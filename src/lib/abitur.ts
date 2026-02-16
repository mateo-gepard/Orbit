// ═══════════════════════════════════════════════════════════
// ORBIT — Abitur Engine (Bavarian G9)
// Complete calculation engine for the Qualifikationsphase
// ═══════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────

export type Semester = '12/1' | '12/2' | '13/1' | '13/2';
export const SEMESTERS: Semester[] = ['12/1', '12/2', '13/1', '13/2'];

export const SEMESTER_LABELS: Record<Semester, string> = {
  '12/1': 'Q12/1',
  '12/2': 'Q12/2',
  '13/1': 'Q13/1',
  '13/2': 'Q13/2',
};

export type SubjectLevel = 'eA' | 'gA' | 'wahlpflicht';
export type SubjectField = 1 | 2 | 3 | 0;
export type ExamType = 'written' | 'colloquium';

export interface SubjectDefinition {
  id: string;
  name: string;
  shortName: string;
  field: SubjectField;
  defaultLevel: SubjectLevel;
  hoursPerWeek: number;
  canBeLF: boolean;
  category: 'language' | 'social' | 'stem' | 'art' | 'sport' | 'seminar' | 'other';
  /** Subject requires Additum (theory course) to be used as exam subject */
  requiresAdditum?: boolean;
  /** Late-starting language — cannot be LF, only Kolloquium */
  lateStart?: boolean;
  /** Can this subject be a written Abitur exam? */
  canBeWrittenExam?: boolean;
  /** Can this subject be an oral exam (Kolloquium)? */
  canBeOralExam?: boolean;
}

export interface SemesterGrade {
  subjectId: string;
  semester: Semester;
  points: number | null;
}

export interface ExamResult {
  subjectId: string;
  examType: ExamType;
  points: number | null;
}

export interface AbiturProfile {
  id: string;
  onboardingComplete: boolean;
  leistungsfach: string;
  subjects: string[];
  examSubjects: string[];
  grades: SemesterGrade[];
  /** User-selected einbringung keys ("subjectId:semester"). Mandatory ones are implicit. */
  einbringungen: string[];
  exams: ExamResult[];
  seminarPaperPoints: number | null;
  seminarPresentationPoints: number | null;
  seminarTopicTitle: string;
  studentName: string;
  schoolYear: string;
  currentSemester: Semester;
  /**
   * "Joker" substitution rule:
   * - 'deu' → Deutsch is replaced as written exam (requires 2 foreign languages in exams)
   * - 'mat' → Mathe is replaced as written exam (requires 2 natural sciences in exams)
   * - null → no substitution (default, standard path)
   * Only one can be substituted at a time.
   */
  substitutedWritten?: 'deu' | 'mat' | null;
}

// ─── Subject Database ──────────────────────────────────────

export const ALL_SUBJECTS: SubjectDefinition[] = [
  { id: 'deu', name: 'Deutsch', shortName: 'D', field: 1, defaultLevel: 'eA', hoursPerWeek: 4, canBeLF: false, category: 'language', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'eng', name: 'Englisch', shortName: 'E', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'language', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'fra', name: 'Französisch', shortName: 'F', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'language', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'lat', name: 'Latein', shortName: 'L', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'language', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'spa', name: 'Spanisch (spätbeg.)', shortName: 'Sp', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: false, category: 'language', lateStart: true, canBeWrittenExam: false, canBeOralExam: true },
  { id: 'ita', name: 'Italienisch', shortName: 'It', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'language', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'rus', name: 'Russisch', shortName: 'Ru', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'language', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'gri', name: 'Griechisch', shortName: 'Gr', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'language', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'kun', name: 'Kunst', shortName: 'Ku', field: 1, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'art', requiresAdditum: true, canBeWrittenExam: true, canBeOralExam: true },
  { id: 'mus', name: 'Musik', shortName: 'Mu', field: 1, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'art', requiresAdditum: true, canBeWrittenExam: true, canBeOralExam: true },
  { id: 'ges', name: 'Geschichte', shortName: 'G', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'social', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'geo', name: 'Geographie', shortName: 'Geo', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'social', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'pug', name: 'Politik & Gesellschaft', shortName: 'PuG', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: false, category: 'social', canBeWrittenExam: false, canBeOralExam: true },
  { id: 'wir', name: 'Wirtschaft & Recht', shortName: 'WR', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'social', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'rev', name: 'Ev. Religionslehre', shortName: 'EvR', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: false, category: 'social', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'rka', name: 'Kath. Religionslehre', shortName: 'KR', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: false, category: 'social', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'eth', name: 'Ethik', shortName: 'Eth', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: false, category: 'social', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'mat', name: 'Mathematik', shortName: 'M', field: 3, defaultLevel: 'eA', hoursPerWeek: 4, canBeLF: false, category: 'stem', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'phy', name: 'Physik', shortName: 'Ph', field: 3, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'stem', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'che', name: 'Chemie', shortName: 'Ch', field: 3, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'stem', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'bio', name: 'Biologie', shortName: 'Bio', field: 3, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'stem', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'inf', name: 'Informatik', shortName: 'Inf', field: 3, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'stem', canBeWrittenExam: true, canBeOralExam: true },
  { id: 'spo', name: 'Sport', shortName: 'Spo', field: 0, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'sport', requiresAdditum: true, canBeWrittenExam: true, canBeOralExam: false },
  { id: 'wsem', name: 'W-Seminar', shortName: 'W', field: 0, defaultLevel: 'wahlpflicht', hoursPerWeek: 2, canBeLF: false, category: 'seminar', canBeWrittenExam: false, canBeOralExam: false },
  { id: 'psem', name: 'P-Seminar', shortName: 'P', field: 0, defaultLevel: 'wahlpflicht', hoursPerWeek: 2, canBeLF: false, category: 'seminar', canBeWrittenExam: false, canBeOralExam: false },
];

