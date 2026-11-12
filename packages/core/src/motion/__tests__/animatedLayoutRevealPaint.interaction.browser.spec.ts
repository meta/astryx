// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input The Animated layout story's Collapsible and TreeList, opened and
 *   closed in a real browser.
 * @output Real-browser tests of what an edge reveal paints on every frame:
 *   the revealed content's shown edge, as the engine evaluates it, against the
 *   content after it.
 * @position Beside `animatedLayoutAdopters.interaction.browser.spec.ts`, which
 *   reads the same edge on the module's clock from keyframes. This one reads
 *   evaluated boxes and clips, where an engine that paints a clip on its own
 *   clock parts the two.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {requireFrames} from '@astryxdesign/interaction-harness';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer | undefined;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

const STORY = 'core-animated-layout--animated-layout';

/**
 * How far the content may move between its two reads of one sample, px. A
 * composited motion moves a little between any two reads; this is well
 * under the edge assertions' 1.5 px.
 */
const TORN_READ_PX = 0.25;

async function openStory(page: Page): Promise<void> {
  await page.goto(
    `${storybook?.origin ?? ''}/iframe.html?id=${STORY}&viewMode=story`,
  );
  await page
    .locator('#storybook-root > *')
    .first()
    .waitFor({state: 'attached'});
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

interface PaintedFrame {
  /**
   * `opening ended` once the reveal has stopped running. A `start` read is
   * taken at the click, before any frame.
   */
  phase:
    'opening start' | 'opening' | 'opening ended' | 'closing start' | 'closing';
  /** When the page read it, epoch ms. */
  t: number;
  /**
   * Whether the read shows one moment. WebKit evaluates a composited motion
   * at each read's own wall-clock time, so a pause between two reads mixes
   * two moments.
   */
  atomic: boolean;
  /** From the shown edge of the revealed content to the content after it. */
  gap: number;
  /** How much of the revealed content shows. */
  shown: number;
}

interface PaintedRide {
  frames: PaintedFrame[];
  /** The gap the layout leaves between the open content and what follows. */
  restGap: number;
  /** How much farther than the content's height the content after it moves. */
  beyond: number;
}

/**
 * Opens and closes the content, and reads what the engine evaluates on every
 * frame. That is the content's box less its clip, the lowest of its parts
 * with their translation, and the box after it.
 */
async function paintedRide(
  page: Page,
  selectors: {trigger: string; content: string; after: string},
): Promise<PaintedRide> {
  const options = {...selectors, tornReadPx: TORN_READ_PX};
  return page.evaluate(async options => {
    const {trigger, content: contentSelector, after, tornReadPx} = options;
    const button = document.querySelector(trigger) as HTMLElement;
    const content = () => document.querySelector<HTMLElement>(contentSelector);
    const next = document.querySelector(after) as HTMLElement;
    const clipBottom = (element: HTMLElement, box: DOMRect) => {
      const match = /^inset\(([^)]*)\)/.exec(
        getComputedStyle(element).clipPath,
      );
      if (match == null) {
        return 0;
      }
      const [t, , b = t] = match[1].trim().split(/\s+/);
      return b.endsWith('%')
        ? (Number.parseFloat(b) / 100) * box.height
        : Number.parseFloat(b);
    };
    const frames: PaintedFrame[] = [];
    const read = (phase: PaintedFrame['phase']) => {
      const t = performance.timeOrigin + performance.now();
      const element = content();
      if (element == null || getComputedStyle(element).display === 'none') {
        // Gone: the frame still counts in the gaps between frames.
        frames.push({phase, t, gap: Number.NaN, shown: 0, atomic: true});
        return;
      }
      const measure = () => {
        const box = element.getBoundingClientRect();
        let edge = box.bottom - clipBottom(element, box);
        let lowest = Number.NEGATIVE_INFINITY;
        for (
          let part = element.firstElementChild;
          part != null;
          part = part.nextElementSibling
        ) {
          lowest = Math.max(lowest, part.getBoundingClientRect().bottom);
        }
        if (Number.isFinite(lowest)) {
          edge = Math.min(edge, lowest);
        }
        return {edge, top: box.top};
      };
      // The content is read again after the content after it. If its edge
      // moved more than TORN_READ_PX in between, the pair spans two moments.
      const shown = measure();
      const nextTop = next.getBoundingClientRect().top;
      const again = measure();
      frames.push({
        phase,
        t,
        gap: nextTop - shown.edge,
        shown: Math.max(0, shown.edge - shown.top),
        atomic: Math.abs(again.edge - shown.edge) <= tornReadPx,
      });
    };
    const frame = async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve());
      });
    const settle = async () => {
      for (let i = 0; i < 90; i++) {
        await frame();
      }
    };
    const closedTop = next.getBoundingClientRect().top;
    button.click();
    await settle();
    const box = (content() as HTMLElement).getBoundingClientRect();
    const openTop = next.getBoundingClientRect().top;
    const restGap = openTop - box.bottom;
    const beyond = Math.max(0, openTop - closedTop - box.height);
    button.click();
    await settle();
    // A frame after the reveal has ended shows the content open, so it does
    // not count as a frame of the motion.
    const revealing = () =>
      (content()?.getAnimations({subtree: true}) ?? []).some(
        animation => animation.playState === 'running',
      );
    // Each click's own read counts in the gaps before the first frame.
    button.click();
    read('opening start');
    for (let i = 0; i < 40; i++) {
      await frame();
      read(revealing() ? 'opening' : 'opening ended');
    }
    await settle();
    button.click();
    read('closing start');
    for (let i = 0; i < 40; i++) {
      await frame();
      read('closing');
    }
    return {frames, restGap, beyond};
  }, options);
}

