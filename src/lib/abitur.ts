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
}

// ─── Subject Database ──────────────────────────────────────

export const ALL_SUBJECTS: SubjectDefinition[] = [
  { id: 'deu', name: 'Deutsch', shortName: 'D', field: 1, defaultLevel: 'eA', hoursPerWeek: 4, canBeLF: false, category: 'language' },
  { id: 'eng', name: 'Englisch', shortName: 'E', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'language' },
  { id: 'fra', name: 'Französisch', shortName: 'F', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'language' },
  { id: 'lat', name: 'Latein', shortName: 'L', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'language' },
  { id: 'spa', name: 'Spanisch', shortName: 'Sp', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'language' },
  { id: 'ita', name: 'Italienisch', shortName: 'It', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'language' },
  { id: 'rus', name: 'Russisch', shortName: 'Ru', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'language' },
  { id: 'gri', name: 'Griechisch', shortName: 'Gr', field: 1, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'language' },
  { id: 'kun', name: 'Kunst', shortName: 'Ku', field: 1, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'art' },
  { id: 'mus', name: 'Musik', shortName: 'Mu', field: 1, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'art' },
  { id: 'ges', name: 'Geschichte', shortName: 'G', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'social' },
  { id: 'geo', name: 'Geographie', shortName: 'Geo', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'social' },
  { id: 'pug', name: 'Politik & Gesellschaft', shortName: 'PuG', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: false, category: 'social' },
  { id: 'wir', name: 'Wirtschaft & Recht', shortName: 'WR', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'social' },
  { id: 'rev', name: 'Ev. Religionslehre', shortName: 'EvR', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: false, category: 'social' },
  { id: 'rka', name: 'Kath. Religionslehre', shortName: 'KR', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: false, category: 'social' },
  { id: 'eth', name: 'Ethik', shortName: 'Eth', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: false, category: 'social' },
  { id: 'mat', name: 'Mathematik', shortName: 'M', field: 3, defaultLevel: 'eA', hoursPerWeek: 4, canBeLF: false, category: 'stem' },
  { id: 'phy', name: 'Physik', shortName: 'Ph', field: 3, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'stem' },
  { id: 'che', name: 'Chemie', shortName: 'Ch', field: 3, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'stem' },
  { id: 'bio', name: 'Biologie', shortName: 'Bio', field: 3, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'stem' },
  { id: 'inf', name: 'Informatik', shortName: 'Inf', field: 3, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'stem' },
  { id: 'spo', name: 'Sport', shortName: 'Spo', field: 0, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'sport' },
  { id: 'wsem', name: 'W-Seminar', shortName: 'W', field: 0, defaultLevel: 'wahlpflicht', hoursPerWeek: 2, canBeLF: false, category: 'seminar' },
  { id: 'psem', name: 'P-Seminar', shortName: 'P', field: 0, defaultLevel: 'wahlpflicht', hoursPerWeek: 2, canBeLF: false, category: 'seminar' },
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
  return profile.einbringungen.includes(eKey(subjectId, semester));
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
  const allGrades = profile.grades.filter(
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
  const allGrades = profile.grades.filter((g) => g.points !== null && g.subjectId !== 'psem');
  const contributed: SemesterGrade[] = [];
  const dropped: SemesterGrade[] = [];

  for (const g of allGrades) {
    if (isEingebracht(g.subjectId, g.semester, profile)) {
      contributed.push(g);
    } else {
      dropped.push(g);
    }
  }

  const totalPoints = contributed.reduce((sum, g) => sum + (g.points ?? 0), 0);
  const deficitCount = contributed.filter((g) => isDeficit(g.points!)).length;
  const zeroCount = contributed.filter((g) => g.points === 0).length;
  const average = contributed.length > 0 ? totalPoints / contributed.length : 0;

  return {
    totalPoints, maxPoints: 600,
    contributedGrades: contributed, droppedGrades: dropped,
    einbringungCount: contributed.length,
    deficitCount, zeroCount,
    passed: totalPoints >= 200 && deficitCount <= 8,
    average,
  };
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
  const remG = Math.max(0, 40 - profile.grades.filter((g) => g.points !== null).length);
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
  };
}
