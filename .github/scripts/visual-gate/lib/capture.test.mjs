// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {
  BACKGROUND_NETWORK_GUARD,
  CAPTURE_CONTEXT_SECURITY,
  applyGlobals,
  blockExternalNetwork,
  isSameOrigin,
  partitionCapturePlan,
  partitionScoutStories,
  serveDirectory,
  storyLoadGlobals,
  storyUsesPlayFunction,
  waitForStoryFinished,
} from './capture.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true});
});

describe('scout partitioning', () => {
  it('balances the current 388-story scout across two workers', () => {
    const stories = Array.from({length: 388}, (_, index) => `story-${index}`);
    const partitions = partitionScoutStories(stories, 2);
    expect(partitions.map(partition => partition.length)).toEqual([194, 194]);
    expect(new Set(partitions.flat()).size).toBe(388);
  });
});

describe('capture plan partitioning', () => {
  it('keeps the 3,378-shot release workload below 1,700 shots per worker', () => {
    const plan = [];
    for (let story = 0; story < 388; story += 1) {
      const shots = story < 274 ? 9 : 8;
      for (let index = 0; index < shots; index += 1) {
        plan.push({key: `${story}-${index}`, storyId: `story-${story}`});
      }
    }

    const partitions = partitionCapturePlan(plan, 2);
    expect(partitions).toHaveLength(2);
    expect(partitions.flat()).toHaveLength(3378);
    expect(Math.max(...partitions.map(partition => partition.length))).toBeLessThan(1700);

    const ownerByStory = {};
    partitions.forEach((partition, worker) => {
      for (const shot of partition) {
        ownerByStory[shot.storyId] ??= worker;
        expect(ownerByStory[shot.storyId]).toBe(worker);
      }
    });
    expect(new Set(partitions.flat().map(shot => shot.key)).size).toBe(3378);
  });

  it('canonicalizes story and global order without changing the shot set', () => {
    const bootstrap = {astryxTheme: 'neutral', colorMode: 'light'};
    const shot = (storyId, theme, mode) => ({
      key: `${storyId}__${theme}-${mode}`,
      storyId,
      theme,
      mode,
    });
    const accepted = [
      shot('radio', 'neutral', 'light'),
      shot('radio', 'neutral', 'dark'),
      shot('default', 'neutral', 'light'),
      shot('default', 'neutral', 'dark'),
      shot('default', 'butter', 'light'),
      shot('default', 'butter', 'dark'),
    ];
    const release = [
      shot('default', 'butter', 'dark'),
      shot('default', 'butter', 'light'),
      shot('default', 'neutral', 'dark'),
      shot('default', 'neutral', 'light'),
      shot('radio', 'neutral', 'dark'),
      shot('radio', 'neutral', 'light'),
    ];

    const sequence = plan =>
      partitionCapturePlan(plan, 2, bootstrap).map(partition =>
        partition.map(candidate => candidate.key),
      );
    expect(sequence(accepted)).toEqual(sequence(release));
    expect(new Set(partitionCapturePlan(release, 2, bootstrap).flat())).toEqual(
      new Set(release),
    );
  });

  it('mounts fast-global stories in the canonical environment first', () => {
    const bootstrap = {astryxTheme: 'neutral', colorMode: 'light'};
    const shot = {theme: 'butter', mode: 'dark'};
    expect(storyLoadGlobals(shot, true, bootstrap)).toEqual({
      initial: bootstrap,
      requested: {astryxTheme: 'butter', colorMode: 'dark'},
      needsUpdate: true,
    });
    expect(storyLoadGlobals(shot, false, bootstrap)).toEqual({
      initial: {astryxTheme: 'butter', colorMode: 'dark'},
      requested: {astryxTheme: 'butter', colorMode: 'dark'},
      needsUpdate: false,
    });
  });

  it('uses one worker for empty or single-worker plans and never splits interleaved stories', () => {
    expect(partitionCapturePlan([], 2)).toEqual([]);
    const plan = [
      {key: 'a-light', storyId: 'a'},
      {key: 'a-dark', storyId: 'a'},
      {key: 'b-light', storyId: 'b'},
    ];
    expect(partitionCapturePlan(plan, 1)).toEqual([plan]);

    const interleaved = [plan[0], plan[2], plan[1]];
    const partitions = partitionCapturePlan(interleaved, 2);
    const aWorkers = partitions
      .map((partition, worker) => (partition.some(shot => shot.storyId === 'a') ? worker : null))
      .filter(worker => worker !== null);
    expect(aWorkers).toHaveLength(1);
  });
});

