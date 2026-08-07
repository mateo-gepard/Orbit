import { describe, expect, it } from 'vitest';

import {
  calculateBlockII,
  calculateSeminarTotal,
  calculateSemesterPoints,
  countAllEinbringungen,
  createDefaultProfile,
  isEingebracht,
  reconcileExamSlots,
  reconcileSubjectSelection,
  selectSubjectWithExclusivity,
  totalPointsToGrade,
  validateEinbringungen,
  validateExamCombination,
  type AbiturProfile,
  type ExamResult,
  type IndividualGrade,
} from './abitur';

function profile(overrides: Partial<AbiturProfile> = {}): AbiturProfile {
  return {
    ...createDefaultProfile(),
    ...overrides,
  };
}

describe('Bavarian G9 semester results', () => {
  const grades: IndividualGrade[] = [
    { id: 'g1', subjectId: 'eng', semester: '12/1', type: 'gross', points: 12 },
    { id: 'g2', subjectId: 'eng', semester: '12/1', type: 'klein', points: 8 },
    { id: 'g3', subjectId: 'eng', semester: '12/1', type: 'klein', points: 10 },
  ];

  it('weights the written assessment and small-assessment average equally', () => {
    expect(calculateSemesterPoints(grades, 'eng', '12/1')).toBe(11);
  });

  it('uses only small assessments for non-LF courses in 13/2', () => {
    const finalSemester: IndividualGrade[] = [
      { id: 'g1', subjectId: 'bio', semester: '13/2', type: 'gross', points: 15 },
      { id: 'g2', subjectId: 'bio', semester: '13/2', type: 'klein', points: 7 },
      { id: 'g3', subjectId: 'bio', semester: '13/2', type: 'klein', points: 8 },
    ];
    expect(calculateSemesterPoints(finalSemester, 'bio', '13/2', 'eng')).toBe(8);
  });

  it('retains normal weighting for the Leistungsfach in 13/2', () => {
    const finalSemester: IndividualGrade[] = [
      { id: 'g1', subjectId: 'eng', semester: '13/2', type: 'gross', points: 13 },
      { id: 'g2', subjectId: 'eng', semester: '13/2', type: 'klein', points: 9 },
    ];
    expect(calculateSemesterPoints(finalSemester, 'eng', '13/2', 'eng')).toBe(11);
  });

  it('uses only small assessments for W-Seminar', () => {
    const seminar: IndividualGrade[] = [
      { id: 'g1', subjectId: 'wsem', semester: '12/1', type: 'gross', points: 15 },
      { id: 'g2', subjectId: 'wsem', semester: '12/1', type: 'klein', points: 6 },
    ];
    expect(calculateSemesterPoints(seminar, 'wsem', '12/1')).toBe(6);
  });
});

describe('seminar and contribution rules', () => {
  it('calculates the seminar result as two HJL equivalents', () => {
    expect(calculateSeminarTotal(profile({ seminarPaperPoints: 12, seminarPresentationPoints: 9 }))).toBe(22);
    expect(calculateSeminarTotal(profile({ seminarPaperPoints: null, seminarPresentationPoints: 9 }))).toBeNull();
  });

  it('locks W-Seminar to 12/1 and 12/2 and counts the paper as two equivalents', () => {
    const candidate = profile();
    expect(isEingebracht('wsem', '12/1', candidate)).toBe(true);
    expect(isEingebracht('wsem', '12/2', candidate)).toBe(true);
    expect(isEingebracht('wsem', '13/1', candidate)).toBe(false);
    expect(countAllEinbringungen(candidate)).toBeGreaterThanOrEqual(4);
  });

  it('does not certify incomplete contribution selections', () => {
    const result = validateEinbringungen(profile());
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('40 Einbringungen'))).toBe(true);
  });
});

