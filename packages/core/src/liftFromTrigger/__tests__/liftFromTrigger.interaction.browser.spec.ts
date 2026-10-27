// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liftFromTrigger.interaction.browser.spec.ts
 * @input The lift bundled with esbuild onto a blank fixture page
 *   (liftFromTrigger.fixture.ts): a list of rows in a clipping, transformed panel and a
 *   menu popover; Chromium and WebKit
 * @output Proof in real engines that a row lifts itself into the top layer
 *   at its lifted rect while one placeholder holds its spot (nothing else
 *   moves, and the row keeps its look); that every motion the lift plays is
 *   `translate`, `scale`, `transform` or `opacity` (spec:AST-094 FR5); that
 *   the menu grows out of the press and keeps nothing inline at rest, and
 *   its close shrinks the layer runtime's exit copy back into it, or, with
 *   no press, fades in where it rests; that the
 *   page has the layer, the shadow, the anchor and the placeholder more while
 *   lifted, whatever the row holds, at most 5 at any moment, and none after
 *   the drop
 *   (AST-017 FR60); that repeated lifts leave no node or listener behind;
 *   that a tap while it grows reaches nothing (FR35) and one on the backdrop
 *   afterwards is the backdrop tap
 * @position Browser proof for liftFromTrigger.ts, run by `pnpm test:interaction`; jsdom
 *   has no layout, no top layer and no animations
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@playwright/test';
import {build, type Plugin} from 'esbuild';
// The page's `window.__lift`.
import type {LiftFixture} from './liftFromTrigger.fixture';

// The layer runtime's gutter is a `stylex.defineConsts` table: static values
// the StyleX compiler puts in place of the call. Unbundled by that compiler,
// the call returns its values here.
const stylexConsts: Plugin = {
  name: 'stylex-consts',
  setup(builder) {
    // esbuild's filters are Go regular expressions, which take no flags.
    builder.onResolve({filter: /^@stylexjs\/stylex$/}, () => ({
      path: 'stylex-consts',
      namespace: 'stylex-consts',
    }));
    builder.onLoad({filter: /.*/, namespace: 'stylex-consts'}, () => ({
      contents: 'export const defineConsts = consts => consts;',
      loader: 'js',
    }));
  },
};

let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'liftFromTrigger.fixture.ts',
      ),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    plugins: [stylexConsts],
  });
  bundle = result.outputFiles[0].text;
});

