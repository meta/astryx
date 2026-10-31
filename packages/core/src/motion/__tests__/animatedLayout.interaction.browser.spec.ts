// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayout.interaction.browser.spec.ts
 * @input The animated-layout module bundled with esbuild onto fixture pages
 *   written inline, real Chromium and WebKit (the interaction projects: a
 *   phone with a coarse pointer) plus a fine-pointer describe
 * @output One proof per `spec:AST-105` Coverage row, and FR2–FR4: which
 *   elements glide after a reported size change, by how much, on one shared
 *   start and spring, never past the area and never scrolling it; nothing
 *   without a handle; Reduce Motion by pointer
 * @position Real-browser verification of `spec:AST-105` and
 *   `architecture:react-component-runtime` INV12
 */

import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@playwright/test';
import {build} from 'esbuild';
import type * as Bundle from './animatedLayoutBundle';

/** One animation on an element: its first frame and its timing. */
interface MotionRead {
  first: string | null;
  opacity: string | null;
  composite: string;
  duration: number;
  startTime: number | null;
}

declare global {
  interface Window {
    AnimatedLayout: typeof Bundle;
    /** Runs one reported change; resolves after the glide is set up. */
    change: (options: {
      changed: string;
      mutate: string;
      area?: string;
      handle?: boolean;
    }) => Promise<void>;
    /** Animations on an element: their first transform and timing. */
    motionOf: (selector: string) => MotionRead[];
  }
}

let script = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL('./animatedLayoutBundle.ts', import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'AnimatedLayout',
    target: 'es2022',
  });
  script = result.outputFiles[0].text;
});

const BASE_STYLE = `
  html, body { margin: 0; font: 14px sans-serif; background: #fff; }
  .area { position: relative; height: 560px; overflow: auto; }
  .row { height: 40px; margin: 0 0 4px; background: #eef; }
  .grow { height: 0; overflow: hidden; background: #fd9; }
  .grow.open { height: 80px; }
`;

const HELPERS = `
window.change = async ({changed, mutate, area = '#area', handle = true}) => {
  const container = document.querySelector(area);
  const target = document.querySelector(changed);
  const layout = handle
    ? AnimatedLayout.createAnimatedLayout(() => container)
    : null;
  const report = AnimatedLayout.reportLayoutChange(layout, () => target);
  report.measureBefore();
  new Function(mutate)();
  report.animate();
  AnimatedLayout.playLayoutChange(layout, target);
  await new Promise(resolve => queueMicrotask(resolve));
};
window.motionOf = selector => {
  const element = document.querySelector(selector);
  return element.getAnimations({subtree: false}).map(animation => {
    const effect = animation.effect;
    const frames = effect.getKeyframes();
    const timing = effect.getTiming();
    return {
      first: frames[0].translate ?? frames[0].transform ?? null,
      opacity: frames[0].opacity == null ? null : String(frames[0].opacity),
      composite: effect.composite,
      duration: Number(timing.duration),
      startTime: animation.startTime == null ? null : Number(animation.startTime),
    };
  });
};
`;

