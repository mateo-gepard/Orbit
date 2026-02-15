// ═══════════════════════════════════════════════════════════
// ORBIT — Abitur Score Engine (Bayern G9)
// Covers Block I (40 Halbjahresleistungen, max 600),
// Block II (5 exams × 4, max 300), conversion to Abiturnote,
// Einbringung rules, and qualification checks.
// ═══════════════════════════════════════════════════════════

// ─── Core Types ────────────────────────────────────────────

export type Halbjahr = '12/1' | '12/2' | '13/1' | '13/2';
export const HALBJAHRE: Halbjahr[] = ['12/1', '12/2', '13/1', '13/2'];

export type SubjectCategory =
  | 'deutsch'
  | 'mathematik'
  | 'fremdsprache'
  | 'naturwissenschaft'
  | 'gesellschaftswissenschaft'
  | 'kunst_musik'
  | 'sport'
  | 'religion_ethik'
  | 'informatik'
  | 'wseminar'
  | 'pseminar'
  | 'sonstiges';

export type Aufgabenfeld = 'SLK' | 'GPR' | 'MINT';

export interface SubjectDefinition {
  id: string;
  name: string;
  shortName: string;
  category: SubjectCategory;
  aufgabenfeld: Aufgabenfeld | null;
  isLeistungsfach: boolean;
  isAbiturFach: boolean;
  abiturFachNr: number | null; // 1-5
}

export type GradeStatus = 'actual' | 'expected' | 'range';

export interface GradeEntry {
  /** Schulaufgabe (großer Leistungsnachweis) points, 0-15 */
  schulaufgabe: number | null;
  /** Kleine Leistungsnachweise (oral, tests, etc.), each 0-15 */
  kleineNachweise: number[];
  /** Final Halbjahresleistung as set by teacher (override) */
  finalOverride: number | null;
  /** Status of this grade */
  status: GradeStatus;
  /** For range-type: min expected */
  rangeMin: number | null;
  /** For range-type: max expected */
  rangeMax: number | null;
}

export interface HalbjahresleistungResult {
  points: number; // 0-15, computed or overridden
  isOverridden: boolean;
  source: 'computed' | 'override' | 'expected' | 'range';
}

export interface EinbringungSlot {
  subjectId: string;
  halbjahr: Halbjahr;
  points: number;
  isMandatory: boolean;
  reason: string; // Why it's included
  isLocked: boolean; // User-locked
}

export interface BlockIResult {
  slots: EinbringungSlot[];
  totalPoints: number;
  mandatoryCount: number;
  freeCount: number;
  isValid: boolean;
  issues: string[];
}

export interface AbiturExam {
  subjectId: string;
  expectedPoints: number | null;
  actualPoints: number | null;
}

export interface BlockIIResult {
  exams: AbiturExam[];
  totalPoints: number; // sum of (points × 4)
  isValid: boolean;
}

export interface QualificationCheck {
  label: string;
  passed: boolean;
  detail: string;
}

// ─── Subject Templates ────────────────────────────────────

