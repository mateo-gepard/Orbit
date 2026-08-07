'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
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
  optimizeEinbringungen,
  selectAllEinbringungen,
  calculateSemesterPoints,
  canSubjectBeLF,
  canSubjectBeOralExam,
  reconcileExamSlots,
  reconcileSubjectSelection,
  subjectsConflict,
} from './abitur';
import { saveToolData, ToolDataConflictError, ToolDataRejectedError } from './firestore';
import { prepareScopedStorage } from './account-storage';
import { verifiedLocalStateStorage } from './verified-storage';
import { reportSyncRecovered, reportSyncWarning } from './sync-warning';

// ═══════════════════════════════════════════════════════════
// Debounced Firestore sync — saves after 500ms of inactivity
// ═══════════════════════════════════════════════════════════

let _syncUserId: string | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _localRevision = 0;
let _cloudSnapshotReceived = false;
let _scopeGeneration = 0;

function scheduleSave(profile: AbiturProfile) {
  if (!_syncUserId) {
    useAbiturStore.setState({ cloudDirty: false });
    return;
  }
  if (_saveTimer) clearTimeout(_saveTimer);
  const scheduledUserId = _syncUserId;
  const scheduledGeneration = _scopeGeneration;
  const revision = ++_localRevision;
  const persist = async () => {
    if (_syncUserId !== scheduledUserId
        || _scopeGeneration !== scheduledGeneration
        || revision !== _localRevision) return;
    try {
      await saveToolData(scheduledUserId, 'abitur', { profile });
      if (_syncUserId === scheduledUserId
          && _scopeGeneration === scheduledGeneration
          && revision === _localRevision) {
        useAbiturStore.setState({ cloudDirty: false });
        reportSyncRecovered({ key: 'tool:abitur', userId: scheduledUserId });
      }
    } catch (error) {
      console.error('[THREADMAP] Failed to save Abitur data:', error);
      if (_syncUserId !== scheduledUserId
          || _scopeGeneration !== scheduledGeneration
          || revision !== _localRevision) return;
      if (error instanceof ToolDataConflictError) {
        // Keep the losing payload dirty and in the persisted local store. The
        // central sync layer has preserved both versions for export/recovery.
        useAbiturStore.setState({ cloudDirty: true });
        return;
      }
      if (error instanceof ToolDataRejectedError) {
        // Retrying resends the identical document, so it would fail forever.
        useAbiturStore.setState({ cloudDirty: true });
        reportSyncWarning({
          key: 'tool:abitur',
          userId: scheduledUserId,
          toolId: 'abitur',
          message: 'Abitur is saved on this device, but the server refused the cloud copy. Export your data and contact support.',
        });
        return;
      }
      reportSyncWarning({
        key: 'tool:abitur',
        userId: scheduledUserId,
        toolId: 'abitur',
        message: 'Abitur changes are saved on this device, but cloud sync will retry.',
      });
      _saveTimer = setTimeout(() => void persist(), 5_000);
    }
  };
  _saveTimer = setTimeout(() => void persist(), 500);
}

// ═══════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════

interface AbiturState {
  profile: AbiturProfile;
  cloudDirty: boolean;

  // Onboarding
  completeOnboarding: () => void;

  // Settings
  setStudentName: (name: string) => void;
  setSchoolYear: (year: string) => void;
  setCurrentSemester: (semester: Semester) => void;
  setLeistungsfach: (subjectId: string) => boolean;
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
  setExamSubject: (index: number, subjectId: string) => boolean;
  setExamType: (index: number, examType: ExamType) => void;
  setExamPoints: (index: number, points: number | null) => void;

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
): { profile: AbiturProfile; cloudDirty: boolean } {
  const profile = updater(s.profile);
  scheduleSave(profile);
  return { profile, cloudDirty: Boolean(_syncUserId) };
}

