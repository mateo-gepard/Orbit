// ═══════════════════════════════════════════════════════════
// ORBIT — Abitur Engine (Bavarian G9)
// Complete calculation engine for the Qualifikationsphase
// ═══════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────

export type Semester = '12/1' | '12/2' | '13/1' | '13/2';
export const SEMESTERS: Semester[] = ['12/1', '12/2', '13/1', '13/2'];

export type SubjectLevel = 'eA' | 'gA' | 'wahlpflicht';

export type SubjectField = 1 | 2 | 3 | 0; // 0 = no field (Sport)

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
  points: number | null; // 0-15, null = not yet entered
}

export interface ExamResult {
  subjectId: string;
  examType: ExamType;
  points: number | null; // 0-15
}

export interface AbiturProfile {
  id: string;
  // Chosen subjects
  leistungsfach: string; // subject ID
  subjects: string[]; // all subject IDs the student is taking
  examSubjects: string[]; // 5 exam subject IDs (order: written1=Deutsch, written2=Math, written3=LF, colloquium1, colloquium2)

  // All semester grades
  grades: SemesterGrade[];

  // Exam results
  exams: ExamResult[];

  // Seminar
  seminarPaperPoints: number | null;
  seminarPresentationPoints: number | null;
  seminarTopicTitle: string;

  // Metadata
  studentName: string;
  schoolYear: string; // e.g. "2025/2027"
  currentSemester: Semester;
}

// ─── Subject Database ──────────────────────────────────────

export const ALL_SUBJECTS: SubjectDefinition[] = [
  // Field I — Language, Literature, Arts
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
  // Field II — Social Sciences
  { id: 'ges', name: 'Geschichte', shortName: 'G', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'social' },
  { id: 'geo', name: 'Geographie', shortName: 'Geo', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'social' },
  { id: 'pug', name: 'Politik & Gesellschaft', shortName: 'PuG', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: false, category: 'social' },
  { id: 'wir', name: 'Wirtschaft & Recht', shortName: 'WR', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'social' },
  { id: 'rev', name: 'Ev. Religionslehre', shortName: 'EvR', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: false, category: 'social' },
  { id: 'rka', name: 'Kath. Religionslehre', shortName: 'KR', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: false, category: 'social' },
  { id: 'eth', name: 'Ethik', shortName: 'Eth', field: 2, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: false, category: 'social' },
  // Field III — Math & Natural Sciences
  { id: 'mat', name: 'Mathematik', shortName: 'M', field: 3, defaultLevel: 'eA', hoursPerWeek: 4, canBeLF: false, category: 'stem' },
  { id: 'phy', name: 'Physik', shortName: 'Ph', field: 3, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'stem' },
  { id: 'che', name: 'Chemie', shortName: 'Ch', field: 3, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'stem' },
  { id: 'bio', name: 'Biologie', shortName: 'Bio', field: 3, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'stem' },
  { id: 'inf', name: 'Informatik', shortName: 'Inf', field: 3, defaultLevel: 'gA', hoursPerWeek: 3, canBeLF: true, category: 'stem' },
  // No field
  { id: 'spo', name: 'Sport', shortName: 'Spo', field: 0, defaultLevel: 'gA', hoursPerWeek: 2, canBeLF: true, category: 'sport' },
  // Seminars
  { id: 'wsem', name: 'W-Seminar', shortName: 'W', field: 0, defaultLevel: 'wahlpflicht', hoursPerWeek: 2, canBeLF: false, category: 'seminar' },
  { id: 'psem', name: 'P-Seminar', shortName: 'P', field: 0, defaultLevel: 'wahlpflicht', hoursPerWeek: 2, canBeLF: false, category: 'seminar' },
];

export function getSubject(id: string): SubjectDefinition | undefined {
  return ALL_SUBJECTS.find((s) => s.id === id);
}

// ─── Grade Helpers ─────────────────────────────────────────

/** Convert 0-15 points to German grade 1-6 */
export function pointsToGrade(points: number): string {
  if (points >= 13) return '1';
  if (points >= 10) return '2';
  if (points >= 7) return '3';
  if (points >= 5) return '4';
  if (points >= 1) return '5';
  return '6';
}

/** Convert 0-15 points to label */
export function pointsToLabel(points: number): string {
  if (points >= 13) return 'Sehr gut';
  if (points >= 10) return 'Gut';
  if (points >= 7) return 'Befriedigend';
  if (points >= 5) return 'Ausreichend';
  if (points >= 1) return 'Mangelhaft';
  return 'Ungenügend';
}