export const SUBJECT_TEMPLATES: {
  name: string;
  shortName: string;
  category: SubjectCategory;
  aufgabenfeld: Aufgabenfeld | null;
}[] = [
  // SLK — Sprachlich-literarisch-künstlerisch
  { name: 'Deutsch', shortName: 'D', category: 'deutsch', aufgabenfeld: 'SLK' },
  { name: 'Englisch', shortName: 'E', category: 'fremdsprache', aufgabenfeld: 'SLK' },
  { name: 'Französisch', shortName: 'F', category: 'fremdsprache', aufgabenfeld: 'SLK' },
  { name: 'Latein', shortName: 'L', category: 'fremdsprache', aufgabenfeld: 'SLK' },
  { name: 'Spanisch', shortName: 'Sp', category: 'fremdsprache', aufgabenfeld: 'SLK' },
  { name: 'Italienisch', shortName: 'It', category: 'fremdsprache', aufgabenfeld: 'SLK' },
  { name: 'Kunst', shortName: 'Ku', category: 'kunst_musik', aufgabenfeld: 'SLK' },
  { name: 'Musik', shortName: 'Mu', category: 'kunst_musik', aufgabenfeld: 'SLK' },
  // GPR — Gesellschaftswissenschaftlich
  { name: 'Geschichte', shortName: 'G', category: 'gesellschaftswissenschaft', aufgabenfeld: 'GPR' },
  { name: 'Politik und Gesellschaft', shortName: 'PuG', category: 'gesellschaftswissenschaft', aufgabenfeld: 'GPR' },
  { name: 'Geographie', shortName: 'Geo', category: 'gesellschaftswissenschaft', aufgabenfeld: 'GPR' },
  { name: 'Wirtschaft und Recht', shortName: 'WR', category: 'gesellschaftswissenschaft', aufgabenfeld: 'GPR' },
  { name: 'Ev. Religionslehre', shortName: 'EvR', category: 'religion_ethik', aufgabenfeld: 'GPR' },
  { name: 'Kath. Religionslehre', shortName: 'KR', category: 'religion_ethik', aufgabenfeld: 'GPR' },
  { name: 'Ethik', shortName: 'Eth', category: 'religion_ethik', aufgabenfeld: 'GPR' },
  // MINT — Mathematisch-naturwissenschaftlich-technisch
  { name: 'Mathematik', shortName: 'M', category: 'mathematik', aufgabenfeld: 'MINT' },
  { name: 'Physik', shortName: 'Ph', category: 'naturwissenschaft', aufgabenfeld: 'MINT' },
  { name: 'Chemie', shortName: 'Ch', category: 'naturwissenschaft', aufgabenfeld: 'MINT' },
  { name: 'Biologie', shortName: 'Bio', category: 'naturwissenschaft', aufgabenfeld: 'MINT' },
  { name: 'Informatik', shortName: 'Inf', category: 'informatik', aufgabenfeld: 'MINT' },
  // Seminare
  { name: 'W-Seminar', shortName: 'W', category: 'wseminar', aufgabenfeld: null },
  { name: 'P-Seminar', shortName: 'P', category: 'pseminar', aufgabenfeld: null },
  // Sport
  { name: 'Sport', shortName: 'Spo', category: 'sport', aufgabenfeld: null },
];

// ─── Schulaufgabe Rules ────────────────────────────────────

/**
 * Does this subject have a Schulaufgabe in this Halbjahr?
 * - Deutsch, Mathe, Leistungsfach: all 4 Halbjahre (including 13/2)
 * - Other Schulaufgabe subjects: 12/1, 12/2, 13/1 only (NOT 13/2)
 * - W-Seminar: never
 * - P-Seminar: never
 */
export function hasSchulaufgabe(
  subject: SubjectDefinition,
  halbjahr: Halbjahr
): boolean {
  if (subject.category === 'wseminar' || subject.category === 'pseminar') return false;
  if (subject.category === 'sport') return false;

  const isDMaLeistung =
    subject.category === 'deutsch' ||
    subject.category === 'mathematik' ||
    subject.isLeistungsfach;

  if (isDMaLeistung) return true; // All 4 Halbjahre

  // Other subjects: no SA in 13/2
  return halbjahr !== '13/2';
}

// ─── Halbjahresleistung Computation ───────────────────────

/**
 * Compute Halbjahresleistung from SA + kleine Nachweise.
 * Official rule: SA and small grades weighted roughly 1:1 in aggregate,
 * but teacher sets final grade. We compute an estimate and allow override.
 */