export function getSubject(id: string): SubjectDefinition | undefined {
  return ALL_SUBJECTS.find((s) => s.id === id);
}

// ─── Einbringung Helpers ───────────────────────────────────

export function eKey(subjectId: string, semester: Semester): string {
  return `${subjectId}:${semester}`;
}

/** Is this grade mandatory? (user cannot deselect it) */
export function isMandatory(subjectId: string, profile: AbiturProfile): boolean {
  if (subjectId === 'deu' || subjectId === 'mat') return true;
  if (subjectId === profile.leistungsfach) return true;
  if (profile.examSubjects.includes(subjectId)) return true;
  return false;
}

/** Is a specific grade eingebracht? Either mandatory or user-selected. */
export function isEingebracht(subjectId: string, semester: Semester, profile: AbiturProfile): boolean {
  if (isMandatory(subjectId, profile)) return true;
  return (profile.einbringungen ?? []).includes(eKey(subjectId, semester));
}

/** Can the user toggle this einbringung? */
export function canToggle(subjectId: string, profile: AbiturProfile): boolean {
  if (isMandatory(subjectId, profile)) return false;
  if (subjectId === 'wsem' || subjectId === 'psem') return false;
  return true;
}

/** Count total einbringungen across all semesters */
export function countAllEinbringungen(profile: AbiturProfile): number {
  let count = 0;
  for (const subjectId of profile.subjects) {
    if (subjectId === 'psem') continue;
    for (const sem of SEMESTERS) {
      if (isEingebracht(subjectId, sem, profile)) count++;
    }
  }
  return count;
}

// ─── Grade Helpers ─────────────────────────────────────────

export function pointsToGrade(points: number): string {
  if (points >= 13) return '1';
  if (points >= 10) return '2';
  if (points >= 7) return '3';
  if (points >= 5) return '4';
  if (points >= 1) return '5';
  return '6';
}

export function pointsToLabel(points: number): string {
  if (points >= 13) return 'Sehr gut';
  if (points >= 10) return 'Gut';
  if (points >= 7) return 'Befriedigend';
  if (points >= 5) return 'Ausreichend';
  if (points >= 1) return 'Mangelhaft';
  return 'Ungenügend';
}

export function isDeficit(points: number): boolean { return points < 5; }

export function getPointsColor(points: number | null): string {
  if (points === null) return 'text-muted-foreground/30';
  if (points >= 13) return 'text-emerald-500';
  if (points >= 10) return 'text-sky-500';
  if (points >= 7) return 'text-foreground';
  if (points >= 5) return 'text-amber-500';
  if (points >= 1) return 'text-orange-500';
  return 'text-red-500';
}

export function getPointsBg(points: number | null): string {
  if (points === null) return 'bg-muted-foreground/5';
  if (points >= 13) return 'bg-emerald-500/10';
  if (points >= 10) return 'bg-sky-500/10';
  if (points >= 7) return 'bg-foreground/5';
  if (points >= 5) return 'bg-amber-500/10';
  if (points >= 1) return 'bg-orange-500/10';
  return 'bg-red-500/10';
}

// ─── Per-Semester Statistics ───────────────────────────────

export interface SemesterStats {
  semester: Semester;
  allGrades: SemesterGrade[];
  eingebrachte: SemesterGrade[];
  allAverage: number | null;
  eingebrachteAverage: number | null;
  deficits: number;
  enteredCount: number;
  totalSubjects: number;
  einbringungCount: number;
}

export function calcSemesterStats(semester: Semester, profile: AbiturProfile): SemesterStats {
  const subjects = profile.subjects.filter((s) => s !== 'psem');
  const allGrades = (profile.grades ?? []).filter(
    (g) => g.semester === semester && g.points !== null && g.subjectId !== 'psem'
  );
  const eingebrachte = allGrades.filter((g) => isEingebracht(g.subjectId, semester, profile));

  const allAvg = allGrades.length > 0
    ? allGrades.reduce((s, g) => s + (g.points ?? 0), 0) / allGrades.length
    : null;
  const einAvg = eingebrachte.length > 0
    ? eingebrachte.reduce((s, g) => s + (g.points ?? 0), 0) / eingebrachte.length
    : null;

  return {
    semester,
    allGrades,
    eingebrachte,
    allAverage: allAvg,
    eingebrachteAverage: einAvg,
    deficits: eingebrachte.filter((g) => isDeficit(g.points!)).length,
    enteredCount: allGrades.length,
    totalSubjects: subjects.length,
    einbringungCount: eingebrachte.length,
  };
}

