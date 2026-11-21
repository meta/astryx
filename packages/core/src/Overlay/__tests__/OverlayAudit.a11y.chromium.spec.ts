// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Overlay

/**
 * @file OverlayAudit.a11y.chromium.spec.ts
 * @input Exact-head Overlay stories, across modes, themes, direction, pointer and motion settings
 * @output Screenshots and fail-closed sensor receipts for the Overlay whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for an Overlay audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('overlay-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;
type Pointer = 'fine' | 'coarse';

type AuditCase = {
  key: string;
  group: string;
  story: string;
  ready: string;
  mode: Mode;
  theme: string;
  direction: Direction;
  viewport: Viewport;
  pointer: Pointer;
  reducedMotion: 'reduce' | 'no-preference';
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 640};
const NARROW = {width: 320, height: 640};

test.describe.configure({retries: 0, timeout: 600_000});

let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

/**
 * Waits for fonts, images and two frames. `holdMotionStill` pins every
 * transition to 0s and re-emulates media, so motion and touch cases skip it.
 */
async function settle(page: Page, still = true) {
  if (still) {
    await holdMotionStill(page);
  }
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(async () => {
    for (const image of Array.from(document.images)) {
      if (!image.complete) {
        await image.decode().catch(() => null);
      }
    }
  });
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForTimeout(40);
}

async function pageSensors(page: Page) {
  return page.evaluate(() => ({
    mode: document.documentElement.getAttribute('data-theme'),
    theme:
      document
        .querySelector('#storybook-root [data-astryx-theme]')
        ?.getAttribute('data-astryx-theme') ?? null,
    direction: getComputedStyle(
      document.querySelector('#storybook-root [dir]') as Element,
    ).direction,
    viewport: {width: innerWidth, height: innerHeight},
    dpr: devicePixelRatio,
    fonts: document.fonts.status,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    hoverNone: matchMedia('(hover: none)').matches,
    coarse: matchMedia('(pointer: coarse)').matches,
    storybookError:
      document.querySelector('.sb-show-errordisplay') != null ||
      document.body.classList.contains('sb-show-errordisplay'),
  }));
}

/** Every Overlay on the page: its root, its scrim, and the scrim's action. */
async function overlays(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.astryx-overlay')).map(root => {
      const scrim = root.querySelector(':scope > .astryx-overlay-scrim');
      const scrimStyle = scrim ? getComputedStyle(scrim) : null;
      const action = scrim?.querySelector('button') ?? null;
      const rootRect = root.getBoundingClientRect();
      const scrimRect = scrim?.getBoundingClientRect();
      let hitIsAction = false;
      if (action) {
        const rect = action.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        hitIsAction = hit != null && action.contains(hit);
      }
      return {
        name: root.querySelector('img')?.getAttribute('alt') ?? null,
        position: scrim?.getAttribute('data-position') ?? null,
        inert: scrim?.hasAttribute('inert') ?? null,
        opacity: scrimStyle?.opacity ?? null,
        visibility: scrimStyle?.visibility ?? null,
        pointerEvents: scrimStyle?.pointerEvents ?? null,
        transform: scrimStyle?.transform ?? null,
        background: scrimStyle?.backgroundColor ?? null,
        transition: scrimStyle
          ? `${scrimStyle.transitionProperty} ${scrimStyle.transitionDuration}`
          : null,
        transitionDelay: scrimStyle?.transitionDelay ?? null,
        rootRadius: getComputedStyle(root).borderTopLeftRadius,
        rootOverflow: getComputedStyle(root).overflow,
        scrimInsideRoot:
          scrimRect != null &&
          scrimRect.left >= rootRect.left - 0.5 &&
          scrimRect.right <= rootRect.right + 0.5 &&
          scrimRect.bottom <= rootRect.bottom + 0.5,
        action: action
          ? {
              label: action.textContent,
              tabbable:
                action.tabIndex >= 0 &&
                getComputedStyle(action).visibility === 'visible' &&
                !action.closest('[inert]'),
              hitIsAction,
              width: action.getBoundingClientRect().width,
              height: action.getBoundingClientRect().height,
            }
          : null,
      };
    }),
  );
}