export function computeHalbjahresleistung(
  entry: GradeEntry,
  hasSA: boolean
): HalbjahresleistungResult {
  // Override takes precedence
  if (entry.finalOverride !== null) {
    return { points: entry.finalOverride, isOverridden: true, source: 'override' };
  }

  if (entry.status === 'range' && entry.rangeMin !== null && entry.rangeMax !== null) {
    const mid = Math.round((entry.rangeMin + entry.rangeMax) / 2);
    return { points: mid, isOverridden: false, source: 'range' };
  }

  if (entry.status === 'expected' && entry.kleineNachweise.length === 0 && entry.schulaufgabe === null) {
    return { points: 0, isOverridden: false, source: 'expected' };
  }

  // Compute from SA + small grades
  const smallAvg =
    entry.kleineNachweise.length > 0
      ? entry.kleineNachweise.reduce((a, b) => a + b, 0) / entry.kleineNachweise.length
      : null;

  if (hasSA && entry.schulaufgabe !== null && smallAvg !== null) {
    // SA : small = 1:1 weighting
    const raw = (entry.schulaufgabe + smallAvg) / 2;
    return { points: Math.round(raw), isOverridden: false, source: 'computed' };
  }

  if (entry.schulaufgabe !== null) {
    return { points: entry.schulaufgabe, isOverridden: false, source: 'computed' };
  }

  if (smallAvg !== null) {
    return { points: Math.round(smallAvg), isOverridden: false, source: 'computed' };
  }

  return { points: 0, isOverridden: false, source: 'expected' };
}

// ─── Einbringung Engine ───────────────────────────────────

interface EinbringungInput {
  subjects: SubjectDefinition[];
  grades: Record<string, Record<Halbjahr, GradeEntry>>; // subjectId → halbjahr → grade
  lockedSlots: Set<string>; // "subjectId:halbjahr" locked by user
  strategy: 'maximize' | 'stable';
  onlyFortgefuehrteFremdsprache: string | null; // subject ID
  onlyFortgefuehrteNaturwissenschaft: string | null; // subject ID
  pugSubjectId: string | null;
  wrGeoSubjectId: string | null; // which of WR/Geo fulfills Belegungsverpflichtung
}

function slotKey(subjectId: string, hj: Halbjahr): string {
  return `${subjectId}:${hj}`;
}

/**
 * Determine which Halbjahresleistungen are mandatory (all 4).
 * Returns a list of { subjectId, halbjahr, reason }.
 */
function getMandatorySlots(input: EinbringungInput): {
  subjectId: string;
  halbjahr: Halbjahr;
  reason: string;
}[] {
  const mandatory: { subjectId: string; halbjahr: Halbjahr; reason: string }[] = [];

  for (const subject of input.subjects) {
    let allFour = false;
    let reason = '';

    // Deutsch → all 4
    if (subject.category === 'deutsch') {
      allFour = true;
      reason = 'Deutsch: alle 4 Halbjahre Pflicht';
    }
    // Mathematik → all 4
    else if (subject.category === 'mathematik') {
      allFour = true;
      reason = 'Mathematik: alle 4 Halbjahre Pflicht';
    }
    // Abiturfach → all 4
    else if (subject.isAbiturFach) {
      allFour = true;
      reason = `Abiturfach ${subject.abiturFachNr}: alle 4 Halbjahre Pflicht`;
    }
    // Only continued foreign language → all 4
    else if (
      subject.category === 'fremdsprache' &&
      input.onlyFortgefuehrteFremdsprache === subject.id
    ) {
      allFour = true;
      reason = 'Einzige fortgeführte Fremdsprache: alle 4 Halbjahre Pflicht';
    }
    // Only continued science → all 4
    else if (
      subject.category === 'naturwissenschaft' &&
      input.onlyFortgefuehrteNaturwissenschaft === subject.id
    ) {
      allFour = true;
      reason = 'Einzige fortgeführte Naturwissenschaft: alle 4 Halbjahre Pflicht';
    }

    if (allFour) {
      for (const hj of HALBJAHRE) {
        mandatory.push({ subjectId: subject.id, halbjahr: hj, reason });
      }
    }
  }

  return mandatory;
}

/**
 * Get additional mandatory slots from PuG + WR/Geo rules.
 */
