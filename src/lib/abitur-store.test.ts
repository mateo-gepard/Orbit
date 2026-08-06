import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./firestore', () => ({
  saveToolData: vi.fn(async () => undefined),
  ToolDataConflictError: class ToolDataConflictError extends Error {},
}));
vi.mock('./verified-storage', () => ({
  verifiedLocalStateStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

import { createDefaultProfile } from './abitur';
import { useAbiturStore } from './abitur-store';

beforeEach(() => {
  useAbiturStore.getState()._setSyncUserId(null);
  useAbiturStore.setState({ profile: createDefaultProfile(), cloudDirty: false });
});

describe('Abitur store exam identity', () => {
  it('resets a changed oral-exam slot instead of carrying points to the new subject', () => {
    expect(useAbiturStore.getState().setExamSubject(3, 'ges')).toBe(true);
    useAbiturStore.getState().setExamPoints(3, 12);
    expect(useAbiturStore.getState().setExamSubject(3, 'geo')).toBe(true);

    const profile = useAbiturStore.getState().profile;
    expect(profile.examSubjects[3]).toBe('geo');
    expect(profile.exams[3]).toEqual({ subjectId: 'geo', examType: 'colloquium', points: null });
  });

  it('keeps the third written slot synchronized when the advanced subject changes', () => {
    useAbiturStore.getState().setExamPoints(2, 11);
    expect(useAbiturStore.getState().setLeistungsfach('phy')).toBe(true);

    const profile = useAbiturStore.getState().profile;
    expect(profile.examSubjects[2]).toBe('phy');
    expect(profile.exams[2]).toEqual({ subjectId: 'phy', examType: 'written', points: null });
  });

  it('does not remove a protected exam subject or its grades through exclusivity', () => {
    expect(useAbiturStore.getState().setExamSubject(3, 'rev')).toBe(true);
    useAbiturStore.getState().setGrade('rev', '12/1', 13);

    const before = useAbiturStore.getState().profile;
    useAbiturStore.getState().setSubjects([...before.subjects, 'eth']);

    const profile = useAbiturStore.getState().profile;
    expect(profile.subjects).toContain('rev');
    expect(profile.subjects).not.toContain('eth');
    expect(profile.grades.find((grade) => (
      grade.subjectId === 'rev' && grade.semester === '12/1'
    ))?.points).toBe(13);
  });

  it('blocks an oral subject that conflicts with the advanced subject', () => {
    const base = createDefaultProfile();
    useAbiturStore.setState({
      profile: {
        ...base,
        leistungsfach: 'kun',
        subjects: [...base.subjects.filter((id) => id !== 'kun'), 'kun', 'mus'],
        examSubjects: ['deu', 'mat', 'kun', '', ''],
        exams: [
          { subjectId: 'deu', examType: 'written', points: null },
          { subjectId: 'mat', examType: 'written', points: null },
          { subjectId: 'kun', examType: 'written', points: null },
          { subjectId: '', examType: 'colloquium', points: null },
          { subjectId: '', examType: 'colloquium', points: null },
        ],
      },
    });

    expect(useAbiturStore.getState().setExamSubject(3, 'mus')).toBe(false);
    expect(useAbiturStore.getState().profile.examSubjects[3]).toBe('');
  });
});
