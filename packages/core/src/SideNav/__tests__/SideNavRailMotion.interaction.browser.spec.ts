// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SideNavRailMotion.interaction.browser.spec.ts
 * @input The built Storybook's `Core/AppShell` rail-collapse stories: an
 *   AppShell whose collapsible SideNav's collapsed state the app holds, on a
 *   phone (finger, coarse pointer) and at desktop width (mouse, fine pointer)
 * @output The real-browser frame evidence `component:SideNav` FR6 and
 *   `component:AppShell` FR17 ask for: every frame of a collapse and an
 *   expand keeps the rail's edge on the content's edge with no width
 *   animation, the rail's copy is hidden from assistive technology and gone at
 *   rest, the rail ends icons-only or with its labels, a second press mid-motion
 *   stays continuous, an expand whose old wrap is not copied keeps the edges
 *   together, and Reduce Motion cross-fades under a finger (DR2) and changes at
 *   once under a mouse (DR3)
 * @position Testing; the components' unit cases are
 *   SideNav/SideNavRailMotion.test.tsx
 *
 * SYNC: When modified, update FR6's state cell and Verification row in
 *   SideNav.spec.md and the FR17 Verification row in AppShell.spec.md.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

// The frame evidence is Chromium's: CI's interaction proofs run the chromium
// project, and these cases have not been run in WebKit.
test.skip(
  ({browserName}) => browserName === 'webkit',
  'Chromium frame evidence; not yet verified in WebKit',
);

let storybook: StaticServer | undefined;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

const PHONE_STORY = 'core-appshell--rail-collapse-motion-phone';
const DESKTOP_STORY = 'core-appshell--rail-collapse-motion';

/** Loads a story and waits for its first render, its fonts and two frames. */
async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(
    `${storybook?.origin ?? ''}/iframe.html?id=${story}&viewMode=story`,
  );
  await page.locator('[role="main"]').first().waitFor({state: 'attached'});
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

/** What the frames of one motion showed, sampled every animation frame. */
interface Frames {
  readonly frames: number;
  /** The largest distance between the rail's shown edge and the content's. */
  readonly maxGap: number;
  /** Whether any running animation changed a width. */
  readonly animatesWidth: boolean;
  /** Whether every rail copy seen was inert and hidden from AT. */
  readonly copiesHidden: boolean;
  /** Rail copies seen during the motion. */
  readonly copiesSeen: number;
  /** Other inert copies seen: the content's old wrap. */
  readonly wrapCopiesSeen: number;
  /** Distinct rail-edge positions seen: more than a few means it moved. */
  readonly edges: number;
}

/**
 * Presses the rail's collapse/expand button (`press` runs the press itself:
 * a tap or a click) after `delays` ms each, then samples every frame until
 * `durationMs` after the last press.
 */