// ─── Block I ───────────────────────────────────────────────

export interface BlockIResult {
  totalPoints: number;
  maxPoints: number;
  contributedGrades: SemesterGrade[];
  droppedGrades: SemesterGrade[];
  einbringungCount: number;
  deficitCount: number;
  zeroCount: number;
  passed: boolean;
  average: number;
}

export function calculateBlockI(profile: AbiturProfile): BlockIResult {
  const allGrades = (profile.grades ?? []).filter((g) => g.points !== null && g.subjectId !== 'psem');
  const contributed: SemesterGrade[] = [];
  const dropped: SemesterGrade[] = [];

  for (const g of allGrades) {
    if (isEingebracht(g.subjectId, g.semester, profile)) {
      contributed.push(g);
    } else {
      dropped.push(g);
    }
  }

  // W-Seminar special: add Seminararbeit (×3 weighted → capped to 2 grade-equivalents)
  // The W-Seminar Seminararbeit + Presentation count as up to 2 extra Einbringungen in Block I
  let wsemBonus = 0;
  let wsemEinbringungen = 0;
  if (profile.seminarPaperPoints !== null && profile.seminarPaperPoints > 0) {
    // Seminararbeit counts double (worth 2× in some interpretations, but we add as 2 grades)
    wsemBonus += profile.seminarPaperPoints * 2; // Seminararbeit ×2
    wsemEinbringungen += 2;
  }
  if (profile.seminarPresentationPoints !== null) {
    wsemBonus += profile.seminarPresentationPoints;
    wsemEinbringungen += 1;
  }

  const totalPoints = contributed.reduce((sum, g) => sum + (g.points ?? 0), 0) + wsemBonus;
  const deficitCount = contributed.filter((g) => isDeficit(g.points!)).length;
  const zeroCount = contributed.filter((g) => g.points === 0).length;
  const einbringungCount = contributed.length + wsemEinbringungen;
  const average = einbringungCount > 0 ? totalPoints / einbringungCount : 0;

  return {
    totalPoints, maxPoints: 600,
    contributedGrades: contributed, droppedGrades: dropped,
    einbringungCount,
    deficitCount, zeroCount,
    passed: totalPoints >= 200 && deficitCount <= 8,
    average,
  };
}

// ─── Block I Auto-Optimizer ────────────────────────────────

/**
 * Automatically selects the optimal 40 Einbringungen for Block I.
 * Algorithm:
 * 1. Collect all non-null grades (excluding P-Seminar)
 * 2. Identify mandatory grades per subject rules (Pflicht = all 4 HJ, Wahlpflicht = best N)
 * 3. Fill remaining slots with highest available optional grades
 * Returns an array of einbringung keys (subjectId:semester) that should be selected.
 */
export function optimizeEinbringungen(profile: AbiturProfile): string[] {
  const result: string[] = [];
  const used = new Set<string>();

  // Helper: get grade points for a subject+semester, returns -1 if not entered
  const getPoints = (subjectId: string, sem: Semester): number => {
    const g = (profile.grades ?? []).find((g) => g.subjectId === subjectId && g.semester === sem);
    return g?.points ?? -1;
  };

  // Step 1: Collect mandatory einbringungen (all 4 HJ, can't be dropped)
  for (const subjectId of profile.subjects) {
    if (subjectId === 'psem') continue;
    const rule = getEinbringungRule(subjectId, profile);
    if (rule.category === 'pflicht') {
      // All 4 semesters are mandatory
      for (const sem of SEMESTERS) {
        const key = eKey(subjectId, sem);
        if (getPoints(subjectId, sem) >= 0) {
          result.push(key);
          used.add(key);
        }
      }
    }
  }

  // Step 2: For Wahlpflicht subjects, pick the best N semesters (where N = minSemesters)
  for (const subjectId of profile.subjects) {
    if (subjectId === 'psem' || subjectId === 'wsem') continue;
    const rule = getEinbringungRule(subjectId, profile);
    if (rule.category !== 'wahlpflicht') continue;

    // Collect available grades for this subject, sorted by points descending
    const available: { sem: Semester; points: number; key: string }[] = [];
    for (const sem of SEMESTERS) {
      const key = eKey(subjectId, sem);
      if (used.has(key)) continue;
      const pts = getPoints(subjectId, sem);
      if (pts >= 0) available.push({ sem, points: pts, key });
    }
    available.sort((a, b) => b.points - a.points);

    // Pick best minSemesters grades
    const needed = Math.min(rule.minSemesters, available.length);
    for (let i = 0; i < needed; i++) {
      result.push(available[i].key);
      used.add(available[i].key);
    }
  }

  // Step 3: W-Seminar — pick best 2 semesters
  if (profile.subjects.includes('wsem')) {
    const wsemRule = getEinbringungRule('wsem', profile);
    const available: { sem: Semester; points: number; key: string }[] = [];
    for (const sem of SEMESTERS) {
      const key = eKey('wsem', sem);
      if (used.has(key)) continue;
      const pts = getPoints('wsem', sem);
      if (pts >= 0) available.push({ sem, points: pts, key });
    }
    available.sort((a, b) => b.points - a.points);
    const needed = Math.min(wsemRule.minSemesters, available.length);
    for (let i = 0; i < needed; i++) {
      result.push(available[i].key);
      used.add(available[i].key);
    }
  }

  // Step 4: Fill remaining slots (up to 40) with highest unused grades
  const TARGET = 40;
  if (result.length < TARGET) {
    const pool: { key: string; points: number }[] = [];
    for (const subjectId of profile.subjects) {
      if (subjectId === 'psem') continue;
      for (const sem of SEMESTERS) {
        const key = eKey(subjectId, sem);
        if (used.has(key)) continue;
        const pts = getPoints(subjectId, sem);
        if (pts >= 0) pool.push({ key, points: pts });
      }
    }
    // Sort by points descending — pick highest grades first
    pool.sort((a, b) => b.points - a.points);

    // Sport: max 3 semesters can be counted
    const sportCount = result.filter((k) => k.startsWith('spo:')).length;
    let sportAdded = sportCount;

    for (const item of pool) {
      if (result.length >= TARGET) break;
      // Enforce Sport max 3
      if (item.key.startsWith('spo:')) {
        if (sportAdded >= 3) continue;
        sportAdded++;
      }
      result.push(item.key);
      used.add(item.key);
    }
  }

  return result;
}