function getPugWrGeoMandatory(input: EinbringungInput): {
  subjectId: string;
  halbjahr: Halbjahr;
  reason: string;
}[] {
  const result: { subjectId: string; halbjahr: Halbjahr; reason: string }[] = [];

  // At least 1 HJ PuG
  if (input.pugSubjectId) {
    result.push({
      subjectId: input.pugSubjectId,
      halbjahr: '12/1',
      reason: 'Politik und Gesellschaft: mind. 1 Halbjahr Pflicht',
    });
  }

  // At least 1 HJ WR or Geo, plus 2 more = 3 total for whichever fulfills Belegungsverpflichtung
  if (input.wrGeoSubjectId) {
    for (const hj of ['12/1', '12/2', '13/1'] as Halbjahr[]) {
      result.push({
        subjectId: input.wrGeoSubjectId,
        halbjahr: hj,
        reason: 'WR/Geo (Belegungsverpflichtung): mind. 3 Halbjahre Pflicht',
      });
    }
  }

  return result;
}

/**
 * Run the Einbringung optimizer: select exactly 40 HJL.
 */
export function computeEinbringung(input: EinbringungInput): BlockIResult {
  const issues: string[] = [];

  // Step 1: Collect all available slots with points
  const allSlots: {
    subjectId: string;
    halbjahr: Halbjahr;
    points: number;
    source: string;
  }[] = [];

  for (const subject of input.subjects) {
    const subjectGrades = input.grades[subject.id];
    if (!subjectGrades) continue;

    for (const hj of HALBJAHRE) {
      const entry = subjectGrades[hj];
      if (!entry) continue;

      const hasSA = hasSchulaufgabe(subject, hj);
      const result = computeHalbjahresleistung(entry, hasSA);
      allSlots.push({
        subjectId: subject.id,
        halbjahr: hj,
        points: result.points,
        source: result.source,
      });
    }
  }

  // Step 2: Determine mandatory slots
  const mandatoryRaw = [
    ...getMandatorySlots(input),
    ...getPugWrGeoMandatory(input),
  ];

  // Deduplicate mandatory
  const mandatoryMap = new Map<string, { subjectId: string; halbjahr: Halbjahr; reason: string }>();
  for (const m of mandatoryRaw) {
    const key = slotKey(m.subjectId, m.halbjahr);
    if (!mandatoryMap.has(key)) {
      mandatoryMap.set(key, m);
    }
  }

  const mandatoryCount = mandatoryMap.size;

  // Check 40 cap
  if (mandatoryCount > 40) {
    issues.push(
      `Pflichtzahl ${mandatoryCount} > 40: Fächerkombination ungültig (max 40 Einbringungen).`
    );
  } else if (mandatoryCount === 41) {
    issues.push(
      `Pflichtzahl 41: Eine Optionsregel muss angewendet werden, um auf 40 zu reduzieren.`
    );
  }

  const freeSlotCount = Math.max(0, 40 - mandatoryCount);

  // Step 3: Build included set — start with mandatory + user-locked
  const included = new Map<string, EinbringungSlot>();

  for (const [key, m] of mandatoryMap) {
    const slot = allSlots.find(
      (s) => s.subjectId === m.subjectId && s.halbjahr === m.halbjahr
    );
    included.set(key, {
      subjectId: m.subjectId,
      halbjahr: m.halbjahr,
      points: slot?.points ?? 0,
      isMandatory: true,
      reason: m.reason,
      isLocked: false,
    });
  }

  // Add user-locked slots
  for (const lockedKey of input.lockedSlots) {
    if (included.has(lockedKey)) {
      const existing = included.get(lockedKey)!;
      existing.isLocked = true;
      continue;
    }
    const [subjectId, halbjahr] = lockedKey.split(':') as [string, Halbjahr];
    const slot = allSlots.find(
      (s) => s.subjectId === subjectId && s.halbjahr === halbjahr
    );
    if (slot) {
      included.set(lockedKey, {
        subjectId,
        halbjahr,
        points: slot.points,
        isMandatory: false,
        reason: 'Vom Benutzer gesperrt',
        isLocked: true,
      });
    }
  }

  // Step 4: Fill remaining free slots
  const remainingSlots = allSlots
    .filter((s) => !included.has(slotKey(s.subjectId, s.halbjahr)))
    .sort((a, b) => {
      if (input.strategy === 'maximize') {
        return b.points - a.points; // Highest points first
      }
      // Stable: prefer actual grades over expected/range
      const sourceOrder: Record<string, number> = {
        override: 0,
        computed: 1,
        expected: 2,
        range: 3,
      };
      const aOrder = sourceOrder[a.source] ?? 2;
      const bOrder = sourceOrder[b.source] ?? 2;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return b.points - a.points;
    });

  let toFill = 40 - included.size;
  for (const slot of remainingSlots) {
    if (toFill <= 0) break;
    const key = slotKey(slot.subjectId, slot.halbjahr);
    included.set(key, {
      subjectId: slot.subjectId,
      halbjahr: slot.halbjahr,
      points: slot.points,
      isMandatory: false,
      reason: input.strategy === 'maximize' ? 'Höchstpunktzahl' : 'Sicher (bestätigte Note)',
      isLocked: false,
    });
    toFill--;
  }

  // Step 5: Validate subject-group minimums
  const slots = Array.from(included.values());

  // Foreign languages: at least 4 HJL
  const foreignLangCount = slots.filter((s) => {
    const sub = input.subjects.find((x) => x.id === s.subjectId);
    return sub?.category === 'fremdsprache';
  }).length;
  if (foreignLangCount < 4) {
    issues.push(`Fremdsprachen: nur ${foreignLangCount}/4 Halbjahresleistungen eingebracht.`);
  }

  // Sciences: at least 4 HJL (Informatik doesn't count)
  const scienceCount = slots.filter((s) => {
    const sub = input.subjects.find((x) => x.id === s.subjectId);
    return sub?.category === 'naturwissenschaft';
  }).length;
  if (scienceCount < 4) {
    issues.push(`Naturwissenschaften: nur ${scienceCount}/4 Halbjahresleistungen eingebracht.`);
  }

  const totalPoints = slots.reduce((sum, s) => sum + s.points, 0);

  return {
    slots,
    totalPoints,
    mandatoryCount,
    freeCount: freeSlotCount,
    isValid: issues.length === 0 && slots.length === 40,
    issues,
  };
}

