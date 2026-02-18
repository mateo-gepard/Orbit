'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type AbiturProfile,
  type Semester,
  type SemesterGrade,
  type IndividualGrade,
  type ExamType,
  SEMESTERS,
  createDefaultProfile,
  eKey,
  isMandatory,
  isEingebracht,
  optimizeEinbringungen,
  selectAllEinbringungen,
  calculateSemesterPoints,
} from './abitur';
import { saveToolData } from './firestore';

// ═══════════════════════════════════════════════════════════
// Debounced Firestore sync — saves after 500ms of inactivity
// ═══════════════════════════════════════════════════════════

let _syncUserId: string | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingSave = false;
let _cloudReceived = false;

function scheduleSave(profile: AbiturProfile) {
  if (!_syncUserId) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _pendingSave = true;
  _saveTimer = setTimeout(async () => {
    if (!_syncUserId) { _pendingSave = false; return; }
    try {
      await saveToolData(_syncUserId, 'abitur', { profile });
    } catch (err) {
      console.error('[ORBIT] Failed to save Abitur data:', err);
    } finally {
      _pendingSave = false;
    }
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

  // Individual Grades (große/kleine Leistungsnachweise)
  addIndividualGrade: (grade: Omit<IndividualGrade, 'id'>) => void;
  updateIndividualGrade: (id: string, updates: Partial<IndividualGrade>) => void;
  removeIndividualGrade: (id: string) => void;

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
  deselectAll: () => void;

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
    (set, get) => ({
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

      addIndividualGrade: (grade) =>
        set((s) => updateProfile(s, (p) => {
          const newGrade: IndividualGrade = { ...grade, id: crypto.randomUUID() };
          const individualGrades = [...(p.individualGrades ?? []), newGrade];
          // Auto-update the semester grade from individual grades
          const semesterPoints = calculateSemesterPoints(individualGrades, grade.subjectId, grade.semester);
          const grades = (p.grades ?? []).map((g) =>
            g.subjectId === grade.subjectId && g.semester === grade.semester ? { ...g, points: semesterPoints } : g
          );
          const exists = grades.some((g) => g.subjectId === grade.subjectId && g.semester === grade.semester);
          if (!exists) grades.push({ subjectId: grade.subjectId, semester: grade.semester, points: semesterPoints });
          return { ...p, individualGrades, grades };
        })),

      updateIndividualGrade: (id, updates) =>
        set((s) => updateProfile(s, (p) => {
          const individualGrades = (p.individualGrades ?? []).map((g) =>
            g.id === id ? { ...g, ...updates } : g
          );
          // Find the grade to know which subject/semester to recalc
          const updated = individualGrades.find((g) => g.id === id);
          if (!updated) return { ...p, individualGrades };
          const semesterPoints = calculateSemesterPoints(individualGrades, updated.subjectId, updated.semester);
          const grades = (p.grades ?? []).map((g) =>
            g.subjectId === updated.subjectId && g.semester === updated.semester ? { ...g, points: semesterPoints } : g
          );
          return { ...p, individualGrades, grades };
        })),

      removeIndividualGrade: (id) =>
        set((s) => updateProfile(s, (p) => {
          const toRemove = (p.individualGrades ?? []).find((g) => g.id === id);
          if (!toRemove) return p;
          const individualGrades = (p.individualGrades ?? []).filter((g) => g.id !== id);
          const semesterPoints = calculateSemesterPoints(individualGrades, toRemove.subjectId, toRemove.semester);
          const grades = (p.grades ?? []).map((g) =>
            g.subjectId === toRemove.subjectId && g.semester === toRemove.semester ? { ...g, points: semesterPoints } : g
          );
          return { ...p, individualGrades, grades };
        })),

      toggleEinbringung: (subjectId, semester) =>
        set((s) => updateProfile(s, (p) => {
          // Mandatory subjects (Abiturfächer) can never be toggled
          if (isMandatory(subjectId, p)) return p;
          if (subjectId === 'wsem' || subjectId === 'psem') return p;

          const current = p.einbringungen ?? [];
          const key = eKey(subjectId, semester);
          const has = current.includes(key);
          return { ...p, einbringungen: has ? current.filter((k) => k !== key) : [...current, key] };
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

      deselectAll: () =>
        set((s) => updateProfile(s, (p) => {
          // Keep only mandatory einbringungen (Pflichteinbringungen)
          const mandatory = (selectAllEinbringungen(p)).filter((key) => {
            const [subjectId, semester] = key.split(':') as [string, Semester];
            return isMandatory(subjectId, p);
          });
          return { ...p, einbringungen: mandatory };
        })),

      _setProfileFromCloud: (cloudProfile) =>
        set((s) => {
          // Only skip if we have a local save in-flight — the echo-back
          // from Firestore will carry the same data we just wrote.
          if (_pendingSave) return s;
          _cloudReceived = true;
          // Cloud wins — merge cloud over local (fills missing fields from local defaults)
          const merged: AbiturProfile = { ...s.profile, ...cloudProfile };
          // Ensure arrays are never undefined (cloud may have stored null)
          if (!Array.isArray(merged.einbringungen)) merged.einbringungen = s.profile.einbringungen ?? [];
          if (!Array.isArray(merged.grades)) merged.grades = s.profile.grades ?? [];
          if (!Array.isArray(merged.subjects)) merged.subjects = s.profile.subjects ?? [];
          if (!Array.isArray(merged.examSubjects)) merged.examSubjects = s.profile.examSubjects ?? [];
          if (!Array.isArray(merged.exams)) merged.exams = s.profile.exams ?? [];
          if (!Array.isArray(merged.individualGrades)) merged.individualGrades = s.profile.individualGrades ?? [];
          return { profile: merged };
        }),

      _setSyncUserId: (userId) => {
        const prev = _syncUserId;
        _syncUserId = userId;
        if (!userId) { _cloudReceived = false; return; }
        if (!prev && !_cloudReceived) {
          const { profile } = get();
          if (profile.onboardingComplete) {
            console.log('[ORBIT] Abitur: user signed in — pushing local profile to cloud');
            scheduleSave(profile);
          }
        }
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
