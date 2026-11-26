// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit ScrollableArea

/**
 * @file ScrollableAreaAudit.a11y.chromium.spec.ts
 * @input Exact-head ScrollableArea stories: conditional keyboard access
 *   fitting and overflowing, native scrollbar presentation, nested overscroll,
 *   a narrow container at phone width, and container integration with full
 *   bleed, in light and dark, both directions and forced colors
 * @output Screenshots and fail-closed sensor receipts for the ScrollableArea
 *   whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for
 *   a ScrollableArea audit pull request
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
import {resetAuditEvidence} from '@astryxdesign/a11y-spec/evidence';

const EVIDENCE = path.resolve('test-results/scrollable-area-audit-evidence');
const CONDITIONAL_STORY = 'core-scrollablearea--conditional-keyboard-access';
const SCROLLBAR_STORY = 'core-scrollablearea--native-scrollbar-presentation';
const OVERSCROLL_STORY = 'core-scrollablearea--overscroll';
const NARROW_STORY = 'core-scrollablearea--narrow-container';
const CONTAINER_STORY = 'core-scrollablearea--container-integration';
const CONDITIONAL = '[data-evidence="conditional-tabindex"]';

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  story: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  motion?: 'reduce' | 'no-preference';
  forcedColors?: boolean;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 700};
const PHONE = {width: 390, height: 700};

test.describe.configure({retries: 0});

let OUTPUT = EVIDENCE;
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;
let holdsMotion = true;

/** The part of Storybook's preview this spec reads: the story render's phase. */
interface StorybookPreviewWindow extends Window {
  __STORYBOOK_PREVIEW__?: {currentRender?: {phase?: string}};
}

async function settle(page: Page) {
  if (holdsMotion) {
    await holdMotionStill(page);
  }
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function pageSensors(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('#storybook-root [data-evidence]');
    return {
      mode: document.documentElement.getAttribute('data-theme'),
      direction: root == null ? null : getComputedStyle(root).direction,
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      fonts: document.fonts.status,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      storybookError: document.body.classList.contains('sb-show-errordisplay'),
    };
  });
}

async function checkAxe(page: Page, check: Check) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = results.violations.flatMap(violation =>
    violation.nodes.map(
      node =>
        `${violation.id} ${node.target.join(' ')}: ${node.failureSummary}`,
    ),
  );
  check(violations.length === 0, `axe: ${violations.join(' | ')}`);
  check(results.passes.length > 0, 'axe checked nothing');
  return {violations, passes: results.passes.length};
}

/** One viewport's keyboard, overflow and presentation state. */
async function readViewport(page: Page, selector: string) {
  return page.locator(selector).evaluate(element => {
    const style = getComputedStyle(element);
    return {
      role: element.getAttribute('role'),
      name: element.getAttribute('aria-label'),
      tabIndex: element.getAttribute('tabindex'),
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      overscrollX: style.overscrollBehaviorX,
      overscrollY: style.overscrollBehaviorY,
      scrollbarColor: style.scrollbarColor,
      outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
      focused: document.activeElement === element,
      box: (() => {
        const rect = element.getBoundingClientRect();
        return {left: rect.left, right: rect.right, width: rect.width};
      })(),
    };
  });
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `conditional__${mode}__${direction}`,
      group: 'conditional keyboard access',
      story: CONDITIONAL_STORY,
      mode,
      direction,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const fitting = await readViewport(page, CONDITIONAL);
        check(fitting.tabIndex == null, `fitting tabindex ${fitting.tabIndex}`);
        check(
          fitting.overflowX === 'clip' && fitting.overflowY === 'clip',
          `fitting overflow ${fitting.overflowX} ${fitting.overflowY}`,
        );
        const fittingAxe = await checkAxe(page, check);
        await frame('fitting', {fitting, axe: fittingAxe});

        await page.getByRole('button', {name: 'Make content overflow'}).click();
        await expect(page.locator(CONDITIONAL)).toHaveAttribute(
          'tabindex',
          '0',
        );
        await page.getByRole('button', {name: 'Make content fit'}).focus();
        await page.keyboard.press('Tab');
        await settle(page);
        const focused = await readViewport(page, CONDITIONAL);
        check(focused.focused, 'Tab did not reach the overflowing viewport');
        check(
          focused.role === 'region' &&
            focused.name === 'Conditional activity list',
          `viewport ${focused.role} ${focused.name}`,
        );
        check(
          focused.overflowY === 'auto',
          `overflowing block overflow ${focused.overflowY}`,
        );
        check(
          focused.outlineStyle !== 'none' && focused.outlineWidth >= 2,
          `focus ring ${focused.outline}`,
        );
        const focusedAxe = await checkAxe(page, check);
        await frame('overflowing-focused', {focused, axe: focusedAxe});
      },
    });
  }
}