async function sampleMotion(
  page: Page,
  press: () => Promise<void>,
  {presses = 1, gapMs = 0, durationMs = 1000} = {},
): Promise<Frames> {
  await page.evaluate(() => {
    const state = {
      frames: 0,
      maxGap: 0,
      animatesWidth: false,
      copiesHidden: true,
      copiesSeen: 0,
      wrapCopiesSeen: 0,
      edges: new Set<number>(),
      running: true,
    };
    (window as unknown as {railFrames: typeof state}).railFrames = state;
    const panel = document.querySelector('.astryx-layout-panel');
    const main = document.querySelector('[role="main"]');
    if (panel == null || main == null) {
      return;
    }
    let column = main;
    while (
      column.parentElement != null &&
      !column.parentElement.contains(panel)
    ) {
      column = column.parentElement;
    }
    const shownRight = (element: Element) => {
      const inset = /inset\(0px ([\d.]+)px/.exec(
        getComputedStyle(element).clipPath,
      );
      return (
        element.getBoundingClientRect().right - (inset ? Number(inset[1]) : 0)
      );
    };
    const sample = () => {
      if (!state.running) {
        return;
      }
      state.frames++;
      const copies = [...document.querySelectorAll('[inert]')].filter(
        element => element.querySelector('nav') != null,
      );
      state.copiesSeen = Math.max(state.copiesSeen, copies.length);
      state.wrapCopiesSeen = Math.max(
        state.wrapCopiesSeen,
        document.querySelectorAll('[inert]').length - copies.length,
      );
      for (const copy of copies) {
        if (copy.getAttribute('aria-hidden') !== 'true') {
          state.copiesHidden = false;
        }
      }
      const edge = Math.max(shownRight(panel), ...copies.map(shownRight));
      state.edges.add(Math.round(edge));
      state.maxGap = Math.max(
        state.maxGap,
        Math.abs(edge - column.getBoundingClientRect().left),
      );
      for (const animation of document.getAnimations()) {
        const frames = (animation.effect as KeyframeEffect).getKeyframes();
        if (frames.some(frame => 'width' in frame || 'inlineSize' in frame)) {
          state.animatesWidth = true;
        }
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  for (let index = 0; index < presses; index++) {
    if (index > 0) {
      await page.waitForTimeout(gapMs);
    }
    await press();
  }
  await page.waitForTimeout(durationMs);
  return page.evaluate(() => {
    const state = (
      window as unknown as {
        railFrames: Omit<Frames, 'edges'> & {
          running: boolean;
          edges: Set<number>;
        };
      }
    ).railFrames;
    state.running = false;
    const {frames, maxGap, animatesWidth, copiesHidden, copiesSeen} = state;
    const {wrapCopiesSeen} = state;
    const edges = state.edges.size;
    return {
      frames,
      maxGap,
      animatesWidth,
      copiesHidden,
      copiesSeen,
      wrapCopiesSeen,
      edges,
    };
  });
}

/** The rail's width and whether its labels show, at rest. */
async function railAtRest(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.astryx-layout-panel') as HTMLElement;
    const label = [...panel.querySelectorAll('span, div')].find(
      element =>
        element.children.length === 0 && element.textContent === 'Analytics',
    );
    const shown =
      label != null &&
      label.getBoundingClientRect().width > 0 &&
      label.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
      }) &&
      label.getBoundingClientRect().right <=
        panel.getBoundingClientRect().right + 0.5;
    return {
      width: Math.round(panel.getBoundingClientRect().width),
      labelsShown: shown,
      copies: document.querySelectorAll('[inert]').length,
      running: document.getAnimations().length,
    };
  });
}

function toggleButton(page: Page) {
  return page.getByRole('button', {name: /^(Collapse|Expand) sidebar$/});
}

/** Every running animation's animated properties and duration. */
async function runningMotion(page: Page) {
  return page.evaluate(() =>
    document.getAnimations().map(animation => {
      const effect = animation.effect as KeyframeEffect;
      const properties = new Set<string>();
      for (const frame of effect.getKeyframes()) {
        for (const key of Object.keys(frame)) {
          if (
            !['offset', 'computedOffset', 'easing', 'composite'].includes(key)
          ) {
            properties.add(key);
          }
        }
      }
      return {
        properties: [...properties],
        duration: Number(effect.getTiming().duration),
        holdsPage:
          effect.target instanceof Element &&
          effect.target.contains(document.querySelector('[role="main"]')),
      };
    }),
  );
}

test.describe('component:SideNav FR6 and component:AppShell FR17 under a finger', () => {
  test('a tap collapses and expands the rail with its edge on the content on every frame, no width animation, and a hidden copy gone at rest', async ({
    page,
  }) => {
    await openStory(page, PHONE_STORY);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(true);
    const expanded = await railAtRest(page);
    expect(expanded.labelsShown).toBe(true);

    const collapse = await sampleMotion(page, async () => {
      await toggleButton(page).tap();
    });
    expect(collapse.frames).toBeGreaterThan(20);
    expect(collapse.maxGap).toBeLessThanOrEqual(1);
    expect(collapse.edges).toBeGreaterThan(5);
    expect(collapse.animatesWidth).toBe(false);
    expect(collapse.copiesSeen).toBe(1);
    expect(collapse.copiesHidden).toBe(true);
    const collapsed = await railAtRest(page);
    expect(collapsed).toMatchObject({
      labelsShown: false,
      copies: 0,
      running: 0,
    });
    expect(collapsed.width).toBeLessThan(expanded.width);

    const expand = await sampleMotion(page, async () => {
      await toggleButton(page).tap();
    });
    expect(expand.maxGap).toBeLessThanOrEqual(1);
    expect(expand.edges).toBeGreaterThan(5);
    expect(expand.animatesWidth).toBe(false);
    expect(expand.copiesHidden).toBe(true);
    expect(await railAtRest(page)).toMatchObject({
      width: expanded.width,
      labelsShown: true,
      copies: 0,
      running: 0,
    });
  });

  test('a second tap while the motion runs keeps the rail and the content together and lands in the second state', async ({
    page,
  }) => {
    await openStory(page, PHONE_STORY);
    const expanded = await railAtRest(page);
    const frames = await sampleMotion(
      page,
      async () => {
        await toggleButton(page).tap();
      },
      {
        presses: 2,
        gapMs: 150,
      },
    );
    expect(frames.maxGap).toBeLessThanOrEqual(1);
    expect(frames.edges).toBeGreaterThan(5);
    expect(frames.animatesWidth).toBe(false);
    expect(frames.copiesSeen).toBeLessThanOrEqual(1);
    expect(await railAtRest(page)).toMatchObject({
      width: expanded.width,
      labelsShown: true,
      copies: 0,
      running: 0,
    });
  });

  test('an expand whose old wrap cannot be copied keeps the rail and the content together', async ({
    page,
  }) => {
    await openStory(page, PHONE_STORY);
    await sampleMotion(page, async () => {
      await toggleButton(page).tap();
    });
    // More elements than the swap copies: the old wrap is not copied.
    await page.evaluate(() => {
      const holder = document.createElement('div');
      for (let index = 0; index < 1600; index++) {
        holder.appendChild(document.createElement('span'));
      }
      document.querySelector('[role="main"]')?.appendChild(holder);
    });
    const expand = await sampleMotion(page, async () => {
      await toggleButton(page).tap();
    });
    expect(expand.maxGap).toBeLessThanOrEqual(1);
    expect(expand.edges).toBeGreaterThan(5);
    expect(expand.animatesWidth).toBe(false);
    // The fallback branch ran: no copy of the old wrap was made.
    expect(expand.wrapCopiesSeen).toBe(0);
    expect(await railAtRest(page)).toMatchObject({
      labelsShown: true,
      copies: 0,
    });
  });

  test('under Reduce Motion a tap only cross-fades, in 200 ms or less, with the page surface still (design:reduced-motion DR2)', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openStory(page, PHONE_STORY);
    await toggleButton(page).tap();
    const motion = await runningMotion(page);
    expect(motion.length).toBeGreaterThan(0);
    for (const {properties, duration, holdsPage} of motion) {
      expect(properties).toEqual(['opacity']);
      expect(duration).toBeLessThanOrEqual(200);
      expect(holdsPage).toBe(false);
    }
    await page.waitForTimeout(400);
    expect(await railAtRest(page)).toMatchObject({
      labelsShown: false,
      copies: 0,
    });
  });
});

