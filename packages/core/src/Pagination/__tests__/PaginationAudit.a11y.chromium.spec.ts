// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Pagination

/**
 * @file PaginationAudit.a11y.chromium.spec.ts
 * @input Exact-head Pagination stories, across modes, themes, direction, pointer and motion settings
 * @output Screenshots and fail-closed sensor receipts for the Pagination whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a Pagination audit pull request
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

const OUTPUT = path.resolve('pagination-audit-evidence');

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

/** Axe on the story root, WCAG 2.2 A and AA rules. */
async function axe(page: Page) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.flatMap(violation =>
    violation.nodes.map(
      node => `${violation.id}: ${node.target.join(' ')} ${node.html}`,
    ),
  );
}

async function noSidewaysScroll(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

/** The landmark, its controls in DOM order, and its current-page state. */
async function pager(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>(
      '#storybook-root nav.astryx-pagination',
    );
    if (nav == null) {
      return null;
    }
    const named = (label: string) =>
      nav.querySelector<HTMLElement>(`[aria-label="${label}"]`);
    const box = (el: HTMLElement | null) => {
      if (el == null) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return {left: Math.round(r.left), right: Math.round(r.right)};
    };
    const previous = named('Go to previous page');
    const next = named('Go to next page');
    const current = nav.querySelector('[aria-current="page"]');
    const ellipses = Array.from(nav.querySelectorAll('span, div')).filter(
      el => el.textContent?.trim() === '…' && el.children.length === 0,
    );
    return {
      name: nav.getAttribute('aria-label'),
      variant: nav.getAttribute('data-variant'),
      previous: previous
        ? {
            box: box(previous),
            disabled: previous.getAttribute('aria-disabled'),
            native: (previous as HTMLButtonElement).disabled === true,
          }
        : null,
      next: next
        ? {
            box: box(next),
            disabled: next.getAttribute('aria-disabled'),
            native: (next as HTMLButtonElement).disabled === true,
          }
        : null,
      current: current?.textContent?.trim() ?? null,
      ellipsisHidden: ellipses.map(
        el => el.closest('[aria-hidden="true"]') != null,
      ),
      scrollWidth: nav.scrollWidth,
      clientWidth: nav.clientWidth,
    };
  });
}

async function politeText(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[aria-live="polite"]'))
      .map(el => el.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' | '),
  );
}

async function dots(page: Page) {
  return page.evaluate(() => {
    const group = document.querySelector<HTMLElement>(
      '#storybook-root [role="radiogroup"]',
    );
    const items = Array.from(
      group?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
    );
    const active = document.activeElement as HTMLElement | null;
    return {
      name: group?.getAttribute('aria-label') ?? null,
      count: items.length,
      checked:
        items.findIndex(el => el.getAttribute('aria-checked') === 'true') + 1,
      tabStops: items.filter(el => el.tabIndex === 0).length,
      focused: items.indexOf(active as HTMLElement) + 1,
      transition: items[0]
        ? `${getComputedStyle(items[0]).transitionProperty} ${getComputedStyle(items[0]).transitionDuration}`
        : null,
      size: items[0]
        ? Math.round(items[0].getBoundingClientRect().width * 10) / 10
        : null,
    };
  });
}

/**
 * Which dot, if any, takes a point offset from the centre of dot `index`.
 * Returns the page number of the dot hit, or null.
 */
async function dotAt(page: Page, index: number, dx: number, dy: number) {
  return page.evaluate(
    ({index, dx, dy}) => {
      const items = Array.from(
        document.querySelectorAll<HTMLElement>(
          '#storybook-root [role="radio"]',
        ),
      );
      const r = items[index].getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + r.width / 2 + dx,
        r.top + r.height / 2 + dy,
      );
      const dot = hit?.closest('[role="radio"]') as HTMLElement | null;
      return dot ? Number(dot.getAttribute('data-page')) : null;
    },
    {index, dx, dy},
  );
}

const cases: AuditCase[] = [];

