'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type AbiturProfile,
  type Semester,
  type SemesterGrade,
  type ExamType,
  SEMESTERS,
  createDefaultProfile,
  eKey,
  isMandatory,
  isEingebracht,
  canDropSemester,
  canAddSemester,
  optimizeEinbringungen,
  selectAllEinbringungen,
} from './abitur';
import { saveToolData } from './firestore';

// ═══════════════════════════════════════════════════════════
// Debounced Firestore sync — saves after 500ms of inactivity
// ═══════════════════════════════════════════════════════════

let _syncUserId: string | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(profile: AbiturProfile) {
  if (!_syncUserId) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    if (!_syncUserId) return;
    saveToolData(_syncUserId, 'abitur', { profile }).catch((err) => {
      console.error('[ORBIT] Failed to save Abitur data:', err);
    });
  }, 500);
}

// ═══════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════

interface AbiturState {
  profile: AbiturProfile;

  // Onboarding
  completeOnboarding: () => void;

  // Settings
  setStudentName: (name: string) => void;
  setSchoolYear: (year: string) => void;
  setCurrentSemester: (semester: Semester) => void;
  setLeistungsfach: (subjectId: string) => void;
  setSubjects: (subjectIds: string[]) => void;

  // Grades
  setGrade: (subjectId: string, semester: Semester, points: number | null) => void;

  // Einbringungen
  toggleEinbringung: (subjectId: string, semester: Semester) => void;

  // Exams
  setExamSubject: (index: number, subjectId: string) => void;
  setExamType: (index: number, examType: ExamType) => void;
  setExamPoints: (subjectId: string, points: number | null) => void;

  // Seminar
  setSeminarPaperPoints: (points: number | null) => void;
  setSeminarPresentationPoints: (points: number | null) => void;
  setSeminarTopic: (title: string) => void;

  // Substitution (Joker)
  setSubstitutedWritten: (subject: 'deu' | 'mat' | null) => void;

  // Auto-optimization
  autoOptimizeEinbringungen: () => void;
  selectAll: () => void;

  // Sync
  _setProfileFromCloud: (profile: AbiturProfile) => void;
  _setSyncUserId: (userId: string | null) => void;

  // Reset
  resetProfile: () => void;
}

/** Helper: update profile and schedule Firestore save */
function updateProfile(
  s: AbiturState,
  updater: (profile: AbiturProfile) => AbiturProfile
): { profile: AbiturProfile } {
  const profile = updater(s.profile);
  scheduleSave(profile);
  return { profile };
}