test.describe('component:SideNav FR6 and component:AppShell FR17 under a mouse', () => {
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: {width: 1280, height: 800},
  });

  test('a click collapses and expands the rail with its edge on the content on every frame and no width animation', async ({
    page,
  }) => {
    await openStory(page, DESKTOP_STORY);
    expect(
      await page.evaluate(() => matchMedia('(pointer: fine)').matches),
    ).toBe(true);
    const expanded = await railAtRest(page);
    const collapse = await sampleMotion(page, async () => {
      await toggleButton(page).click();
    });
    expect(collapse.maxGap).toBeLessThanOrEqual(1);
    expect(collapse.edges).toBeGreaterThan(5);
    expect(collapse.animatesWidth).toBe(false);
    expect(collapse.copiesHidden).toBe(true);
    expect(await railAtRest(page)).toMatchObject({
      labelsShown: false,
      copies: 0,
      running: 0,
    });
    const expand = await sampleMotion(page, async () => {
      await toggleButton(page).click();
    });
    expect(expand.maxGap).toBeLessThanOrEqual(1);
    expect(expand.edges).toBeGreaterThan(5);
    expect(expand.animatesWidth).toBe(false);
    expect(await railAtRest(page)).toMatchObject({
      width: expanded.width,
      labelsShown: true,
      copies: 0,
    });
  });

  test('under Reduce Motion a click changes the rail and the page at once (design:reduced-motion DR3)', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openStory(page, DESKTOP_STORY);
    await toggleButton(page).click();
    expect(await runningMotion(page)).toEqual([]);
    expect(await railAtRest(page)).toMatchObject({
      labelsShown: false,
      copies: 0,
    });
  });
});