function ensureGradeRows(profile: AbiturProfile, subjectIds: string[]): SemesterGrade[] {
  const existingGrades = Array.isArray(profile.grades) ? profile.grades : [];
  const selected = new Set(subjectIds);
  const existingKeys = new Set(existingGrades.map((grade) => `${grade.subjectId}:${grade.semester}`));
  const grades = existingGrades.filter((grade) => selected.has(grade.subjectId));
  for (const subjectId of subjectIds) {
    for (const semester of SEMESTERS) {
      if (!existingKeys.has(`${subjectId}:${semester}`)) {
        grades.push({ subjectId, semester, points: null });
      }
    }
  }
  return grades;
}

function recalculateDerivedGrades(profile: AbiturProfile): AbiturProfile {
  const individualGrades = Array.isArray(profile.individualGrades) ? profile.individualGrades : [];
  if (individualGrades.length === 0) return profile;
  const grades = profile.grades.map((grade) => {
    const hasIndividualGrades = individualGrades.some((individual) => (
      individual.subjectId === grade.subjectId && individual.semester === grade.semester
    ));
    if (!hasIndividualGrades) return grade;
    return {
      ...grade,
      points: calculateSemesterPoints(
        individualGrades,
        grade.subjectId,
        grade.semester,
        profile.leistungsfach,
      ),
    };
  });
  return { ...profile, grades };
}

function normalizeExamIdentity(profile: AbiturProfile): AbiturProfile {
  const normalized = reconcileExamSlots(profile);
  const subjects = reconcileSubjectSelection(normalized, normalized.subjects ?? []);
  return {
    ...normalized,
    subjects,
    grades: ensureGradeRows(normalized, subjects),
  };
}