async function open(page: Page, body: string, style = '') {
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${BASE_STYLE}${style}</style>
${body}
<script>${script}</script>
<script>${HELPERS}</script>`;
  await page.route('http://layout.test/', async route =>
    route.fulfill({contentType: 'text/html', body: html}),
  );
  await page.goto('http://layout.test/');
}

const OPEN_GROW = `document.querySelector('#grow').classList.add('open')`;

/** Reports one change from the test (its options cross into the page). */
async function change(
  page: Page,
  options: {
    changed?: string;
    mutate?: string;
    area?: string;
    handle?: boolean;
  } = {},
) {
  await page.evaluate(async o => window.change(o), {
    changed: '#grow',
    mutate: OPEN_GROW,
    ...options,
  });
}

/** Until every animation on the page has finished. */
async function settle(page: Page) {
  await expect
    .poll(async () => page.evaluate(() => document.getAnimations().length), {
      timeout: 5000,
    })
    .toBe(0);
}

/** The translate an animation starts from, in px. */
function startOffset(first: string | null): {x: number; y: number} {
  // The browser shortens `-80px 0px` to `-80px`.
  const match = /^(-?[\d.e+-]+)px(?:\s+(-?[\d.e+-]+)px)?/.exec(first ?? '');
  return match == null
    ? {x: 0, y: 0}
    : {x: Number(match[1]), y: match[2] == null ? 0 : Number(match[2])};
}

test.describe('spec:AST-105 Coverage', () => {
  test('normal-flow siblings at each ancestor level glide, and nothing past the area moves', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area">
        <section id="l1">
          <div id="l2">
            <div id="l3"><div id="grow" class="grow"></div><div id="s3" class="row"></div></div>
            <div id="s2" class="row"></div>
          </div>
          <div id="s1" class="row"></div>
        </section>
        <div id="s0" class="row"></div>
      </div>
      <div id="outside" class="row"></div>`,
    );
    await change(page);
    for (const id of ['#s3', '#s2', '#s1', '#s0']) {
      const [motion] = await page.evaluate(s => window.motionOf(s), id);
      expect(motion, id).toBeDefined();
      expect(startOffset(motion.first).y, id).toBeCloseTo(-80, 0);
      expect(motion.composite, id).toBe('replace');
    }
    expect(await page.evaluate(() => window.motionOf('#outside'))).toEqual([]);
  });

  test('a display: contents wrapper has no box: its children glide in its place', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div id="grow" class="grow"></div>
        <div id="wrap" style="display: contents"><div id="c1" class="row"></div><div id="c2" class="row"></div></div></div>`,
    );
    await change(page);
    expect(await page.evaluate(() => window.motionOf('#wrap'))).toEqual([]);
    for (const id of ['#c1', '#c2']) {
      expect(await page.evaluate(s => window.motionOf(s), id)).toHaveLength(1);
    }
  });

  test('absolute and fixed elements take their final place; an absolute badge rides with its row', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div id="grow" class="grow"></div>
        <div id="row" class="row" style="position: relative"><span id="badge" style="position: absolute; top: 4px; right: 4px; width: 16px; height: 16px; background: #c00"></span></div>
        <div id="abs" style="position: absolute; top: 200px; left: 0; width: 40px; height: 40px; background: #0c0"></div>
        <div id="fixed" style="position: fixed; bottom: 0; right: 0; width: 40px; height: 40px; background: #00c"></div></div>`,
    );
    const before = await page.locator('#badge').boundingBox();
    await change(page);
    expect(await page.evaluate(() => window.motionOf('#abs'))).toEqual([]);
    expect(await page.evaluate(() => window.motionOf('#fixed'))).toEqual([]);
    expect(await page.evaluate(() => window.motionOf('#badge'))).toEqual([]);
    // Halfway through, the row and its badge are between the two places.
    await page.evaluate(() => {
      for (const animation of document
        .querySelector<HTMLElement>('#row')
        ?.getAnimations() ?? []) {
        animation.pause();
        animation.currentTime = 60;
      }
    });
    const mid = await page.locator('#badge').boundingBox();
    expect(mid?.y ?? 0).toBeGreaterThan(before?.y ?? 0);
    expect(mid?.y ?? 0).toBeLessThan((before?.y ?? 0) + 80);
  });

  test('a sticky element glides while unstuck and stays put while stuck', async ({
    page,
  }) => {
    // Both headers come after the change; the first is stuck at the area's
    // top, the second is still in flow below. No scroll anchoring, so content
    // after a change above the fold moves.
    await open(
      page,
      `<div id="area" class="area" style="overflow-anchor: none">
        <div id="grow" class="grow"></div>
        ${'<div class="row"></div>'.repeat(2)}
        <div id="stuck" style="position: sticky; top: 0; height: 30px; background: #ccf"></div>
        ${'<div class="row"></div>'.repeat(10)}
        <div id="unstuck" style="position: sticky; top: 0; height: 30px; background: #fcc"></div>
        ${'<div class="row"></div>'.repeat(20)}
      </div>`,
    );
    const stuckTop = await page.evaluate(() => {
      const area = document.querySelector('#area') as HTMLElement;
      area.scrollTop = 300;
      const top = area.getBoundingClientRect().top;
      return (
        (document.querySelector('#stuck')?.getBoundingClientRect().top ?? 0) -
        top
      );
    });
    // Precondition: the first header is stuck at the top.
    expect(stuckTop).toBeCloseTo(0, 0);
    await change(page);
    expect(await page.evaluate(() => window.motionOf('#stuck'))).toEqual([]);
    const [unstuck] = await page.evaluate(() => window.motionOf('#unstuck'));
    expect(startOffset(unstuck.first).y).toBeCloseTo(-80, 0);
  });

  test('a float after the change glides', async ({page}) => {
    await open(
      page,
      `<div id="area" class="area"><div id="grow" class="grow"></div>
        <div id="float" style="float: left; width: 60px; height: 60px; background: #9c9"></div></div>`,
    );
    await change(page);
    expect(await page.evaluate(() => window.motionOf('#float'))).toHaveLength(
      1,
    );
  });

  test('flex items: an item that wraps glides, a row-direction neighbor whose rectangle does not change stays', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area">
        <div style="display: flex; flex-wrap: wrap; gap: 4px; width: 200px">
          <div id="chip" style="width: 40px; height: 24px; background: #fd9"></div>
          <div id="t1" style="width: 60px; height: 24px; background: #ddd"></div>
          <div id="t2" style="width: 60px; height: 24px; background: #ddd"></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 8px">
          <div id="tall" style="width: 40px; height: 30px; background: #fd9"></div>
          <div id="neighbor" style="width: 40px; height: 30px; background: #9cf"></div>
        </div>
        <div id="below" class="row"></div>
      </div>`,
    );
    // The first chip widens: the last item wraps to a new line and glides.
    const t2Before = await page.evaluate(
      () => document.querySelector('#t2')?.getBoundingClientRect().top ?? 0,
    );
    await change(page, {
      changed: '#chip',
      mutate: `document.querySelector('#chip').style.width = '120px'`,
    });
    const t2After = await page.evaluate(
      () => document.querySelector('#t2')?.getBoundingClientRect().top ?? 0,
    );
    const [wrapped] = await page.evaluate(() => window.motionOf('#t2'));
    expect(wrapped).toBeDefined();
    // It wrapped: its layout moved down a line, and it starts where it was.
    expect(startOffset(wrapped.first).y).toBeLessThan(-20);
    // A round trip after the change: it has barely left its old place.
    expect(Math.abs(t2After - t2Before)).toBeLessThan(4);
    await settle(page);
    // An item grows taller: its row-direction neighbor keeps its rectangle and
    // stays; the content after the row glides.
    await change(page, {
      changed: '#tall',
      mutate: `document.querySelector('#tall').style.height = '110px'`,
    });
    expect(await page.evaluate(() => window.motionOf('#neighbor'))).toEqual([]);
    const [below] = await page.evaluate(() => window.motionOf('#below'));
    expect(startOffset(below.first).y).toBeCloseTo(-80, 0);
  });

  test('hidden, display: none and zero-size elements are skipped', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div id="grow" class="grow"></div>
        <div id="hidden" class="row" style="visibility: hidden"></div>
        <div id="none" class="row" style="display: none"></div>
        <div id="empty" style="height: 0"></div>
        <div id="after" class="row"></div></div>`,
    );
    await change(page);
    for (const id of ['#hidden', '#none', '#empty']) {
      expect(await page.evaluate(s => window.motionOf(s), id), id).toEqual([]);
    }
    expect(await page.evaluate(() => window.motionOf('#after'))).toHaveLength(
      1,
    );
  });

  test('elements outside the visible part land without animation', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div id="grow" class="grow"></div>
        ${Array.from({length: 40}, (_, i) => `<div id="r${i}" class="row"></div>`).join('')}</div>`,
    );
    await change(page);
    expect(await page.evaluate(() => window.motionOf('#r0'))).toHaveLength(1);
    // Far below the fold before and after.
    expect(await page.evaluate(() => window.motionOf('#r39'))).toEqual([]);
    // A change above the fold, out of sight: the changed element plays nothing.
    await settle(page);
    await page.evaluate(() => {
      (document.querySelector('#area') as HTMLElement).scrollTop = 1200;
    });
    await change(page, {
      changed: '#r2',
      mutate: `document.querySelector('#r2').style.height = '120px'`,
    });
    expect(await page.evaluate(() => window.motionOf('#r2'))).toEqual([]);
  });

  test('a row under a scaled panel moves by its layout change, corrected for the scale', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div style="transform: scale(0.5); transform-origin: 0 0">
        <div id="grow" class="grow"></div><div id="scaled" class="row"></div></div></div>`,
    );
    await change(page);
    const [motion] = await page.evaluate(() => window.motionOf('#scaled'));
    // 80 px of layout: 40 px on screen, translated in the panel's own space.
    expect(startOffset(motion.first).y).toBeCloseTo(-80, 0);
  });

  test("a follower with its own scale glides from its old place: its own scale is no ancestor's", async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div id="grow" class="grow"></div>
        <div id="pressed" class="row" style="transform: scale(0.98)"></div>
        <div id="half" class="row" style="scale: 0.5"></div>
        <div id="flipped" class="row" style="scale: -1"></div>
        <div id="mirrored" class="row" style="scale: 1 -1"></div>
        <div id="pressing" class="row" style="transition: transform 2s linear"></div></div>`,
    );
    // A press starting on #pressing: its own transition runs from
    // \`transform: none\` toward a scale while the change happens.
    await page.evaluate(() => {
      const pressing = document.querySelector<HTMLElement>('#pressing');
      if (pressing != null) {
        void pressing.offsetHeight;
        pressing.style.transform = 'scale(0.98)';
      }
    });
    await change(page);
    // A negative scale flips the element in place: it glides the same way.
    for (const id of [
      '#pressed',
      '#half',
      '#flipped',
      '#mirrored',
      '#pressing',
    ]) {
      const motions = await page.evaluate(s => window.motionOf(s), id);
      const glide = motions.find(motion => (motion.first ?? '').includes('px'));
      expect(glide, `${id} ${JSON.stringify(motions)}`).toBeDefined();
      // 80 px of layout, translated in its parent's space: a \`translate\`
      // does not go through the element's own scale.
      expect(startOffset(glide?.first ?? null).y, id).toBeCloseTo(-80, 0);
    }
  });

  test('top-layer content is never moved', async ({page}) => {
    await open(
      page,
      `<div id="area" class="area"><div id="grow" class="grow"></div>
        <div class="row"></div><div id="pop" popover>menu</div></div>`,
    );
    await page.evaluate(() =>
      (document.querySelector('#pop') as HTMLElement).showPopover(),
    );
    await change(page);
    expect(await page.evaluate(() => window.motionOf('#pop'))).toEqual([]);
  });

  test('an element already moving keeps its motion and adds the new move: no jump, no lost speed', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div id="grow" class="grow"></div>
        <div id="second" class="grow"></div><div id="after" class="row"></div></div>`,
    );
    await change(page);
    await page.waitForTimeout(100);
    const [first] = await page.evaluate(() => window.motionOf('#after'));
    // The row's on-screen speed over the frame before the second change and
    // the frame after it, and its place either side of the change.
    const run = await page.evaluate(async mutate => {
      const row = document.querySelector('#after') as HTMLElement;
      const frame = async () =>
        new Promise<number>(resolve => requestAnimationFrame(resolve));
      const t0 = await frame();
      const y0 = row.getBoundingClientRect().top;
      const t1 = await frame();
      const y1 = row.getBoundingClientRect().top;
      await window.change({changed: '#second', mutate});
      const y1After = row.getBoundingClientRect().top;
      const t2 = await frame();
      const y2 = row.getBoundingClientRect().top;
      return {
        before: (y1 - y0) / (t1 - t0),
        after: (y2 - y1After) / (t2 - t1),
        y1,
        y1After,
      };
    }, `document.querySelector('#second').classList.add('open')`);
    const motions = await page.evaluate(() => window.motionOf('#after'));
    expect(motions).toHaveLength(1);
    expect(motions[0].composite).toBe('replace');
    expect(motions[0].startTime).not.toBe(first.startTime);
    expect(run.y1After).toBeCloseTo(run.y1, 0);
    // Still gliding down at least as fast: the new move adds to the motion.
    expect(run.before).toBeGreaterThan(0);
    expect(run.after).toBeGreaterThan(run.before * 0.9);
    // It still lands where layout put it: 160 px below where it began.
    await settle(page);
    const landed = await page.evaluate(() => {
      const area = document.querySelector('#area')?.getBoundingClientRect();
      const row = document.querySelector('#after')?.getBoundingClientRect();
      return (row?.top ?? 0) - (area?.top ?? 0);
    });
    expect(landed).toBeCloseTo(160, 0);
  });

  test('nested areas: motion stops at the inner area; an inner area moves as one unit', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div id="outerGrow" class="grow"></div>
        <div id="inner" style="height: 200px; overflow: auto"><div id="grow" class="grow"></div><div id="innerAfter" class="row"></div></div>
        <div id="outerAfter" class="row"></div></div>`,
    );
    await change(page, {area: '#inner'});
    expect(
      await page.evaluate(() => window.motionOf('#innerAfter')),
    ).toHaveLength(1);
    expect(await page.evaluate(() => window.motionOf('#outerAfter'))).toEqual(
      [],
    );
    await settle(page);
    await change(page, {
      changed: '#outerGrow',
      mutate: `document.querySelector('#outerGrow').classList.add('open')`,
    });
    expect(await page.evaluate(() => window.motionOf('#inner'))).toHaveLength(
      1,
    );
    expect(
      (await page.evaluate(() => window.motionOf('#innerAfter'))).length,
    ).toBe(0);
  });
});

test.describe('architecture:react-component-runtime INV12', () => {
  test('a 10-level by 50-sibling tree on a throttled phone: one move per follower, none inside a subtree, none past the area, no height', async ({
    page,
    browserName,
  }) => {
    if (browserName === 'chromium') {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
    }
    // Level k holds the path to the changed element plus 49 rows, each with
    // a child of its own (a subtree the walk must not enter).
    const level = (depth: number): string => {
      const rows = Array.from(
        {length: 49},
        () =>
          `<div class="sib" data-depth="${depth}" style="height: 2px"><i class="inner" style="display: block; height: 1px"></i></div>`,
      ).join('');
      const inner =
        depth === 9
          ? '<div id="g1" class="grow"></div><div id="g2" class="grow"></div>'
          : level(depth + 1);
      return `<div class="lvl">${inner}</div>${rows}`;
    };
    await open(
      page,
      `<div id="area" class="area" style="height: 700px">${level(0)}</div>
       <div id="outside" class="row"></div>`,
    );
    // Two changes in one frame, read in the same task: on a throttled page a
    // second round trip can outlast the glide.
    const report = await page.evaluate(async () => {
      const area = document.querySelector('#area');
      const layout = window.AnimatedLayout.createAnimatedLayout(() => area);
      const one = window.AnimatedLayout.reportLayoutChange(layout, () =>
        document.querySelector('#g1'),
      );
      const two = window.AnimatedLayout.reportLayoutChange(layout, () =>
        document.querySelector('#g2'),
      );
      one.measureBefore();
      two.measureBefore();
      document.querySelector('#g1')?.classList.add('open');
      document.querySelector('#g2')?.classList.add('open');
      one.animate();
      two.animate();
      await new Promise<void>(resolve => {
        queueMicrotask(resolve);
      });
      const animations = document.getAnimations();
      const targets = animations.map(
        a => (a.effect as KeyframeEffect).target as Element,
      );
      return {
        total: animations.length,
        distinct: new Set(targets).size,
        intoSubtree: targets.filter(t => t.classList.contains('inner')).length,
        pastArea: targets.filter(t => t.id === 'outside').length,
        animatesHeight: animations.some(a =>
          (a.effect as KeyframeEffect)
            .getKeyframes()
            .some(f => 'height' in f || 'top' in f),
        ),
        followers: targets.filter(t => t.classList.contains('sib')).length,
      };
    });
    expect(report.followers).toBeGreaterThan(0);
    expect(report.distinct).toBe(report.total);
    expect(report.intoSubtree).toBe(0);
    expect(report.pastArea).toBe(0);
    expect(report.animatesHeight).toBe(false);
  });
});

test.describe('spec:AST-105 FR2–FR4', () => {
  const PAGE = `<div id="area" class="area"><div id="grow" class="grow"></div>
    <div id="a" class="row"></div><div id="b" class="row"></div>
    ${'<div class="row"></div>'.repeat(30)}</div>`;

  test('without a handle nothing animates (FR2)', async ({page}) => {
    await open(page, PAGE);
    await change(page, {handle: false});
    for (const id of ['#grow', '#a', '#b']) {
      expect(await page.evaluate(s => window.motionOf(s), id), id).toEqual([]);
    }
  });

  test('two changes in one frame move each element once, by its total change (FR3)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div id="g1" class="grow"></div><div id="g2" class="grow"></div><div id="after" class="row"></div></div>`,
    );
    await page.evaluate(async () => {
      const area = document.querySelector('#area');
      const layout = window.AnimatedLayout.createAnimatedLayout(() => area);
      const one = window.AnimatedLayout.reportLayoutChange(layout, () =>
        document.querySelector('#g1'),
      );
      const two = window.AnimatedLayout.reportLayoutChange(layout, () =>
        document.querySelector('#g2'),
      );
      one.measureBefore();
      two.measureBefore();
      document.querySelector<HTMLElement>('#g1')?.classList.add('open');
      document.querySelector<HTMLElement>('#g2')?.classList.add('open');
      one.animate();
      two.animate();
      await new Promise<void>(resolve => {
        queueMicrotask(resolve);
      });
    });
    const motions = await page.evaluate(() => window.motionOf('#after'));
    expect(motions).toHaveLength(1);
    expect(startOffset(motions[0].first).y).toBeCloseTo(-160, 0);
    // The second changed element, pushed down by the first, moves with its
    // row from its old place.
    const [second] = await page.evaluate(() => window.motionOf('#g2'));
    expect(startOffset(second.first).y).toBeCloseTo(-80, 0);
  });

  test('nested changes compose whichever is reported first: a row inside a moving folder moves only by its own change (FR3)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div id="a" class="grow"></div>
        <div id="folder"><div id="inner" class="grow"></div><div id="row" class="row"></div></div>
        <div id="after" class="row"></div></div>`,
    );
    await page.evaluate(async () => {
      const area = document.querySelector('#area');
      const layout = window.AnimatedLayout.createAnimatedLayout(() => area);
      // The inner change is reported first.
      const inner = window.AnimatedLayout.reportLayoutChange(layout, () =>
        document.querySelector('#inner'),
      );
      const outer = window.AnimatedLayout.reportLayoutChange(layout, () =>
        document.querySelector('#a'),
      );
      inner.measureBefore();
      outer.measureBefore();
      document.querySelector<HTMLElement>('#inner')?.classList.add('open');
      document.querySelector<HTMLElement>('#a')?.classList.add('open');
      inner.animate();
      outer.animate();
      await new Promise<void>(resolve => {
        queueMicrotask(resolve);
      });
    });
    const [folder] = await page.evaluate(() => window.motionOf('#folder'));
    const [row] = await page.evaluate(() => window.motionOf('#row'));
    const [after] = await page.evaluate(() => window.motionOf('#after'));
    // The folder moves by the first change; the row inside it by the inner
    // one alone; what follows by both.
    expect(startOffset(folder.first).y).toBeCloseTo(-80, 0);
    expect(startOffset(row.first).y).toBeCloseTo(-80, 0);
    expect(startOffset(after.first).y).toBeCloseTo(-160, 0);
  });

  for (const row of [
    {
      name: 'a centered row',
      justify: 'center',
      items: ['before', 'changed', 'after'],
      // The row grows by 80 px: an item before moves left by half of it.
      expectX: 40,
    },
    {
      name: 'a space-between row',
      justify: 'space-between',
      items: ['first', 'before', 'changed', 'last'],
      // Four items: the gaps shrink by a third of the growth each.
      expectX: 80 / 3,
    },
    {
      name: 'an end-aligned row',
      justify: 'flex-end',
      items: ['before', 'changed'],
      expectX: 80,
    },
  ]) {
    test(`an earlier sibling ${row.name} moves glides from its old place (spec:AST-105 Coverage)`, async ({
      page,
    }) => {
      await open(
        page,
        `<div id="area" class="area"><div style="display: flex; justify-content: ${row.justify}; gap: 8px">
          ${row.items
            .map(
              id =>
                `<div id="${id}" style="width: 60px; height: 24px; flex: none; background: #ddd"></div>`,
            )
            .join('')}
        </div></div>`,
      );
      await change(page, {
        changed: '#changed',
        mutate: `document.querySelector('#changed').style.width = '140px'`,
      });
      const [motion] = await page.evaluate(() => window.motionOf('#before'));
      expect(motion).toBeDefined();
      expect(startOffset(motion.first).x).toBeCloseTo(row.expectX, 0);
    });
  }

  test('an earlier sibling that order places after the change glides from its old place (spec:AST-105 Coverage)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div style="display: flex; gap: 8px">
        <div id="ordered" style="order: 1; width: 60px; height: 24px; flex: none; background: #ddd"></div>
        <div id="changed" style="width: 60px; height: 24px; flex: none; background: #ddd"></div>
      </div></div>`,
    );
    await change(page, {
      changed: '#changed',
      mutate: `document.querySelector('#changed').style.width = '140px'`,
    });
    const [motion] = await page.evaluate(() => window.motionOf('#ordered'));
    expect(motion).toBeDefined();
    // First in the DOM, laid out after the change: it starts 80 px back.
    expect(startOffset(motion.first).x).toBeCloseTo(-80, 0);
  });

  for (const position of ['absolute', 'fixed']) {
    test(`a ${position} ancestor of the change takes its final place (spec:AST-105 Coverage)`, async ({
      page,
    }) => {
      await open(
        page,
        `<div id="area" class="area">
          <div id="anchored" style="position: ${position}; left: 0; bottom: 0; width: 300px">
            <div id="grow" class="grow"></div><div class="row"></div>
          </div>
        </div>`,
      );
      await change(page);
      // Anchored at its bottom, it grows upward: its top moves, yet it never
      // glides.
      expect(await page.evaluate(() => window.motionOf('#anchored'))).toEqual(
        [],
      );
    });
  }

  test('inside a positioned ancestor only the content after the change moves: the header before it and the card around it take their final place (spec:AST-105 Coverage)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area">
        <div style="position: absolute; left: 0; right: 0; bottom: 0">
          <div id="header" class="row"></div>
          <div id="card" style="padding: 8px; background: #eee"><div id="trigger" class="row"></div><div id="grow" class="grow"></div></div>
          <div id="footer" class="row"></div>
        </div>
      </div>`,
    );
    await change(page);
    // Docked at the bottom, the panel rises as the content opens, and
    // everything around the change takes its place at once with it, so no
    // gap opens and the revealing content never covers what is above it.
    for (const id of ['#header', '#card', '#trigger']) {
      expect(await page.evaluate(s => window.motionOf(s), id), id).toEqual([]);
    }
  });

  test('a stuck sticky footer around the change stays at the area edge (spec:AST-105 Coverage, FR7)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area">${Array.from(
        {length: 30},
        () => '<div class="row"></div>',
      ).join(
        '',
      )}<div id="footer" style="position: sticky; bottom: 0; background: #ccc"><div id="grow" class="grow"></div><div class="row"></div></div></div>`,
    );
    await change(page);
    expect(await page.evaluate(() => window.motionOf('#footer'))).toEqual([]);
  });

  for (const reduce of [false, true]) {
    test(`a change above the visible part inside a wrapper: with scroll anchoring the rows in view and their wrapper stay put${reduce ? ' under Reduce Motion' : ''} (FR3)`, async ({
      page,
    }) => {
      if (reduce) {
        await page.emulateMedia({reducedMotion: 'reduce'});
      }
      await open(
        page,
        `<div id="area" class="area"><div id="wrapper"><div id="grow" class="grow"></div>${Array.from(
          {length: 1000},
          (_, i) => `<div id="r${i}" class="row"></div>`,
        ).join('')}</div></div>`,
      );
      const result = await page.evaluate(async () => {
        const area = document.querySelector('#area') as HTMLElement;
        area.scrollTop = 4200;
        const inView = document.querySelector('#r95') as HTMLElement;
        const before = inView.getBoundingClientRect().top;
        await window.change({
          changed: '#grow',
          mutate: `document.querySelector('#grow').classList.add('open')`,
        });
        const wrapper = document.querySelector('#wrapper') as HTMLElement;
        const moving = [wrapper, ...wrapper.children].filter(
          element => element.getAnimations().length > 0,
        ).length;
        const shown = inView.getBoundingClientRect().top;
        document.getAnimations().forEach(animation => animation.finish());
        return {moving, before, shown};
      });
      // The browser keeps the rows in view where they were; nothing glides
      // or fades, the wrapper around them included.
      expect(result.moving).toBe(0);
      expect(Math.abs(result.shown - result.before)).toBeLessThan(1);
    });
  }

  test('a change above the view in a panel the page scrolls: with the page anchoring its scroll, the rows in view and their wrapper stay put (FR3)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area"><div id="wrapper"><div id="grow" class="grow"></div>${Array.from(
        {length: 1000},
        (_, i) => `<div id="r${i}" class="row"></div>`,
      ).join('')}</div></div>`,
    );
    const result = await page.evaluate(async () => {
      window.scrollTo(0, 4200);
      const inView = document.querySelector('#r95') as HTMLElement;
      const before = inView.getBoundingClientRect().top;
      await window.change({
        changed: '#grow',
        mutate: `document.querySelector('#grow').classList.add('open')`,
      });
      const wrapper = document.querySelector('#wrapper') as HTMLElement;
      const moving = [wrapper, ...wrapper.children].filter(
        element => element.getAnimations().length > 0,
      ).length;
      const shown = inView.getBoundingClientRect().top;
      document.getAnimations().forEach(animation => animation.finish());
      return {moving, before, shown};
    });
    expect(result.moving).toBe(0);
    expect(Math.abs(result.shown - result.before)).toBeLessThan(1);
  });

  test('a sticky footer stuck to the viewport in a panel the page scrolls stays at the edge (FR7)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area">${Array.from(
        {length: 60},
        () => '<div class="row"></div>',
      ).join(
        '',
      )}<div id="footer" style="position: sticky; bottom: 0; background: #ccc"><div id="grow" class="grow"></div><div class="row"></div></div>${Array.from(
        {length: 60},
        () => '<div class="row"></div>',
      ).join('')}</div>`,
    );
    await page.evaluate(() => window.scrollTo(0, 200));
    await change(page);
    expect(await page.evaluate(() => window.motionOf('#footer'))).toEqual([]);
  });

  test('in a multi-column list the rows of a later column glide too (spec:AST-105 Coverage)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div id="list" style="columns: 2; column-gap: 8px">${[
        '<div id="grow" class="grow"></div>',
        ...Array.from(
          {length: 120},
          (_, i) =>
            `<div id="c${i}" class="row" style="break-inside: avoid"></div>`,
        ),
      ].join('')}</div></div>`,
    );
    await change(page);
    const moving = await page.evaluate(
      () =>
        [...document.querySelectorAll('#list > .row')].filter(
          row => row.getAnimations().length > 0,
        ).length,
    );
    // Every row shifts one slot along the columns; the rows in view glide,
    // the second column's included, though they come past the band in DOM
    // order.
    expect(moving).toBeGreaterThanOrEqual(20);
  });

  test('in a dialog re-centered as it grows, the header and trigger before the change stay with their card (FR3)', async ({
    page,
  }) => {
    await open(
      page,
      `<div style="position: fixed; inset: 0; display: flex; align-items: center; justify-content: center">
        <div id="area" style="width: 320px; background: #fff; border: 1px solid #999">
          <div id="header" class="row"></div>
          <div id="card" style="padding: 8px; background: #eee"><div id="trigger" class="row"></div><div id="grow" class="grow"></div></div>
        </div>
      </div>`,
    );
    await change(page);
    // The dialog rises by half the opening at once; what is before the
    // change in it rises with it, never over the opening content.
    for (const id of ['#header', '#card', '#trigger']) {
      expect(await page.evaluate(s => window.motionOf(s), id), id).toEqual([]);
    }
  });

  test('a sticky footer stuck to the viewport stays at the edge when the body sets an overflow (FR7)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area">${Array.from(
        {length: 60},
        () => '<div class="row"></div>',
      ).join(
        '',
      )}<div id="footer" style="position: sticky; bottom: 0; background: #ccc"><div id="grow" class="grow"></div><div class="row"></div></div>${Array.from(
        {length: 60},
        () => '<div class="row"></div>',
      ).join('')}</div>`,
      'body { overflow-x: hidden; }',
    );
    await page.evaluate(() => window.scrollTo(0, 200));
    await change(page);
    expect(await page.evaluate(() => window.motionOf('#footer'))).toEqual([]);
  });

  test('closing an item above the view while opening one in view, in one frame: the rows the browser keeps in place stay put (FR3)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div id="shut" style="height: 344px; overflow: hidden; background: #fd9"></div>${Array.from(
        {length: 30},
        (_, i) =>
          i === 14
            ? '<div id="grow" class="grow"></div>'
            : `<div id="q${i}" class="row"></div>`,
      ).join('')}</div>`,
    );
    const result = await page.evaluate(async () => {
      const area = document.querySelector('#area') as HTMLElement;
      area.scrollTop = 395;
      const layout = window.AnimatedLayout.createAnimatedLayout(() => area);
      const shut = window.AnimatedLayout.reportLayoutChange(layout, () =>
        document.querySelector('#shut'),
      );
      const grow = window.AnimatedLayout.reportLayoutChange(layout, () =>
        document.querySelector('#grow'),
      );
      shut.measureBefore();
      grow.measureBefore();
      (document.querySelector('#shut') as HTMLElement).style.height = '0px';
      document.querySelector('#grow')?.classList.add('open');
      shut.animate();
      grow.animate();
      await new Promise<void>(resolve => {
        queueMicrotask(resolve);
      });
      // The rows in view before the opening one: anchoring keeps them still.
      return [5, 6, 7, 8, 9].map(
        i => document.querySelector(`#q${i}`)?.getAnimations().length ?? -1,
      );
    });
    expect(result).toEqual([0, 0, 0, 0, 0]);
  });

  for (const anchoring of ['auto', 'none']) {
    test(`a change above the band with scroll anchoring ${anchoring === 'auto' ? 'on' : 'off'}: ${anchoring === 'auto' ? 'the rows in view stay put and the walk stops' : 'the rows in view glide'} (FR3)`, async ({
      page,
    }) => {
      await open(
        page,
        `<div id="area" class="area" style="overflow-anchor: ${anchoring}"><div id="grow" class="grow"></div>${Array.from(
          {length: 1000},
          (_, i) => `<div id="r${i}" class="row"></div>`,
        ).join('')}</div>`,
      );
      const result = await page.evaluate(async () => {
        const area = document.querySelector('#area') as HTMLElement;
        area.scrollTop = 3600 + 600;
        const firstInView = document.querySelector('#r95') as HTMLElement;
        const before = firstInView.getBoundingClientRect().top;
        await window.change({
          changed: '#grow',
          mutate: `document.querySelector('#grow').classList.add('open')`,
        });
        const moving = [...area.children].filter(
          row => row.getAnimations().length > 0,
        ).length;
        document.getAnimations().forEach(animation => animation.finish());
        return {moving, before, after: firstInView.getBoundingClientRect().top};
      });
      if (anchoring === 'auto') {
        // The browser keeps the rows in view where they were: nothing moves.
        expect(result.moving).toBe(0);
        expect(Math.abs(result.after - result.before)).toBeLessThan(1);
      } else {
        // They shift down 80 px, and glide there.
        expect(result.moving).toBeGreaterThanOrEqual(12);
      }
    });
  }

  test('in a centered column an unstuck sticky card around the change glides with the content before it (spec:AST-105 Coverage)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div style="display: flex; flex-direction: column; justify-content: center; min-height: 400px">
        <div id="above" class="row"></div>
        <div id="card" style="position: sticky; top: 0; background: #eee"><div id="grow" class="grow"></div><div class="row"></div></div>
        <div class="row"></div>
      </div></div>`,
    );
    await change(page);
    const [above] = await page.evaluate(() => window.motionOf('#above'));
    const [card] = await page.evaluate(() => window.motionOf('#card'));
    // Not stuck, the card is in flow: it rises with the row above it, so
    // that row never crosses it.
    expect(above).toBeDefined();
    expect(card).toBeDefined();
    expect(startOffset(card.first).y).toBeCloseTo(
      startOffset(above.first).y,
      0,
    );
  });

  test('in a centered column the card around the change glides with the content before it, so nothing slides over the opening content (spec:AST-105 Coverage)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div style="display: flex; flex-direction: column; justify-content: center; min-height: 400px">
        <div id="before" class="row" style="margin: 0"></div>
        <div id="card" style="padding: 8px; background: #eef"><div id="title" style="height: 24px">Title</div><div id="changed" style="height: 0"></div></div>
        <div id="after" class="row" style="margin: 0"></div></div></div>`,
    );
    await change(page, {
      changed: '#changed',
      mutate: `document.querySelector('#changed').style.height = '120px'`,
    });
    const card = await page.evaluate(() => window.motionOf('#card'));
    const before = await page.evaluate(() => window.motionOf('#before'));
    const title = await page.evaluate(() => window.motionOf('#title'));
    // The card and the row above it glide up together from their old place;
    // the title inside the card rides with it.
    expect(startOffset(card[0].first).y).toBeCloseTo(60, 0);
    expect(startOffset(before[0].first).y).toBeCloseTo(60, 0);
    expect(title).toEqual([]);
  });

  test('in a long list the walk reads only the rows near the visible part, and rows a tall collapse pulls up into view glide in (FR3)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area" style="overflow-anchor: none">
        ${'<div class="row" style="margin: 0"></div>'.repeat(1000)}
        <div id="tall" style="height: 1200px; background: #fd9"></div>
        ${Array.from({length: 1000}, (_, i) => `<div id="r${i}" class="row" style="margin: 0"></div>`).join('')}
      </div>`,
    );
    const result = await page.evaluate(async () => {
      const area = document.querySelector('#area') as HTMLElement;
      const tall = document.querySelector('#tall') as HTMLElement;
      // The tall item's bottom part in view.
      area.scrollTop = tall.offsetTop + 1000 - area.clientHeight / 2;
      const prototype = Element.prototype;
      const original = prototype.getBoundingClientRect;
      let reads = 0;
      prototype.getBoundingClientRect = function getBoundingClientRect(
        this: Element,
      ) {
        reads += 1;
        return original.call(this);
      };
      const layout = window.AnimatedLayout.createAnimatedLayout(() => area);
      const report = window.AnimatedLayout.reportLayoutChange(
        layout,
        () => tall,
      );
      report.measureBefore();
      tall.style.height = '0px';
      report.animate();
      await new Promise<void>(resolve => {
        queueMicrotask(resolve);
      });
      prototype.getBoundingClientRect = original;
      // Rows now in view that were below the area's visible part plus one
      // viewport before the collapse: the band reached them because the
      // collapsing item is taller than a viewport.
      const areaRect = area.getBoundingClientRect();
      const inView = [
        ...area.querySelectorAll<HTMLElement>('[id^="r"]'),
      ].filter(row => {
        const rect = row.getBoundingClientRect();
        return rect.bottom > areaRect.top && rect.top < areaRect.bottom;
      });
      const lowest = inView.at(-1);
      return {
        reads,
        rows: inView.length,
        lowestGlides: lowest?.getAnimations().length ?? 0,
      };
    });
    // Two thousand rows, but only those near the visible part are read.
    expect(result.reads).toBeLessThan(200);
    expect(result.rows).toBeGreaterThan(0);
    expect(result.lowestGlides).toBe(1);
  });

  test('the glide never scrolls the area (FR3)', async ({page}) => {
    // The same change with and without a handle, from the same scroll
    // position: the area's scroll (the browser's own scroll anchoring
    // included) is identical, frame by frame, so the glide adds none.
    const scrollsOf = async (handle: boolean) => {
      await open(page, PAGE);
      return page.evaluate(
        async ({mutate, withHandle}) => {
          const area = document.querySelector('#area') as HTMLElement;
          area.scrollTop = 40;
          const frame = async () =>
            new Promise(resolve => requestAnimationFrame(resolve));
          await frame();
          await frame();
          await window.change({changed: '#grow', mutate, handle: withHandle});
          const tops: number[] = [];
          for (let i = 0; i < 40; i++) {
            tops.push(area.scrollTop);
            await frame();
          }
          return tops;
        },
        {mutate: OPEN_GROW, withHandle: handle},
      );
    };
    const without = await scrollsOf(false);
    const withHandle = await scrollsOf(true);
    expect(withHandle).toEqual(without);
  });

  test('the changed element and its followers start on one frame on springs.settle (FR4)', async ({
    page,
  }) => {
    await open(page, PAGE);
    await change(page);
    await page.waitForTimeout(50);
    const grow = await page.evaluate(() => window.motionOf('#grow'));
    const follower = await page.evaluate(() => window.motionOf('#a'));
    expect(grow).toHaveLength(1);
    expect(follower).toHaveLength(1);
    expect(grow[0].startTime).toBe(follower[0].startTime);
    expect(grow[0].duration).toBeCloseTo(follower[0].duration, 3);
    // springs.settle is SwiftUI's smooth spring (duration 0.5 s, no bounce):
    // it settles within a second.
    expect(follower[0].duration).toBeGreaterThan(300);
    expect(follower[0].duration).toBeLessThan(1200);
  });

  for (const layout of [
    {
      name: 'block flow',
      html: `<div style="display: block"><div id="content" style="height: 80px; background: #fd9">Details</div><div id="a" class="row" style="margin: 0"></div></div>`,
    },
    {
      name: 'a column flex box with a gap',
      html: `<div style="display: flex; flex-direction: column; gap: 12px"><div id="content" style="height: 80px; background: #fd9">Details</div><div id="a" class="row" style="margin: 0"></div></div>`,
    },
    {
      name: 'a centered column',
      html: `<div style="display: flex; flex-direction: column; justify-content: center; min-height: 400px"><div class="row"></div><div id="content" style="height: 80px; background: #fd9">Details</div><div id="a" class="row"></div></div>`,
    },
    {
      name: 'a space-between column',
      html: `<div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 400px"><div class="row"></div><div id="content" style="height: 80px; background: #fd9">Details</div><div id="a" class="row"></div><div class="row"></div></div>`,
    },
    {
      name: 'a column that ends a flex row',
      html: `<div style="display: flex; gap: 8px"><div style="display: flex; flex-direction: column; flex: 1"><div class="row"></div><div id="content" style="height: 80px; background: #fd9">Details</div></div><div style="width: 60px; height: 40px; background: #ddd"></div></div><div id="a" class="row"></div>`,
    },
  ]) {
    test(`an exit in ${layout.name} lands the content after it exactly where it goes once hidden (FR4)`, async ({
      page,
    }) => {
      await open(
        page,
        `<div id="area" class="area">${layout.html}<div class="row"></div></div>`,
      );
      const result = await page.evaluate(async () => {
        const area = document.querySelector('#area');
        const content = document.querySelector('#content') as HTMLElement;
        const a = document.querySelector('#a') as HTMLElement;
        const handle = window.AnimatedLayout.createAnimatedLayout(() => area);
        const report = window.AnimatedLayout.reportLayoutChange(
          handle,
          () => content,
        );
        report.measureBefore();
        report.animate();
        // Where the content after it lands once the element is gone.
        content.style.display = 'none';
        const target = a.getBoundingClientRect().top;
        content.style.display = '';
        const held = window.AnimatedLayout.holdLayoutExit(
          handle,
          content,
          () => {},
        );
        await new Promise<void>(resolve => {
          queueMicrotask(resolve);
        });
        a.getAnimations().forEach(animation => animation.finish());
        const landed = a.getBoundingClientRect().top;
        // When the element hides, nothing after it moves again.
        content.style.display = 'none';
        window.AnimatedLayout.releaseLayoutExit(content);
        const hidden = a.getBoundingClientRect().top;
        return {held, landed, hidden, target};
      });
      if (result.held) {
        expect(Math.abs(result.landed - result.target)).toBeLessThan(0.5);
      }
      expect(Math.abs(result.hidden - result.target)).toBeLessThan(0.5);
    });
  }

  test('a closing element exits on the same motion while the content after it glides up at once (FR4)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div id="content" style="height: 80px; background: #fd9">Details</div>
        <div id="a" class="row"></div><div id="b" class="row"></div></div>`,
    );
    const result = await page.evaluate(async () => {
      const area = document.querySelector('#area');
      const content = document.querySelector('#content') as HTMLElement;
      const layout = window.AnimatedLayout.createAnimatedLayout(() => area);
      const report = window.AnimatedLayout.reportLayoutChange(
        layout,
        () => content,
      );
      report.measureBefore();
      // The component closes it but keeps it rendered for the exit, holding
      // it once the change reports it measured.
      report.animate();
      let finished = false;
      const held = window.AnimatedLayout.holdLayoutExit(layout, content, () => {
        finished = true;
      });
      await new Promise<void>(resolve => {
        queueMicrotask(resolve);
      });
      const exit = content.getAnimations()[0];
      const timing = exit?.effect?.getTiming();
      const followerStart = window.motionOf('#a')[0]?.first ?? null;
      const visible = getComputedStyle(content).display !== 'none';
      await exit?.finished;
      // The finish event follows the finished promise.
      await new Promise(resolve => {
        setTimeout(resolve, 50);
      });
      return {
        held,
        visible,
        position: getComputedStyle(content).position,
        marginEnd: content.style.getPropertyValue('margin-block-end'),
        followerStart,
        exitDuration: Number(timing?.duration),
        followerDuration: window.motionOf('#a')[0]?.duration ?? null,
        finished,
      };
    });
    expect(result.held).toBe(true);
    expect(result.visible).toBe(true);
    // In flow, where it was, giving up its space.
    expect(result.position).toBe('static');
    expect(result.marginEnd).toBe('-80px');
    // The row below starts 80 px lower, where it was, and glides up.
    expect(startOffset(result.followerStart).y).toBeCloseTo(80, 0);
    expect(result.finished).toBe(true);
  });

  test('an exiting element in a scrolled area stays where it is, scrolls with the area and keeps its width (FR4)', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area" style="overflow-anchor: none">
        ${'<div class="row"></div>'.repeat(3)}
        <div id="content" style="box-sizing: content-box; padding: 12px 18px; border: 2px solid #c90; height: 80px">Details</div>
        ${'<div class="row"></div>'.repeat(30)}
      </div>`,
    );
    const result = await page.evaluate(async () => {
      const area = document.querySelector('#area') as HTMLElement;
      const content = document.querySelector('#content') as HTMLElement;
      area.scrollTop = 60;
      const before = content.getBoundingClientRect();
      const layout = window.AnimatedLayout.createAnimatedLayout(() => area);
      const report = window.AnimatedLayout.reportLayoutChange(
        layout,
        () => content,
      );
      report.measureBefore();
      report.animate();
      window.AnimatedLayout.holdLayoutExit(layout, content, () => {});
      await new Promise<void>(resolve => {
        queueMicrotask(resolve);
      });
      const held = content.getBoundingClientRect();
      area.scrollTop = 80;
      const scrolled = content.getBoundingClientRect();
      return {before, held, scrolled};
    });
    expect(result.held.top).toBeCloseTo(result.before.top, 0);
    expect(result.held.width).toBeCloseTo(result.before.width, 0);
    // It scrolls with the area (so the area still clips it).
    expect(result.scrolled.top).toBeCloseTo(result.before.top - 20, 0);
  });

  for (const layout of [
    {
      name: 'a flex column with a gap',
      html: `<div style="display: flex; flex-direction: column; gap: 8px">
          <div class="row" style="margin: 0"></div>
          <div id="content" style="height: 80px; background: #fd9">Details</div>
          <div id="after" class="row" style="margin: 0"></div>
        </div>`,
    },
    {
      name: 'collapsing margins',
      html: `<div>
          <div class="row" style="margin: 0"></div>
          <div id="content" style="height: 80px; margin: 10px 0 20px; background: #fd9">Details</div>
          <div id="after" class="row" style="margin: 0"></div>
        </div>`,
    },
    {
      // What follows is inside a `display: contents` wrapper, as Tooltip and
      // Theme render one.
      name: 'a flex column whose next item is a display: contents wrapper',
      html: `<div style="display: flex; flex-direction: column; gap: 8px">
          <div class="row" style="margin: 0"></div>
          <div id="content" style="height: 80px; background: #fd9">Details</div>
          <div style="display: contents"><div id="after" class="row" style="margin: 0"></div></div>
        </div>`,
    },
    {
      // Under a scaled ancestor: the correction is read in screen px.
      name: 'a gap stack under a scaled ancestor',
      html: `<div style="transform: scale(0.5); transform-origin: 0 0">
          <div style="display: flex; flex-direction: column; gap: 8px">
            <div class="row" style="margin: 0"></div>
            <div id="content" style="height: 80px; background: #fd9">Details</div>
            <div id="after" class="row" style="margin: 0"></div>
          </div>
        </div>`,
    },
    {
      // Collapsible's shape: the content is the last child of a plain block
      // wrapper, and what follows sits after the wrapper.
      name: 'a plain wrapper, as its last child',
      html: `<div>
          <div class="row" style="margin: 0"></div>
          <div id="content" style="height: 80px; background: #fd9">Details</div>
        </div>
        <p id="after" style="margin: 0; height: 40px">Next</p>`,
    },
  ]) {
    test(`an exiting element frees exactly its space in ${layout.name}: the content after it does not jump when it hides (FR3, FR4)`, async ({
      page,
    }) => {
      await open(page, `<div id="area" class="area">${layout.html}</div>`);
      const result = await page.evaluate(async () => {
        const area = document.querySelector('#area');
        const content = document.querySelector('#content') as HTMLElement;
        const after = document.querySelector('#after') as HTMLElement;
        const layoutHandle = window.AnimatedLayout.createAnimatedLayout(
          () => area,
        );
        const report = window.AnimatedLayout.reportLayoutChange(
          layoutHandle,
          () => content,
        );
        report.measureBefore();
        const measured = report.animate();
        const held = window.AnimatedLayout.holdLayoutExit(
          layoutHandle,
          content,
          () => {},
        );
        const inert = content.hasAttribute('inert');
        await new Promise<void>(resolve => {
          queueMicrotask(resolve);
        });
        const glides = after.getAnimations().length;
        for (const animation of document.getAnimations()) {
          animation.finish();
        }
        const settled = after.getBoundingClientRect().top;
        // The component hides it once its exit ends.
        content.style.display = 'none';
        window.AnimatedLayout.releaseLayoutExit(content);
        const hidden = after.getBoundingClientRect().top;
        return {measured, held, inert, glides, settled, hidden};
      });
      expect(result.measured).toBe(true);
      expect(result.held).toBe(true);
      expect(result.inert).toBe(true);
      expect(result.glides).toBe(1);
      expect(result.settled).toBeCloseTo(result.hidden, 0);
    });
  }

  test("a closing flex-row item that sets its row's height hides at once, and the content after the row takes its final place at once", async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area">
        <div style="display: flex; align-items: flex-start; gap: 8px">
          <div id="content" style="width: 80px; height: 120px; background: #fd9"></div>
          <div style="width: 80px; height: 40px; background: #9cf"></div>
        </div>
        <div id="after" class="row" style="margin: 0"></div>
      </div>`,
    );
    const result = await page.evaluate(async () => {
      const area = document.querySelector('#area');
      const content = document.querySelector('#content') as HTMLElement;
      const after = document.querySelector('#after') as HTMLElement;
      const layoutHandle = window.AnimatedLayout.createAnimatedLayout(
        () => area,
      );
      const report = window.AnimatedLayout.reportLayoutChange(
        layoutHandle,
        () => content,
      );
      report.measureBefore();
      report.animate();
      const held = window.AnimatedLayout.holdLayoutExit(
        layoutHandle,
        content,
        () => {},
      );
      // The component hides it in the same commit.
      content.style.display = 'none';
      await new Promise<void>(resolve => {
        queueMicrotask(resolve);
      });
      return {
        held,
        margin: content.style.getPropertyValue('margin-inline-end'),
        glides: after.getAnimations().length,
      };
    });
    expect(result).toEqual({held: false, margin: '', glides: 0});
  });

  test('holding the exit keeps the CSS animations inside the element running (FR4)', async ({
    page,
  }) => {
    await open(
      page,
      `<style>@keyframes spin { to { rotate: 360deg; } }</style>
      <div id="area" class="area">
        <div id="content" style="height: 80px"><div id="spinner" style="width: 20px; height: 20px; background: #36c; animation: spin 2s linear infinite"></div></div>
        <div id="after" class="row"></div>
      </div>`,
    );
    const result = await page.evaluate(async () => {
      const area = document.querySelector('#area');
      const content = document.querySelector('#content') as HTMLElement;
      const spinner = document.querySelector('#spinner') as HTMLElement;
      await new Promise(resolve => {
        setTimeout(resolve, 300);
      });
      let restarts = 0;
      spinner.addEventListener('animationstart', () => {
        restarts += 1;
      });
      const before = Number(spinner.getAnimations()[0]?.currentTime);
      const layoutHandle = window.AnimatedLayout.createAnimatedLayout(
        () => area,
      );
      const report = window.AnimatedLayout.reportLayoutChange(
        layoutHandle,
        () => content,
      );
      report.measureBefore();
      report.animate();
      const held = window.AnimatedLayout.holdLayoutExit(
        layoutHandle,
        content,
        () => {},
      );
      const after = Number(spinner.getAnimations()[0]?.currentTime);
      await new Promise(resolve => {
        setTimeout(resolve, 100);
      });
      return {held, before, after, restarts};
    });
    expect(result.held).toBe(true);
    // The spinner kept its time: no restart from 0.
    expect(result.after).toBeGreaterThanOrEqual(result.before);
    expect(result.restarts).toBe(0);
  });

  test('a follower the app moves with its own transform takes its final place at once', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="area" class="area"><div id="grow" class="grow"></div>
        <div id="moved" class="row" style="transform: translateX(4px)"></div>
        <div id="spun" class="row"></div>
        <div id="plain" class="row"></div></div>`,
    );
    await page.evaluate(() => {
      document
        .querySelector('#spun')
        ?.animate([{rotate: '0deg'}, {rotate: '3deg'}], {
          duration: 5000,
          iterations: Infinity,
        });
    });
    await change(page);
    expect(await page.evaluate(() => window.motionOf('#moved'))).toEqual([]);
    const spun = await page.evaluate(() => window.motionOf('#spun'));
    expect(spun.filter(m => m.first?.includes('px') === true)).toEqual([]);
    expect(await page.evaluate(() => window.motionOf('#plain'))).toHaveLength(
      1,
    );
  });

  test("a scope's --motion-springs-settle changes nothing: the role is internal (FR4)", async ({
    page,
  }) => {
    await open(page, PAGE);
    await change(page);
    const [shared] = await page.evaluate(() => window.motionOf('#a'));
    await open(page, PAGE, '#area { --motion-springs-settle: 0.2s 0; }');
    await change(page);
    const [scoped] = await page.evaluate(() => window.motionOf('#a'));
    expect(scoped.duration).toBeCloseTo(shared.duration, 3);
  });

  test('under Reduce Motion with a coarse pointer, both cross-fade with no travel (FR4)', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await open(page, PAGE);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(true);
    await change(page);
    for (const id of ['#grow', '#a']) {
      const [motion] = await page.evaluate(s => window.motionOf(s), id);
      expect(motion.first, id).toBeNull();
      expect(motion.opacity, id).toBe('0');
      expect(motion.duration, id).toBeLessThanOrEqual(200);
    }
  });
});

test.describe('spec:AST-105 FR5 and FR4 under a fine pointer', () => {
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: {width: 1280, height: 800},
  });

  const PAGE = `<div id="area" class="area"><div id="grow" class="grow"></div>
    <div id="a" class="row"></div></div>`;

  test('the glide applies under a mouse (FR5)', async ({page}) => {
    await open(page, PAGE);
    expect(
      await page.evaluate(() => matchMedia('(pointer: fine)').matches),
    ).toBe(true);
    await change(page);
    expect(await page.evaluate(() => window.motionOf('#a'))).toHaveLength(1);
  });

  test('under Reduce Motion with a fine pointer the change is immediate (FR4)', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await open(page, PAGE);
    await change(page);
    expect(await page.evaluate(() => window.motionOf('#grow'))).toEqual([]);
    expect(await page.evaluate(() => window.motionOf('#a'))).toEqual([]);
  });
});
