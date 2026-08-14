// ═══════════════════════════════════════════════════════════
// Threadmap — Abitur Engine (Bavarian G9)
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

/** Individual grade entry (große or kleine Leistungsnachweise) */
export interface IndividualGrade {
  id: string;
  subjectId: string;
  semester: Semester;
  type: 'gross' | 'klein'; // große vs kleine Leistungsnachweise
  points: number;
  label?: string; // optional label like "Schulaufgabe 1", "Stegreifaufgabe", etc.
}

/**
 * Calculate the semester grade (Halbjahresleistung) from individual grades.
 * In Bavaria: Ø große LN and Ø kleine LN count 1:1.
 * Returns null if no grades entered.
 */
export function calculateSemesterPoints(
  grades: IndividualGrade[],
  subjectId: string,
  semester: Semester,
  leistungsfach?: string,
): number | null {
  const subGrades = grades.filter((g) => g.subjectId === subjectId && g.semester === semester);
  if (subGrades.length === 0) return null;

  const gross = subGrades.filter((g) => g.type === 'gross');
  const klein = subGrades.filter((g) => g.type === 'klein');

  // GSO § 29(2), version effective 1 Aug 2026: W-Seminar results and
  // non-Leistungsfach results in 13/2 are based on small assessments only.
  // https://www.gesetze-bayern.de/Content/Document/BayGSO-29
  const onlySmallAssessments = subjectId === 'wsem' || (semester === '13/2' && subjectId !== leistungsfach);
  if (onlySmallAssessments) {
    if (klein.length === 0) return null;
    return Math.round(klein.reduce((sum, grade) => sum + grade.points, 0) / klein.length);
  }

  // If only one type has grades, use just that average
  if (gross.length === 0 && klein.length === 0) return null;
  if (gross.length > 0 && klein.length === 0) {
    return Math.round(gross.reduce((s, g) => s + g.points, 0) / gross.length);
  }
  if (gross.length === 0 && klein.length > 0) {
    return Math.round(klein.reduce((s, g) => s + g.points, 0) / klein.length);
  }

  // Both types: 1:1 weighting (average of averages)
  const grossAvg = gross.reduce((s, g) => s + g.points, 0) / gross.length;
  const kleinAvg = klein.reduce((s, g) => s + g.points, 0) / klein.length;
  return Math.round((grossAvg + kleinAvg) / 2);
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
  /** Individual grades (große/kleine Leistungsnachweise) per subject per semester */
  individualGrades?: IndividualGrade[];
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

/** Is this subject an Abiturfach? (Deu, Mat, LF, exam subjects — user cannot deselect these) */
export function isMandatory(subjectId: string, profile: AbiturProfile): boolean {
  if (subjectId === 'deu' || subjectId === 'mat') return true;
  if (subjectId === profile.leistungsfach) return true;
  if (profile.examSubjects.includes(subjectId)) return true;

  const subject = getSubject(subjectId);
  if (subject?.category === 'language' && subjectId !== 'deu') {
    const languages = profile.subjects.filter((id) => {
      const candidate = getSubject(id);
      return candidate?.category === 'language' && id !== 'deu';
    });
    if (languages.length === 1) return true;
  }

  if (subject?.category === 'stem' && !['mat', 'inf'].includes(subjectId)) {
    const sciences = profile.subjects.filter((id) => {
      const candidate = getSubject(id);
      return candidate?.category === 'stem' && !['mat', 'inf'].includes(id);
    });
    if (sciences.length === 1) return true;
  }
  return false;
}

/** Is a specific grade eingebracht? Either mandatory or user-selected. */
export function isEingebracht(subjectId: string, semester: Semester, profile: AbiturProfile): boolean {
  if (subjectId === 'psem') return false;
  // Anlage 10 footnote 8: only W-Seminar 12/1 and 12/2 are contributed.
  if (subjectId === 'wsem') return semester === '12/1' || semester === '12/2';
  if (isMandatory(subjectId, profile)) return true;
  return (profile.einbringungen ?? []).includes(eKey(subjectId, semester));
}

/** Can the user toggle this einbringung? Only Abiturfächer are locked. */
export function canToggle(subjectId: string, profile: AbiturProfile): boolean {
  if (isMandatory(subjectId, profile)) return false;
  if (subjectId === 'psem' || subjectId === 'wsem') return false;
  return true;
}

/**
 * Simple toggle check: can this semester be toggled?
 * Only Abiturfächer (Deu, Mat, LF, exam subjects) are locked — everything else is free.
 */
export function canToggleSemester(
  subjectId: string,
  semester: Semester,
  profile: AbiturProfile,
): { canToggle: boolean; reason: string; isEingebracht: boolean; isMandatory: boolean } {
  const mandatory = isMandatory(subjectId, profile);
  const eingebracht = isEingebracht(subjectId, semester, profile);

  if (mandatory) {
    return { canToggle: false, reason: 'Abiturfach — alle 4 HJ Pflicht', isEingebracht: true, isMandatory: true };
  }
  if (subjectId === 'psem') {
    return { canToggle: false, reason: 'P-Seminar — nicht in Block I', isEingebracht: false, isMandatory: false };
  }
  if (subjectId === 'wsem') {
    return {
      canToggle: false,
      reason: semester === '12/1' || semester === '12/2'
        ? 'W-Seminar — 12/1 und 12/2 sind Pflicht'
        : 'W-Seminar — 13/1 und 13/2 zählen nicht',
      isEingebracht: semester === '12/1' || semester === '12/2',
      isMandatory: semester === '12/1' || semester === '12/2',
    };
  }

  return { canToggle: true, reason: eingebracht ? 'Klicken zum Streichen' : 'Klicken zum Einbringen', isEingebracht: eingebracht, isMandatory: false };
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
  // The Seminararbeit Gesamtleistung is worth exactly two HJL (Anlage 10 no. 14).
  return count + (profile.subjects.includes('wsem') ? 2 : 0);
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

/**
 * Converts average Abitur points (0-15) to precise decimal grade (0.67-6.00)
 * Using Bavarian formula: grade = (17 - points) / 3
 * Examples: 15P→0.67, 14P→1.0, 13P→1.33, 12P→1.67, 10P→2.33, 5P→4.0, 0P→5.67
 */
export function pointsToDecimalGrade(points: number): number {
  const grade = (17 - points) / 3;
  return Math.max(0.67, Math.min(6.0, grade));
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
  eingebrachteGrade: number | null; // Decimal grade (1.00-6.00) from eingebrachte average
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
  const einGrade = einAvg !== null ? pointsToDecimalGrade(einAvg) : null;

  return {
    semester,
    allGrades,
    eingebrachte,
    allAverage: allAvg,
    eingebrachteAverage: einAvg,
    eingebrachteGrade: einGrade,
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
  seminarTotalPoints: number | null;
  atLeastFiveCount: number;
  missingGradeCount: number;
  rulesValid: boolean;
  ruleErrors: string[];
}

/**
 * GSO § 29(6), effective 1 Aug 2026. The rounded result is worth two HJL.
 * https://www.gesetze-bayern.de/Content/Document/BayGSO-29
 */
export function calculateSeminarTotal(profile: AbiturProfile): number | null {
  const paper = profile.seminarPaperPoints;
  const presentation = profile.seminarPresentationPoints;
  if (paper === null || presentation === null) return null;
  return Math.round((2 * paper + presentation) * (2 / 3));
}

export interface EinbringungValidation {
  valid: boolean;
  errors: string[];
  selectedCourseCount: number;
  totalEquivalentCount: number;
}

/**
 * Validate the contribution selection against GSO Anlage 10 (version effective
 * 1 Aug 2026). The model intentionally does not attempt the one-off Optionsregel;
 * such exceptional combinations must be confirmed by the Oberstufenkoordination.
 * https://www.gesetze-bayern.de/Content/Document/BayGSO-ANL_17
 */
export function validateEinbringungen(profile: AbiturProfile): EinbringungValidation {
  const errors: string[] = [];
  const selectedCount = (subjectId: string) =>
    SEMESTERS.filter((semester) => isEingebracht(subjectId, semester, profile)).length;
  const selectedCourseCount = profile.subjects
    .filter((subjectId) => subjectId !== 'psem')
    .reduce((sum, subjectId) => sum + selectedCount(subjectId), 0);
  const seminarEquivalent = profile.subjects.includes('wsem') ? 2 : 0;
  const totalEquivalentCount = selectedCourseCount + seminarEquivalent;

  if (totalEquivalentCount !== 40) {
    errors.push(`Genau 40 Einbringungen erforderlich (${totalEquivalentCount}/40)`);
  }

  const examSubjects = [...new Set(['deu', 'mat', profile.leistungsfach, ...profile.examSubjects].filter(Boolean))];
  for (const subjectId of examSubjects) {
    if (!profile.subjects.includes(subjectId)) {
      errors.push(`${getSubject(subjectId)?.name ?? subjectId} fehlt in der Fächerwahl`);
    } else if (selectedCount(subjectId) !== 4) {
      errors.push(`${getSubject(subjectId)?.name ?? subjectId}: alle 4 Halbjahre sind Pflicht`);
    }
  }

  if (profile.subjects.includes('wsem')) {
    const correctWsem = isEingebracht('wsem', '12/1', profile)
      && isEingebracht('wsem', '12/2', profile)
      && !isEingebracht('wsem', '13/1', profile)
      && !isEingebracht('wsem', '13/2', profile);
    if (!correctWsem) errors.push('W-Seminar: nur 12/1 und 12/2 dürfen eingebracht werden');
  } else {
    errors.push('W-Seminar und Seminararbeit fehlen');
  }

  const languages = profile.subjects.filter((id) => {
    const subject = getSubject(id);
    return subject?.category === 'language' && id !== 'deu';
  });
  const languageCount = languages.reduce((sum, id) => sum + selectedCount(id), 0);
  if (languageCount < 4) errors.push(`Fremdsprachen: mindestens 4 Halbjahre gesamt (${languageCount}/4)`);

  const sciences = profile.subjects.filter((id) => {
    const subject = getSubject(id);
    return subject?.category === 'stem' && !['mat', 'inf'].includes(id);
  });
  const scienceCount = sciences.reduce((sum, id) => sum + selectedCount(id), 0);
  if (scienceCount < 4) errors.push(`Naturwissenschaften: mindestens 4 Halbjahre gesamt (${scienceCount}/4)`);

  const religion = profile.subjects.find((id) => ['eth', 'rev', 'rka'].includes(id));
  if (!religion) errors.push('Religionslehre bzw. Ethik fehlt');
  else if (selectedCount(religion) < 3) errors.push(`${getSubject(religion)?.name}: 3 Halbjahre erforderlich`);

  if (!profile.subjects.includes('ges')) errors.push('Geschichte fehlt');
  else if (selectedCount('ges') < 3) errors.push('Geschichte: 3 Halbjahre erforderlich');

  const companionSubjects = ['geo', 'wir'].filter((id) => profile.subjects.includes(id));
  if (!profile.subjects.includes('pug')) {
    errors.push('Politik und Gesellschaft fehlt');
  } else if (companionSubjects.length === 0) {
    errors.push('Geographie oder Wirtschaft und Recht fehlt');
  } else {
    const pugCount = selectedCount('pug');
    const companionCounts = companionSubjects.map((id) => selectedCount(id));
    const hasValidGprSplit =
      (pugCount >= 3 && companionCounts.some((count) => count >= 1))
      || (pugCount >= 1 && companionCounts.some((count) => count >= 3));
    if (!hasValidGprSplit) {
      errors.push('GPR-Bereich: im fortgeführten Fach 3, im anderen Fach 1 Halbjahr erforderlich');
    }
  }

  const arts = ['kun', 'mus'].filter((id) => profile.subjects.includes(id));
  if (arts.length === 0) errors.push('Kunst oder Musik fehlt');
  else if (!arts.some((id) => selectedCount(id) >= 3)) errors.push('Kunst/Musik: 3 Halbjahre erforderlich');

  const sportCount = selectedCount('spo');
  const sportIsExam = profile.leistungsfach === 'spo' || profile.examSubjects.includes('spo');
  if (!sportIsExam && sportCount > 3) errors.push(`Sport: höchstens 3 Halbjahre (${sportCount}/3)`);

  if (profile.substitutedWritten) {
    errors.push('Joker-Regel ist in diesem Rechner nicht vollständig abbildbar; schulisch prüfen lassen');
  }

  return { valid: errors.length === 0, errors, selectedCourseCount, totalEquivalentCount };
}

export function calculateBlockI(profile: AbiturProfile): BlockIResult {
  const allGrades = (profile.grades ?? []).filter((grade) => grade.subjectId !== 'psem');
  const contributed: SemesterGrade[] = [];
  const dropped: SemesterGrade[] = [];
  let missingGradeCount = 0;

  for (const g of allGrades) {
    if (isEingebracht(g.subjectId, g.semester, profile)) {
      if (g.points === null) missingGradeCount++;
      else contributed.push(g);
    } else if (g.points !== null) {
      dropped.push(g);
    }
  }

  const seminarTotalPoints = profile.subjects.includes('wsem') ? calculateSeminarTotal(profile) : null;
  if (profile.subjects.includes('wsem') && seminarTotalPoints === null) missingGradeCount += 2;

  const totalPoints = contributed.reduce((sum, g) => sum + (g.points ?? 0), 0) + (seminarTotalPoints ?? 0);
  const courseAtLeastFive = contributed.filter((g) => (g.points ?? 0) >= 5).length;
  const seminarAtLeastFive = seminarTotalPoints !== null && seminarTotalPoints >= 9 ? 2 : 0;
  const atLeastFiveCount = courseAtLeastFive + seminarAtLeastFive;
  const deficitCount = contributed.filter((g) => isDeficit(g.points!)).length
    + (seminarTotalPoints !== null && seminarTotalPoints < 9 ? 2 : 0);
  const zeroCount = contributed.filter((g) => g.points === 0).length;
  const einbringungCount = contributed.length + (seminarTotalPoints !== null ? 2 : 0);
  const average = einbringungCount > 0 ? totalPoints / einbringungCount : 0;
  const validation = validateEinbringungen(profile);
  const seminarInputsValid = profile.seminarPaperPoints !== null
    && profile.seminarPresentationPoints !== null
    && profile.seminarPaperPoints > 0
    && profile.seminarPresentationPoints > 0;
  const complete = missingGradeCount === 0 && einbringungCount === 40;

  return {
    totalPoints, maxPoints: 600,
    contributedGrades: contributed, droppedGrades: dropped,
    einbringungCount,
    deficitCount, zeroCount,
    passed: complete
      && validation.valid
      && seminarInputsValid
      && totalPoints >= 200
      && atLeastFiveCount >= 32
      && zeroCount === 0,
    average,
    seminarTotalPoints,
    atLeastFiveCount,
    missingGradeCount,
    rulesValid: validation.valid,
    ruleErrors: validation.errors,
  };
}

// ─── Select All Einbringungen ──────────────────────────────

/**
 * Generates einbringung keys for all possible non-mandatory einbringungen.
 * Respects:
 * - Mandatory subjects are implicit (Deu, Mat, LF, exam subjects)
 * - P-Seminar excluded
 * - Optional subjects (Sport, Inf): all 4 semesters (user will drop extras to respect max 3)
 * - Wahlpflicht subjects: all 4 semesters (user will drop to meet constraints)
 * 
 * User starts with MORE than 40 and drops to exactly 40.
 */
export function selectAllEinbringungen(profile: AbiturProfile): string[] {
  const result: string[] = [];
  for (const subjectId of profile.subjects) {
    if (subjectId === 'psem' || subjectId === 'wsem') continue;
    if (isMandatory(subjectId, profile)) continue; // already implicit
    // Select all 4 semesters for all non-mandatory subjects
    // User will manually drop to get to exactly 40
    for (const sem of SEMESTERS) {
      result.push(eKey(subjectId, sem));
    }
  }
  return result;
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
  const selected = new Set<string>();
  const gradePoints = new Map(
    (profile.grades ?? []).map((grade) => [eKey(grade.subjectId, grade.semester), grade.points ?? -1]),
  );
  const pointsFor = (key: string) => gradePoints.get(key) ?? -1;
  const keysFor = (subjectId: string) => SEMESTERS
    .map((semester) => eKey(subjectId, semester))
    .sort((a, b) => pointsFor(b) - pointsFor(a) || a.localeCompare(b));
  const addBest = (subjectId: string, count: number) => {
    for (const key of keysFor(subjectId)) {
      if (selected.size >= 40) break;
      if (!selected.has(key) && count > 0) {
        selected.add(key);
        count--;
      }
    }
  };

  // Seminararbeit is two HJL equivalents; the remaining course target is 38.
  const targetCourseCount = profile.subjects.includes('wsem') ? 38 : 40;

  for (const subjectId of profile.subjects) {
    if (subjectId === 'psem') continue;
    if (subjectId === 'wsem') {
      selected.add(eKey('wsem', '12/1'));
      selected.add(eKey('wsem', '12/2'));
    } else if (isMandatory(subjectId, profile)) {
      for (const semester of SEMESTERS) selected.add(eKey(subjectId, semester));
    }
  }

  const religion = profile.subjects.find((id) => ['eth', 'rev', 'rka'].includes(id));
  if (religion) addBest(religion, Math.max(0, 3 - keysFor(religion).filter((key) => selected.has(key)).length));
  if (profile.subjects.includes('ges')) addBest('ges', Math.max(0, 3 - keysFor('ges').filter((key) => selected.has(key)).length));

  const art = ['kun', 'mus'].find((id) => profile.subjects.includes(id));
  if (art) addBest(art, Math.max(0, 3 - keysFor(art).filter((key) => selected.has(key)).length));

  const companions = ['geo', 'wir'].filter((id) => profile.subjects.includes(id));
  if (profile.subjects.includes('pug') && companions.length > 0) {
    const continuedCandidates = ['pug', ...companions];
    const continued = continuedCandidates
      .map((id) => ({ id, score: keysFor(id).slice(0, 3).reduce((sum, key) => sum + Math.max(0, pointsFor(key)), 0) }))
      .sort((a, b) => b.score - a.score)[0].id;
    addBest(continued, Math.max(0, 3 - keysFor(continued).filter((key) => selected.has(key)).length));
    const counterpart = continued === 'pug'
      ? companions.sort((a, b) => pointsFor(keysFor(b)[0]) - pointsFor(keysFor(a)[0]))[0]
      : 'pug';
    addBest(counterpart, Math.max(0, 1 - keysFor(counterpart).filter((key) => selected.has(key)).length));
  }

  const ensureGroupTotal = (subjectIds: string[], minimum: number) => {
    let current = subjectIds.reduce(
      (sum, id) => sum + keysFor(id).filter((key) => selected.has(key)).length,
      0,
    );
    const pool = subjectIds
      .flatMap((id) => keysFor(id))
      .filter((key) => !selected.has(key))
      .sort((a, b) => pointsFor(b) - pointsFor(a) || a.localeCompare(b));
    for (const key of pool) {
      if (current >= minimum) break;
      selected.add(key);
      current++;
    }
  };

  const languages = profile.subjects.filter((id) => getSubject(id)?.category === 'language' && id !== 'deu');
  const sciences = profile.subjects.filter((id) => getSubject(id)?.category === 'stem' && !['mat', 'inf'].includes(id));
  ensureGroupTotal(languages, 4);
  ensureGroupTotal(sciences, 4);

  const sportIsExam = profile.leistungsfach === 'spo' || profile.examSubjects.includes('spo');
  const pool = profile.subjects
    .filter((id) => id !== 'psem' && id !== 'wsem')
    .flatMap((id) => keysFor(id))
    .filter((key) => !selected.has(key))
    .sort((a, b) => pointsFor(b) - pointsFor(a) || a.localeCompare(b));

  for (const key of pool) {
    if (selected.size >= targetCourseCount) break;
    if (!sportIsExam && key.startsWith('spo:') && [...selected].filter((item) => item.startsWith('spo:')).length >= 3) continue;
    selected.add(key);
  }

  return [...selected];
}

// ─── Block II ──────────────────────────────────────────────

export interface BlockIIResult {
  totalPoints: number; maxPoints: number; rawSum: number;
  exams: ExamResult[];
  passingExamCount: number;
  hasZeroExam: boolean;
  coreExamPassed: boolean;
  complete: boolean;
  trioPassed: boolean;
  fieldMinimumsPassed: boolean;
  passed: boolean;
}

export function calculateBlockII(profile: AbiturProfile): BlockIIResult {
  const slots = profile.exams.slice(0, 5);
  const exams = slots.filter((exam) => exam.points !== null && exam.subjectId);
  const uniqueSubjects = new Set(slots.map((exam) => exam.subjectId).filter(Boolean));
  const complete = slots.length === 5
    && slots.every((exam) => exam.subjectId && exam.points !== null)
    && uniqueSubjects.size === 5;
  const rawSum = exams.reduce((sum, exam) => sum + (exam.points ?? 0), 0);
  const totalPoints = rawSum * 4;
  const passing = exams.filter((exam) => (exam.points ?? 0) >= 5);
  const core = ['deu', 'mat', profile.leistungsfach];
  const coreOk = passing.some((exam) => core.includes(exam.subjectId));
  const examBySubject = new Map(exams.map((exam) => [exam.subjectId, exam.points ?? 0]));

  const languageOrScience = exams
    .map((exam) => exam.subjectId)
    .filter((subjectId) => {
      const subject = getSubject(subjectId);
      return (subject?.category === 'language' && subjectId !== 'deu')
        || (subject?.category === 'stem' && !['mat', 'inf'].includes(subjectId));
    });
  let fixedTrio: string[];
  if (profile.substitutedWritten === 'deu') fixedTrio = ['mat', profile.leistungsfach];
  else if (profile.substitutedWritten === 'mat') fixedTrio = ['deu', profile.leistungsfach];
  else fixedTrio = ['deu', 'mat'];

  const trioPassed = languageOrScience.some((thirdSubject) => {
    if (fixedTrio.includes(thirdSubject)) return false;
    const trio = [...fixedTrio, thirdSubject];
    if (trio.some((subjectId) => !examBySubject.has(subjectId))) return false;
    const weighted = trio.map((subjectId) => (examBySubject.get(subjectId) ?? 0) * 4);
    return weighted.reduce((sum, points) => sum + points, 0) >= 40
      && weighted.filter((points) => points < 16).length <= 1;
  });

  const fieldMinimumsPassed = ([1, 2, 3] as const).every((field) =>
    exams.filter((exam) => getSubject(exam.subjectId)?.field === field && (exam.points ?? 0) * 4 < 16).length <= 1,
  );
  const hasZeroExam = exams.some((exam) => exam.points === 0);
  return {
    totalPoints, maxPoints: 300, rawSum, exams,
    passingExamCount: passing.length,
    hasZeroExam,
    coreExamPassed: coreOk,
    complete,
    trioPassed,
    fieldMinimumsPassed,
    passed: complete
      && totalPoints >= 100
      && passing.length >= 3
      && coreOk
      && !hasZeroExam
      && trioPassed
      && fieldMinimumsPassed,
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
  // GSO Anlage 13 maps 18-point bands to one decimal place without rounding.
  // https://www.gesetze-bayern.de/Content/Document/BayGSO-ANL_23
  const grade = Math.floor((17 / 3 - Math.min(900, points) / 180) * 10 + 1e-9) / 10;
  return Math.max(1.0, Math.min(4.0, grade));
}

export function calculateAbitur(profile: AbiturProfile): AbiturResult {
  const blockI = calculateBlockI(profile);
  const blockII = calculateBlockII(profile);
  const totalPoints = blockI.totalPoints + blockII.totalPoints;
  const finalGrade = totalPointsToGrade(totalPoints);
  const semesterStats = SEMESTERS.map((s) => calcSemesterStats(s, profile));

  const qPhasePoints = (subjectIds: string[]) => {
    const uniqueIds = [...new Set(subjectIds.filter(Boolean))];
    const grades = uniqueIds.flatMap((subjectId) =>
      SEMESTERS.map((semester) =>
        (profile.grades ?? []).find((grade) => grade.subjectId === subjectId && grade.semester === semester),
      ),
    );
    return {
      total: grades.reduce((sum, grade) => sum + (grade?.points ?? 0), 0),
      complete: grades.length === uniqueIds.length * 4 && grades.every((grade) => grade?.points !== null && grade?.points !== undefined),
    };
  };

  const coreQualification = qPhasePoints(['deu', 'mat', profile.leistungsfach]);
  const examQualification = qPhasePoints(profile.examSubjects);
  const examSubjectsComplete = profile.examSubjects.length === 5
    && profile.examSubjects.every(Boolean)
    && new Set(profile.examSubjects).size === 5;
  const fieldCoverage = checkFieldCoverage(profile.examSubjects);
  const seminarInputsValid = profile.seminarPaperPoints !== null
    && profile.seminarPresentationPoints !== null
    && profile.seminarPaperPoints > 0
    && profile.seminarPresentationPoints > 0;

  const hurdles: HurdleCheck[] = [
    { id: 'selection', label: 'Einbringungsregeln erfüllt', description: blockI.rulesValid ? '✓' : (blockI.ruleErrors[0] ?? 'prüfen'), passed: blockI.rulesValid, severity: 'critical' },
    { id: 'b1-complete', label: 'Alle 40 Leistungen eingetragen', description: blockI.missingGradeCount === 0 ? '✓' : `${blockI.missingGradeCount} offen`, passed: blockI.missingGradeCount === 0 && blockI.einbringungCount === 40, severity: 'critical' },
    { id: 'b1-min', label: 'Block I ≥ 200 Punkte', description: `${blockI.totalPoints}/200`, passed: blockI.totalPoints >= 200, severity: 'critical' },
    { id: 'b1-40', label: 'Genau 40 Einbringungen', description: `${blockI.einbringungCount}/40`, passed: blockI.einbringungCount === 40, severity: 'critical' },
    { id: 'b1-def', label: 'Mind. 32 Leistungen ≥ 5P', description: `${blockI.atLeastFiveCount}/32`, passed: blockI.atLeastFiveCount >= 32, severity: 'critical' },
    { id: 'b1-zero', label: 'Keine 0 Punkte (Pflicht)', description: blockI.zeroCount > 0 ? `${blockI.zeroCount}× 0P` : '✓', passed: blockI.zeroCount === 0, severity: 'critical' },
    { id: 'q-core', label: 'D + M + LF ≥ 48 Punkte', description: coreQualification.complete ? `${coreQualification.total}/48` : 'offen', passed: coreQualification.complete && coreQualification.total >= 48, severity: 'critical' },
    { id: 'q-exams', label: '5 Prüfungsfächer ≥ 100 Punkte', description: examQualification.complete ? `${examQualification.total}/100` : 'offen', passed: examSubjectsComplete && examQualification.complete && examQualification.total >= 100, severity: 'critical' },
    { id: 'exam-fields', label: 'Alle 3 Aufgabenfelder', description: fieldCoverage.allCovered ? '✓' : 'unvollständig', passed: examSubjectsComplete && fieldCoverage.allCovered, severity: 'critical' },
    { id: 'b2-complete', label: 'Alle 5 Prüfungen eingetragen', description: blockII.complete ? '✓' : `${blockII.exams.length}/5`, passed: blockII.complete, severity: 'critical' },
    { id: 'b2-min', label: 'Block II ≥ 100 Punkte', description: `${blockII.totalPoints}/100`, passed: blockII.totalPoints >= 100, severity: 'critical' },
    { id: 'b2-3', label: '≥ 3 Prüfungen ≥ 5P', description: `${blockII.passingExamCount}/3`, passed: blockII.passingExamCount >= 3, severity: 'critical' },
    { id: 'b2-core', label: 'Kernfach bestanden', description: blockII.coreExamPassed ? '✓' : '✗', passed: blockII.coreExamPassed, severity: 'critical' },
    { id: 'b2-zero', label: 'Keine 0P in Prüfungen', description: blockII.hasZeroExam ? '✗' : '✓', passed: !blockII.hasZeroExam, severity: 'critical' },
    { id: 'b2-trio', label: 'Prüfungsfach-Trio ≥ 40 Punkte', description: blockII.trioPassed ? '✓' : 'nicht erfüllt', passed: blockII.trioPassed, severity: 'critical' },
    { id: 'b2-fields', label: 'Je Aufgabenfeld max. 1× < 4P', description: blockII.fieldMinimumsPassed ? '✓' : 'nicht erfüllt', passed: blockII.fieldMinimumsPassed, severity: 'critical' },
    { id: 'sem', label: 'Seminararbeit & Gespräch > 0P', description: seminarInputsValid ? `${blockI.seminarTotalPoints ?? 0}P gesamt` : 'offen/0P', passed: seminarInputsValid, severity: 'critical' },
  ];

  return {
    blockI, blockII, totalPoints, maxPoints: 900, finalGrade,
    passed: blockI.passed && blockII.passed && hurdles.every((h) => h.passed) && totalPoints >= 300,
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

export interface ExclusiveSelectionResult {
  subjects: string[];
  blockedBy: string | null;
}

/**
 * Apply an exclusive subject choice without ever evicting a protected subject.
 * Callers can use `blockedBy` to explain why the requested choice was rejected.
 */
export function selectSubjectWithExclusivity(
  subjects: string[],
  adding: string,
  protectedSubjects: Iterable<string> = [],
): ExclusiveSelectionResult {
  const uniqueSubjects = [...new Set(subjects.filter(Boolean))];
  const group = EXCLUSIVE_GROUPS.find((candidate) => candidate.includes(adding));
  if (!group) return { subjects: uniqueSubjects, blockedBy: null };

  const protectedIds = new Set(protectedSubjects);
  const blockedBy = group.find((id) => (
    id !== adding && uniqueSubjects.includes(id) && protectedIds.has(id)
  ));
  if (blockedBy) {
    return {
      subjects: uniqueSubjects.filter((id) => id !== adding),
      blockedBy,
    };
  }

  return {
    subjects: uniqueSubjects.filter((id) => !group.includes(id) || id === adding),
    blockedBy: null,
  };
}

/** When selecting a subject in an exclusive group, remove the conflicting ones */
export function applyExclusivity(subjects: string[], adding: string): string[] {
  return selectSubjectWithExclusivity(subjects, adding).subjects;
}

/** Get the exclusive group a subject belongs to, or null */
export function getExclusiveGroup(subjectId: string): string[] | null {
  return EXCLUSIVE_GROUPS.find((g) => g.includes(subjectId)) ?? null;
}

export function subjectsConflict(firstId: string, secondId: string): boolean {
  if (!firstId || !secondId || firstId === secondId) return false;
  return EXCLUSIVE_GROUPS.some((group) => group.includes(firstId) && group.includes(secondId));
}

/** The subject identities whose removal would invalidate the current profile. */
export function getProtectedSubjectIds(profile: AbiturProfile): Set<string> {
  return new Set([
    'deu',
    'mat',
    'wsem',
    'psem',
    profile.leistungsfach,
    ...(profile.examSubjects ?? []),
  ].filter(Boolean));
}

/**
 * Reconcile a requested subject list while retaining every required/exam subject.
 * When an exclusive group contains a protected subject, any opposing unprotected
 * request is discarded. Otherwise the last requested member wins.
 */
export function reconcileSubjectSelection(
  profile: AbiturProfile,
  requestedSubjects: string[],
): string[] {
  const validIds = new Set(ALL_SUBJECTS.map((subject) => subject.id));
  const protectedIds = getProtectedSubjectIds(profile);
  let result = [...new Set(requestedSubjects.filter((id) => validIds.has(id)))];

  for (const protectedId of protectedIds) {
    if (validIds.has(protectedId) && !result.includes(protectedId)) result.push(protectedId);
  }

  for (const group of EXCLUSIVE_GROUPS) {
    const selected = result.filter((id) => group.includes(id));
    if (selected.length <= 1) continue;

    const protectedSelected = selected.filter((id) => protectedIds.has(id));
    if (protectedSelected.length > 0) {
      result = result.filter((id) => !group.includes(id) || protectedIds.has(id));
      continue;
    }

    const winner = selected[selected.length - 1];
    result = result.filter((id) => !group.includes(id) || id === winner);
  }

  return result;
}

/**
 * Keep the five exam slots canonical. A slot retains points only while its
 * subject identity is unchanged; changing a subject always starts with no
 * result so points can never silently move between subjects.
 */
export function reconcileExamSlots(profile: AbiturProfile): AbiturProfile {
  const sourceSubjects = Array.isArray(profile.examSubjects) ? profile.examSubjects : [];
  const examSubjects = [
    'deu',
    'mat',
    profile.leistungsfach || '',
    sourceSubjects[3] || '',
    sourceSubjects[4] || '',
  ];
  const sourceExams = Array.isArray(profile.exams) ? profile.exams : [];
  const exams: ExamResult[] = examSubjects.map((subjectId, index) => {
    const previous = sourceExams[index];
    const unchanged = previous?.subjectId === subjectId;
    return {
      subjectId,
      examType: index < 3 ? 'written' : 'colloquium',
      points: unchanged && typeof previous.points === 'number' && Number.isFinite(previous.points)
        ? Math.round(Math.max(0, Math.min(15, previous.points)))
        : null,
    };
  });

  return { ...profile, examSubjects, exams };
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
  const filteredAll = ['deu', 'mat', leistungsfach, exam4, exam5].filter(Boolean);

  if (!leistungsfach) errors.push('Leistungsfach fehlt');
  if (!exam4) errors.push('4. Prüfungsfach fehlt');
  if (!exam5) errors.push('5. Prüfungsfach fehlt');
  if (new Set(filteredAll).size !== filteredAll.length) errors.push('Jedes Prüfungsfach darf nur einmal vorkommen');

  // Substitution needs a separately modelled replacement written exam. The
  // current five-slot profile cannot represent that safely, so never certify it.
  if (substitution) {
    errors.push('Joker-Regel wird nicht verbindlich berechnet — bitte Oberstufenkoordination einbeziehen');
  }

  // Check for duplicate subjects
  if (exam4 && exam5 && exam4 === exam5) {
    errors.push('4. und 5. Prüfung dürfen nicht dasselbe Fach sein');
  }
  if (exam4 && (exam4 === 'deu' || exam4 === 'mat' || exam4 === leistungsfach)) {
    errors.push(`${getSubject(exam4)?.name} ist bereits als schriftliche Prüfung belegt`);
  }
  if (exam5 && (exam5 === 'deu' || exam5 === 'mat' || exam5 === leistungsfach)) {
    errors.push(`${getSubject(exam5)?.name} ist bereits als schriftliche Prüfung belegt`);
  }

  // Check field coverage (Abdeckungsgebot)
  const coverage = checkFieldCoverage(filteredAll);
  if (!coverage.field1) errors.push('Kein Prüfungsfach aus Aufgabenfeld I (sprachl.-lit.-künstlerisch)');
  if (!coverage.field2) errors.push('Kein Prüfungsfach aus Aufgabenfeld II (gesellschaftswiss.)');
  if (!coverage.field3) errors.push('Kein Prüfungsfach aus Aufgabenfeld III (math.-naturwiss.)');
  const hasLanguageOrScience = filteredAll.some((id) => {
    const subject = getSubject(id);
    return (subject?.category === 'language' && id !== 'deu')
      || (subject?.category === 'stem' && !['mat', 'inf'].includes(id));
  });
  if (!hasLanguageOrScience) errors.push('Eine fortgeführte Fremdsprache oder Naturwissenschaft muss Prüfungsfach sein');
  if (!filteredAll.some((id) => ['ges', 'pug', 'geo', 'wir'].includes(id))) {
    errors.push('Mindestens ein GPR-Fach muss Prüfungsfach sein');
  }

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

  // Exclusive schedule choices cannot coexist in any of the configurable slots.
  const configurableExams = [leistungsfach, exam4, exam5].filter(Boolean);
  for (let first = 0; first < configurableExams.length; first++) {
    for (let second = first + 1; second < configurableExams.length; second++) {
      if (subjectsConflict(configurableExams[first], configurableExams[second])) {
        errors.push(`${getSubject(configurableExams[first])?.name} und ${getSubject(configurableExams[second])?.name} schließen sich gegenseitig aus`);
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
 * Based on Bavarian G9 official Einbringungslogik:
 *
 * PFLICHT (all 4 semesters mandatory — cannot use Optionsregel):
 * - Deutsch, Mathe (always excluded from Optionsregel)
 * - Leistungsfach, all exam subjects (excluded from Optionsregel)
 * - If only ONE foreign language: all 4 semesters mandatory
 * - If only ONE natural science: all 4 semesters mandatory
 *
 * WAHLPFLICHT:
 * - Foreign languages (if multiple): at least 4 semesters TOTAL across all languages
 * - Natural sciences (if multiple): at least 4 semesters TOTAL across all sciences
 * - Religion/Ethik: 3 of 4 semesters
 * - Geschichte: 3 of 4 semesters
 * - PuG plus Geo/WR: 3 in the continued subject and 1 in the other
 * - Kunst/Musik: 3 of 4 semesters
 * - W-Seminar: specifically 12/1 and 12/2 + Seminararbeit
 *
 * OPTIONAL:
 * - Sport (unless LF): max 3 semesters
 * - Zusatzangebot: max 3 semesters per subject (the current subject model does
 *   not distinguish regular Informatik from Zusatzangebot courses)
 */
export function getEinbringungRule(
  subjectId: string,
  profile: AbiturProfile,
): EinbringungRule {
  const s = getSubject(subjectId);
  if (!s) return { subjectId, minSemesters: 0, maxDroppable: 4, reason: 'Unbekannt', category: 'optional' };

  // Deutsch & Mathe: always 4 semesters mandatory (excluded from Optionsregel)
  if (subjectId === 'deu' || subjectId === 'mat') {
    return { subjectId, minSemesters: 4, maxDroppable: 0, reason: 'Pflichtfach — alle 4 HJ', category: 'pflicht' };
  }

  // Leistungsfach: all 4 semesters mandatory (excluded from Optionsregel)
  if (subjectId === profile.leistungsfach) {
    return { subjectId, minSemesters: 4, maxDroppable: 0, reason: 'Leistungsfach — alle 4 HJ', category: 'pflicht' };
  }

  // Exam subjects (4th + 5th): all 4 semesters mandatory (excluded from Optionsregel)
  if (profile.examSubjects.includes(subjectId)) {
    return { subjectId, minSemesters: 4, maxDroppable: 0, reason: 'Prüfungsfach — alle 4 HJ', category: 'pflicht' };
  }

  // Foreign languages: Check if this is the ONLY foreign language
  if (s.category === 'language' && subjectId !== 'deu') {
    const allLanguages = profile.subjects.filter((id) => {
      const sub = getSubject(id);
      return sub && sub.category === 'language' && id !== 'deu';
    });
    if (allLanguages.length === 1) {
      // Only one foreign language → all 4 semesters mandatory (excluded from Optionsregel)
      return { subjectId, minSemesters: 4, maxDroppable: 0, reason: 'Einzige Fremdsprache — alle 4 HJ Pflicht', category: 'pflicht' };
    }
    // Multiple foreign languages → need 4 total semesters ACROSS all, but individual subjects can vary
    // This is handled by the global validation in canDropSemester
    return { subjectId, minSemesters: 0, maxDroppable: 4, reason: 'Fremdsprache — mind. 4 HJ gesamt über alle FS', category: 'wahlpflicht' };
  }

  // Natural sciences (Phy, Che, Bio — NOT Informatik): Check if this is the ONLY natural science
  if (s.category === 'stem' && subjectId !== 'mat' && subjectId !== 'inf') {
    const allSciences = profile.subjects.filter((id) => {
      const sub = getSubject(id);
      return sub && sub.category === 'stem' && id !== 'mat' && id !== 'inf';
    });
    if (allSciences.length === 1) {
      // Only one natural science → all 4 semesters mandatory (excluded from Optionsregel)
      return { subjectId, minSemesters: 4, maxDroppable: 0, reason: 'Einzige Naturwissenschaft — alle 4 HJ Pflicht', category: 'pflicht' };
    }
    // Multiple natural sciences → need 4 total semesters ACROSS all, but individual subjects can vary
    return { subjectId, minSemesters: 0, maxDroppable: 4, reason: 'Naturwissenschaft — mind. 4 HJ gesamt über alle NW', category: 'wahlpflicht' };
  }

  // Religion/Ethik: 3 of 4 semesters
  if (['eth', 'rev', 'rka'].includes(subjectId)) {
    return { subjectId, minSemesters: 3, maxDroppable: 1, reason: 'Rel./Ethik — 3 von 4 HJ Pflicht', category: 'wahlpflicht' };
  }

  // Geschichte: 3 of 4 semesters
  if (subjectId === 'ges') {
    return { subjectId, minSemesters: 3, maxDroppable: 1, reason: 'Geschichte — 3 von 4 HJ Pflicht', category: 'wahlpflicht' };
  }

  // PuG + Geo/WR: the continued subject contributes 3, the counterpart 1.
  // Exact split is validated globally because it depends on the pair.
  if (['pug', 'geo', 'wir'].includes(subjectId)) {
    return { subjectId, minSemesters: 1, maxDroppable: 3, reason: 'GPR-Verbund — 3 HJ fortgeführt + 1 HJ Gegenfach', category: 'wahlpflicht' };
  }

  // Kunst/Musik: 3 of 4 semesters
  if (subjectId === 'kun' || subjectId === 'mus') {
    return { subjectId, minSemesters: 3, maxDroppable: 1, reason: 'Musisches Pflichtfach — 3 von 4 HJ', category: 'wahlpflicht' };
  }

  // Sport: optional, max 3 semesters (unless it's LF, then it's already caught above)
  if (subjectId === 'spo') {
    return { subjectId, minSemesters: 0, maxDroppable: 4, reason: 'Sport — optional, max. 3 HJ zählbar', category: 'optional' };
  }

  // W-Seminar: specifically 12/1 and 12/2 + Seminararbeit
  if (subjectId === 'wsem') {
    return { subjectId, minSemesters: 2, maxDroppable: 2, reason: 'W-Seminar — 12/1 + 12/2 + Seminararbeit', category: 'wahlpflicht' };
  }

  // P-Seminar: not counted in Block I
  if (subjectId === 'psem') {
    return { subjectId, minSemesters: 0, maxDroppable: 4, reason: 'P-Seminar — nicht in Block I', category: 'optional' };
  }

  // Informatik is not a natural science; whether it is the required additional
  // Wahlpflichtfach depends on the individual course plan.
  if (subjectId === 'inf') {
    return { subjectId, minSemesters: 0, maxDroppable: 4, reason: 'Informatik — Kursplan individuell prüfen', category: 'optional' };
  }

  return { subjectId, minSemesters: 0, maxDroppable: 4, reason: 'Weitere Einbringung — Kursplan individuell prüfen', category: 'optional' };
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
      const oralValidation = canSubjectBeOralExam(id);
      const conflictingExam = [profile.leistungsfach, otherExam]
        .find((examId) => subjectsConflict(id, examId));
      const validation = conflictingExam
        ? {
            valid: false,
            reason: `${subject.name} und ${getSubject(conflictingExam)?.name} schließen sich gegenseitig aus`,
          }
        : oralValidation;

      // Check what field coverage would look like with this choice
      const hypothetical = ['deu', 'mat', profile.leistungsfach, otherExam, id].filter(Boolean);
      const fieldCoverage = checkFieldCoverage(hypothetical);

      return { id, subject, validation, fieldCoverage };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

// ─── Create Default Profile ────────────────────────────────

export function createDefaultProfile(): AbiturProfile {
  const subs = ['deu', 'mat', 'eng', 'ges', 'pug', 'geo', 'phy', 'rev', 'spo', 'kun', 'wsem', 'psem'];
  const now = new Date();
  const schoolYearStart = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
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
    studentName: '', schoolYear: `${schoolYearStart}/${schoolYearStart + 2}`, currentSemester: '12/1',
    substitutedWritten: null,
  };
}