// A real navigation (not setContent): the page keeps its own window.
async function open(page: Page) {
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body><script>${bundle}</script></body>`;
  await page.route('http://lift.test/', async route =>
    route.fulfill({contentType: 'text/html', body: html}),
  );
  await page.goto('http://lift.test/');
}

type Box = [number, number, number, number];
type LiftFromTriggerResult = NonNullable<ReturnType<LiftFixture['lift']>>;

function expectBox(actual: Box, expected: Box, tolerance = 0.5) {
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
}

test('a row lifts itself into the top layer at its lifted rect while one placeholder holds its spot: nothing else moves, and the row keeps its look', async ({
  page,
}) => {
  await open(page);
  const read = async () =>
    page.evaluate(() => {
      const box = (element: Element | null): Box => {
        const r = element?.getBoundingClientRect();
        return r == null ? [0, 0, 0, 0] : [r.x, r.y, r.width, r.height];
      };
      const row = document.getElementById('row2') as HTMLElement;
      const style = getComputedStyle(row);
      return {
        row1: box(document.getElementById('row1')),
        row2: box(row),
        row3: box(document.getElementById('row3')),
        row4: box(document.getElementById('row4')),
        placeholder: box(document.querySelector('[data-lift-placeholder]')),
        shadow: box(document.querySelector('[data-lift-shadow]')),
        isOpen: row.matches(':popover-open'),
        look: [
          style.color,
          style.backgroundColor,
          style.borderBottomWidth,
          style.borderBottomColor,
          style.paddingLeft,
          style.fontSize,
          style.display,
        ],
      };
    });
  const before = await read();
  const result = await page.evaluate(() => window.__lift.lift('row2', 0.2));
  expect(result).not.toBeNull();
  await page.waitForTimeout(800);
  const after = await read();
  expect(after.isOpen).toBe(true);
  // Grown by 26 px on its larger side, about its center: wider than the
  // clipping panel, and drawn whole.
  const lifted: LiftFromTriggerResult['lifted'] = result?.lifted ?? {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
  expect(lifted.width).toBeCloseTo(361, 3);
  expectBox(after.row2, [lifted.x, lifted.y, lifted.width, lifted.height]);
  // Its shadow lies exactly under it.
  expectBox(after.shadow, [lifted.x, lifted.y, lifted.width, lifted.height]);
  expectBox(after.placeholder, before.row2);
  expectBox(after.row1, before.row1);
  expectBox(after.row3, before.row3);
  expectBox(after.row4, before.row4);
  expect(after.look).toEqual(before.look);
  await page.evaluate(() => window.__lift.dispose());
});

test('a lifted list item leaves its list valid: an li holds its spot, so the list keeps only li children, at the item\u2019s size whatever the page styles an li with', async ({
  page,
}) => {
  await open(page);
  // A rule that would make any other li taller than the row it stands for.
  await page.addStyleTag({
    content: 'li:not([id]) { min-height: 100px; padding: 40px 0; }',
  });
  const row2 = await page.evaluate(() => {
    const r = document.getElementById('row2')?.getBoundingClientRect();
    return r == null ? null : {height: r.height};
  });
  const row3Before = await page.evaluate(
    () => document.getElementById('row3')?.getBoundingClientRect().top ?? -1,
  );
  await page.evaluate(() => window.__lift.lift('row2', 0.2));
  await page.waitForTimeout(400);
  const read = await page.evaluate(() => {
    const list = document.getElementById('list');
    const placeholder = document.querySelector('[data-lift-placeholder]');
    return {
      children: [...(list?.children ?? [])].map(child => child.localName),
      placeholder:
        placeholder == null
          ? null
          : {
              tag: placeholder.localName,
              parent: placeholder.parentElement?.id ?? null,
              hidden: placeholder.getAttribute('aria-hidden'),
              height: placeholder.getBoundingClientRect().height,
            },
      row3: document.getElementById('row3')?.getBoundingClientRect().top ?? -1,
    };
  });
  const detail = JSON.stringify(read);
  expect(read.children, detail).toEqual(['li', 'li', 'li', 'li', 'li']);
  expect(read.placeholder, detail).toEqual({
    tag: 'li',
    parent: 'list',
    hidden: 'true',
    height: row2?.height ?? -1,
  });
  expect(read.row3, detail).toBe(row3Before);
  await page.evaluate(() => window.__lift.dispose());
});

test('a lifted item of an ordered list leaves the numbers of the items after it as they were', async ({
  page,
}) => {
  await open(page);
  // An ordered list with its markers outside, and no tint and no shadow: a
  // later item's marker paints the same while an item is lifted unless its
  // number changes.
  const clip = await page.evaluate(() => {
    const root = document.documentElement.style;
    root.setProperty('--color-overlay', 'transparent');
    root.setProperty('--shadow-high', 'none');
    const panel = document.querySelector<HTMLElement>('.panel');
    if (panel != null) {
      panel.style.display = 'none';
    }
    const holder = document.createElement('div');
    holder.style.cssText =
      'position: absolute; left: 20px; top: 120px; width: 335px;';
    holder.innerHTML = `<ol id="numbered" style="margin: 0; padding: 0 0 0 48px; list-style: decimal outside; font: 20px monospace; color: rgb(0, 0, 0); background: rgb(255, 255, 255);">${[
      1, 2, 3, 4, 5,
    ]
      .map(
        i =>
          `<li id="item${i}" style="display: list-item; height: 44px; line-height: 44px; padding: 0; border: 0; border-radius: 0; background: rgb(255, 255, 255);">Item ${i}</li>`,
      )
      .join('')}</ol>`;
    document.body.append(holder);
    const list = document.getElementById('numbered')?.getBoundingClientRect();
    const later = document.getElementById('item5')?.getBoundingClientRect();
    return list == null || later == null
      ? null
      : {
          x: list.left,
          y: later.top,
          width: later.left - list.left,
          height: later.height,
        };
  });
  if (clip == null) {
    throw new Error('no ordered list');
  }
  const before = await page.screenshot({clip});
  await page.evaluate(() => window.__lift.lift('item2', 0.2));
  await page.waitForTimeout(600);
  const lifted = await page.screenshot({clip});
  const placeholder = await page.evaluate(() => {
    const element = document.querySelector('[data-lift-placeholder]');
    return element == null
      ? null
      : {tag: element.localName, display: getComputedStyle(element).display};
  });
  // The fifth item still reads "5.".
  expect(Buffer.compare(lifted, before), JSON.stringify(placeholder)).toBe(0);
  expect(placeholder?.tag).toBe('li');
  await page.evaluate(() => window.__lift.dispose());
});

test('the shadow follows the row on every frame of its lift and of its drop', async ({
  page,
}) => {
  await open(page);
  // Every animation of the lift, held at the same moment `t` ms in.
  const at = async (t: number) =>
    page.evaluate(time => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = time;
      }
      const box = (element: Element | null): Box => {
        const r = element?.getBoundingClientRect();
        return r == null ? [0, 0, 0, 0] : [r.x, r.y, r.width, r.height];
      };
      return {
        row: box(document.getElementById('row2')),
        shadow: box(document.querySelector('[data-lift-shadow]')),
      };
    }, t);
  await page.evaluate(() => window.__lift.lift('row2', 0.2));
  await page.waitForTimeout(50);
  for (const t of [30, 90, 180]) {
    const {row, shadow} = await at(t);
    expectBox(shadow, row);
  }
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      animation.finish();
    }
    window.__lift.drop();
  });
  await page.waitForTimeout(50);
  for (const t of [30, 90]) {
    const {row, shadow} = await at(t);
    expectBox(shadow, row);
  }
  await page.evaluate(() => window.__lift.dispose());
});

test('the tint clears from what it shows when the row drops, with no jump to clear', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.__lift.lift('row2', 0.2));
  await page.waitForTimeout(600);
  const tint = await page.evaluate(() => {
    const layer = document.querySelector('[data-lift]');
    // The opacity keyframes of the tint animations on the layer's
    // `::backdrop` (the layer itself animates nothing), oldest first.
    // WebKit reports no `pseudoElement` on the effect.
    const fades = () =>
      (layer?.getAnimations({subtree: true}) ?? [])
        .filter(animation => {
          const effect = animation.effect as KeyframeEffect | null;
          return (
            effect?.target === layer &&
            animation.playState !== 'idle' &&
            effect.getKeyframes().some(frame => 'opacity' in frame) &&
            new Set(effect.getKeyframes().map(frame => frame.opacity)).size > 1
          );
        })
        .map(animation =>
          (animation.effect as KeyframeEffect)
            .getKeyframes()
            .map(frame => Number(frame.opacity)),
        );
    const shown = fades().at(-1)?.at(-1) ?? -1;
    window.__lift.drop();
    const clear = fades().at(-1) ?? [];
    return {shown, from: clear[0] ?? -1, to: clear.at(-1) ?? -1};
  });
  const detail = JSON.stringify(tint);
  // Risen, the tint clears from there to nothing.
  expect(tint.shown, detail).toBeCloseTo(1, 2);
  expect(tint.from, detail).toBeGreaterThan(0.95);
  expect(tint.to, detail).toBeCloseTo(0, 2);
  await page.evaluate(() => window.__lift.dispose());
});

test('every motion the lift plays, the menu’s growth and close included, is translate, scale, transform or opacity (spec:AST-094 FR5)', async ({
  page,
}) => {
  await open(page);
  const properties = await page.evaluate(async () => {
    const seen = new Set<string>();
    const ignored = new Set([
      'offset',
      'computedOffset',
      'easing',
      'composite',
    ]);
    const collect = () => {
      for (const animation of document.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        // A zero-length fill holds a value; it plays no motion.
        if (effect == null || effect.getComputedTiming().duration === 0) {
          continue;
        }
        for (const keyframe of effect.getKeyframes()) {
          for (const property of Object.keys(keyframe)) {
            if (!ignored.has(property)) {
              seen.add(property);
            }
          }
        }
      }
    };
    const frame = async () =>
      new Promise(resolve => requestAnimationFrame(resolve));
    window.__lift.lift('row2', 0.4);
    window.__lift.presentMenu({x: 180, y: 330});
    collect();
    await frame();
    await frame();
    collect();
    window.__lift.dismissMenu();
    window.__lift.closeMenu();
    window.__lift.drop();
    collect();
    await frame();
    await frame();
    collect();
    return [...seen].sort();
  });
  expect(properties.length).toBeGreaterThan(0);
  expect(
    properties.filter(
      property =>
        !['opacity', 'scale', 'transform', 'translate'].includes(property),
    ),
  ).toEqual([]);
});

test('the menu grows out of the press into its box and keeps nothing inline at rest; its close shrinks the exit copy back into the press', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.__lift.lift('row2', 0.3));
  await page.waitForTimeout(600);
  const press = {x: 180, y: 330};
  const early = await page.evaluate(async at => {
    window.__lift.presentMenu(at);
    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const r = (
      document.getElementById('menu') as HTMLElement
    ).getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width};
  }, press);
  // Small, and nearer the press than its own center.
  expect(early.width).toBeLessThan(125);
  const fromPress = Math.hypot(early.x - press.x, early.y - press.y);
  const fromBox = Math.hypot(early.x - 165, early.y - 510);
  expect(fromPress).toBeLessThan(fromBox);
  await page.waitForTimeout(900);
  const rest = await page.evaluate(() => {
    const menu = document.getElementById('menu') as HTMLElement;
    const r = menu.getBoundingClientRect();
    return {
      box: [r.x, r.y, r.width, r.height] as Box,
      translate: menu.style.translate,
      scale: menu.style.scale,
      opacity: getComputedStyle(menu).opacity,
    };
  });
  expectBox(rest.box, [40, 420, 250, 180]);
  expect(rest.translate).toBe('');
  expect(rest.scale).toBe('');
  expect(rest.opacity).toBe('1');
  const copy = await page.evaluate(async () => {
    window.__lift.dismissMenu();
    window.__lift.closeMenu();
    const placed = document.querySelector<HTMLElement>('[data-lift-exit]');
    if (placed == null) {
      return null;
    }
    // Its narrowest over the next frames: it starts as the menu stands.
    let width = Infinity;
    for (let i = 0; i < 20 && width >= 250; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      width = Math.min(width, placed.getBoundingClientRect().width);
    }
    return {
      isOpen: placed.matches(':popover-open'),
      inert: placed.inert,
      hidden: placed.getAttribute('aria-hidden'),
      width,
    };
  });
  expect(copy).not.toBeNull();
  expect(copy?.isOpen).toBe(true);
  expect(copy?.inert).toBe(true);
  expect(copy?.hidden).toBe('true');
  // Shrinking already.
  expect(copy?.width ?? 0).toBeLessThan(250);
  await page.waitForTimeout(900);
  expect(
    await page.evaluate(() => document.querySelector('[data-lift-exit]')),
  ).toBeNull();
  await page.evaluate(() => window.__lift.dispose());
});

test('without a press the menu fades in where it rests: opacity only, no travel or growth', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.__lift.lift('row2', 0.3));
  await page.waitForTimeout(600);
  const early = await page.evaluate(async () => {
    window.__lift.presentMenu(null);
    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const menu = document.getElementById('menu') as HTMLElement;
    const r = menu.getBoundingClientRect();
    const moving = new Set<string>();
    for (const animation of menu.getAnimations()) {
      const effect = animation.effect as KeyframeEffect | null;
      const frames = effect?.getKeyframes() ?? [];
      for (const property of ['translate', 'scale', 'transform', 'opacity']) {
        const values = new Set(frames.map(frame => String(frame[property])));
        if (values.size > 1) {
          moving.add(property);
        }
      }
    }
    return {
      box: [r.x, r.y, r.width, r.height] as Box,
      opacity: Number(getComputedStyle(menu).opacity),
      moving: [...moving].sort(),
    };
  });
  expectBox(early.box, [40, 420, 250, 180]);
  expect(early.opacity).toBeLessThan(1);
  expect(early.moving).toEqual(['opacity']);
  await page.waitForTimeout(900);
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(document.getElementById('menu') as HTMLElement)
          .opacity,
    ),
  ).toBe('1');
  await page.evaluate(() => window.__lift.dispose());
});

test('while lifted the page has the layer, the shadow, the anchor and the placeholder more, whatever the row holds, and never more than 5 (AST-017 FR60); a drop leaves the page as it was', async ({
  page,
}) => {
  await open(page);
  const counts = await page.evaluate(async () => {
    // The layer runtime's exit copy is the transient copy INV7 allows (made
    // by the layer runtime, gone within a second): not one of the lift's.
    const count = () =>
      [...document.body.querySelectorAll('*')].filter(
        element => element.closest('[data-lift-exit]') == null,
      ).length;
    const wait = async (ms: number) =>
      new Promise(resolve => setTimeout(resolve, ms));
    const row = document.getElementById('row2') as HTMLElement;
    // As serialized: the same declarations, in the same order.
    const style = row.style.cssText;
    const rest = count();
    let most = 0;
    let sampling = true;
    const sample = () => {
      most = Math.max(most, count() - rest);
      if (sampling) {
        requestAnimationFrame(sample);
      }
    };
    window.__lift.lift('row2', 0.3);
    const deep = count() - rest;
    requestAnimationFrame(sample);
    window.__lift.presentMenu({x: 180, y: 330});
    await wait(700);
    const open = count() - rest;
    window.__lift.dismissMenu();
    window.__lift.closeMenu();
    window.__lift.drop();
    await wait(1200);
    sampling = false;
    const after = count() - rest;
    const styleAfter = row.style.cssText;
    const popoverAfter = row.getAttribute('popover');
    window.__lift.lift('row1', 0.3);
    const shallow = count() - rest;
    window.__lift.dispose();
    return {
      deep,
      open,
      most,
      after,
      shallow,
      style,
      styleAfter,
      popoverAfter,
      lifted: window.__lift.isLifted(),
    };
  });
  // A row of 13 elements and a row of 1: the same 4 more once grown (the
  // layer, the shadow, the anchor and the placeholder), and the hold's
  // shield while the lift grows.
  expect(counts.deep).toBe(5);
  expect(counts.shallow).toBe(5);
  expect(counts.open).toBe(4);
  expect(counts.most).toBeLessThanOrEqual(5);
  expect(counts.after).toBe(0);
  expect(counts.styleAfter).toBe(counts.style);
  expect(counts.popoverAfter).toBeNull();
  expect(counts.lifted).toBe(false);
});

test('ten lifts and drops leave the DOM node and event listener counts where they were (no leaks)', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'DOM counters are a Chromium protocol');
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  const counters = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return cdp.send('Memory.getDOMCounters');
  };
  const cycle = async () =>
    page.evaluate(async () => {
      const wait = async (ms: number) =>
        new Promise(resolve => setTimeout(resolve, ms));
      window.__lift.lift('row2', 0.15);
      window.__lift.presentMenu({x: 180, y: 330});
      await wait(400);
      window.__lift.dismissMenu();
      window.__lift.closeMenu();
      window.__lift.drop();
      await wait(700);
    });
  // One lift first: what a first lift sets up once (the hold's touch gate).
  await cycle();
  const before = await counters();
  for (let i = 0; i < 10; i++) {
    await cycle();
  }
  const after = await counters();
  expect(after.jsEventListeners).toBe(before.jsEventListeners);
  expect(after.nodes).toBeLessThanOrEqual(before.nodes);
});

test('a tap while the row and the menu grow reaches nothing; one on the backdrop once they settle is the backdrop tap, and reaches nothing under it either', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    window.__lift.lift('row2', 0.8);
    window.__lift.presentMenu({x: 180, y: 330});
  });
  await page.mouse.click(180, 700);
  const growing = await page.evaluate(() => ({...window.__lift.log}));
  expect(growing.backdropTaps).toBe(0);
  expect(growing.clicks).not.toContain('page');
  await page.waitForTimeout(2000);
  await page.mouse.click(180, 700);
  const settled = await page.evaluate(() => ({...window.__lift.log}));
  expect(settled.backdropTaps).toBe(1);
  expect(settled.clicks).not.toContain('page');
  await page.evaluate(() => window.__lift.dispose());
});