export const useAbiturStore = create<AbiturState>()(
  persist(
    (set, get) => ({
      profile: createDefaultProfile(),
      cloudDirty: false,

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

      setLeistungsfach: (subjectId) => {
        if (!canSubjectBeLF(subjectId).valid) return false;
        const current = get().profile;
        if (!current.subjects.includes(subjectId)) return false;
        const conflictingExam = (current.examSubjects ?? [])
          .slice(3, 5)
          .find((examId) => subjectsConflict(subjectId, examId));
        if (conflictingExam) return false;

        set((s) => updateProfile(s, (p) => {
          const withExamIdentity = reconcileExamSlots({ ...p, leistungsfach: subjectId });
          const subjects = reconcileSubjectSelection(
            withExamIdentity,
            [...(p.subjects ?? []), subjectId],
          );
          const next = {
            ...withExamIdentity,
            subjects,
            grades: ensureGradeRows(withExamIdentity, subjects),
          };
          return recalculateDerivedGrades(next);
        }));
        return true;
      },

      setSubjects: (subjectIds) =>
        set((s) => updateProfile(s, (p) => {
          const reconciledSubjects = reconcileSubjectSelection(p, subjectIds);
          const einbringungen = p.einbringungen ?? [];
          const filteredEin = einbringungen.filter((k) => {
            const [sid] = k.split(':');
            return reconciledSubjects.includes(sid);
          });
          return {
            ...p,
            subjects: reconciledSubjects,
            grades: ensureGradeRows(p, reconciledSubjects),
            einbringungen: filteredEin,
          };
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
          const semesterPoints = calculateSemesterPoints(
            individualGrades,
            grade.subjectId,
            grade.semester,
            p.leistungsfach
          );
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
          const semesterPoints = calculateSemesterPoints(
            individualGrades,
            updated.subjectId,
            updated.semester,
            p.leistungsfach
          );
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
          const semesterPoints = calculateSemesterPoints(
            individualGrades,
            toRemove.subjectId,
            toRemove.semester,
            p.leistungsfach
          );
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

      setExamSubject: (index, subjectId) => {
        if (index !== 3 && index !== 4) return false;
        const current = get().profile;
        if (subjectId) {
          if (!current.subjects.includes(subjectId) || !canSubjectBeOralExam(subjectId).valid) return false;
          const otherIndex = index === 3 ? 4 : 3;
          const otherSubject = current.examSubjects[otherIndex] || '';
          const usedSubjects = new Set(['deu', 'mat', current.leistungsfach, otherSubject].filter(Boolean));
          if (usedSubjects.has(subjectId)) return false;
          if (
            subjectsConflict(subjectId, current.leistungsfach)
            || subjectsConflict(subjectId, otherSubject)
          ) return false;
        }

        set((s) => updateProfile(s, (p) => {
          const subs = [...p.examSubjects];
          subs[index] = subjectId;
          return reconcileExamSlots({ ...p, examSubjects: subs });
        }));
        return true;
      },

      setExamType: (index, examType) =>
        set((s) => updateProfile(s, (p) => {
          const exams = [...p.exams];
          if (exams[index]) exams[index] = { ...exams[index], examType };
          return { ...p, exams };
        })),

      setExamPoints: (index, points) =>
        set((s) => updateProfile(s, (p) => ({
          ...p,
          exams: p.exams.map((exam, examIndex) =>
            examIndex === index
              ? {
                  ...exam,
                  points: points === null || !Number.isFinite(points)
                    ? null
                    : Math.round(Math.max(0, Math.min(15, points))),
                }
              : exam
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
            const [subjectId] = key.split(':') as [string, Semester];
            return isMandatory(subjectId, p);
          });
          return { ...p, einbringungen: mandatory };
        })),

      _setProfileFromCloud: (cloudProfile) =>
        set((s) => {
          const firstSnapshot = !_cloudSnapshotReceived;
          _cloudSnapshotReceived = true;
          // A verified browser revision that has not reached the cloud is newer
          // than any snapshot. Retry it after the subscription establishes the
          // current cloud revision instead of discarding it.
          if (s.cloudDirty) {
            if (firstSnapshot) scheduleSave(s.profile);
            return s;
          }
          // Cloud wins — merge cloud over local (fills missing fields from local defaults)
          const merged: AbiturProfile = { ...s.profile, ...cloudProfile };
          // Ensure arrays are never undefined (cloud may have stored null)
          if (!Array.isArray(merged.einbringungen)) merged.einbringungen = s.profile.einbringungen ?? [];
          if (!Array.isArray(merged.grades)) merged.grades = s.profile.grades ?? [];
          if (!Array.isArray(merged.subjects)) merged.subjects = s.profile.subjects ?? [];
          if (!Array.isArray(merged.examSubjects)) merged.examSubjects = s.profile.examSubjects ?? [];
          if (!Array.isArray(merged.exams)) merged.exams = s.profile.exams ?? [];
          if (!Array.isArray(merged.individualGrades)) merged.individualGrades = s.profile.individualGrades ?? [];
          return { profile: normalizeExamIdentity(merged), cloudDirty: false };
        }),

      _setSyncUserId: (userId) => {
        if (_syncUserId !== userId) {
          _scopeGeneration += 1;
          if (_saveTimer) {
            clearTimeout(_saveTimer);
            _saveTimer = null;
          }
        }
        _syncUserId = userId;
        _localRevision = 0;
        _cloudSnapshotReceived = false;
        if (!userId) return;
      },

      resetProfile: () => {
        const profile = createDefaultProfile();
        scheduleSave(profile);
        set({ profile, cloudDirty: Boolean(_syncUserId) });
      },
    }),
    {
      name: 'orbit-abitur',
      skipHydration: true,
      storage: createJSONStorage(() => verifiedLocalStateStorage),
      merge: (persisted, current) => {
        const saved = persisted as Partial<AbiturState> | undefined;
        return {
          ...current,
          ...saved,
          profile: saved?.profile ? normalizeExamIdentity(saved.profile) : current.profile,
          cloudDirty: saved?.cloudDirty === true,
        };
      },
    }
  )
);

const ABITUR_STORAGE_KEY = 'orbit-abitur';

export async function scopeAbiturStore(userId: string | null): Promise<void> {
  useAbiturStore.getState()._setSyncUserId(null);
  const target = prepareScopedStorage(ABITUR_STORAGE_KEY, userId);
  useAbiturStore.persist.setOptions({ name: target.key });
  if (!target.hasPersistedState) {
    useAbiturStore.setState({ profile: createDefaultProfile(), cloudDirty: false });
  }
  await useAbiturStore.persist.rehydrate();
}