cases.push({
  key: 'conditional__light__ltr__motion',
  group: 'motion on',
  story: CONDITIONAL_STORY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  motion: 'no-preference',
  run: async (page, check, frame) => {
    await page.getByRole('button', {name: 'Make content overflow'}).click();
    await expect(page.locator(CONDITIONAL)).toHaveAttribute('tabindex', '0');
    await page.getByRole('button', {name: 'Make content fit'}).focus();
    await page.keyboard.press('Tab');
    await settle(page);
    const overflowing = await readViewport(page, CONDITIONAL);
    check(overflowing.focused, 'Tab did not reach the overflowing viewport');
    await frame('overflowing-focused', {overflowing});
  },
});

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `scrollbar__${mode}__ltr`,
    group: 'native scrollbar',
    story: SCROLLBAR_STORY,
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const viewport = await readViewport(
        page,
        '[data-evidence="scrollbar-default"]',
      );
      // The neutral token as this viewport resolves it.
      const neutral = await page
        .locator('[data-evidence="scrollbar-default"]')
        .evaluate(element => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--color-neutral)';
          element.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        });
      const [thumb, track] =
        viewport.scrollbarColor.match(/rgba?\([^)]*\)/g) ?? [];
      check(
        thumb === neutral && track === 'rgba(0, 0, 0, 0)',
        `scrollbar-color ${viewport.scrollbarColor}; neutral ${neutral}`,
      );
      const axe = await checkAxe(page, check);
      await frame('rest', {viewport, neutral, axe});
    },
  });
}

cases.push({
  key: 'scrollbar__light__ltr__forced-colors',
  group: 'forced colors',
  story: SCROLLBAR_STORY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  forcedColors: true,
  run: async (page, check, frame) => {
    const viewport = await readViewport(
      page,
      '[data-evidence="scrollbar-default"]',
    );
    check(
      viewport.scrollbarColor === 'auto',
      `forced-colors scrollbar-color ${viewport.scrollbarColor}`,
    );
    await frame('rest', {viewport});
  },
});

cases.push({
  key: 'overscroll__light__ltr',
  group: 'overscroll',
  story: OVERSCROLL_STORY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    const read = async (evidence: string) =>
      readViewport(page, `[data-evidence="${evidence}"]`);
    const containOverflowing = await read('contain-overflowing-nested');
    const containFitting = await read('contain-fitting-nested');
    const allowOverflowing = await read('allow-overflowing-nested');
    // Containment applies only to an axis that scrolls.
    check(
      containOverflowing.overscrollY === 'contain',
      `contain overflowing ${containOverflowing.overscrollY}`,
    );
    check(
      containFitting.overscrollY !== 'contain',
      `contain fitting ${containFitting.overscrollY}`,
    );
    check(
      allowOverflowing.overscrollY !== 'contain',
      `allow overflowing ${allowOverflowing.overscrollY}`,
    );
    const axe = await checkAxe(page, check);
    await frame('rest', {
      containOverflowing,
      containFitting,
      allowOverflowing,
      axe,
    });
  },
});

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `narrow__light__${direction}`,
    group: 'phone width',
    story: NARROW_STORY,
    mode: 'light',
    direction,
    viewport: PHONE,
    run: async (page, check, frame) => {
      const viewport = await readViewport(
        page,
        '[data-evidence="narrow-container"]',
      );
      const pageOverflow = await page.evaluate(() =>
        document.scrollingElement == null
          ? null
          : document.scrollingElement.scrollWidth -
            document.scrollingElement.clientWidth,
      );
      check(
        pageOverflow != null && pageOverflow <= 0,
        `page scrolls sideways by ${pageOverflow}`,
      );
      check(viewport.tabIndex === '0', `narrow tabindex ${viewport.tabIndex}`);
      const axe = await checkAxe(page, check);
      await frame('rest', {viewport, pageOverflow, axe});
    },
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `full-bleed__light__${direction}`,
    group: 'full bleed',
    story: CONTAINER_STORY,
    mode: 'light',
    direction,
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const geometry = await page
        .locator('[data-evidence="container-integration"]')
        .evaluate(element => {
          const host = element.parentElement as HTMLElement;
          const hostRect = host.getBoundingClientRect();
          const hostStyle = getComputedStyle(host);
          const rect = element.getBoundingClientRect();
          return {
            hostPaddingStart: parseFloat(hostStyle.paddingInlineStart),
            viewport: {left: rect.left, right: rect.right},
            hostInner: {
              left: hostRect.left + parseFloat(hostStyle.borderLeftWidth),
              right: hostRect.right - parseFloat(hostStyle.borderRightWidth),
            },
          };
        });
      check(
        geometry.hostPaddingStart > 0,
        `container has no inline padding to escape: ${geometry.hostPaddingStart}`,
      );
      check(
        Math.abs(geometry.viewport.left - geometry.hostInner.left) <= 1 &&
          Math.abs(geometry.viewport.right - geometry.hostInner.right) <= 1,
        `full bleed ${JSON.stringify(geometry)}`,
      );
      const axe = await checkAxe(page, check);
      await frame('rest', {geometry, axe});
    },
  });
}

