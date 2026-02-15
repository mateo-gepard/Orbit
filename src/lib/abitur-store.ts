import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type SubjectDefinition,
  type Halbjahr,
  type GradeEntry,
  type AbiturExam,
  type EinbringungSlot,
  HALBJAHRE,
  createEmptyGrade,
} from './abitur';

// ═══════════════════════════════════════════════════════════
// ORBIT — Abitur Store (Bayern G9)
// Persisted via Zustand + localStorage
// ═══════════════════════════════════════════════════════════

export type AbiturView =
  | 'dashboard'
  | 'halbjahr'
  | 'subject'
  | 'einbringung'
  | 'exams'
  | 'setup';

export interface AbiturState {
  // Setup
  isSetupComplete: boolean;
  detailedMode: boolean;

  // Subjects
  subjects: SubjectDefinition[];

  // Grades: subjectId → halbjahr → GradeEntry
  grades: Record<string, Record<Halbjahr, GradeEntry>>;

  // Einbringung
  einbringungStrategy: 'maximize' | 'stable';
  lockedSlots: string[]; // "subjectId:halbjahr"
  onlyFortgefuehrteFremdsprache: string | null;
  onlyFortgefuehrteNaturwissenschaft: string | null;
  pugSubjectId: string | null;
  wrGeoSubjectId: string | null;

  // Block II exams
  exams: AbiturExam[];

  // UI state (not persisted)
  currentView: AbiturView;
  selectedHalbjahr: Halbjahr;
  selectedSubjectId: string | null;
  targetGrade: number;
}

export interface AbiturActions {
  // Setup
  completeSetup: (subjects: SubjectDefinition[], config: {
    onlyFortgefuehrteFremdsprache: string | null;
    onlyFortgefuehrteNaturwissenschaft: string | null;
    pugSubjectId: string | null;
    wrGeoSubjectId: string | null;
  }) => void;
  resetSetup: () => void;
  setDetailedMode: (v: boolean) => void;

  // Grades
  setGrade: (subjectId: string, halbjahr: Halbjahr, entry: Partial<GradeEntry>) => void;
  setFinalOverride: (subjectId: string, halbjahr: Halbjahr, points: number | null) => void;
  addKleineNote: (subjectId: string, halbjahr: Halbjahr, points: number) => void;
  removeKleineNote: (subjectId: string, halbjahr: Halbjahr, index: number) => void;

  // Einbringung
  setStrategy: (s: 'maximize' | 'stable') => void;
  toggleLockSlot: (subjectId: string, halbjahr: Halbjahr) => void;

  // Exams
  setExam: (index: number, exam: Partial<AbiturExam>) => void;

  // UI
  setView: (view: AbiturView) => void;
  setSelectedHalbjahr: (hj: Halbjahr) => void;
  setSelectedSubjectId: (id: string | null) => void;
  setTargetGrade: (g: number) => void;
}

const initialState: AbiturState = {
  isSetupComplete: false,
  detailedMode: false,
  subjects: [],
  grades: {},
  einbringungStrategy: 'maximize',
  lockedSlots: [],
  onlyFortgefuehrteFremdsprache: null,
  onlyFortgefuehrteNaturwissenschaft: null,
  pugSubjectId: null,
  wrGeoSubjectId: null,
  exams: [],
  currentView: 'setup',
  selectedHalbjahr: '12/1',
  selectedSubjectId: null,
  targetGrade: 2.0,
};

export const useAbiturStore = create<AbiturState & AbiturActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      completeSetup: (subjects, config) => {
        // Initialize grade entries for each subject × halbjahr
        const grades: Record<string, Record<Halbjahr, GradeEntry>> = {};
        for (const sub of subjects) {
          grades[sub.id] = {} as Record<Halbjahr, GradeEntry>;
          for (const hj of HALBJAHRE) {
            grades[sub.id][hj] = createEmptyGrade();
          }
        }

        // Initialize 5 exam slots
        const abiSubjects = subjects.filter((s) => s.isAbiturFach).sort((a, b) => (a.abiturFachNr ?? 0) - (b.abiturFachNr ?? 0));
        const exams: AbiturExam[] = abiSubjects.map((s) => ({
          subjectId: s.id,
          expectedPoints: null,
          actualPoints: null,
        }));

        set({
          subjects,
          grades,
          exams,
          ...config,
          isSetupComplete: true,
          currentView: 'dashboard',
        });
      },

      resetSetup: () => set(initialState),

      setDetailedMode: (v) => set({ detailedMode: v }),

      setGrade: (subjectId, halbjahr, entry) => {
        const grades = { ...get().grades };
        if (!grades[subjectId]) return;
        grades[subjectId] = {
          ...grades[subjectId],
          [halbjahr]: { ...grades[subjectId][halbjahr], ...entry },
        };
        set({ grades });
      },

      setFinalOverride: (subjectId, halbjahr, points) => {
        const grades = { ...get().grades };
        if (!grades[subjectId]) return;
        grades[subjectId] = {
          ...grades[subjectId],
          [halbjahr]: { ...grades[subjectId][halbjahr], finalOverride: points, status: points !== null ? 'actual' : 'expected' },
        };
        set({ grades });
      },

      addKleineNote: (subjectId, halbjahr, points) => {
        const grades = { ...get().grades };
        if (!grades[subjectId]) return;
        const current = grades[subjectId][halbjahr];
        grades[subjectId] = {
          ...grades[subjectId],
          [halbjahr]: {
            ...current,
            kleineNachweise: [...current.kleineNachweise, points],
            status: 'actual',
          },
        };
        set({ grades });
      },

      removeKleineNote: (subjectId, halbjahr, index) => {
        const grades = { ...get().grades };
        if (!grades[subjectId]) return;
        const current = grades[subjectId][halbjahr];
        grades[subjectId] = {
          ...grades[subjectId],
          [halbjahr]: {
            ...current,
            kleineNachweise: current.kleineNachweise.filter((_, i) => i !== index),
          },
        };
        set({ grades });
      },

      setStrategy: (s) => set({ einbringungStrategy: s }),

      toggleLockSlot: (subjectId, halbjahr) => {
        const key = `${subjectId}:${halbjahr}`;
        const locked = get().lockedSlots;
        if (locked.includes(key)) {
          set({ lockedSlots: locked.filter((k) => k !== key) });
        } else {
          set({ lockedSlots: [...locked, key] });
        }
      },

      setExam: (index, exam) => {
        const exams = [...get().exams];
        exams[index] = { ...exams[index], ...exam };
        set({ exams });
      },

      setView: (view) => set({ currentView: view }),
      setSelectedHalbjahr: (hj) => set({ selectedHalbjahr: hj }),
      setSelectedSubjectId: (id) => set({ selectedSubjectId: id }),
      setTargetGrade: (g) => set({ targetGrade: g }),
    }),
    {
      name: 'orbit-abitur',
      partialize: (state) => ({
        isSetupComplete: state.isSetupComplete,
        detailedMode: state.detailedMode,
        subjects: state.subjects,
        grades: state.grades,
        einbringungStrategy: state.einbringungStrategy,
        lockedSlots: state.lockedSlots,
        onlyFortgefuehrteFremdsprache: state.onlyFortgefuehrteFremdsprache,
        onlyFortgefuehrteNaturwissenschaft: state.onlyFortgefuehrteNaturwissenschaft,
        pugSubjectId: state.pugSubjectId,
        wrGeoSubjectId: state.wrGeoSubjectId,
        exams: state.exams,
        targetGrade: state.targetGrade,
      }),
      skipHydration: true,
    }
  )
);
