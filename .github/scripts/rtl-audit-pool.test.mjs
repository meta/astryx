// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  closePageQuietly,
  createCuratedPages,
  createPagePool,
  mapPool,
  runSteps,
} from '../../apps/storybook/rtl-audit/rtl-audit-pool.mjs';

const TIMEOUT = 'TimeoutError: page.goto: Timeout 30000ms exceeded.';

/**
 * Fake pages. A page that loads the poisoning story fails that story and
 * every later navigation, as a page with a stuck renderer does.
 */
function fakeBrowser({hangOnClose = false} = {}) {
  const opened = [];
  return {
    opened,
    openPage: async () => {
      const page = {
        id: opened.length,
        poisoned: false,
        closed: false,
        close: () =>
          hangOnClose
            ? new Promise(() => {})
            : Promise.resolve().then(() => {
                page.closed = true;
              }),
      };
      opened.push(page);
      return page;
    },
  };
}

function stories(count, poisonAt) {
  return Array.from({length: count}, (_, index) => ({
    storyId: `core-story--${index}`,
    poison: poisonAt.includes(index),
  }));
}

/** One scan phase, counting how often each story is scanned. */
function phase(scanCounts) {
  return {
    scan: async (story, page) => {
      scanCounts.set(story.storyId, (scanCounts.get(story.storyId) ?? 0) + 1);
      await new Promise(resolve => setTimeout(resolve, 1));
      if (page.poisoned) throw new Error(TIMEOUT);
      if (story.poison) {
        page.poisoned = true;
        throw new Error(TIMEOUT);
      }
      return {storyId: story.storyId, verdict: 'N-A', page: page.id};
    },
    onError: (story, error) => ({
      storyId: story.storyId,
      verdict: 'ERROR',
      notes: [String(error)],
    }),
    describe: story => ({storyId: story.storyId}),
  };
}