describe('Storybook interaction lifecycle', () => {
  it('waits for the initial story play function to finish', async () => {
    let timeout;
    const page = {
      waitForFunction: async (predicate, storyId, options) => {
        timeout = options.timeout;
        globalThis.__STORYBOOK_PREVIEW__ = {
          selectionStore: {selection: {storyId}},
          currentRender: {phase: 'playing'},
        };
        expect(predicate(storyId)).toBe(false);
        globalThis.__STORYBOOK_PREVIEW__.currentRender.phase = 'finished';
        expect(predicate(storyId)).toBe(true);
        delete globalThis.__STORYBOOK_PREVIEW__;
      },
    };

    await waitForStoryFinished(page, 'core-sidenav--resizable-in-app-shell');
    expect(timeout).toBe(30000);
  });

  it('detects interaction stories so capture can reload them per environment', async () => {
    const page = {
      evaluate: async (predicate, storyId) => {
        globalThis.__STORYBOOK_PREVIEW__ = {
          selectionStore: {selection: {storyId}},
          currentRender: {story: {playFunction: () => {}}},
        };
        try {
          return predicate(storyId);
        } finally {
          delete globalThis.__STORYBOOK_PREVIEW__;
        }
      },
    };

    await expect(storyUsesPlayFunction(page, 'example')).resolves.toBe(true);
  });

  it('waits for the selected story to finish after a global update', async () => {
    const listeners = new Map();
    const channel = {
      on: (name, listener) => listeners.set(name, listener),
      off: name => listeners.delete(name),
      emit: (name, payload) => {
        if (name !== 'updateGlobals') return;
        expect(payload).toEqual({
          globals: {astryxTheme: 'probe', colorMode: 'dark'},
        });
        queueMicrotask(() => {
          listeners
            .get('storyFinished')
            ?.({storyId: 'other', status: 'success'});
          listeners
            .get('storyFinished')
            ?.({storyId: 'example', status: 'success'});
        });
      },
    };
    const page = {
      evaluate: async (callback, value) => {
        globalThis.__STORYBOOK_ADDONS_CHANNEL__ = channel;
        try {
          return await callback(value);
        } finally {
          delete globalThis.__STORYBOOK_ADDONS_CHANNEL__;
        }
      },
    };

    await applyGlobals(
      page,
      {astryxTheme: 'probe', colorMode: 'dark'},
      'example',
    );
    expect(listeners.has('storyFinished')).toBe(false);
  });
});

describe('capture network boundary', () => {
  it('allows the exact Storybook origin', () => {
    expect(isSameOrigin('http://127.0.0.1:6100/assets/story.js', 'http://127.0.0.1:6100')).toBe(
      true,
    );
  });

  it('rejects URLs that merely share the trusted prefix', () => {
    expect(
      isSameOrigin('http://127.0.0.1:6100@evil.example/collect', 'http://127.0.0.1:6100'),
    ).toBe(false);
  });

  it('blocks service workers and every WebSocket before Storybook runs', async () => {
    let webSocketHandler;
    const context = {
      route: async () => {},
      routeWebSocket: async (_pattern, handler) => {
        webSocketHandler = handler;
      },
    };
    await blockExternalNetwork(context, 'http://127.0.0.1:6100');
    const closed = [];
    await webSocketHandler({close: options => closed.push(options)});
    expect(CAPTURE_CONTEXT_SECURITY).toEqual({serviceWorkers: 'block'});
    expect(BACKGROUND_NETWORK_GUARD).toContain("'WebSocket', 'Worker', 'SharedWorker'");
    expect(closed).toEqual([{code: 1008, reason: 'blocked'}]);
  });

  it('does not follow a Storybook artifact symlink outside its root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-server-'));
    roots.push(root);
    const served = path.join(root, 'served');
    fs.mkdirSync(served);
    fs.writeFileSync(path.join(root, 'secret'), 'credential');
    fs.symlinkSync(path.join(root, 'secret'), path.join(served, 'escape'));
    const server = await serveDirectory(served);
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/escape`);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('credential');
    } finally {
      await server.close();
    }
  });
});
