import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createDefaultProfile,
  type AbiturProfile,
  type SemesterGrade,
  type ExamResult,
  type Semester,
  SEMESTERS,
} from './abitur';

// ═══════════════════════════════════════════════════════════
// ORBIT — Abitur Store
// Persistent state for the Abitur tracker tool.
// ═══════════════════════════════════════════════════════════

interface AbiturStore {
  profile: AbiturProfile;

  // Profile actions
  setStudentName: (name: string) => void;
  setSchoolYear: (year: string) => void;
  setCurrentSemester: (semester: Semester) => void;
  setLeistungsfach: (subjectId: string) => void;
  setSeminarTopicTitle: (title: string) => void;

  // Subject management
  addSubject: (subjectId: string) => void;
  removeSubject: (subjectId: string) => void;
  setExamSubject: (index: number, subjectId: string) => void;

  // Grade management
  setGrade: (subjectId: string, semester: Semester, points: number | null) => void;

  // Exam management
  setExamPoints: (subjectId: string, points: number | null) => void;

  // Seminar
  setSeminarPaperPoints: (points: number | null) => void;
  setSeminarPresentationPoints: (points: number | null) => void;

  // Reset
  resetProfile: () => void;
}

export const useAbiturStore = create<AbiturStore>()(
  persist(
    (set, get) => ({
      profile: createDefaultProfile(),

      setStudentName: (name) =>
        set((s) => ({ profile: { ...s.profile, studentName: name } })),

      setSchoolYear: (year) =>
        set((s) => ({ profile: { ...s.profile, schoolYear: year } })),

      setCurrentSemester: (semester) =>
        set((s) => ({ profile: { ...s.profile, currentSemester: semester } })),

      setLeistungsfach: (subjectId) =>
        set((s) => {
          const profile = { ...s.profile, leistungsfach: subjectId };
          // Update exam subjects: index 2 is always the LF
          const examSubjects = [...profile.examSubjects];
          examSubjects[2] = subjectId;
          profile.examSubjects = examSubjects;
          // Update exams
          const exams = [...profile.exams];
          exams[2] = { subjectId, examType: 'written', points: exams[2]?.points ?? null };
          profile.exams = exams;
          return { profile };
        }),

      setSeminarTopicTitle: (title) =>
        set((s) => ({ profile: { ...s.profile, seminarTopicTitle: title } })),

      addSubject: (subjectId) =>
        set((s) => {
          if (s.profile.subjects.includes(subjectId)) return s;
          const subjects = [...s.profile.subjects, subjectId];
          // Add grades for all semesters
          const newGrades: SemesterGrade[] = SEMESTERS.map((sem) => ({
            subjectId,
            semester: sem,
            points: null,
          }));
          const grades = [...s.profile.grades, ...newGrades];
          return { profile: { ...s.profile, subjects, grades } };
        }),

      removeSubject: (subjectId) =>
        set((s) => {
          // Don't remove mandatory subjects
          if (['deu', 'mat'].includes(subjectId)) return s;
          if (subjectId === s.profile.leistungsfach) return s;
          if (s.profile.examSubjects.includes(subjectId)) return s;

          const subjects = s.profile.subjects.filter((id) => id !== subjectId);
          const grades = s.profile.grades.filter((g) => g.subjectId !== subjectId);
          return { profile: { ...s.profile, subjects, grades } };
        }),

      setExamSubject: (index, subjectId) =>
        set((s) => {
          // Index 0=Deutsch (fixed), 1=Math (fixed), 2=LF (fixed), 3/4=Colloquiums
          if (index < 3) return s; // Can't change fixed exams
          const examSubjects = [...s.profile.examSubjects];
          examSubjects[index] = subjectId;
          const exams = [...s.profile.exams];
          exams[index] = {
            subjectId,
            examType: 'colloquium',
            points: null,
          };
          return { profile: { ...s.profile, examSubjects, exams } };
        }),

      setGrade: (subjectId, semester, points) =>
        set((s) => {
          const grades = s.profile.grades.map((g) =>
            g.subjectId === subjectId && g.semester === semester
              ? { ...g, points }
              : g
          );
          // If grade doesn't exist yet, add it
          const exists = grades.some(
            (g) => g.subjectId === subjectId && g.semester === semester
          );
          if (!exists) {
            grades.push({ subjectId, semester, points });
          }
          return { profile: { ...s.profile, grades } };
        }),

      setExamPoints: (subjectId, points) =>
        set((s) => {
          const exams = s.profile.exams.map((e) =>
            e.subjectId === subjectId ? { ...e, points } : e
          );
          return { profile: { ...s.profile, exams } };
        }),

      setSeminarPaperPoints: (points) =>
        set((s) => ({ profile: { ...s.profile, seminarPaperPoints: points } })),

      setSeminarPresentationPoints: (points) =>
        set((s) => ({ profile: { ...s.profile, seminarPresentationPoints: points } })),

      resetProfile: () => set({ profile: createDefaultProfile() }),
    }),
    {
      name: 'orbit-abitur',
      partialize: (state) => ({ profile: state.profile }),
      skipHydration: true,
    }
  )
);