async function activeElement(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const root = active?.closest('.astryx-overlay');
    const scrim = root?.querySelector(':scope > .astryx-overlay-scrim');
    const scrimStyle = scrim ? getComputedStyle(scrim) : null;
    return {
      tag: active?.tagName.toLowerCase() ?? null,
      label: active?.textContent?.trim().slice(0, 40) ?? null,
      inOverlay: root != null,
      focusVisible: active?.matches(':focus-visible') ?? false,
      scrimOpacity: scrimStyle?.opacity ?? null,
      scrimVisibility: scrimStyle?.visibility ?? null,
      scrimTransform: scrimStyle?.transform ?? null,
    };
  });
}

/** Axe on the story root, WCAG 2.2 A and AA rules. */
async function axe(page: Page) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.flatMap(violation =>
    violation.nodes.map(node => `${violation.id}: ${node.target.join(' ')}`),
  );
}

/** Moves the mouse to the centre of the first match, with no actionability wait. */
async function pointAt(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (box == null) {
    throw new Error(`no box for ${selector}`);
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function noSidewaysScroll(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

const shown = (o: {opacity: string | null; visibility: string | null}) =>
  o.opacity === '1' && o.visibility === 'visible';

const cases: AuditCase[] = [];

function addCase(item: Omit<AuditCase, 'theme'> & {theme?: string}) {
  cases.push({theme: 'neutral', ...item});
}

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    const suffix = `${mode}-${direction}`;

    addCase({
      key: `rest-hover-${suffix}`,
      group: 'rest',
      story: 'core-overlay--hover-on-image',
      ready: '#storybook-root .astryx-overlay img',
      mode,
      direction,
      viewport: DESKTOP,
      pointer: 'fine',
      reducedMotion: 'reduce',
      run: async (page, check, frame) => {
        const [o] = await overlays(page);
        check(o != null, 'no overlay');
        check(o.position === 'fill', `position ${o.position}`);
        check(o.opacity === '0', `rest opacity ${o.opacity}`);
        check(
          o.pointerEvents === 'none',
          `rest pointer-events ${o.pointerEvents}`,
        );
        check(o.action?.hitIsAction === false, 'a hidden action takes a click');
        check(o.inert === false, 'a CSS-driven scrim is inert');
        check(o.rootOverflow === 'clip', `root overflow ${o.rootOverflow}`);
        const violations = await axe(page);
        check(violations.length === 0, `axe: ${violations.join(' | ')}`);
        await frame('rest', {overlay: o, violations});

        await pointAt(page, '#storybook-root img');
        await settle(page);
        const [hovered] = await overlays(page);
        check(shown(hovered), `hover ${hovered.opacity} ${hovered.visibility}`);
        check(
          hovered.action?.hitIsAction === true,
          'hover: the action is not hit',
        );
        await frame('hover', {overlay: hovered});
      },
    });

    addCase({
      key: `keyboard-hover-${suffix}`,
      group: 'keyboard',
      story: 'core-overlay--hover-on-image',
      ready: '#storybook-root .astryx-overlay img',
      mode,
      direction,
      viewport: DESKTOP,
      pointer: 'fine',
      reducedMotion: 'reduce',
      run: async (page, check, frame) => {
        await page.mouse.move(1, 1);
        await page.keyboard.press('Tab');
        await settle(page);
        const focus = await activeElement(page);
        check(
          focus.inOverlay && focus.label === 'Quick view',
          `Tab lands on ${focus.tag} "${focus.label}", not the overlay action`,
        );
        check(focus.focusVisible, 'the focused action is not :focus-visible');
        check(
          focus.scrimOpacity === '1' && focus.scrimVisibility === 'visible',
          `focus leaves the scrim at ${focus.scrimOpacity} ${focus.scrimVisibility}`,
        );
        await frame('focus-visible', {focus});
      },
    });

    addCase({
      key: `bottom-strip-${suffix}`,
      group: 'rest',
      story: 'core-overlay--bottom-strip',
      ready: '#storybook-root .astryx-overlay img',
      mode,
      direction,
      viewport: DESKTOP,
      pointer: 'fine',
      reducedMotion: 'reduce',
      run: async (page, check, frame) => {
        const [o] = await overlays(page);
        check(o.position === 'bottom', `position ${o.position}`);
        check(shown(o), `always strip ${o.opacity} ${o.visibility}`);
        check(o.scrimInsideRoot, 'the strip leaves the media box');
        const text = await page.evaluate(() => {
          const heading = document.querySelector(
            '#storybook-root .astryx-overlay-scrim h3',
          ) as HTMLElement;
          const scrim = heading.closest('.astryx-overlay-scrim') as HTMLElement;
          const h = heading.getBoundingClientRect();
          const s = scrim.getBoundingClientRect();
          return {
            color: getComputedStyle(heading).color,
            fromStart:
              getComputedStyle(scrim).direction === 'rtl'
                ? Math.round(s.right - h.right)
                : Math.round(h.left - s.left),
          };
        });
        check(
          text.fromStart >= 0 && text.fromStart < 40,
          `start inset ${text.fromStart}`,
        );
        const violations = await axe(page);
        check(violations.length === 0, `axe: ${violations.join(' | ')}`);
        await frame('rest', {overlay: o, text, violations});
      },
    });
  }

  addCase({
    key: `reveal-modes-${mode}`,
    group: 'keyboard',
    story: 'core-overlay--reveal-modes',
    ready: '#storybook-root .astryx-overlay img',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const rest = await overlays(page);
      check(rest.length === 6, `${rest.length} overlays`);
      for (const o of rest.slice(0, 3)) {
        check(o.opacity === '0', `${o.name} rest opacity ${o.opacity}`);
        check(
          o.action?.hitIsAction === false,
          `${o.name}: hidden action takes a click`,
        );
      }
      check(
        shown(rest[3]),
        `always ${rest[3]?.opacity} ${rest[3]?.visibility}`,
      );
      check(
        rest[4]?.opacity === '0',
        `focus link rest opacity ${rest[4]?.opacity}`,
      );
      check(
        rest[4]?.action?.hitIsAction === false,
        'the hidden focus link takes a click',
      );
      check(
        rest[5]?.opacity === '0',
        `hover link rest opacity ${rest[5]?.opacity}`,
      );
      check(
        rest[5]?.action?.hitIsAction === false,
        'the hidden hover link takes a click',
      );
      const violations = await axe(page);
      check(violations.length === 0, `axe: ${violations.join(' | ')}`);
      await frame('rest', {overlays: rest, violations});

      await page.mouse.move(1, 1);
      const expected = [
        'Hover action',
        'Focus action',
        'Hover strip action',
        'Always action',
        'Focus link action',
        'Hover link action',
      ];
      for (const label of expected) {
        await page.keyboard.press('Tab');
        await settle(page);
        const focus = await activeElement(page);
        check(
          focus.label === label,
          `Tab lands on "${focus.label}", expected "${label}"`,
        );
        check(
          focus.scrimOpacity === '1' && focus.scrimVisibility === 'visible',
          `${label}: scrim ${focus.scrimOpacity} ${focus.scrimVisibility}`,
        );
        if (label === 'Hover strip action') {
          check(
            focus.scrimTransform === 'none' ||
              focus.scrimTransform === 'matrix(1, 0, 0, 1, 0, 0)',
            `strip still offset at ${focus.scrimTransform}`,
          );
        }
        await frame(`focus-${label.toLowerCase().replace(/\s+/g, '-')}`, {
          focus,
        });
      }
    },
  });

  addCase({
    key: `controlled-light-scrim-${mode}`,
    group: 'controlled',
    story: 'core-overlay--loading-overlay',
    ready: '#storybook-root .astryx-overlay img',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const [closed] = await overlays(page);
      check(closed.inert === true, 'a closed controlled scrim is not inert');
      check(
        closed.visibility === 'hidden',
        `closed visibility ${closed.visibility}`,
      );
      await frame('closed', {overlay: closed});
      await page.getByRole('button', {name: 'Simulate upload'}).click();
      await settle(page);
      const [open] = await overlays(page);
      check(open.inert === false, 'an open controlled scrim is inert');
      check(shown(open), `open ${open.opacity} ${open.visibility}`);
      check(
        /rgba\(255, 255, 255, 0\.6\)|color\(srgb 1 1 1 \/ 0\.6\)/.test(
          open.background ?? '',
        ),
        `light scrim paints ${open.background}`,
      );
      const busyText = await page.evaluate(() => {
        const text = Array.from(
          document.querySelectorAll('#storybook-root .astryx-overlay-scrim *'),
        ).find(el => el.textContent === 'Uploading...') as HTMLElement;
        return getComputedStyle(text).color;
      });
      const violations = await axe(page);
      check(violations.length === 0, `axe: ${violations.join(' | ')}`);
      await frame('open', {overlay: open, busyText, violations});
    },
  });

  addCase({
    key: `card-and-no-scrim-${mode}`,
    group: 'rest',
    story: 'core-overlay--card-overlay',
    ready: '#storybook-root .astryx-overlay h3',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const [o] = await overlays(page);
      check(
        o.rootRadius !== '0px',
        `the root took no card radius (${o.rootRadius})`,
      );
      await pointAt(page, '#storybook-root h3');
      await settle(page);
      const [hovered] = await overlays(page);
      check(
        shown(hovered),
        `card hover ${hovered.opacity} ${hovered.visibility}`,
      );
      await frame('hover', {overlay: hovered});
    },
  });
}