// ─── Block II ──────────────────────────────────────────────

export interface BlockIIResult {
  totalPoints: number; maxPoints: number; rawSum: number;
  exams: ExamResult[];
  passingExamCount: number; hasZeroExam: boolean; coreExamPassed: boolean; passed: boolean;
}

export function calculateBlockII(profile: AbiturProfile): BlockIIResult {
  const exams = profile.exams.filter((e) => e.points !== null);
  const rawSum = exams.reduce((s, e) => s + (e.points ?? 0), 0);
  const totalPoints = rawSum * 4;
  const passing = exams.filter((e) => (e.points ?? 0) >= 5);
  const core = ['deu', 'mat', profile.leistungsfach];
  const coreOk = passing.some((e) => core.includes(e.subjectId));
  return {
    totalPoints, maxPoints: 300, rawSum, exams,
    passingExamCount: passing.length,
    hasZeroExam: exams.some((e) => e.points === 0),
    coreExamPassed: coreOk,
    passed: totalPoints >= 100 && passing.length >= 3 && coreOk && !exams.some((e) => e.points === 0),
  };
}

// ─── Full Calculation ──────────────────────────────────────

export interface AbiturResult {
  blockI: BlockIResult; blockII: BlockIIResult;
  totalPoints: number; maxPoints: number; finalGrade: number;
  passed: boolean; hurdles: HurdleCheck[];
  semesterStats: SemesterStats[];
}

export interface HurdleCheck {
  id: string; label: string; description: string; passed: boolean; severity: 'critical' | 'warning';
}

export function totalPointsToGrade(points: number): number {
  if (points < 300) return 6.0;
  const grade = 17 / 3 - points / 180;
  return Math.max(1.0, Math.min(6.0, Math.round(grade * 10) / 10));
}

export function calculateAbitur(profile: AbiturProfile): AbiturResult {
  const blockI = calculateBlockI(profile);
  const blockII = calculateBlockII(profile);
  const totalPoints = blockI.totalPoints + blockII.totalPoints;
  const finalGrade = totalPointsToGrade(totalPoints);
  const semesterStats = SEMESTERS.map((s) => calcSemesterStats(s, profile));

  const hurdles: HurdleCheck[] = [
    { id: 'b1-min', label: 'Block I ≥ 200 Punkte', description: `${blockI.totalPoints}/200`, passed: blockI.totalPoints >= 200, severity: 'critical' },
    { id: 'b1-40', label: '40 Einbringungen', description: `${blockI.einbringungCount}/40`, passed: blockI.einbringungCount >= 40, severity: 'critical' },
    { id: 'b1-def', label: 'Max. 8 Unterpunktungen', description: `${blockI.deficitCount}/8`, passed: blockI.deficitCount <= 8, severity: 'critical' },
    { id: 'b1-zero', label: 'Keine 0 Punkte (Pflicht)', description: blockI.zeroCount > 0 ? `${blockI.zeroCount}× 0P` : '✓', passed: blockI.zeroCount === 0, severity: 'critical' },
    { id: 'b2-min', label: 'Block II ≥ 100 Punkte', description: `${blockII.totalPoints}/100`, passed: blockII.totalPoints >= 100, severity: 'critical' },
    { id: 'b2-3', label: '≥ 3 Prüfungen ≥ 5P', description: `${blockII.passingExamCount}/3`, passed: blockII.passingExamCount >= 3, severity: 'critical' },
    { id: 'b2-core', label: 'Kernfach bestanden', description: blockII.coreExamPassed ? '✓' : '✗', passed: blockII.coreExamPassed, severity: 'critical' },
    { id: 'b2-zero', label: 'Keine 0P in Prüfungen', description: blockII.hasZeroExam ? '✗' : '✓', passed: !blockII.hasZeroExam, severity: 'critical' },
    { id: 'sem', label: 'Seminararbeit > 0P', description: profile.seminarPaperPoints === null ? 'offen' : profile.seminarPaperPoints === 0 ? '0P!' : `${profile.seminarPaperPoints}P`, passed: profile.seminarPaperPoints === null || profile.seminarPaperPoints > 0, severity: 'critical' },
  ];

  return {
    blockI, blockII, totalPoints, maxPoints: 900, finalGrade,
    passed: hurdles.every((h) => h.passed) && totalPoints >= 300,
    hurdles, semesterStats,
  };
}