/** Notes the samples a run dropped as spanning two moments. */
function noteTornReads(frames: ReadonlyArray<PaintedFrame>): void {
  const torn = frames.filter(f => !f.atomic).length;
  if (torn > 0) {
    test.info().annotations.push({
      type: 'torn reads',
      description: `${torn} of ${frames.length} reads moved over ${TORN_READ_PX} px between their two reads and were not judged`,
    });
  }
}

/**
 * On every painted frame where the content shows, its shown edge meets the
 * content after it as at rest. No blank band opens and nothing overlaps,
 * beyond the container gap that content travels.
 */
function expectPaintedRide(result: PaintedRide): void {
  noteTornReads(result.frames);
  // Every drawn frame, the reveal's settled ones too.
  for (const phase of ['opening', 'closing'] as const) {
    const shown = result.frames.filter(
      f =>
        (f.phase === phase ||
          (phase === 'opening' && f.phase === 'opening ended')) &&
        f.shown > 0.5 &&
        f.atomic,
    );
    for (const f of shown) {
      const detail = JSON.stringify({...f, ...result, frames: undefined});
      expect(f.gap, detail).toBeLessThan(result.restGap + 1.5);
      expect(f.gap, detail).toBeGreaterThan(
        result.restGap - result.beyond - 1.5,
      );
    }
  }
  // The page drew both motions: a starved page fails here by name. Each
  // phase is judged on its own reads, never across the settle between them.
  for (const phase of ['opening', 'closing'] as const) {
    requireFrames(
      result.frames.filter(f => f.phase.startsWith(phase)),
      {
        min: 5,
        during: `the ${phase === 'opening' ? 'reveal' : 'conceal'} plays`,
        where: f => f.phase === phase && f.shown > 0.5 && f.atomic,
      },
    );
  }
}

/**
 * Waits until no animation on the page still runs. It reads again after each
 * wait, so a motion that starts late is waited for too.
 */
async function settleMotions(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const running = () =>
      document
        .getAnimations()
        .filter(animation => animation.playState !== 'finished');
    for (let left = running(); left.length > 0; left = running()) {
      await Promise.allSettled(left.map(async animation => animation.finished));
    }
  });
}

/** Opens the gliding rows story and marks the first row's toggle and the row after it. */
async function openTable(page: Page): Promise<void> {
  await page.goto(
    `${storybook?.origin ?? ''}/iframe.html?id=core-tablerowexpansion--gliding-rows&viewMode=story`,
  );
  const trigger = page.locator('tbody button[aria-expanded="false"]').first();
  await trigger.waitFor();
  await trigger.evaluate(button => {
    button.setAttribute('data-test-id', 'expand');
    button
      .closest('tr')
      ?.nextElementSibling?.setAttribute('data-test-id', 'after-row');
  });
}

/**
 * Opens the marked row. As the change commits, before any frame, reads
 * whether the panel row's own motion moves a clip, and how many of its cells
 * move. A frame can come after a short motion has ended.
 */
async function revealAsItCommits(page: Page) {
  return page.evaluate(async () => {
    (document.querySelector('[data-test-id="expand"]') as HTMLElement).click();
    const panel = () => document.querySelector('[data-expansion-panel]');
    const moving = () => (panel()?.getAnimations().length ?? 0) > 0;
    // The row commits in the click's microtasks, or in a later task.
    for (let i = 0; i < 10 && !moving(); i++) {
      await new Promise<void>(resolve => {
        queueMicrotask(resolve);
      });
    }
    for (let i = 0; i < 50 && !moving(); i++) {
      await new Promise<void>(resolve => {
        setTimeout(resolve, 0);
      });
    }
    return {
      clips: (panel()?.getAnimations() ?? []).some(animation =>
        (animation.effect as KeyframeEffect)
          .getKeyframes()
          .some(frame => frame.clipPath != null),
      ),
      partMotions: [...(panel()?.children ?? [])].reduce(
        (count, part) => count + part.getAnimations().length,
        0,
      ),
    };
  });
}

