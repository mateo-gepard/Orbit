import { beforeEach, describe, expect, it, vi } from 'vitest';

// The suite runs in the node environment, and the store persists through
// `localStorage` and announces conflicts on `window`. Both are stubbed here
// rather than pulling in a DOM implementation for four globals.
const memoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
};

vi.stubGlobal('localStorage', memoryStorage());
vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: globalThis.localStorage }));

const { useThreadmapStore } = await import('./store');
import type { ThreadmapItem } from './types';

/**
 * The tag-sync state machine.
 *
 * `store.ts` had no unit tests at all, and its riskiest part is exactly this:
 * echo suppression, dirty-state bookkeeping, and deciding whether an incoming
 * cloud snapshot may overwrite unsaved local edits. The primitives underneath
 * it are tested; the orchestration was not, and orchestration is where this
 * design's risk lives.
 */

function item(id: string, tags: string[] = []): ThreadmapItem {
  return {
    id,
    title: id,
    type: 'task',
    status: 'active',
    createdAt: 0,
    updatedAt: 0,
    userId: 'u1',
    tags,
  };
}

function reset() {
  useThreadmapStore.getState()._setSyncUserId(null);
  useThreadmapStore.setState({
    items: [],
    customTags: [],
    removedDefaultTags: [],
    _tagsCloudDirty: false,
    _tagsBaseRevision: 0,
    _tagsBaseUpdatedAt: 0,
    _pendingTagEdits: {},
  });
}

describe('tag state', () => {
  beforeEach(reset);

  it('adds a custom tag once, lower-cased and trimmed', () => {
    const store = useThreadmapStore.getState();
    store.addCustomTag('  Research  ');
    store.addCustomTag('research');
    expect(useThreadmapStore.getState().customTags).toEqual(['research']);
  });

  it('ignores an empty tag', () => {
    useThreadmapStore.getState().addCustomTag('   ');
    expect(useThreadmapStore.getState().customTags).toEqual([]);
  });

  it('restores a removed default tag instead of adding a duplicate', () => {
    useThreadmapStore.setState({ removedDefaultTags: ['health'] });
    useThreadmapStore.getState().addCustomTag('health');
    expect(useThreadmapStore.getState().removedDefaultTags).toEqual([]);
    expect(useThreadmapStore.getState().customTags).toEqual([]);
  });

  it('does not mark the account dirty while signed out', () => {
    useThreadmapStore.getState().addCustomTag('research');
    expect(useThreadmapStore.getState()._tagsCloudDirty).toBe(false);
  });

  it('marks the account dirty once a sync user is set', () => {
    useThreadmapStore.getState()._setSyncUserId('u1');
    useThreadmapStore.getState().addCustomTag('research');
    expect(useThreadmapStore.getState()._tagsCloudDirty).toBe(true);
  });
});

describe('setTagsFromCloud', () => {
  beforeEach(reset);

  it('accepts a cloud snapshot when nothing local is pending', () => {
    useThreadmapStore.getState().setTagsFromCloud(['a', 'b'], ['home'], 4, 100);
    const state = useThreadmapStore.getState();
    expect(state.customTags).toEqual(['a', 'b']);
    expect(state.removedDefaultTags).toEqual(['home']);
    expect(state._tagsBaseRevision).toBe(4);
    expect(state._tagsBaseUpdatedAt).toBe(100);
    expect(state._tagsCloudDirty).toBe(false);
  });

  it('never lets a non-authoritative snapshot overwrite unsaved local edits', () => {
    useThreadmapStore.setState({ customTags: ['local'], _tagsCloudDirty: true });
    useThreadmapStore.getState().setTagsFromCloud(['cloud'], [], 9, 999);
    expect(useThreadmapStore.getState().customTags).toEqual(['local']);
  });

  it('clears the dirty flag when the cloud already agrees', () => {
    useThreadmapStore.setState({ customTags: ['same'], _tagsCloudDirty: true });
    useThreadmapStore.getState().setTagsFromCloud(['same'], [], 7, 700, true);
    const state = useThreadmapStore.getState();
    expect(state._tagsCloudDirty).toBe(false);
    expect(state._tagsBaseRevision).toBe(7);
    expect(state.customTags).toEqual(['same']);
  });

  it('treats a reordering as a real difference, because tag order is displayed', () => {
    useThreadmapStore.setState({
      customTags: ['b', 'a'],
      _tagsCloudDirty: true,
      _tagsBaseRevision: 7,
      _tagsBaseUpdatedAt: 700,
    });
    useThreadmapStore.getState().setTagsFromCloud(['a', 'b'], [], 7, 700, true);
    // Same set, different order: the local copy stays dirty and is resynced
    // rather than being quietly replaced.
    expect(useThreadmapStore.getState()._tagsCloudDirty).toBe(true);
    expect(useThreadmapStore.getState().customTags).toEqual(['b', 'a']);
  });

  it('raises a conflict when an authoritative snapshot diverges from a newer base', () => {
    const events: string[] = [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent<{ toolId?: string }>).detail?.toolId ?? '');
    };
    window.addEventListener('threadmap:sync-conflict', listener);

    useThreadmapStore.setState({
      customTags: ['local'],
      _tagsCloudDirty: true,
      _tagsBaseRevision: 2,
      _tagsBaseUpdatedAt: 200,
    });
    // Revision 5 is not the base this dirty copy was built on.
    useThreadmapStore.getState().setTagsFromCloud(['cloud'], [], 5, 500, true);

    window.removeEventListener('threadmap:sync-conflict', listener);
    expect(events).toContain('tags');
    // The local copy survives the conflict rather than being discarded.
    expect(useThreadmapStore.getState().customTags).toEqual(['local']);
  });
});

describe('echo suppression', () => {
  beforeEach(reset);

  it('resets on account switch so one account cannot suppress another', () => {
    useThreadmapStore.getState()._setSyncUserId('u1');
    useThreadmapStore.getState().addCustomTag('research');
    expect(useThreadmapStore.getState()._tagsCloudDirty).toBe(true);

    useThreadmapStore.getState()._setSyncUserId('u2');
    // A fresh account accepts its own cloud snapshot immediately.
    useThreadmapStore.setState({ _tagsCloudDirty: false });
    useThreadmapStore.getState().setTagsFromCloud(['from-u2'], [], 1, 10);
    expect(useThreadmapStore.getState().customTags).toEqual(['from-u2']);
  });
});

describe('setItems', () => {
  beforeEach(reset);

  it('rejects a non-array without throwing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // @ts-expect-error — deliberately wrong, this is the guard under test.
    useThreadmapStore.getState().setItems(null);
    expect(useThreadmapStore.getState().items).toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('warns rather than silently accepting a wipe', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    useThreadmapStore.getState().setItems([item('a'), item('b')]);
    useThreadmapStore.getState().setItems([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('stores the items it is given', () => {
    useThreadmapStore.getState().setItems([item('a'), item('b')]);
    expect(useThreadmapStore.getState().items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('getAllTags', () => {
  beforeEach(reset);

  it('combines defaults with custom tags and drops removed defaults', () => {
    useThreadmapStore.setState({ customTags: ['research'], removedDefaultTags: ['home'] });
    const all = useThreadmapStore.getState().getAllTags();
    expect(all).toContain('research');
    expect(all).toContain('tech');
    expect(all).not.toContain('home');
  });
});