// ─── Projection ────────────────────────────────────────────

export function calculateNeededAverage(
  profile: AbiturProfile, targetGrade: number
): { neededBlockIAvg: number; neededExamAvg: number; achievable: boolean } {
  const targetPoints = Math.ceil((17 / 3 - targetGrade) * 180);
  const bI = calculateBlockI(profile);
  const bII = calculateBlockII(profile);
  const remG = Math.max(0, 40 - (profile.grades ?? []).filter((g) => g.points !== null).length);
  const remE = Math.max(0, 5 - profile.exams.filter((e) => e.points !== null).length);
  if (remG === 0 && remE === 0) return { neededBlockIAvg: 0, neededExamAvg: 0, achievable: bI.totalPoints + bII.totalPoints >= targetPoints };
  const need = targetPoints - bI.totalPoints - bII.totalPoints;
  const nBI = remG > 0 ? Math.min(15, Math.max(0, need * 0.67) / remG) : 0;
  const nBII = remE > 0 ? Math.min(15, Math.max(0, need * 0.33) / (remE * 4)) : 0;
  return { neededBlockIAvg: Math.round(nBI * 10) / 10, neededExamAvg: Math.round(nBII * 10) / 10, achievable: nBI <= 15 && nBII <= 15 };
}

export function checkFieldCoverage(examSubjects: string[]) {
  const f = examSubjects.map((id) => getSubject(id)?.field ?? 0);
  const f1 = f.includes(1), f2 = f.includes(2), f3 = f.includes(3);
  return { field1: f1, field2: f2, field3: f3, allCovered: f1 && f2 && f3 };
}

// ─── Mutually Exclusive Subject Groups ─────────────────────

/** Groups of subjects where only one can be taken at a time.
 *  NOTE: Geo/WR are NOT mutually exclusive in the schedule — both can be taken.
 *  Only the mandatory social science SLOT is exclusive (one fills the requirement). */
export const EXCLUSIVE_GROUPS: string[][] = [
  ['eth', 'rev', 'rka'],   // Ethik / Ev. Religion / Kath. Religion — pick one
  ['kun', 'mus'],           // Kunst / Musik — musisches Pflichtfach, pick one
];

/** When selecting a subject in an exclusive group, remove the conflicting ones */
export function applyExclusivity(subjects: string[], adding: string): string[] {
  for (const group of EXCLUSIVE_GROUPS) {
    if (group.includes(adding)) {
      subjects = subjects.filter((id) => !group.includes(id) || id === adding);
    }
  }
  return subjects;
}

/** Get the exclusive group a subject belongs to, or null */
export function getExclusiveGroup(subjectId: string): string[] | null {
  return EXCLUSIVE_GROUPS.find((g) => g.includes(subjectId)) ?? null;
}

// ─── Exam Validation ───────────────────────────────────────

export interface ExamValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Check if a subject can be used as Leistungsfach (3rd written exam).
 * Rules:
 * - Must have `canBeLF: true`
 * - Late-starting languages (Spanisch spätbeg.) are excluded
 * - Sport/Kunst/Musik require Additum (theory course)
 */
export function canSubjectBeLF(subjectId: string): ExamValidation {
  const s = getSubject(subjectId);
  if (!s) return { valid: false, reason: 'Fach nicht gefunden' };
  if (!s.canBeLF) return { valid: false, reason: `${s.name} kann nicht Leistungsfach sein` };
  if (s.lateStart) return { valid: false, reason: 'Spätbeginnende Fremdsprachen können nicht LF sein' };
  if (s.requiresAdditum) return { valid: true, reason: `Benötigt ${s.id === 'spo' ? 'Sport-' : ''}Additum (Theorie + Praxis)` };
  return { valid: true };
}

/**
 * Check if a subject can be a written Abitur exam.
 */