// ─── Block II ──────────────────────────────────────────────

export function computeBlockII(exams: AbiturExam[]): BlockIIResult {
  let totalPoints = 0;
  for (const exam of exams) {
    const pts = exam.actualPoints ?? exam.expectedPoints ?? 0;
    totalPoints += pts * 4;
  }

  return {
    exams,
    totalPoints,
    isValid: exams.length === 5,
  };
}

// ─── Total Score + Abiturnote ──────────────────────────────

/**
 * Official conversion table: total points (0-900) → Abiturnote.
 * Based on BayGSO Anlage 10.
 */
const SCORE_TO_GRADE: [number, number][] = [
  [900, 1.0], [882, 1.1], [864, 1.2], [846, 1.3], [828, 1.4], [810, 1.5],
  [792, 1.6], [774, 1.7], [756, 1.8], [738, 1.9],
  [720, 2.0], [702, 2.1], [684, 2.2], [666, 2.3], [648, 2.4], [630, 2.5],
  [612, 2.6], [594, 2.7], [576, 2.8], [558, 2.9],
  [540, 3.0], [522, 3.1], [504, 3.2], [486, 3.3], [468, 3.4], [450, 3.5],
  [432, 3.6], [414, 3.7], [396, 3.8], [378, 3.9],
  [360, 4.0], [343, 4.1], [326, 4.2], [309, 4.3], [292, 4.4], [275, 4.5],
  [258, 4.6], [241, 4.7], [224, 4.8], [207, 4.9],
  [190, 5.0], [173, 5.1], [156, 5.2], [139, 5.3], [122, 5.4], [105, 5.5],
  [88, 5.6], [71, 5.7], [54, 5.8], [37, 5.9],
  [20, 6.0],
];

export function pointsToGrade(totalPoints: number): number {
  for (const [minPoints, grade] of SCORE_TO_GRADE) {
    if (totalPoints >= minPoints) return grade;
  }
  return 6.0;
}