/** Is this grade a deficit? (under 5 points) */
export function isDeficit(points: number): boolean {
  return points < 5;
}

/** Get color class for points */
export function getPointsColor(points: number | null): string {
  if (points === null) return 'text-muted-foreground/30';
  if (points >= 13) return 'text-emerald-500';
  if (points >= 10) return 'text-sky-500';
  if (points >= 7) return 'text-foreground';
  if (points >= 5) return 'text-amber-500';
  if (points >= 1) return 'text-orange-500';
  return 'text-red-500';
}

/** Get background color class for points */
export function getPointsBg(points: number | null): string {
  if (points === null) return 'bg-muted-foreground/5';
  if (points >= 13) return 'bg-emerald-500/10';
  if (points >= 10) return 'bg-sky-500/10';
  if (points >= 7) return 'bg-foreground/5';
  if (points >= 5) return 'bg-amber-500/10';
  if (points >= 1) return 'bg-orange-500/10';
  return 'bg-red-500/10';
}

// ─── Block I: Semester Grades Calculation ──────────────────

export interface BlockIResult {
  totalPoints: number;
  maxPoints: number; // 600
  contributedGrades: SemesterGrade[]; // the 40 used
  droppedGrades: SemesterGrade[]; // optimized out
  deficitCount: number;
  zeroCount: number;
  passed: boolean;
  average: number; // average of 40 grades
}

/**
 * Calculate Block I score.
 * Selects the optimal 40 grades, enforcing mandatory Einbringungen.
 */
export function calculateBlockI(profile: AbiturProfile): BlockIResult {
  const allGrades = profile.grades.filter((g) => g.points !== null);

  // Mandatory grades that MUST be contributed
  const mandatorySubjectIds = new Set<string>();

  // Deutsch, Math, LF: all 4 semesters
  mandatorySubjectIds.add('deu');
  mandatorySubjectIds.add('mat');
  mandatorySubjectIds.add(profile.leistungsfach);

  // All 5 exam subjects: all 4 semesters
  for (const examSubject of profile.examSubjects) {
    mandatorySubjectIds.add(examSubject);
  }

  // Identify mandatory grades (all semesters for mandatory subjects)
  const mandatoryGrades: SemesterGrade[] = [];
  const optionalGrades: SemesterGrade[] = [];

  for (const g of allGrades) {
    if (mandatorySubjectIds.has(g.subjectId)) {
      mandatoryGrades.push(g);
    } else {
      optionalGrades.push(g);
    }
  }

  // Add W-Seminar grades (paper + presentation count as 2 grades)
  // These are handled separately in the profile

  // Sort optional grades by points descending (for optimization)
  optionalGrades.sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  // Build the 40 grades
  const contributed: SemesterGrade[] = [...mandatoryGrades];

  // Fill remaining slots with best optional grades
  const remaining = 40 - contributed.length;
  const usedOptional = optionalGrades.slice(0, Math.max(0, remaining));
  contributed.push(...usedOptional);

  const dropped = optionalGrades.slice(Math.max(0, remaining));

  // Calculate
  const totalPoints = contributed.reduce((sum, g) => sum + (g.points ?? 0), 0);
  const deficitCount = contributed.filter((g) => g.points !== null && isDeficit(g.points)).length;
  const zeroCount = contributed.filter((g) => g.points === 0).length;
  const average = contributed.length > 0 ? totalPoints / contributed.length : 0;

  return {
    totalPoints,
    maxPoints: 600,
    contributedGrades: contributed,
    droppedGrades: dropped,
    deficitCount,
    zeroCount,
    passed: totalPoints >= 200 && deficitCount <= 8,
    average,
  };
}

// ─── Block II: Exam Calculation ────────────────────────────

export interface BlockIIResult {
  totalPoints: number; // sum * 4
  maxPoints: number; // 300
  rawSum: number;
  exams: ExamResult[];
  passingExamCount: number; // exams >= 5 points
  hasZeroExam: boolean;
  coreExamPassed: boolean; // at least 1 of D/M/LF >= 5
  passed: boolean;
}