export function canSubjectBeWrittenExam(subjectId: string): ExamValidation {
  const s = getSubject(subjectId);
  if (!s) return { valid: false, reason: 'Fach nicht gefunden' };
  if (s.canBeWrittenExam === false) {
    if (s.lateStart) return { valid: false, reason: 'Spätbeginnende Sprache — nur mündlich (Kolloquium) möglich' };
    return { valid: false, reason: `${s.name} ist nicht als schriftliche Prüfung zugelassen` };
  }
  if (s.requiresAdditum) return { valid: true, reason: `Benötigt Additum` };
  return { valid: true };
}

/**
 * Check if a subject can be an oral exam (Kolloquium).
 */
export function canSubjectBeOralExam(subjectId: string): ExamValidation {
  const s = getSubject(subjectId);
  if (!s) return { valid: false, reason: 'Fach nicht gefunden' };
  if (s.canBeOralExam === false) {
    if (s.id === 'spo') return { valid: false, reason: 'Sport nur als schriftl. Prüfung mit Additum' };
    return { valid: false, reason: `${s.name} ist nicht als Kolloquium zugelassen` };
  }
  return { valid: true };
}

/**
 * Validate the full set of 5 exam subjects for the Abdeckungsgebot (field coverage rule).
 * The 5 exams must cover all 3 academic fields (Aufgabenfelder 1, 2, 3).
 *
 * Supports the "Joker" substitution rule:
 * - If Deutsch is substituted: must have ≥ 2 foreign languages among exam subjects
 * - If Mathe is substituted: must have ≥ 2 natural sciences among exam subjects
 */