export function gradeToString(grade: number): string {
  return grade.toFixed(1);
}

// ─── Qualification Checks ─────────────────────────────────

export function runQualificationChecks(
  blockI: BlockIResult,
  blockII: BlockIIResult,
  subjects: SubjectDefinition[],
  grades: Record<string, Record<Halbjahr, GradeEntry>>
): QualificationCheck[] {
  const checks: QualificationCheck[] = [];

  // 1. Block I: 40 Einbringungen
  checks.push({
    label: '40 Einbringungen',
    passed: blockI.slots.length === 40,
    detail: `${blockI.slots.length}/40 Halbjahresleistungen eingebracht`,
  });

  // 2. Each included HJL at least 1 point
  const zeroPointSlots = blockI.slots.filter((s) => s.points === 0);
  checks.push({
    label: 'Keine 0-Punkt-Einbringung',
    passed: zeroPointSlots.length === 0,
    detail:
      zeroPointSlots.length === 0
        ? 'Alle eingebrachten Halbjahre ≥ 1 Punkt'
        : `${zeroPointSlots.length} Halbjahr(e) mit 0 Punkten`,
  });

  // 3. Block I minimum: 200 points (in 40 HJL)
  checks.push({
    label: 'Block I Mindestpunktzahl',
    passed: blockI.totalPoints >= 200,
    detail: `${blockI.totalPoints}/200 Mindestpunkte`,
  });

  // 4. Block II minimum: 100 points
  checks.push({
    label: 'Block II Mindestpunktzahl',
    passed: blockII.totalPoints >= 100,
    detail: `${blockII.totalPoints}/100 Mindestpunkte`,
  });

  // 5. At least 5 exams
  checks.push({
    label: '5 Abiturprüfungen',
    passed: blockII.exams.length === 5,
    detail: `${blockII.exams.length}/5 Prüfungen`,
  });

  // 6. In at least 32 of the 40 included HJL, at least 5 points
  const atLeast5 = blockI.slots.filter((s) => s.points >= 5).length;
  checks.push({
    label: 'Mind. 5 Punkte in 32 Einbringungen',
    passed: atLeast5 >= 32,
    detail: `${atLeast5}/32 Halbjahre mit ≥ 5 Punkten`,
  });

  // 7. D + M + Leistungsfach: sum of HJL points ≥ 48 (in the 12 included HJL)
  const dmLeistung = blockI.slots.filter((s) => {
    const sub = subjects.find((x) => x.id === s.subjectId);
    return (
      sub?.category === 'deutsch' ||
      sub?.category === 'mathematik' ||
      sub?.isLeistungsfach
    );
  });
  const dmLeistungSum = dmLeistung.reduce((sum, s) => sum + s.points, 0);
  checks.push({
    label: 'D + M + Leistungsfach ≥ 48',
    passed: dmLeistungSum >= 48,
    detail: `${dmLeistungSum}/48 Punkte in Deutsch, Mathe, Leistungsfach`,
  });

  // 8. 5 Abiturfächer total HJL sum ≥ 100 (in 20 included HJL)
  const abiFaecherSlots = blockI.slots.filter((s) => {
    const sub = subjects.find((x) => x.id === s.subjectId);
    return sub?.isAbiturFach;
  });
  const abiFaecherSum = abiFaecherSlots.reduce((sum, s) => sum + s.points, 0);
  checks.push({
    label: '5 Abiturfächer HJL-Summe ≥ 100',
    passed: abiFaecherSum >= 100,
    detail: `${abiFaecherSum}/100 Punkte in den 5 Abiturfächern`,
  });

  // 9. Each exam ≥ 1 point
  const examZeros = blockII.exams.filter((e) => {
    const pts = e.actualPoints ?? e.expectedPoints ?? 0;
    return pts === 0;
  });
  checks.push({
    label: 'Jede Prüfung ≥ 1 Punkt',
    passed: examZeros.length === 0,
    detail:
      examZeros.length === 0
        ? 'Alle Prüfungen bestanden'
        : `${examZeros.length} Prüfung(en) mit 0 Punkten`,
  });

  // 10. In 3 of the 5 exams, at least 5 points (including 1 written)
  const examsWith5 = blockII.exams.filter((e) => {
    const pts = e.actualPoints ?? e.expectedPoints ?? 0;
    return pts >= 5;
  });
  checks.push({
    label: 'Mind. 3 Prüfungen ≥ 5 Punkte',
    passed: examsWith5.length >= 3,
    detail: `${examsWith5.length}/3 Prüfungen mit ≥ 5 Punkten`,
  });

  return checks;
}