describe('exam qualification', () => {
  const completeExams: ExamResult[] = [
    { subjectId: 'deu', examType: 'written', points: 10 },
    { subjectId: 'mat', examType: 'written', points: 10 },
    { subjectId: 'eng', examType: 'written', points: 10 },
    { subjectId: 'ges', examType: 'colloquium', points: 10 },
    { subjectId: 'bio', examType: 'colloquium', points: 10 },
  ];

  it('accepts a complete five-subject result that clears all Block II hurdles', () => {
    const result = calculateBlockII(profile({ exams: completeExams }));
    expect(result.complete).toBe(true);
    expect(result.totalPoints).toBe(200);
    expect(result.passed).toBe(true);
  });

  it('rejects a zero-point exam result', () => {
    const exams = completeExams.map((exam, index) => index === 4 ? { ...exam, points: 0 } : exam);
    const result = calculateBlockII(profile({ exams }));
    expect(result.hasZeroExam).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('validates field, language/science, and GPR coverage', () => {
    expect(validateExamCombination('eng', 'ges', 'bio').valid).toBe(true);
    expect(validateExamCombination('eng', 'fra', 'lat').valid).toBe(false);
    expect(validateExamCombination('eng', 'ges', 'ges').valid).toBe(false);
  });

  it('never presents the unmodelled substitution rule as certified', () => {
    const result = validateExamCombination('eng', 'ges', 'bio', 'mat');
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('Joker-Regel'))).toBe(true);
  });

  it('rejects an exclusive conflict between the advanced subject and an oral exam', () => {
    const result = validateExamCombination('kun', 'mus', 'geo');
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('schließen sich gegenseitig aus'))).toBe(true);
  });
});

describe('protected subject and exam-slot reconciliation', () => {
  it('blocks an exclusive choice instead of evicting a protected subject', () => {
    const result = selectSubjectWithExclusivity(['rev', 'eth'], 'eth', ['rev']);
    expect(result.blockedBy).toBe('rev');
    expect(result.subjects).toContain('rev');
    expect(result.subjects).not.toContain('eth');
  });

  it('always retains advanced and exam subjects when reconciling the selected list', () => {
    const candidate = profile({
      leistungsfach: 'kun',
      examSubjects: ['deu', 'mat', 'kun', 'rev', 'geo'],
      subjects: ['deu', 'mat', 'kun', 'rev', 'geo', 'wsem', 'psem'],
    });
    const reconciled = reconcileSubjectSelection(candidate, ['deu', 'mat', 'mus', 'eth']);
    expect(reconciled).toEqual(expect.arrayContaining(['kun', 'rev', 'geo', 'wsem', 'psem']));
    expect(reconciled).not.toContain('mus');
    expect(reconciled).not.toContain('eth');
  });

  it('resets points when a slot changes subject and synchronizes the LF slot', () => {
    const candidate = profile({
      leistungsfach: 'phy',
      examSubjects: ['deu', 'mat', 'eng', 'ges', 'bio'],
      exams: [
        { subjectId: 'deu', examType: 'written', points: 10 },
        { subjectId: 'mat', examType: 'written', points: 11 },
        { subjectId: 'eng', examType: 'written', points: 12 },
        { subjectId: 'ges', examType: 'colloquium', points: 13 },
        { subjectId: 'bio', examType: 'colloquium', points: 14 },
      ],
    });
    const reconciled = reconcileExamSlots(candidate);
    expect(reconciled.examSubjects[2]).toBe('phy');
    expect(reconciled.exams[2]).toEqual({ subjectId: 'phy', examType: 'written', points: null });
    expect(reconciled.exams[3].points).toBe(13);
  });
});

describe('official total-points conversion bands', () => {
  it.each([
    [900, 1.0],
    [823, 1.0],
    [822, 1.1],
    [805, 1.1],
    [804, 1.2],
    [301, 3.9],
    [300, 4.0],
    [299, 6.0],
  ])('maps %i points to %s', (points, grade) => {
    expect(totalPointsToGrade(points)).toBe(grade);
  });
});