function addCase(item: Omit<AuditCase, 'theme'> & {theme?: string}) {
  cases.push({theme: 'neutral', ...item});
}

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    const suffix = `${mode}-${direction}`;

    addCase({
      key: `pages-${suffix}`,
      group: 'pages',
      story: 'core-pagination--many-pages',
      ready: '#storybook-root nav.astryx-pagination',
      mode,
      direction,
      viewport: DESKTOP,
      pointer: 'fine',
      reducedMotion: 'reduce',
      run: async (page, check, frame) => {
        const p = await pager(page);
        check(p != null, 'no landmark');
        if (p == null) {
          return;
        }
        check(p.name === 'Pagination', `landmark name ${p.name}`);
        check(p.current === '5', `current page ${p.current}`);
        check(
          p.ellipsisHidden.length > 0 && p.ellipsisHidden.every(Boolean),
          `ellipses hidden from AT: ${JSON.stringify(p.ellipsisHidden)}`,
        );
        const prevFirst =
          direction === 'ltr'
            ? (p.previous?.box?.left ?? 0) < (p.next?.box?.left ?? 0)
            : (p.previous?.box?.left ?? 0) > (p.next?.box?.left ?? 0);
        check(
          prevFirst,
          `Previous is not first in reading order (${direction})`,
        );
        const violations = await axe(page);
        check(violations.length === 0, `axe: ${violations.join(' | ')}`);
        await frame('rest', {pager: p, violations});

        await page.mouse.move(1, 1);
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await settle(page);
        const focused = await page.evaluate(() => ({
          label: document.activeElement?.getAttribute('aria-label') ?? null,
          focusVisible:
            document.activeElement?.matches(':focus-visible') ?? false,
        }));
        check(
          focused.focusVisible,
          'the second Tab stop is not :focus-visible',
        );
        await frame('focus-visible', {focused});

        await page.getByRole('button', {name: 'Go to page 6'}).click();
        await settle(page);
        const after = await pager(page);
        const announced = await politeText(page);
        check(after?.current === '6', `after click current ${after?.current}`);
        check(
          announced.includes('Page 6 of 50'),
          `announcement "${announced}"`,
        );
        await frame('page-6', {pager: after, announced});
      },
    });

    addCase({
      key: `dots-${suffix}`,
      group: 'dots',
      story: 'core-pagination--dots-variant',
      ready: '#storybook-root [role="radiogroup"]',
      mode,
      direction,
      viewport: DESKTOP,
      pointer: 'fine',
      reducedMotion: 'reduce',
      run: async (page, check, frame) => {
        const rest = await dots(page);
        check(rest.count === 8, `${rest.count} dots`);
        check(rest.checked === 1, `checked dot ${rest.checked}`);
        check(rest.tabStops === 1, `${rest.tabStops} tab stops`);
        // 8 px dots 4 px apart fail axe's target-size spacing check. Previous
        // and Next reach every page with full-size targets, so the WCAG 2.5.8
        // equivalent exception applies; the audit records it, not fails it.
        const allViolations = await axe(page);
        const isDotTargetSize = (v: string) =>
          v.startsWith('target-size:') && v.includes('role="radio"');
        const targetSize = allViolations.filter(isDotTargetSize);
        const violations = allViolations.filter(v => !isDotTargetSize(v));
        check(violations.length === 0, `axe: ${violations.join(' | ')}`);
        await frame('rest', {dots: rest, violations, targetSize});

        await page.mouse.move(1, 1);
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press(
          direction === 'ltr' ? 'ArrowRight' : 'ArrowLeft',
        );
        await settle(page);
        const moved = await dots(page);
        check(
          moved.checked === 2 && moved.focused === 2,
          `the forward arrow in ${direction} checks ${moved.checked}, focuses ${moved.focused}`,
        );
        await page.keyboard.press('End');
        await settle(page);
        const end = await dots(page);
        check(end.checked === 8, `End checks ${end.checked}`);
        await frame('keyboard', {moved, end});
      },
    });
  }

  addCase({
    key: `input-${mode}`,
    group: 'input',
    story: 'core-pagination--input-variant',
    ready: '#storybook-root nav.astryx-pagination input',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const violations = await axe(page);
      check(violations.length === 0, `axe: ${violations.join(' | ')}`);
      await frame('rest', {violations});
      const input = page.locator('#storybook-root nav.astryx-pagination input');
      await input.fill('4');
      await input.press('Enter');
      await settle(page);
      const announced = await politeText(page);
      check(announced.includes('Page 4 of'), `announcement "${announced}"`);
      await frame('page-4', {announced});
    },
  });

  addCase({
    key: `page-size-${mode}`,
    group: 'input',
    story: 'core-pagination--with-page-size-selector',
    ready: '#storybook-root nav.astryx-pagination',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const p = await pager(page);
      check(p?.variant === 'count', `variant ${p?.variant}`);
      const violations = await axe(page);
      check(violations.length === 0, `axe: ${violations.join(' | ')}`);
      await frame('rest', {pager: p, violations});
    },
  });

  addCase({
    key: `disabled-${mode}`,
    group: 'input',
    story: 'core-pagination--disabled',
    ready: '#storybook-root nav.astryx-pagination',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const p = await pager(page);
      check(
        p?.previous?.disabled === 'true' && p.previous.native === false,
        `Previous ${JSON.stringify(p?.previous)}`,
      );
      check(
        p?.next?.disabled === 'true' && p.next.native === false,
        `Next ${JSON.stringify(p?.next)}`,
      );
      await page.mouse.move(1, 1);
      await page.keyboard.press('Tab');
      await settle(page);
      const focusedInNav = await page.evaluate(
        () => document.activeElement?.closest('nav.astryx-pagination') != null,
      );
      check(focusedInNav, 'a disabled control does not take focus');
      const violations = await axe(page);
      check(violations.length === 0, `axe: ${violations.join(' | ')}`);
      await frame('focus', {pager: p, violations});
    },
  });
}