describe('RTL audit worker pages', () => {
  it('fails only the story that broke a page; the worker continues on a fresh page', async () => {
    const browser = fakeBrowser();
    const pool = await createPagePool({size: 4, openPage: browser.openPage});
    const scanCounts = new Map();
    const results = await mapPool(stories(200, [5]), pool, phase(scanCounts));

    expect(results.filter(result => result.verdict === 'ERROR')).toEqual([
      {
        storyId: 'core-story--5',
        verdict: 'ERROR',
        notes: [`Error: ${TIMEOUT}`],
      },
    ]);
    expect(results.map(result => result.storyId)).toEqual(
      stories(200, []).map(story => story.storyId),
    );
    // No story is scanned twice: the failed one is recorded, not retried.
    expect([...scanCounts.values()].every(count => count === 1)).toBe(true);
    expect(scanCounts.size).toBe(200);
    expect(pool.recoveries).toEqual([
      expect.objectContaining({
        storyId: 'core-story--5',
        error: `Error: ${TIMEOUT}`,
      }),
    ]);
    const [broken] = browser.opened.filter(page => page.poisoned);
    expect(broken.closed).toBe(true);
    expect(pool.pages()).not.toContain(broken);
    expect(browser.opened).toHaveLength(5);
  });

  it('keeps the recovery across phases, and the first page follows its slot', async () => {
    const browser = fakeBrowser();
    const pool = await createPagePool({size: 4, openPage: browser.openPage});
    const firstBefore = pool.first();
    // The first story goes to the first worker, so the first page breaks.
    const d5 = await mapPool(stories(120, [0, 61]), pool, phase(new Map()));
    const d6 = await mapPool(stories(120, []), pool, phase(new Map()));

    expect(
      d5.filter(result => result.verdict === 'ERROR').map(r => r.storyId),
    ).toEqual(['core-story--0', 'core-story--61']);
    expect(d6.filter(result => result.verdict === 'ERROR')).toEqual([]);
    expect(pool.first()).not.toBe(firstBefore);
    expect(pool.first().poisoned).toBe(false);
    expect(pool.recoveries.map(recovery => recovery.storyId)).toEqual([
      'core-story--0',
      'core-story--61',
    ]);
  });

  it('does not wait on a page that never acknowledges its close', async () => {
    const browser = fakeBrowser({hangOnClose: true});
    const pool = await createPagePool({
      size: 2,
      openPage: browser.openPage,
      closePage: page => closePageQuietly(page, 10),
    });
    const results = await mapPool(stories(20, [3]), pool, phase(new Map()));

    expect(results.filter(result => result.verdict === 'ERROR')).toHaveLength(
      1,
    );
    await pool.close();
  });

  it('closes quietly when closing throws', async () => {
    await expect(
      closePageQuietly(
        {close: () => Promise.reject(new Error('Target closed'))},
        10,
      ),
    ).resolves.toBeUndefined();
  });

  describe('curated pass', () => {
    /** Runs curated targets the way the audit does: one target at a time. */
    async function scoreTargets(targets, pages, poison) {
      const results = [];
      for (const target of targets) {
        const dims = {};
        await runSteps(target.dims, pages, {
          pageFor: dim => (dim === 'D7' ? 'coarse' : 'main'),
          run: async (dim, page) => {
            await new Promise(resolve => setTimeout(resolve, 1));
            if (page.poisoned) throw new Error(TIMEOUT);
            if (poison === `${target.storyId}:${dim}`) {
              page.poisoned = true;
              throw new Error(TIMEOUT);
            }
            dims[dim] = `pass on page ${page.id}`;
          },
          onError: dim => {
            dims[dim] = 'ERROR';
          },
          describe: dim => ({phase: 'curated', storyId: target.storyId, dim}),
        });
        results.push({storyId: target.storyId, dims});
      }
      return results;
    }

    const TARGETS = [
      {storyId: 'core-a--default', dims: ['D2', 'D8']},
      {storyId: 'core-b--default', dims: ['D2']},
      {storyId: 'core-c--default', dims: ['D7', 'D2']},
    ];

    async function curatedPages() {
      const browser = fakeBrowser();
      const coarseBrowser = fakeBrowser();
      const pool = await createPagePool({size: 1, openPage: browser.openPage});
      const pages = createCuratedPages({
        pool,
        coarsePage: await coarseBrowser.openPage(),
        openCoarsePage: coarseBrowser.openPage,
      });
      return {browser, coarseBrowser, pool, pages};
    }

    it('fails only the step that broke the page; later steps and targets run on a fresh page', async () => {
      const {browser, coarseBrowser, pool, pages} = await curatedPages();
      const results = await scoreTargets(TARGETS, pages, 'core-a--default:D2');

      expect(results).toEqual([
        {storyId: 'core-a--default', dims: {D2: 'ERROR', D8: 'pass on page 1'}},
        {storyId: 'core-b--default', dims: {D2: 'pass on page 1'}},
        {
          storyId: 'core-c--default',
          dims: {D7: 'pass on page 0', D2: 'pass on page 1'},
        },
      ]);
      expect(pool.recoveries).toEqual([
        {
          worker: 0,
          phase: 'curated',
          storyId: 'core-a--default',
          dim: 'D2',
          error: `Error: ${TIMEOUT}`,
        },
      ]);
      expect(browser.opened[0].closed).toBe(true);
      expect(coarseBrowser.opened).toHaveLength(1);
    });

    it('replaces only the coarse-pointer page when a coarse step breaks it', async () => {
      const {browser, coarseBrowser, pool, pages} = await curatedPages();
      const results = await scoreTargets(
        [...TARGETS, {storyId: 'core-d--default', dims: ['D7']}],
        pages,
        'core-c--default:D7',
      );

      expect(results.at(-2)).toEqual({
        storyId: 'core-c--default',
        dims: {D7: 'ERROR', D2: 'pass on page 0'},
      });
      expect(results.at(-1)).toEqual({
        storyId: 'core-d--default',
        dims: {D7: 'pass on page 1'},
      });
      expect(pool.recoveries.map(recovery => recovery.worker)).toEqual([
        'coarse',
      ]);
      expect(coarseBrowser.opened[0].closed).toBe(true);
      expect(browser.opened).toHaveLength(1);
    });
  });

  it('ends the run, naming both failures, when a page cannot be replaced', async () => {
    const browser = fakeBrowser();
    let opens = 0;
    const pool = await createPagePool({
      size: 1,
      openPage: async () => {
        opens += 1;
        if (opens > 1)
          throw new Error('Target page, context or browser has been closed');
        return browser.openPage();
      },
    });
    await expect(
      mapPool(stories(5, [2]), pool, {
        ...phase(new Map()),
        describe: story => ({phase: 'D5', storyId: story.storyId}),
      }),
    ).rejects.toThrow(
      `cannot replace the page after D5 core-story--2 failed (Error: ${TIMEOUT}): Error: Target page, context or browser has been closed`,
    );
    expect(pool.recoveries).toEqual([]);

    const coarseBrowser = fakeBrowser();
    const pages = createCuratedPages({
      pool: await createPagePool({size: 1, openPage: browser.openPage}),
      coarsePage: await coarseBrowser.openPage(),
      openCoarsePage: async () => {
        throw new Error('Target page, context or browser has been closed');
      },
    });
    await expect(
      runSteps(['D7', 'D2'], pages, {
        pageFor: () => 'coarse',
        run: async () => {
          throw new Error(TIMEOUT);
        },
        onError: () => {},
        describe: dim => ({phase: 'curated', storyId: 'core-a--default', dim}),
      }),
    ).rejects.toThrow(
      `cannot replace the page after curated core-a--default D7 failed (Error: ${TIMEOUT})`,
    );
  });

  it('does not wait on a curated page that never acknowledges its close', async () => {
    const browser = fakeBrowser({hangOnClose: true});
    const coarseBrowser = fakeBrowser({hangOnClose: true});
    const quickClose = page => closePageQuietly(page, 10);
    const pool = await createPagePool({
      size: 1,
      openPage: browser.openPage,
      closePage: quickClose,
    });
    const pages = createCuratedPages({
      pool,
      coarsePage: await coarseBrowser.openPage(),
      openCoarsePage: coarseBrowser.openPage,
      closePage: quickClose,
    });
    const failed = [];
    await runSteps(['D2', 'D7', 'D8'], pages, {
      pageFor: dim => (dim === 'D7' ? 'coarse' : 'main'),
      run: async dim => {
        if (dim !== 'D8') throw new Error(TIMEOUT);
      },
      onError: dim => failed.push(dim),
    });

    expect(failed).toEqual(['D2', 'D7']);
    expect(pool.recoveries.map(recovery => recovery.worker)).toEqual([
      0,
      'coarse',
    ]);
  });
});