export const useAbiturStore = create<AbiturState>()(
  persist(
    (set) => ({
      profile: createDefaultProfile(),

      completeOnboarding: () =>
        set((s) => updateProfile(s, (p) => ({
          ...p,
          onboardingComplete: true,
          einbringungen: selectAllEinbringungen(p),
        }))),

      setStudentName: (name) =>
        set((s) => updateProfile(s, (p) => ({ ...p, studentName: name }))),

      setSchoolYear: (year) =>
        set((s) => updateProfile(s, (p) => ({ ...p, schoolYear: year }))),

      setCurrentSemester: (semester) =>
        set((s) => updateProfile(s, (p) => ({ ...p, currentSemester: semester }))),

      setLeistungsfach: (subjectId) =>
        set((s) => updateProfile(s, (p) => ({ ...p, leistungsfach: subjectId }))),

      setSubjects: (subjectIds) =>
        set((s) => updateProfile(s, (p) => {
          const grades = p.grades ?? [];
          const einbringungen = p.einbringungen ?? [];
          const existing = new Set(grades.map((g) => `${g.subjectId}:${g.semester}`));
          const newGrades: SemesterGrade[] = [...grades];
          for (const sid of subjectIds) {
            for (const sem of SEMESTERS) {
              if (!existing.has(`${sid}:${sem}`)) {
                newGrades.push({ subjectId: sid, semester: sem, points: null });
              }
            }
          }
          const filteredGrades = newGrades.filter((g) => subjectIds.includes(g.subjectId));
          const filteredEin = einbringungen.filter((k) => {
            const [sid] = k.split(':');
            return subjectIds.includes(sid);
          });
          return { ...p, subjects: subjectIds, grades: filteredGrades, einbringungen: filteredEin };
        })),

      setGrade: (subjectId, semester, points) =>
        set((s) => updateProfile(s, (p) => {
          const grades = (p.grades ?? []).map((g) =>
            g.subjectId === subjectId && g.semester === semester ? { ...g, points } : g
          );
          const exists = grades.some((g) => g.subjectId === subjectId && g.semester === semester);
          if (!exists) grades.push({ subjectId, semester, points });
          return { ...p, grades };
        })),

      toggleEinbringung: (subjectId, semester) =>
        set((s) => updateProfile(s, (p) => {
          // Mandatory subjects can never be toggled
          if (isMandatory(subjectId, p)) return p;
          if (subjectId === 'wsem' || subjectId === 'psem') return p;

          const current = p.einbringungen ?? [];
          const key = eKey(subjectId, semester);
          const currentlyEingebracht = isEingebracht(subjectId, semester, p);

          if (currentlyEingebracht) {
            // Trying to DROP — validate
            const check = canDropSemester(subjectId, semester, p);
            if (!check.canDrop) return p; // Blocked — don't change anything
            return { ...p, einbringungen: current.filter((k) => k !== key) };
          } else {
            // Trying to ADD — validate
            const check = canAddSemester(subjectId, semester, p);
            if (!check.canAdd) return p; // Blocked — don't change anything
            return { ...p, einbringungen: [...current, key] };
          }
        })),

      setExamSubject: (index, subjectId) =>
        set((s) => updateProfile(s, (p) => {
          const subs = [...p.examSubjects];
          subs[index] = subjectId;
          const exams = [...p.exams];
          if (exams[index]) exams[index] = { ...exams[index], subjectId };
          return { ...p, examSubjects: subs, exams };
        })),

      setExamType: (index, examType) =>
        set((s) => updateProfile(s, (p) => {
          const exams = [...p.exams];
          if (exams[index]) exams[index] = { ...exams[index], examType };
          return { ...p, exams };
        })),

      setExamPoints: (subjectId, points) =>
        set((s) => updateProfile(s, (p) => ({
          ...p,
          exams: p.exams.map((e) =>
            e.subjectId === subjectId ? { ...e, points } : e
          ),
        }))),

      setSeminarPaperPoints: (points) =>
        set((s) => updateProfile(s, (p) => ({ ...p, seminarPaperPoints: points }))),

      setSeminarPresentationPoints: (points) =>
        set((s) => updateProfile(s, (p) => ({ ...p, seminarPresentationPoints: points }))),

      setSeminarTopic: (title) =>
        set((s) => updateProfile(s, (p) => ({ ...p, seminarTopicTitle: title }))),

      setSubstitutedWritten: (subject) =>
        set((s) => updateProfile(s, (p) => ({ ...p, substitutedWritten: subject }))),

      autoOptimizeEinbringungen: () =>
        set((s) => updateProfile(s, (p) => {
          const optimized = optimizeEinbringungen(p);
          // Only keep non-mandatory keys in einbringungen (mandatory are implicit)
          return { ...p, einbringungen: optimized };
        })),

      selectAll: () =>
        set((s) => updateProfile(s, (p) => ({
          ...p,
          einbringungen: selectAllEinbringungen(p),
        }))),

      _setProfileFromCloud: (profile) => set({ profile }),

      _setSyncUserId: (userId) => {
        _syncUserId = userId;
      },

      resetProfile: () => {
        const profile = createDefaultProfile();
        scheduleSave(profile);
        set({ profile });
      },
    }),
    { name: 'orbit-abitur', skipHydration: true }
  )
);
