import { describe, expect, it } from 'vitest';

import {
  calculateAbitur,
  calculateBlockI,
  calculateNeededAverage,
  checkFieldCoverage,
  createDefaultProfile,
  eKey,
  optimizeEinbringungen,
  pointsToGrade,
  selectAllEinbringungen,
  type AbiturProfile,
} from './abitur';

/**
 * The half of the Abitur score that had no tests at all.
 *
 * `calculateBlockI` decides roughly two-thirds of the total (the 40 semester
 * results), `calculateAbitur` produces the headline number, and
 * `optimizeEinbringungen` chooses *which* results are submitted. A student
 * makes real, irreversible decisions from these three.
 */

const SEMESTERS = ['12/1', '12/2', '13/1', '13/2'] as const;

/** A profile with every semester result set to `points`. */
function filledProfile(points: number, overrides: Partial<AbiturProfile> = {}): AbiturProfile {
  const base = createDefaultProfile();
  return {
    ...base,
    examSubjects: ['deu', 'mat', 'eng', 'ges', 'phy'],
    exams: [
      { subjectId: 'deu', examType: 'written', points: 10 },
      { subjectId: 'mat', examType: 'written', points: 10 },
      { subjectId: 'eng', examType: 'written', points: 10 },
      { subjectId: 'ges', examType: 'colloquium', points: 10 },
      { subjectId: 'phy', examType: 'colloquium', points: 10 },
    ],
    grades: base.grades.map((grade) => ({ ...grade, points })),
    seminarPaperPoints: points,
    seminarPresentationPoints: points,
    einbringungen: [],
    ...overrides,
  };
}

function withEinbringungen(profile: AbiturProfile): AbiturProfile {
  return { ...profile, einbringungen: optimizeEinbringungen(profile) };
}

describe('optimizeEinbringungen', () => {
  it('selects exactly 40 einbringungen counting the seminar as two', () => {
    const profile = filledProfile(10);
    const keys = optimizeEinbringungen(profile);
    // 38 course results plus the two seminar slots.
    expect(keys).toHaveLength(38);
    expect(keys).toContain(eKey('wsem', '12/1'));
    expect(keys).toContain(eKey('wsem', '12/2'));
  });

  it('never selects the P-Seminar', () => {
    const keys = optimizeEinbringungen(filledProfile(10));
    expect(keys.some((key) => key.startsWith('psem'))).toBe(false);
  });

  it('takes every semester of the mandatory subjects', () => {
    const keys = new Set(optimizeEinbringungen(filledProfile(10)));
    for (const subjectId of ['deu', 'mat', 'eng']) {
      for (const semester of SEMESTERS) {
        expect(keys.has(eKey(subjectId, semester))).toBe(true);
      }
    }
  });

  it('prefers the higher-scoring semesters where it has a choice', () => {
    const profile = filledProfile(4);
    // Make history's second year clearly better than its first.
    profile.grades = profile.grades.map((grade) =>
      grade.subjectId === 'ges'
        ? { ...grade, points: grade.semester === '13/1' || grade.semester === '13/2' ? 14 : 1 }
        : grade
    );

    const chosen = new Set(optimizeEinbringungen(profile));
    const historyChosen = SEMESTERS.filter((semester) => chosen.has(eKey('ges', semester)));
    expect(historyChosen).toContain('13/1');
    expect(historyChosen).toContain('13/2');
  });

  it('is deterministic for the same profile', () => {
    const profile = filledProfile(9);
    expect(optimizeEinbringungen(profile)).toEqual(optimizeEinbringungen(profile));
  });

  it('produces a valid Block I when applied', () => {
    const result = calculateBlockI(withEinbringungen(filledProfile(10)));
    expect(result.einbringungCount).toBe(40);
    expect(result.rulesValid).toBe(true);
  });

  it('only ever selects subjects the student actually takes', () => {
    const profile = filledProfile(10);
    const taken = new Set(profile.subjects);
    for (const key of optimizeEinbringungen(profile)) {
      const [subjectId, semester] = key.split(':');
      expect(taken.has(subjectId)).toBe(true);
      expect(SEMESTERS).toContain(semester as typeof SEMESTERS[number]);
    }
  });

  it('offers at least as many candidates as it finally selects', () => {
    const profile = filledProfile(10);
    expect(selectAllEinbringungen(profile).length).toBeGreaterThan(0);
    expect(optimizeEinbringungen(profile).length).toBeLessThanOrEqual(40);
  });
});

