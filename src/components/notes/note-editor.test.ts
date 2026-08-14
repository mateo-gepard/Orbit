import { describe, expect, it } from 'vitest';
import { VersionedSaveQueue } from './versioned-save-queue';

async function advanceQueue(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('VersionedSaveQueue', () => {
  it('serializes overlapping saves so the latest revision finishes last', async () => {
    const started: string[] = [];
    const completed: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const queue = new VersionedSaveQueue({ content: '' }, async (draft) => {
      started.push(draft.content);
      if (draft.content === 'first') await firstGate;
      completed.push(draft.content);
    });

    queue.update({ content: 'first' });
    const firstSave = queue.saveLatest();
    await advanceQueue();

    queue.update({ content: 'latest' });
    const latestSave = queue.saveLatest();
    await advanceQueue();

    expect(started).toEqual(['first']);
    releaseFirst();
    await Promise.all([firstSave, latestSave]);

    expect(started).toEqual(['first', 'latest']);
    expect(completed).toEqual(['first', 'latest']);
    expect(queue.isDirty()).toBe(false);
  });

  it('flushes a newer edit made while an older revision is in flight', async () => {
    const persisted: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const queue = new VersionedSaveQueue({ content: '' }, async (draft) => {
      if (draft.content === 'first') await firstGate;
      persisted.push(draft.content);
    });

    queue.update({ content: 'first' });
    const flush = queue.flushLatest();
    await advanceQueue();
    queue.update({ content: 'typed while saving' });
    releaseFirst();

    await flush;
    expect(persisted).toEqual(['first', 'typed while saving']);
    expect(queue.isDirty()).toBe(false);
  });

  it('keeps a failed revision dirty and allows an explicit retry', async () => {
    let attempts = 0;
    const queue = new VersionedSaveQueue({ content: '' }, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
    });

    queue.update({ content: 'keep me' });
    await expect(queue.flushLatest()).rejects.toThrow('offline');
    expect(queue.isDirty()).toBe(true);

    await expect(queue.flushLatest()).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    expect(queue.isDirty()).toBe(false);
  });

  it('adopts remote state only when no local edit is dirty', () => {
    const queue = new VersionedSaveQueue({ content: 'initial' }, async () => {});
    expect(queue.adopt({ content: 'remote' })).toBe(true);
    expect(queue.getLatest().value.content).toBe('remote');
    queue.update({ content: 'local' });
    expect(queue.adopt({ content: 'new remote' })).toBe(false);
    expect(queue.getLatest().value.content).toBe('local');
    queue.resolveWithExternal({ content: 'chosen remote' });
    expect(queue.getLatest().value.content).toBe('chosen remote');
    expect(queue.isDirty()).toBe(false);
  });
});
