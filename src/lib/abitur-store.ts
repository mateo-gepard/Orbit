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
} from './abitur';

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

  // Reset
  resetProfile: () => void;
}

export const useAbiturStore = create<AbiturState>()(
  persist(
    (set) => ({
      profile: createDefaultProfile(),

      completeOnboarding: () =>
        set((s) => ({ profile: { ...s.profile, onboardingComplete: true } })),

      setStudentName: (name) =>
        set((s) => ({ profile: { ...s.profile, studentName: name } })),

      setSchoolYear: (year) =>
        set((s) => ({ profile: { ...s.profile, schoolYear: year } })),

      setCurrentSemester: (semester) =>
        set((s) => ({ profile: { ...s.profile, currentSemester: semester } })),

      setLeistungsfach: (subjectId) =>
        set((s) => ({ profile: { ...s.profile, leistungsfach: subjectId } })),

      setSubjects: (subjectIds) =>
        set((s) => {
          const existing = new Set(s.profile.grades.map((g) => `${g.subjectId}:${g.semester}`));
          const newGrades: SemesterGrade[] = [...s.profile.grades];
          for (const sid of subjectIds) {
            for (const sem of SEMESTERS) {
              if (!existing.has(`${sid}:${sem}`)) {
                newGrades.push({ subjectId: sid, semester: sem, points: null });
              }
            }
          }
          const filteredGrades = newGrades.filter((g) => subjectIds.includes(g.subjectId));
          const filteredEin = s.profile.einbringungen.filter((k) => {
            const [sid] = k.split(':');
            return subjectIds.includes(sid);
          });
          return { profile: { ...s.profile, subjects: subjectIds, grades: filteredGrades, einbringungen: filteredEin } };
        }),

      setGrade: (subjectId, semester, points) =>
        set((s) => {
          const grades = s.profile.grades.map((g) =>
            g.subjectId === subjectId && g.semester === semester ? { ...g, points } : g
          );
          const exists = grades.some((g) => g.subjectId === subjectId && g.semester === semester);
          if (!exists) grades.push({ subjectId, semester, points });
          return { profile: { ...s.profile, grades } };
        }),

      toggleEinbringung: (subjectId, semester) =>
        set((s) => {
          const key = eKey(subjectId, semester);
          const has = s.profile.einbringungen.includes(key);
          const einbringungen = has
            ? s.profile.einbringungen.filter((k) => k !== key)
            : [...s.profile.einbringungen, key];
          return { profile: { ...s.profile, einbringungen } };
        }),

      setExamSubject: (index, subjectId) =>
        set((s) => {
          const subs = [...s.profile.examSubjects];
          subs[index] = subjectId;
          const exams = [...s.profile.exams];
          if (exams[index]) exams[index] = { ...exams[index], subjectId };
          return { profile: { ...s.profile, examSubjects: subs, exams } };
        }),

      setExamType: (index, examType) =>
        set((s) => {
          const exams = [...s.profile.exams];
          if (exams[index]) exams[index] = { ...exams[index], examType };
          return { profile: { ...s.profile, exams } };
        }),

      setExamPoints: (subjectId, points) =>
        set((s) => ({
          profile: {
            ...s.profile,
            exams: s.profile.exams.map((e) =>
              e.subjectId === subjectId ? { ...e, points } : e
            ),
          },
        })),

      setSeminarPaperPoints: (points) =>
        set((s) => ({ profile: { ...s.profile, seminarPaperPoints: points } })),

      setSeminarPresentationPoints: (points) =>
        set((s) => ({ profile: { ...s.profile, seminarPresentationPoints: points } })),

      setSeminarTopic: (title) =>
        set((s) => ({ profile: { ...s.profile, seminarTopicTitle: title } })),

      resetProfile: () => set({ profile: createDefaultProfile() }),
    }),
    { name: 'orbit-abitur', skipHydration: true }
  )
);