export function calculateBlockII(profile: AbiturProfile): BlockIIResult {
  const exams = profile.exams.filter((e) => e.points !== null);
  const rawSum = exams.reduce((sum, e) => sum + (e.points ?? 0), 0);
  const totalPoints = rawSum * 4;

  const passingExams = exams.filter((e) => (e.points ?? 0) >= 5);
  const coreSubjects = ['deu', 'mat', profile.leistungsfach];
  const coreExamPassed = passingExams.some((e) => coreSubjects.includes(e.subjectId));

  return {
    totalPoints,
    maxPoints: 300,
    rawSum,
    exams,
    passingExamCount: passingExams.length,
    hasZeroExam: exams.some((e) => e.points === 0),
    coreExamPassed,
    passed: totalPoints >= 100 && passingExams.length >= 3 && coreExamPassed && !exams.some((e) => e.points === 0),
  };
}

// ─── Total Score & Final Grade ─────────────────────────────

export interface AbiturResult {
  blockI: BlockIResult;
  blockII: BlockIIResult;
  totalPoints: number;
  maxPoints: number; // 900
  finalGrade: number; // 1.0 - 6.0
  passed: boolean;
  hurdles: HurdleCheck[];
}

export interface HurdleCheck {
  id: string;
  label: string;
  description: string;
  passed: boolean;
  severity: 'critical' | 'warning';
}

/** Convert total points (0-900) to Abitur grade (1.0-6.0) */
export function totalPointsToGrade(points: number): number {
  if (points < 300) return 6.0;
  // Official formula: grade = 17/3 - points/180
  const grade = 17 / 3 - points / 180;
  return Math.max(1.0, Math.min(6.0, Math.round(grade * 10) / 10));
}

/** Full Abitur calculation with hurdle checks */
export function calculateAbitur(profile: AbiturProfile): AbiturResult {
  const blockI = calculateBlockI(profile);
  const blockII = calculateBlockII(profile);
  const totalPoints = blockI.totalPoints + blockII.totalPoints;
  const finalGrade = totalPointsToGrade(totalPoints);

  const hurdles: HurdleCheck[] = [];

  // Hurdle 1: Block I minimum
  hurdles.push({
    id: 'block1-min',
    label: 'Block I Minimum (200 Punkte)',
    description: `${blockI.totalPoints} von 200 benötigten Punkten`,
    passed: blockI.totalPoints >= 200,
    severity: 'critical',
  });

  // Hurdle 2: Block I deficit limit
  hurdles.push({
    id: 'block1-deficits',
    label: 'Max. 8 Unterpunktungen (Block I)',
    description: `${blockI.deficitCount} von maximal 8 Unterpunktungen`,
    passed: blockI.deficitCount <= 8,
    severity: 'critical',
  });

  // Hurdle 3: No zero in mandatory grades
  hurdles.push({
    id: 'block1-zeros',
    label: 'Keine 0 Punkte in Pflichtfächern',
    description: blockI.zeroCount > 0 ? `${blockI.zeroCount} Fächer mit 0 Punkten` : 'Alle Pflichtfächer bestanden',
    passed: blockI.zeroCount === 0,
    severity: 'critical',
  });

  // Hurdle 4: Block II minimum
  hurdles.push({
    id: 'block2-min',
    label: 'Block II Minimum (100 Punkte)',
    description: `${blockII.totalPoints} von 100 benötigten Punkten`,
    passed: blockII.totalPoints >= 100,
    severity: 'critical',
  });

  // Hurdle 5: 3 exams >= 5 points
  hurdles.push({
    id: 'block2-3exams',
    label: 'Mind. 3 Prüfungen ≥ 5 Punkte',
    description: `${blockII.passingExamCount} von 3 benötigten Prüfungen bestanden`,
    passed: blockII.passingExamCount >= 3,
    severity: 'critical',
  });

  // Hurdle 6: Core exam passed
  hurdles.push({
    id: 'block2-core',
    label: 'Kernfach bestanden (D/M/LF)',
    description: blockII.coreExamPassed ? 'Mindestens 1 Kernfach ≥ 5 Punkte' : 'Kein Kernfach ≥ 5 Punkte',
    passed: blockII.coreExamPassed,
    severity: 'critical',
  });

  // Hurdle 7: No zero exam
  hurdles.push({
    id: 'block2-no-zero',
    label: 'Keine 0 Punkte in Prüfungen',
    description: blockII.hasZeroExam ? 'Mindestens 1 Prüfung mit 0 Punkten' : 'Alle Prüfungen > 0 Punkte',
    passed: !blockII.hasZeroExam,
    severity: 'critical',
  });

  // Hurdle 8: Seminar paper
  hurdles.push({
    id: 'seminar-paper',
    label: 'W-Seminararbeit > 0 Punkte',
    description: profile.seminarPaperPoints === null
      ? 'Noch nicht bewertet'
      : profile.seminarPaperPoints === 0
        ? 'Seminararbeit mit 0 Punkten — Nichtzulassung!'
        : `Seminararbeit: ${profile.seminarPaperPoints} Punkte`,
    passed: profile.seminarPaperPoints === null || profile.seminarPaperPoints > 0,
    severity: 'critical',
  });

  const allHurdlesPassed = hurdles.every((h) => h.passed);

  return {
    blockI,
    blockII,
    totalPoints,
    maxPoints: 900,
    finalGrade,
    passed: allHurdlesPassed && totalPoints >= 300,
    hurdles,
  };
}