addCase({
  key: 'custom-theme-strip-light',
  group: 'rest',
  story: 'core-overlay--bottom-strip',
  ready: '#storybook-root .astryx-overlay img',
  mode: 'light',
  theme: 'matcha',
  direction: 'ltr',
  viewport: DESKTOP,
  pointer: 'fine',
  reducedMotion: 'reduce',
  run: async (page, check, frame) => {
    const [o] = await overlays(page);
    check(shown(o), `strip ${o.opacity} ${o.visibility}`);
    await frame('rest', {overlay: o});
  },
});

addCase({
  key: 'touch-tap-toggle',
  group: 'touch',
  story: 'core-overlay--hover-on-image',
  ready: '#storybook-root .astryx-overlay img',
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  pointer: 'coarse',
  reducedMotion: 'reduce',
  run: async (page, check, frame) => {
    const [rest] = await overlays(page);
    check(rest.inert === true, 'touch rest scrim is not inert');
    check(rest.opacity === '0', `touch rest opacity ${rest.opacity}`);
    await frame('rest', {overlay: rest});
    const box = await page.locator('#storybook-root img').boundingBox();
    if (box == null) {
      throw new Error('no media box');
    }
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await settle(page, false);
    const [open] = await overlays(page);
    check(
      open.inert === false && shown(open),
      `tap: ${open.opacity} inert=${open.inert}`,
    );
    check(open.action?.hitIsAction === true, 'tap: the action is not hit');
    check(
      (open.action?.width ?? 0) >= 24 && (open.action?.height ?? 0) >= 24,
      `action ${open.action?.width}x${open.action?.height}`,
    );
    await frame('open', {overlay: open});
    await page.touchscreen.tap(box.x + 10, box.y + 10);
    await settle(page, false);
    const [closed] = await overlays(page);
    check(closed.inert === true, 'a second tap does not close it');
    await frame('closed', {overlay: closed});
  },
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  addCase({
    key: `motion-${reducedMotion}`,
    group: 'motion',
    story: 'core-overlay--gallery-grid',
    ready: '#storybook-root .astryx-overlay img',
    mode: 'light',
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion,
    run: async (page, check, frame) => {
      const [o] = await overlays(page);
      check(o.position === 'bottom', `position ${o.position}`);
      const duration = /\s([\d.]+)s/.exec(o.transition ?? '')?.[1];
      const delays = (o.transitionDelay ?? '').split(',').map(d => d.trim());
      if (reducedMotion === 'reduce') {
        check(duration === '0', `reduced-motion transition ${o.transition}`);
        check(
          delays.every(d => d === '0s'),
          `reduced-motion delays ${o.transitionDelay}`,
        );
      } else {
        check(Number(duration) > 0, `no-preference transition ${o.transition}`);
        check(
          delays.length === 4 && delays[3] === `${duration}s`,
          `the clip path does not wait for the fade: ${o.transitionDelay}`,
        );
      }
      await frame('rest', {overlay: o});
    },
  });
}

/**
 * Samples each animation frame after the pointer enters the media: the
 * scrim's opacity and whether the action takes a click at its centre.
 */
async function hoverFrames(page: Page) {
  await page.mouse.move(1, 1);
  await page.waitForTimeout(400);
  const box = await page.locator('#storybook-root img').first().boundingBox();
  if (box == null) {
    throw new Error('no media box');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  return page.evaluate(
    async () =>
      new Promise<
        {t: number; opacity: number; painted: boolean; hit: boolean}[]
      >(resolve => {
        const samples: {
          t: number;
          opacity: number;
          painted: boolean;
          hit: boolean;
        }[] = [];
        const start = performance.now();
        const scrim = document.querySelector(
          '#storybook-root .astryx-overlay-scrim',
        ) as HTMLElement;
        const action = scrim.querySelector('button') as HTMLElement;
        const tick = () => {
          const r = action.getBoundingClientRect();
          const hitEl = document.elementFromPoint(
            r.left + r.width / 2,
            r.top + r.height / 2,
          );
          samples.push({
            t: Math.round(performance.now() - start),
            opacity: Number(getComputedStyle(scrim).opacity),
            painted: getComputedStyle(scrim).clipPath === 'none',
            hit: hitEl != null && action.contains(hitEl),
          });
          if (performance.now() - start < 500) {
            requestAnimationFrame(tick);
          } else {
            resolve(samples);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  addCase({
    key: `hover-frames-${reducedMotion}`,
    group: 'motion',
    story: 'core-overlay--hover-on-image',
    ready: '#storybook-root .astryx-overlay img',
    mode: 'light',
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion,
    run: async (page, check, frame) => {
      const samples = await hoverFrames(page);
      const early = samples.filter(x => x.hit && x.opacity < 0.05);
      check(
        early.length === 0,
        `the action takes a click while transparent: ${JSON.stringify(early)}`,
      );
      const firstPaint = samples.find(x => x.painted);
      check(
        firstPaint != null && firstPaint.t <= 40,
        `the overlay does not paint from its first faded-in frame: ${JSON.stringify(firstPaint)}`,
      );
      const last = samples.at(-1);
      check(
        last != null && last.hit && last.opacity === 1,
        `after the fade the action is not shown and hit: ${JSON.stringify(last)}`,
      );
      if (reducedMotion === 'reduce') {
        const first = samples[0];
        check(
          first != null && first.hit && first.opacity === 1,
          `under reduced motion the first frame is ${JSON.stringify(first)}`,
        );
      }
      await frame('settled', {samples});
    },
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  addCase({
    key: `narrow-${direction}`,
    group: 'narrow',
    story: 'core-overlay--gallery-grid',
    ready: '#storybook-root .astryx-overlay img',
    mode: 'light',
    direction,
    viewport: NARROW,
    pointer: 'fine',
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const scroll = await noSidewaysScroll(page);
      check(
        scroll.scrollWidth <= scroll.clientWidth,
        `page scrolls sideways: ${scroll.scrollWidth} > ${scroll.clientWidth}`,
      );
      await frame('rest', {scroll});
    },
  });
}

test.beforeAll(async () => {
  fs.mkdirSync(OUTPUT, {recursive: true});
  checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const expected = process.env.ASTRYX_HEAD_SHA;
  if (expected && expected !== checkoutSha) {
    throw new Error(
      `checkout ${checkoutSha} does not match expected head ${expected}`,
    );
  }
  server = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  const response = await fetch(`${server.origin}/astryx-build-sha.txt`);
  if (!response.ok) {
    throw new Error(`Storybook build has no SHA stamp (${response.status})`);
  }
  storybookSha = (await response.text()).trim();
  if (storybookSha !== checkoutSha) {
    throw new Error(
      `Storybook ${storybookSha} does not match checkout ${checkoutSha}`,
    );
  }
});

test.afterAll(async () => {
  await server?.close();
});

function isStill(item: AuditCase) {
  return item.group !== 'motion' && item.group !== 'touch';
}

async function runCase(page: Page, item: AuditCase) {
  await page.setViewportSize(item.viewport);
  await page.emulateMedia({
    colorScheme: item.mode,
    reducedMotion: item.reducedMotion,
  });
  if (item.pointer === 'coarse') {
    // Playwright has no hover or pointer media option; Chromium takes them over CDP.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [
        {name: 'hover', value: 'none'},
        {name: 'any-hover', value: 'none'},
        {name: 'pointer', value: 'coarse'},
        {name: 'any-pointer', value: 'coarse'},
        {
          name: 'prefers-reduced-motion',
          value: item.reducedMotion === 'reduce' ? 'reduce' : '',
        },
        {name: 'prefers-color-scheme', value: item.mode},
      ],
    });
  }
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
  await page.goto(url, {waitUntil: 'load'});

  const failures: string[] = [];
  const check: Check = (condition, message) => {
    if (!condition) {
      failures.push(message);
    }
  };
  const frames: {
    state: string;
    observed: unknown;
    file: string;
    sha256: string;
  }[] = [];
  const frame: FrameSink = async (state, observed) => {
    const screenshot = await page.screenshot({animations: 'disabled'});
    const file = `${item.key}__${state}.png`;
    fs.writeFileSync(path.join(OUTPUT, file), screenshot);
    frames.push({
      state,
      observed,
      file,
      sha256: createHash('sha256').update(screenshot).digest('hex'),
    });
  };

  let sensors: Awaited<ReturnType<typeof pageSensors>> | null = null;
  try {
    await page.locator(item.ready).first().waitFor({timeout: 10_000});
    // A pointer left over the last case's story would hover this one.
    await page.mouse.move(0, 0);
    await settle(page, isStill(item));
    sensors = await pageSensors(page);
    check(!sensors.storybookError, 'storybook error display');
    check(sensors.mode === item.mode, `mode ${sensors.mode}`);
    check(sensors.theme === item.theme, `theme ${sensors.theme}`);
    check(
      sensors.direction === item.direction,
      `direction ${sensors.direction}`,
    );
    check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
    check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
    check(
      sensors.reducedMotion === (item.reducedMotion === 'reduce'),
      `reduced motion ${sensors.reducedMotion}`,
    );
    check(
      sensors.coarse === (item.pointer === 'coarse') &&
        sensors.hoverNone === (item.pointer === 'coarse'),
      `pointer coarse=${sensors.coarse} hover-none=${sensors.hoverNone}`,
    );
    await item.run(page, check, frame);
  } catch (error) {
    check(false, `case did not run: ${String(error).split('\n')[0]}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);

  const receipt = {
    component: 'Overlay',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    mode: item.mode,
    theme: item.theme,
    direction: item.direction,
    viewport: item.viewport,
    pointer: item.pointer,
    reducedMotion: item.reducedMotion,
    sensors,
    pageErrors,
    frames,
    passed: failures.length === 0,
    failures,
  };
  fs.writeFileSync(
    path.join(OUTPUT, `${item.key}.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return failures.map(failure => `${item.key}: ${failure}`);
}

for (const group of [...new Set(cases.map(item => item.group))]) {
  test(group, async ({browser}) => {
    const context = await browser.newContext({
      deviceScaleFactor: 2,
      hasTouch: group === 'touch',
    });
    try {
      const page = await context.newPage();
      const failures: string[] = [];
      for (const item of cases.filter(c => c.group === group)) {
        failures.push(...(await runCase(page, item)));
      }
      expect(failures).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
