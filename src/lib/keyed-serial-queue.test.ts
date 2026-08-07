import { describe, expect, it } from 'vitest';
import { KeyedSerialQueue } from './keyed-serial-queue';

describe('KeyedSerialQueue', () => {
  it('persists rapid same-item saves in call order', async () => {
    const queue = new KeyedSerialQueue();
    const order: string[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });

    const first = queue.run('user:item', async () => {
      order.push('first:start');
      markFirstStarted();
      await firstGate;
      order.push('first:end');
    });
    const second = queue.run('user:item', async () => {
      order.push('second');
    });

    await firstStarted;
    expect(order).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it('continues a same-item queue after an earlier save fails', async () => {
    const queue = new KeyedSerialQueue();
    const order: string[] = [];
    const failed = queue.run('same', async () => {
      order.push('failed');
      throw new Error('failed');
    });
    const next = queue.run('same', async () => { order.push('next'); });

    await expect(failed).rejects.toThrow('failed');
    await next;
    expect(order.indexOf('next')).toBeGreaterThan(order.indexOf('failed'));
  });

  it('allows different items to persist concurrently', async () => {
    const queue = new KeyedSerialQueue();
    const order: string[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });

    const first = queue.run('item-a', async () => {
      order.push('a:start');
      markFirstStarted();
      await firstGate;
      order.push('a:end');
    });
    await firstStarted;

    const other = queue.run('item-b', async () => {
      order.push('b');
    });
    await other;

    expect(order).toEqual(['a:start', 'b']);
    releaseFirst();
    await first;
    expect(order).toEqual(['a:start', 'b', 'a:end']);
  });
});