// ─── "What do I need?" Calculator ─────────────────────────

export interface WhatDoINeedResult {
  targetGrade: number;
  currentBlockI: number;
  currentBlockII: number;
  currentTotal: number;
  neededTotal: number;
  blockIGap: number;
  blockIIGap: number;
  sentence: string;
}

export function whatDoINeedForGrade(
  targetGrade: number,
  blockI: BlockIResult,
  blockII: BlockIIResult
): WhatDoINeedResult {
  // Find minimum total for targetGrade
  let neededTotal = 900;
  for (const [minPoints, grade] of SCORE_TO_GRADE) {
    if (grade <= targetGrade) {
      neededTotal = minPoints;
      break;
    }
  }

  const currentTotal = blockI.totalPoints + blockII.totalPoints;
  const gap = Math.max(0, neededTotal - currentTotal);
  const blockIGap = Math.max(0, neededTotal - blockII.totalPoints - blockI.totalPoints);
  const blockIIGap = Math.max(0, neededTotal - blockI.totalPoints - blockII.totalPoints);

  let sentence = '';
  if (currentTotal >= neededTotal) {
    sentence = `Du erreichst bereits ${gradeToString(targetGrade)} mit ${currentTotal} Punkten.`;
  } else {
    const blockIINeeded = Math.max(0, neededTotal - blockI.totalPoints);
    const perExam = Math.ceil(blockIINeeded / 20); // /5 exams /4 weight
    sentence = `Für ${gradeToString(targetGrade)} brauchst du noch ${gap} Punkte. Bei aktuellem Block I brauchst du im Schnitt ${Math.min(15, perExam)} Punkte pro Prüfung.`;
  }

  return {
    targetGrade,
    currentBlockI: blockI.totalPoints,
    currentBlockII: blockII.totalPoints,
    currentTotal,
    neededTotal,
    blockIGap,
    blockIIGap,
    sentence,
  };
}

/**
 * What SA grade do I need in a subject+halbjahr to reach target HJL?
 */
export function whatSADoINeed(
  targetHJL: number,
  currentSmallAvg: number | null,
  hasSA: boolean
): { neededSA: number; sentence: string } {
  if (!hasSA || currentSmallAvg === null) {
    return { neededSA: targetHJL, sentence: `Du brauchst insgesamt ${targetHJL} Punkte.` };
  }
  // HJL = (SA + smallAvg) / 2 → SA = 2 × targetHJL - smallAvg
  const neededSA = Math.max(0, Math.min(15, Math.round(2 * targetHJL - currentSmallAvg)));
  const sentence = `Bei einem mündlichen Schnitt von ${currentSmallAvg.toFixed(1)} brauchst du ${neededSA} Punkte in der Schulaufgabe.`;
  return { neededSA, sentence };
}

// ─── Default empty grade ──────────────────────────────────

export function createEmptyGrade(): GradeEntry {
  return {
    schulaufgabe: null,
    kleineNachweise: [],
    finalOverride: null,
    status: 'expected',
    rangeMin: null,
    rangeMax: null,
  };
}

// ─── Points display helper ────────────────────────────────

export function pointsColor(points: number): string {
  if (points >= 13) return 'text-emerald-500';
  if (points >= 10) return 'text-sky-500';
  if (points >= 7) return 'text-amber-500';
  if (points >= 4) return 'text-orange-500';
  return 'text-red-500';
}