// ─── Projection / Simulation ───────────────────────────────

/** Calculate what average you need on remaining grades to hit a target */
export function calculateNeededAverage(
  profile: AbiturProfile,
  targetGrade: number
): { neededBlockIAvg: number; neededExamAvg: number; achievable: boolean } {
  const targetPoints = Math.ceil((17 / 3 - targetGrade) * 180);

  const currentBlockI = calculateBlockI(profile);
  const currentBlockII = calculateBlockII(profile);

  // How many grades are still missing?
  const enteredGradeCount = profile.grades.filter((g) => g.points !== null).length;
  const remainingGrades = Math.max(0, 40 - enteredGradeCount);

  // How many exams are still missing?
  const enteredExamCount = profile.exams.filter((e) => e.points !== null).length;
  const remainingExams = Math.max(0, 5 - enteredExamCount);

  if (remainingGrades === 0 && remainingExams === 0) {
    return { neededBlockIAvg: 0, neededExamAvg: 0, achievable: currentBlockI.totalPoints + currentBlockII.totalPoints >= targetPoints };
  }

  // Points still needed
  const pointsNeeded = targetPoints - currentBlockI.totalPoints - currentBlockII.totalPoints;

  // Split needed points between blocks proportionally
  const blockINeeded = remainingGrades > 0 ? Math.max(0, pointsNeeded * 0.67) : 0;
  const blockIINeeded = remainingExams > 0 ? Math.max(0, pointsNeeded * 0.33) : 0;

  const neededBlockIAvg = remainingGrades > 0 ? Math.min(15, blockINeeded / remainingGrades) : 0;
  const neededExamAvg = remainingExams > 0 ? Math.min(15, blockIINeeded / (remainingExams * 4)) : 0;

  return {
    neededBlockIAvg: Math.round(neededBlockIAvg * 10) / 10,
    neededExamAvg: Math.round(neededExamAvg * 10) / 10,
    achievable: neededBlockIAvg <= 15 && neededExamAvg <= 15,
  };
}

// ─── Field Coverage Check ──────────────────────────────────

export function checkFieldCoverage(examSubjects: string[]): { field1: boolean; field2: boolean; field3: boolean; allCovered: boolean } {
  const fields = examSubjects.map((id) => getSubject(id)?.field ?? 0);
  const field1 = fields.includes(1);
  const field2 = fields.includes(2);
  const field3 = fields.includes(3);
  return { field1, field2, field3, allCovered: field1 && field2 && field3 };
}

// ─── Create Default Profile ────────────────────────────────

export function createDefaultProfile(): AbiturProfile {
  const defaultSubjects = ['deu', 'mat', 'eng', 'ges', 'pug', 'phy', 'rev', 'spo', 'kun', 'wsem', 'psem'];

  const grades: SemesterGrade[] = [];
  for (const subjectId of defaultSubjects) {
    for (const semester of SEMESTERS) {
      grades.push({ subjectId, semester, points: null });
    }
  }

  const examSubjects = ['deu', 'mat', 'eng', '', ''];

  const exams: ExamResult[] = [
    { subjectId: 'deu', examType: 'written', points: null },
    { subjectId: 'mat', examType: 'written', points: null },
    { subjectId: 'eng', examType: 'written', points: null },
    { subjectId: '', examType: 'colloquium', points: null },
    { subjectId: '', examType: 'colloquium', points: null },
  ];

  return {
    id: crypto.randomUUID(),
    leistungsfach: 'eng',
    subjects: defaultSubjects,
    examSubjects,
    grades,
    exams,
    seminarPaperPoints: null,
    seminarPresentationPoints: null,
    seminarTopicTitle: '',
    studentName: '',
    schoolYear: '2025/2027',
    currentSemester: '12/1',
  };
}