addCase({
  key: 'dots-custom-theme',
  group: 'dots',
  story: 'core-pagination--dots-variant',
  ready: '#storybook-root [role="radiogroup"]',
  mode: 'light',
  theme: 'matcha',
  direction: 'ltr',
  viewport: DESKTOP,
  pointer: 'fine',
  reducedMotion: 'reduce',
  run: async (page, check, frame) => {
    const rest = await dots(page);
    check(rest.count === 8, `${rest.count} dots`);
    check(rest.checked === 1, `checked dot ${rest.checked}`);
    check(rest.tabStops === 1, `${rest.tabStops} tab stops`);
    await frame('rest', {dots: rest});
  },
});

addCase({
  key: 'dots-coarse-hit-area',
  group: 'touch',
  story: 'core-pagination--dots-variant',
  ready: '#storybook-root [role="radiogroup"]',
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  pointer: 'coarse',
  reducedMotion: 'reduce',
  run: async (page, check, frame) => {
    // The shared hit area measures after layout settles; wait for its inset.
    await page.waitForFunction(
      () => {
        const dot = document.querySelectorAll<HTMLElement>(
          '#storybook-root [role="radio"]',
        )[2];
        return (
          dot != null &&
          parseFloat(
            getComputedStyle(dot).getPropertyValue('--astryx-hit-inset-top'),
          ) > 0
        );
      },
      undefined,
      {timeout: 5000},
    );
    const rest = await dots(page);
    const above = await dotAt(page, 2, 0, -12);
    const below = await dotAt(page, 2, 0, 12);
    const ownBox = await dotAt(page, 2, 0, 0);
    const gapEnd = await dotAt(page, 2, (rest.size ?? 8) / 2 + 1, 0);
    check(ownBox === 3, `the dot's own box hits ${ownBox}`);
    check(above === 3, `12 px above dot 3 hits ${above}, not dot 3`);
    check(below === 3, `12 px below dot 3 hits ${below}, not dot 3`);
    check(gapEnd === 3, `1 px past dot 3's inline end hits ${gapEnd}`);
    await frame('rest', {dots: rest, above, below, ownBox, gapEnd});
  },
});

addCase({
  key: 'dots-fine-no-hit-area',
  group: 'dots',
  story: 'core-pagination--dots-variant',
  ready: '#storybook-root [role="radiogroup"]',
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  pointer: 'fine',
  reducedMotion: 'reduce',
  run: async (page, check, frame) => {
    const above = await dotAt(page, 2, 0, -12);
    check(
      above === null,
      `under a fine pointer 12 px above dot 3 hits ${above}`,
    );
    await frame('rest', {above});
  },
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  addCase({
    key: `dots-motion-${reducedMotion}`,
    group: 'motion',
    story: 'core-pagination--dots-variant',
    ready: '#storybook-root [role="radiogroup"]',
    mode: 'light',
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion,
    run: async (page, check, frame) => {
      const rest = await dots(page);
      const duration = /\s([\d.]+)s$/.exec(rest.transition ?? '')?.[1];
      if (reducedMotion === 'reduce') {
        check(
          duration === '0',
          `reduced-motion dot transition ${rest.transition}`,
        );
      } else {
        check(
          Number(duration) > 0,
          `no-preference dot transition ${rest.transition}`,
        );
      }
      await frame('rest', {dots: rest});
    },
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  addCase({
    key: `narrow-${direction}`,
    group: 'narrow',
    story: 'core-pagination--many-pages',
    ready: '#storybook-root nav.astryx-pagination',
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
    component: 'Pagination',
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