test.describe('spec:AST-105 FR9: an edge reveal paints its edge on the content beside it', () => {
  test("a Collapsible's revealed content meets the content after it on every painted frame, opening and closing", async ({
    page,
  }) => {
    await openStory(page);
    await page.evaluate(() => {
      const element = [...document.querySelectorAll('div')].find(el =>
        el.firstChild?.textContent?.trim().startsWith('A plain app div'),
      );
      element?.setAttribute('data-test-id', 'after');
    });
    const trigger = page.getByRole('button', {name: 'Shipping details'});
    const contentId = await trigger.getAttribute('aria-controls');
    expectPaintedRide(
      await paintedRide(page, {
        trigger: `button[aria-controls="${contentId ?? ''}"]`,
        content: `[id="${contentId ?? ''}"]`,
        after: '[data-test-id="after"]',
      }),
    );
  });

  test('a Collapsible closed and opened again rests with its content in place, with no slide left on it', async ({
    page,
  }) => {
    await openStory(page);
    const trigger = page.getByRole('button', {name: 'Shipping details'});
    const contentId = (await trigger.getAttribute('aria-controls')) ?? '';
    for (let i = 0; i < 3; i++) {
      await trigger.click();
      await settleMotions(page);
    }
    const parts = await page.evaluate(id => {
      const region = document.getElementById(id);
      return [...(region?.children ?? [])].map(part => ({
        animations: part.getAnimations().length,
        translate: getComputedStyle(part).translate,
      }));
    }, contentId);
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(part.animations).toBe(0);
      expect(part.translate).toBe('none');
    }
  });

  test("mid-open a Collapsible's content stays inside the region's content box, below the trigger's label", async ({
    page,
  }) => {
    await openStory(page);
    const trigger = page.getByRole('button', {name: 'Shipping details'});
    const contentId = (await trigger.getAttribute('aria-controls')) ?? '';
    await trigger.click();
    const held = await page.evaluate(async id => {
      const region = document.getElementById(id);
      for (let i = 0; i < 30 && !region?.getAnimations().length; i++) {
        await new Promise(requestAnimationFrame);
      }
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = 105;
      }
      await new Promise(requestAnimationFrame);
      if (region == null || region.firstElementChild == null) {
        return null;
      }
      const style = getComputedStyle(region);
      const box = region.getBoundingClientRect();
      return {
        clipTop: Number.parseFloat(
          /^inset\(([^ )]+)/.exec(style.clipPath)?.[1] ?? 'NaN',
        ),
        paddingTop: Number.parseFloat(style.paddingTop),
        partTop: region.firstElementChild.getBoundingClientRect().top - box.top,
      };
    }, contentId);
    expect(held, 'the region and its content').not.toBeNull();
    expect(held?.paddingTop ?? 0).toBeGreaterThan(0);
    // The clip starts where the content box does: the label's descenders
    // hang into the padding above it.
    expect(held?.clipTop ?? 0).toBeCloseTo(held?.paddingTop ?? -1, 1);
    // Mid-open the content still reaches above that edge, so the clip does work.
    expect(held?.partTop ?? 0).toBeLessThan(held?.paddingTop ?? 0);
  });

  test('a Collapsible region with a generated box of its own keeps the moving clip, and its parts stay still', async ({
    page,
  }) => {
    await openStory(page);
    const trigger = page.getByRole('button', {name: 'Shipping details'});
    const contentId = (await trigger.getAttribute('aria-controls')) ?? '';
    await page.addStyleTag({
      content: `[id="${contentId}"]::before { content: ""; display: block; height: 4px; }`,
    });
    await trigger.click();
    const reveal = await page.evaluate(async id => {
      const region = document.getElementById(id);
      for (let i = 0; i < 30 && !region?.getAnimations().length; i++) {
        await new Promise(requestAnimationFrame);
      }
      return {
        clips: (region?.getAnimations() ?? []).some(animation =>
          (animation.effect as KeyframeEffect)
            .getKeyframes()
            .some(frame => frame.clipPath != null),
        ),
        partMotions: [...(region?.children ?? [])].reduce(
          (count, part) => count + part.getAnimations().length,
          0,
        ),
      };
    }, contentId);
    expect(reveal).toEqual({clips: true, partMotions: 0});
  });

  test("a Table row's expanded panel slides its cell on the glide's frames and meets the row after it on every painted frame as it opens", async ({
    page,
  }) => {
    await openTable(page);
    expect(await revealAsItCommits(page)).toEqual({
      clips: false,
      partMotions: 1,
    });
    await settleMotions(page);
    await page.locator('[data-test-id="expand"]').click();
    await settleMotions(page);
    const ride = await paintedRide(page, {
      trigger: '[data-test-id="expand"]',
      content: '[data-expansion-panel]',
      after: '[data-test-id="after-row"]',
    });
    noteTornReads(ride.frames);
    // A closing panel leaves at once and only the rows after it glide.
    const opening = ride.frames.filter(
      f =>
        (f.phase === 'opening' || f.phase === 'opening ended') &&
        f.shown > 0.5 &&
        f.atomic,
    );
    for (const f of opening) {
      expect(f.gap, JSON.stringify(f)).toBeLessThan(ride.restGap + 1.5);
      expect(f.gap, JSON.stringify(f)).toBeGreaterThan(
        ride.restGap - ride.beyond - 1.5,
      );
    }
    requireFrames(
      ride.frames.filter(f => f.phase.startsWith('opening')),
      {
        min: 5,
        during: 'the reveal plays',
        where: f => f.phase === 'opening' && f.shown > 0.5 && f.atomic,
      },
    );
  });

  test('a Table panel row that paints its own box keeps the moving clip, and its cell stays still', async ({
    page,
  }) => {
    await openTable(page);
    await page.addStyleTag({
      content:
        '[data-expansion-panel] { background-color: rgb(240, 240, 240); }',
    });
    expect(await revealAsItCommits(page)).toEqual({
      clips: true,
      partMotions: 0,
    });
  });

  test("a nested row expanded while its parent's group still slides: the rows after it keep meeting it, and none jumps", async ({
    page,
  }) => {
    await openStory(page);
    const result = await page.evaluate(async () => {
      const toggle = (id: string) =>
        document.querySelector<HTMLElement>(
          `[data-tree-id="${id}"] [data-tree-toggle]`,
        );
      const row = (id: string) =>
        document.querySelector<HTMLElement>(`[data-tree-id="${id}"]`);
      const group = () =>
        document.querySelector<HTMLElement>(
          '[data-tree-id="trips"] > [role="group"]',
        );
      const frame = async () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => resolve());
        });
      // Where Trips' group shows its bottom: its box, or its lowest part.
      const shownEdge = (element: HTMLElement) => {
        let lowest = Number.NEGATIVE_INFINITY;
        for (
          let part = element.firstElementChild;
          part != null;
          part = part.nextElementSibling
        ) {
          lowest = Math.max(lowest, part.getBoundingClientRect().bottom);
        }
        return Math.min(element.getBoundingClientRect().bottom, lowest);
      };
      toggle('photos')?.click();
      for (let i = 0; i < 7; i++) {
        await frame();
      }
      toggle('trips')?.click();
      const frames: {gap: number; overlap: number}[] = [];
      for (let i = 0; i < 30; i++) {
        await frame();
        const trips = group();
        const party = row('party')?.getBoundingClientRect();
        const docs = row('docs')?.getBoundingClientRect();
        if (trips == null || party == null || docs == null) {
          continue;
        }
        frames.push({
          gap: party.top - shownEdge(trips),
          overlap: party.bottom - docs.top,
        });
      }
      for (let i = 0; i < 60; i++) {
        await frame();
      }
      const trips = group();
      const party = row('party')?.getBoundingClientRect();
      return {
        frames,
        restGap: (party?.top ?? 0) - (trips == null ? 0 : shownEdge(trips)),
      };
    });
    expect(result.frames.length).toBeGreaterThan(4);
    for (const [i, f] of result.frames.entries()) {
      const at = `frame ${i}: ${JSON.stringify(f)}`;
      expect(Math.abs(f.gap - result.restGap), at).toBeLessThan(1.5);
      expect(f.overlap, at).toBeLessThan(0.5);
    }
  });

  test("a TreeList row's revealed group meets the rows after it on every painted frame, expanding and collapsing", async ({
    page,
  }) => {
    await openStory(page);
    expectPaintedRide(
      await paintedRide(page, {
        trigger: '[data-tree-id="docs"] [data-tree-toggle]',
        content: '[data-tree-id="docs"] > [role="group"]',
        after: '[data-tree-id="notes"]',
      }),
    );
  });
});