describe('calculateBlockI', () => {
  it('totals 40 einbringungen and caps at 600', () => {
    const result = calculateBlockI(withEinbringungen(filledProfile(15)));
    expect(result.einbringungCount).toBe(40);
    expect(result.totalPoints).toBe(600);
    expect(result.maxPoints).toBe(600);
    expect(result.average).toBe(15);
  });

  it('counts the seminar as two results worth twice its rounded score', () => {
    const result = calculateBlockI(withEinbringungen(filledProfile(10)));
    expect(result.seminarTotalPoints).toBe(20);
    expect(result.totalPoints).toBe(400);
  });

  it('fails below the 200-point floor', () => {
    const result = calculateBlockI(withEinbringungen(filledProfile(4)));
    expect(result.totalPoints).toBe(160);
    expect(result.passed).toBe(false);
  });

  it('passes a profile that clears every Block I hurdle', () => {
    const result = calculateBlockI(withEinbringungen(filledProfile(10)));
    expect(result.totalPoints).toBeGreaterThanOrEqual(200);
    expect(result.atLeastFiveCount).toBeGreaterThanOrEqual(32);
    expect(result.zeroCount).toBe(0);
    expect(result.passed).toBe(true);
  });

  it('counts deficits and refuses to pass with a zero', () => {
    const profile = withEinbringungen(filledProfile(10));
    profile.grades = profile.grades.map((grade) =>
      grade.subjectId === 'deu' && grade.semester === '12/1' ? { ...grade, points: 0 } : grade
    );
    const result = calculateBlockI(profile);
    expect(result.zeroCount).toBe(1);
    expect(result.deficitCount).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it('refuses to pass with fewer than 32 results at 5 points or better', () => {
    const profile = withEinbringungen(filledProfile(4));
    expect(calculateBlockI(profile).atLeastFiveCount).toBe(0);
    expect(calculateBlockI(profile).passed).toBe(false);
  });

  it('reports missing results rather than scoring them as zero', () => {
    const profile = withEinbringungen(filledProfile(10));
    profile.grades = profile.grades.map((grade) =>
      grade.subjectId === 'deu' && grade.semester === '12/1' ? { ...grade, points: null } : grade
    );
    const result = calculateBlockI(profile);
    expect(result.missingGradeCount).toBe(1);
    expect(result.passed).toBe(false);
  });

  it('separates contributed from dropped results', () => {
    const result = calculateBlockI(withEinbringungen(filledProfile(10)));
    expect(result.contributedGrades).toHaveLength(38);
    // Everything entered but not submitted is reported as dropped, so a
    // student can see what the optimiser left out.
    expect(result.droppedGrades.length).toBeGreaterThan(0);
    expect(result.droppedGrades.every((grade) => grade.points !== null)).toBe(true);
  });

  it('treats a seminar below 9 points as two deficits', () => {
    const profile = withEinbringungen(filledProfile(10));
    profile.seminarPaperPoints = 3;
    profile.seminarPresentationPoints = 3;
    const result = calculateBlockI(profile);
    expect(result.seminarTotalPoints).toBeLessThan(9);
    expect(result.deficitCount).toBeGreaterThanOrEqual(2);
  });

  it('is empty and unpassed for a fresh profile', () => {
    const result = calculateBlockI(createDefaultProfile());
    expect(result.totalPoints).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.average).toBe(0);
  });
});

describe('calculateAbitur', () => {
  it('adds Block I and Block II into the headline number', () => {
    const result = calculateAbitur(withEinbringungen(filledProfile(10)));
    expect(result.blockI.totalPoints).toBe(400);
    expect(result.totalPoints).toBe(result.blockI.totalPoints + result.blockII.totalPoints);
  });

  it('reaches the maximum 900 for a perfect profile', () => {
    const perfect = withEinbringungen(filledProfile(15));
    perfect.exams = perfect.exams.map((exam) => ({ ...exam, points: 15 }));
    const result = calculateAbitur(perfect);
    expect(result.totalPoints).toBe(900);
    expect(result.finalGrade).toBe(1.0);
  });

  it('does not certify a profile that fails a critical hurdle', () => {
    const failing = withEinbringungen(filledProfile(3));
    const result = calculateAbitur(failing);
    expect(result.passed).toBe(false);
    expect(result.hurdles.some((hurdle) => hurdle.severity === 'critical' && !hurdle.passed)).toBe(true);
  });

  it('reports one stat per semester', () => {
    const result = calculateAbitur(withEinbringungen(filledProfile(10)));
    expect(result.semesterStats).toHaveLength(4);
  });

  it('flags an incomplete exam subject selection', () => {
    const profile = withEinbringungen(filledProfile(10));
    profile.examSubjects = ['deu', 'mat', 'eng', '', ''];
    const result = calculateAbitur(profile);
    expect(result.hurdles.find((h) => h.id === 'exam-fields')?.passed).toBe(false);
  });

  it('survives a fresh profile without throwing', () => {
    const result = calculateAbitur(createDefaultProfile());
    expect(result.totalPoints).toBe(0);
    expect(result.passed).toBe(false);
  });
});

describe('pointsToGrade', () => {
  it('maps each band', () => {
    expect(pointsToGrade(15)).toBe('1');
    expect(pointsToGrade(13)).toBe('1');
    expect(pointsToGrade(12)).toBe('2');
    expect(pointsToGrade(10)).toBe('2');
    expect(pointsToGrade(9)).toBe('3');
    expect(pointsToGrade(7)).toBe('3');
    expect(pointsToGrade(6)).toBe('4');
    expect(pointsToGrade(5)).toBe('4');
    expect(pointsToGrade(4)).toBe('5');
    expect(pointsToGrade(1)).toBe('5');
    expect(pointsToGrade(0)).toBe('6');
  });
});

describe('checkFieldCoverage', () => {
  it('requires all three Aufgabenfelder', () => {
    expect(checkFieldCoverage(['deu', 'mat', 'eng', 'ges', 'phy']).allCovered).toBe(true);
    expect(checkFieldCoverage(['deu', 'eng', '', '', '']).allCovered).toBe(false);
  });

  it('treats an unknown subject as covering nothing', () => {
    expect(checkFieldCoverage(['nope', 'nope', 'nope', 'nope', 'nope'])).toMatchObject({
      field1: false,
      field2: false,
      field3: false,
      allCovered: false,
    });
  });
});

describe('calculateNeededAverage', () => {
  it('reports nothing needed once everything is entered', () => {
    const complete = withEinbringungen(filledProfile(15));
    complete.exams = complete.exams.map((exam) => ({ ...exam, points: 15 }));
    const result = calculateNeededAverage(complete, 1.0);
    expect(result).toMatchObject({ neededBlockIAvg: 0, neededExamAvg: 0, achievable: true });
  });

  it('reports an unreachable target as not achieved on a finished profile', () => {
    const complete = withEinbringungen(filledProfile(4));
    const result = calculateNeededAverage(complete, 1.0);
    expect(result.achievable).toBe(false);
  });

  it('never asks for more than 15 points per result', () => {
    const fresh = createDefaultProfile();
    const result = calculateNeededAverage(fresh, 1.0);
    expect(result.neededBlockIAvg).toBeLessThanOrEqual(15);
    expect(result.neededExamAvg).toBeLessThanOrEqual(15);
  });
});