test.beforeAll(async () => {
  OUTPUT = resetAuditEvidence(EVIDENCE, test.info());
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

async function runCase(page: Page, item: AuditCase) {
  await page.setViewportSize(item.viewport);
  holdsMotion = (item.motion ?? 'reduce') === 'reduce';
  await page.emulateMedia({
    colorScheme: item.mode,
    reducedMotion: item.motion ?? 'reduce',
    forcedColors: item.forcedColors ? 'active' : 'none',
  });
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:neutral;direction:${item.direction}`;
  const failures: string[] = [];
  const check: Check = (condition, message) => {
    if (!condition) {
      failures.push(message);
    }
  };
  let sensors: Awaited<ReturnType<typeof pageSensors>> | null = null;
  const frames: {
    state: string;
    observed: unknown;
    file: string;
    sha256: string;
  }[] = [];
  const frame: FrameSink = async (state, observed) => {
    const screenshot = await page
      .locator('#storybook-root')
      .screenshot({animations: 'disabled'});
    const file = `${item.key}__${state}.png`;
    fs.writeFileSync(path.join(OUTPUT, file), screenshot);
    frames.push({
      state,
      observed,
      file,
      sha256: createHash('sha256').update(screenshot).digest('hex'),
    });
  };
  try {
    await page.goto(url, {waitUntil: 'load'});
    await page.locator('#storybook-root [data-evidence]').first().waitFor();
    // Play functions toggle, focus and scroll the viewports; read them only
    // after Storybook finishes the render, play included.
    await page.waitForFunction(
      () =>
        (window as StorybookPreviewWindow).__STORYBOOK_PREVIEW__?.currentRender
          ?.phase === 'finished',
    );
    await settle(page);
    sensors = await pageSensors(page);
    check(!sensors.storybookError, 'storybook error display');
    check(sensors.mode === item.mode, `mode ${sensors.mode}`);
    check(
      sensors.direction === item.direction,
      `direction ${sensors.direction}`,
    );
    check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
    check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
    check(
      sensors.reducedMotion === ((item.motion ?? 'reduce') === 'reduce'),
      `reduced motion ${sensors.reducedMotion}`,
    );
    check(
      sensors.forcedColors === (item.forcedColors ?? false),
      `forced colors ${sensors.forcedColors}`,
    );
    await item.run(page, check, frame);
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'ScrollableArea',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    mode: item.mode,
    theme: 'neutral',
    direction: item.direction,
    viewport: item.viewport,
    reducedMotion: item.motion ?? 'reduce',
    forcedColors: item.forcedColors ?? false,
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
    const context = await browser.newContext({deviceScaleFactor: 2});
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