export function validateExamCombination(
  leistungsfach: string,
  exam4: string,
  exam5: string,
  substitution?: 'deu' | 'mat' | null,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Build the 5 exam subjects depending on substitution
  const writtenExams: string[] = [];
  const allExams: string[] = [];

  if (substitution === 'deu') {
    // Deutsch is NOT a mandatory written exam — student replaces it
    // Written: Mat + LF + one of the Kolloquien becomes written
    writtenExams.push('mat', leistungsfach);
    allExams.push('mat', leistungsfach, exam4, exam5);
    // Deutsch moves to a Kolloquium slot or is dropped from exams entirely
    // The student still needs 5 exam subjects total
    warnings.push('Joker: Deutsch als Pflicht-Schriftliche ersetzt — 2 fortgeführte FS nötig');
  } else if (substitution === 'mat') {
    // Mathe is NOT a mandatory written exam
    writtenExams.push('deu', leistungsfach);
    allExams.push('deu', leistungsfach, exam4, exam5);
    warnings.push('Joker: Mathematik als Pflicht-Schriftliche ersetzt — 2 NW nötig');
  } else {
    // Standard: Deutsch + Mathe + LF are written
    writtenExams.push('deu', 'mat', leistungsfach);
    allExams.push('deu', 'mat', leistungsfach, exam4, exam5);
  }

  const filteredAll = allExams.filter(Boolean);

  // Validate substitution prerequisites
  if (substitution === 'deu') {
    // Need ≥ 2 foreign languages (fortgeführte Fremdsprachen) among ALL exam subjects
    const foreignLangs = filteredAll.filter((id) => {
      const s = getSubject(id);
      return s && s.category === 'language' && id !== 'deu' && !s.lateStart;
    });
    if (foreignLangs.length < 2) {
      errors.push('Joker Deutsch: Mindestens 2 fortgeführte Fremdsprachen als Prüfungsfächer nötig');
    }
  }
  if (substitution === 'mat') {
    // Need ≥ 2 natural sciences (Phy, Che, Bio — NOT Informatik) among ALL exam subjects
    const sciences = filteredAll.filter((id) => {
      const s = getSubject(id);
      return s && s.category === 'stem' && id !== 'mat' && id !== 'inf';
    });
    if (sciences.length < 2) {
      errors.push('Joker Mathematik: Mindestens 2 Naturwissenschaften (Phy/Che/Bio) als Prüfungsfächer nötig');
    }
  }

  // Check field coverage (Abdeckungsgebot)
  const coverage = checkFieldCoverage(filteredAll);
  if (!coverage.field1) errors.push('Kein Prüfungsfach aus Aufgabenfeld I (sprachl.-lit.-künstlerisch)');
  if (!coverage.field2) errors.push('Kein Prüfungsfach aus Aufgabenfeld II (gesellschaftswiss.)');
  if (!coverage.field3) errors.push('Kein Prüfungsfach aus Aufgabenfeld III (math.-naturwiss.)');

  // Check for seminar subjects
  if ([leistungsfach, exam4, exam5].filter((id) => id === 'wsem' || id === 'psem').length > 0) {
    errors.push('Seminare können nicht als Prüfungsfach gewählt werden');
  }

  // Check oral exam validity for Kolloquien
  if (exam4) {
    const v4 = canSubjectBeOralExam(exam4);
    if (!v4.valid) errors.push(`4. Prüfung: ${v4.reason}`);
  }
  if (exam5) {
    const v5 = canSubjectBeOralExam(exam5);
    if (!v5.valid) errors.push(`5. Prüfung: ${v5.reason}`);
  }

  // Check LF validity
  if (leistungsfach) {
    const vLF = canSubjectBeLF(leistungsfach);
    if (!vLF.valid) errors.push(`Leistungsfach: ${vLF.reason}`);
    if (vLF.valid && vLF.reason) warnings.push(`Leistungsfach: ${vLF.reason}`);
  }

  // Check exclusive subjects used as both oral exams
  if (exam4 && exam5) {
    for (const group of EXCLUSIVE_GROUPS) {
      if (group.includes(exam4) && group.includes(exam5)) {
        errors.push(`${getSubject(exam4)?.name} und ${getSubject(exam5)?.name} schließen sich gegenseitig aus`);
      }
    }
  }

  // Warning: Additum subjects
  for (const id of filteredAll) {
    const s = getSubject(id);
    if (s?.requiresAdditum) {
      warnings.push(`${s.name} benötigt Additum (2 Jahre Theorie + Praxis)`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Einbringung / Streichung Rules ────────────────────────

export interface EinbringungRule {
  subjectId: string;
  minSemesters: number;       // Minimum semesters that MUST be counted
  maxDroppable: number;       // How many can be dropped ("gestrichen")
  reason: string;
  category: 'pflicht' | 'wahlpflicht' | 'optional';
}

/**
 * Get the Einbringung rules for a specific subject.
 * Based on Bavarian G9 Streichungsregeln:
 *
 * PFLICHT (all 4 semesters mandatory):
 * - Deutsch, Mathe, Leistungsfach, all exam subjects, primary foreign language, primary science
 *
 * WAHLPFLICHT (3 of 4 semesters required):
 * - Religion/Ethik: 4 taken, only 3 mandatory → drop worst 1
 * - Geschichte + PuG combined: ~4 taken, 3 mandatory → drop worst 1
 *
 * OPTIONAL (0-4 semesters, only count if they help):
 * - Sport (if not exam): max 3 semesters counted
 * - Extra sciences, extra languages: can drop all 4
 * - Choir/Orchestra/etc: purely optional
 */
export function getEinbringungRule(
  subjectId: string,
  profile: AbiturProfile,
): EinbringungRule {
  const s = getSubject(subjectId);
  if (!s) return { subjectId, minSemesters: 0, maxDroppable: 4, reason: 'Unbekannt', category: 'optional' };

  // Deutsch & Mathe: always 4 semesters mandatory
  if (subjectId === 'deu' || subjectId === 'mat') {
    return { subjectId, minSemesters: 4, maxDroppable: 0, reason: 'Pflichtfach — alle 4 HJ', category: 'pflicht' };
  }

  // Leistungsfach: all 4 semesters mandatory
  if (subjectId === profile.leistungsfach) {
    return { subjectId, minSemesters: 4, maxDroppable: 0, reason: 'Leistungsfach — alle 4 HJ', category: 'pflicht' };
  }

  // Exam subjects (4th + 5th): all 4 semesters mandatory
  if (profile.examSubjects.includes(subjectId)) {
    return { subjectId, minSemesters: 4, maxDroppable: 0, reason: 'Prüfungsfach — alle 4 HJ', category: 'pflicht' };
  }

  // Primary foreign language (first language in selected subjects that isn't LF/exam)
  // In Bavaria the "fortgeführte Fremdsprache" is always mandatory 4 semesters
  const primaryLang = profile.subjects.find(
    (id) => {
      const sub = getSubject(id);
      return sub && sub.category === 'language' && id !== 'deu';
    }
  );
  if (subjectId === primaryLang) {
    return { subjectId, minSemesters: 4, maxDroppable: 0, reason: 'Fortgeführte Fremdsprache — alle 4 HJ', category: 'pflicht' };
  }

  // Primary natural science (first STEM subject in selection)
  const primaryScience = profile.subjects.find(
    (id) => {
      const sub = getSubject(id);
      return sub && sub.category === 'stem' && id !== 'mat' && id !== 'inf';
    }
  );
  if (subjectId === primaryScience) {
    return { subjectId, minSemesters: 4, maxDroppable: 0, reason: 'Naturwissenschaft (Pflicht) — alle 4 HJ', category: 'pflicht' };
  }

  // Religion/Ethik: 4 taken, 3 mandatory
  if (['eth', 'rev', 'rka'].includes(subjectId)) {
    return { subjectId, minSemesters: 3, maxDroppable: 1, reason: 'Rel./Ethik — 3 von 4 HJ Pflicht', category: 'wahlpflicht' };
  }

  // Geschichte: exactly 2 of 4 mandatory (G9: "mind. 2 HJ Geschichte")
  if (subjectId === 'ges') {
    return { subjectId, minSemesters: 2, maxDroppable: 2, reason: 'Geschichte — mind. 2 HJ', category: 'wahlpflicht' };
  }

  // PuG (Politik und Gesellschaft): usually 1-2 semesters required
  if (subjectId === 'pug') {
    return { subjectId, minSemesters: 1, maxDroppable: 3, reason: 'PuG — mind. 1 HJ', category: 'wahlpflicht' };
  }

  // Kunst/Musik: musisches Pflichtfach, 3 semesters mandatory
  if (subjectId === 'kun' || subjectId === 'mus') {
    return { subjectId, minSemesters: 3, maxDroppable: 1, reason: 'Musisches Pflichtfach — 3 von 4 HJ', category: 'wahlpflicht' };
  }

  // Sport (not as exam): max 3 semesters, all droppable
  if (subjectId === 'spo') {
    return { subjectId, minSemesters: 0, maxDroppable: 4, reason: 'Sport — optional, max. 3 HJ zählbar', category: 'optional' };
  }

  // W-Seminar: special rules (paper + presentation separate)
  if (subjectId === 'wsem') {
    return { subjectId, minSemesters: 2, maxDroppable: 2, reason: 'W-Seminar — 2 von 4 HJ + Seminararbeit', category: 'wahlpflicht' };
  }

  // P-Seminar: not counted in Block I (only pass/fail)
  if (subjectId === 'psem') {
    return { subjectId, minSemesters: 0, maxDroppable: 4, reason: 'P-Seminar — nicht in Block I', category: 'optional' };
  }

  // Everything else (extra languages, extra sciences, Informatik as 2nd STEM, Geo/WR if not exam):
  // Completely optional — only count if they boost average
  return { subjectId, minSemesters: 0, maxDroppable: 4, reason: 'Wahlfach — optional einbringbar', category: 'optional' };
}

/**
 * Get all Einbringung rules for the profile's subjects.
 */
export function getAllEinbringungRules(profile: AbiturProfile): EinbringungRule[] {
  return profile.subjects
    .filter((id) => id !== 'psem')
    .map((id) => getEinbringungRule(id, profile));
}

/**
 * Check which subjects can be "easily dropped" (Streichkandidaten).
 * Returns subjects sorted by drop priority (most droppable first).
 */
export function getDropCandidates(profile: AbiturProfile): EinbringungRule[] {
  return getAllEinbringungRules(profile)
    .filter((r) => r.maxDroppable > 0)
    .sort((a, b) => b.maxDroppable - a.maxDroppable);
}

/**
 * Get subjects that can NEVER have a grade dropped (Pflicht-Einbringungen).
 */
export function getMandatoryEinbringungen(profile: AbiturProfile): EinbringungRule[] {
  return getAllEinbringungRules(profile)
    .filter((r) => r.category === 'pflicht');
}

// ─── Kolloquium Eligibility ────────────────────────────────

/**
 * Get subjects eligible for Kolloquium (oral exam) given the current exam setup.
 * Filters out:
 * - Already used exam subjects (Deu, Mat, LF)
 * - Subjects that can't be oral exams
 * - The other Kolloquium (can't pick same subject twice)
 * - Exclusive group conflicts with other Kolloquium
 */
export function getKolloquiumOptions(
  profile: AbiturProfile,
  slotIndex: 3 | 4,
): { id: string; subject: SubjectDefinition; validation: ExamValidation; fieldCoverage: ReturnType<typeof checkFieldCoverage> }[] {
  const otherSlot = slotIndex === 3 ? 4 : 3;
  const otherExam = profile.examSubjects[otherSlot] || '';
  const usedIds = new Set(['deu', 'mat', profile.leistungsfach, 'wsem', 'psem']);
  if (otherExam) usedIds.add(otherExam);

  return profile.subjects
    .filter((id) => !usedIds.has(id))
    .map((id) => {
      const subject = getSubject(id);
      if (!subject) return null;
      const validation = canSubjectBeOralExam(id);

      // Check what field coverage would look like with this choice
      const hypothetical = ['deu', 'mat', profile.leistungsfach, otherExam, id].filter(Boolean);
      const fieldCoverage = checkFieldCoverage(hypothetical);

      return { id, subject, validation, fieldCoverage };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

// ─── Create Default Profile ────────────────────────────────

export function createDefaultProfile(): AbiturProfile {
  const subs = ['deu', 'mat', 'eng', 'ges', 'pug', 'phy', 'rev', 'spo', 'kun', 'wsem', 'psem'];
  const grades: SemesterGrade[] = [];
  for (const subjectId of subs) {
    for (const semester of SEMESTERS) {
      grades.push({ subjectId, semester, points: null });
    }
  }
  return {
    id: crypto.randomUUID(), onboardingComplete: false,
    leistungsfach: 'eng', subjects: subs,
    examSubjects: ['deu', 'mat', 'eng', '', ''],
    grades, einbringungen: [],
    exams: [
      { subjectId: 'deu', examType: 'written', points: null },
      { subjectId: 'mat', examType: 'written', points: null },
      { subjectId: 'eng', examType: 'written', points: null },
      { subjectId: '', examType: 'colloquium', points: null },
      { subjectId: '', examType: 'colloquium', points: null },
    ],
    seminarPaperPoints: null, seminarPresentationPoints: null, seminarTopicTitle: '',
    studentName: '', schoolYear: '2025/2027', currentSemester: '12/1',
    substitutedWritten: null,
  };
}
