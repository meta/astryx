// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit OverflowList

/**
 * @file OverflowListAudit.a11y.chromium.spec.ts
 * @input Exact-head OverflowList stories across themes, modes, direction, widths, and states
 * @output Screenshots and fail-closed sensor receipts for the OverflowList whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for an OverflowList audit pull request
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

const OUTPUT = path.resolve('overflow-list-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  story: string;
  theme: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  /** Which edge holds the indicator when items collapse. */
  edge: 'start' | 'end';
  run?: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 1180, height: 800};
const NARROW = {width: 320, height: 640};

const LIST = '#storybook-root .astryx-overflow-list';
/** Sub-pixel layout rounding allowed at the list's edges, in CSS px. */
const EDGE_TOLERANCE = 0.5;

test.describe.configure({retries: 0});

let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForTimeout(60);
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
    storybookError:
      document.querySelector('.sb-show-errordisplay') != null ||
      document.body.classList.contains('sb-show-errordisplay'),
  }));
}

/**
 * Every visible list: its box, each child's box and text, whether any child
 * reaches past the list's inline edges (and so is clipped), the measurement
 * copy's hiding, and the gap the browser rendered.
 */
async function lists(page: Page) {
  return page.evaluate(
    ([sel, tolerance]) => {
      const round = (n: number) => Math.round(n * 10) / 10;
      return Array.from(document.querySelectorAll(sel as string)).map(el => {
        const list = el as HTMLElement;
        const box = list.getBoundingClientRect();
        // A child that renders no box (a closed menu's hidden layer) is not
        // shown, so it is neither clipped nor the indicator.
        const shown = Array.from(list.children).filter(child => {
          const r = child.getBoundingClientRect();
          return r.width > 0 || r.height > 0;
        });
        const children = shown.map(child => {
          const r = child.getBoundingClientRect();
          return {
            text: (child.textContent ?? '').trim(),
            left: round(r.left),
            right: round(r.right),
            top: round(r.top),
            bottom: round(r.bottom),
          };
        });
        const clipped = children.filter(
          child =>
            child.left < box.left - (tolerance as number) ||
            child.right > box.right + (tolerance as number) ||
            child.bottom > box.bottom + (tolerance as number),
        );
        const measure = list.previousElementSibling as HTMLElement | null;
        const measureStyle = measure ? getComputedStyle(measure) : null;
        return {
          box: {
            left: round(box.left),
            right: round(box.right),
            top: round(box.top),
            bottom: round(box.bottom),
          },
          gap: getComputedStyle(list).columnGap,
          children,
          clipped,
          indicator: children.findIndex(child => child.text.startsWith('+')),
          measure:
            measure == null || measureStyle == null
              ? null
              : {
                  ariaHidden: measure.getAttribute('aria-hidden'),
                  inert: measure.hasAttribute('inert'),
                  visibility: measureStyle.visibility,
                  height: measureStyle.height,
                  pointerEvents: measureStyle.pointerEvents,
                },
        };
      });
    },
    [LIST, EDGE_TOLERANCE],
  );
}

type ListRead = Awaited<ReturnType<typeof lists>>[number];

async function axeRoot(page: Page) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.flatMap(violation =>
    violation.nodes.map(node => `${violation.id}: ${node.target.join(' ')}`),
  );
}

/** Checks one list: its copy is hidden and inert, and nothing is clipped. */
function checkList(
  check: Check,
  list: ListRead,
  label: string,
  edge: 'start' | 'end',
) {
  check(list.measure != null, `${label} has no measurement copy`);
  if (list.measure != null) {
    check(list.measure.ariaHidden === 'true', `${label} copy is not hidden`);
    check(list.measure.inert, `${label} copy is not inert`);
    check(
      list.measure.visibility === 'hidden',
      `${label} copy visibility ${list.measure.visibility}`,
    );
    check(
      list.measure.height === '0px',
      `${label} copy height ${list.measure.height}`,
    );
    check(
      list.measure.pointerEvents === 'none',
      `${label} copy takes pointer input`,
    );
  }
  check(
    list.clipped.length === 0,
    `${label} clips ${JSON.stringify(list.clipped)} at ${JSON.stringify(list.box)}`,
  );
  if (list.indicator >= 0) {
    const expected = edge === 'start' ? 0 : list.children.length - 1;
    check(
      list.indicator === expected,
      `${label} indicator is child ${list.indicator}, expected ${expected}`,
    );
  }
}

const cases: AuditCase[] = [];

const restStories: {story: string; edge: 'start' | 'end'}[] = [
  {story: 'core-overflowlist--default', edge: 'end'},
  {story: 'core-overflowlist--no-overflow', edge: 'end'},
  {story: 'core-overflowlist--with-badges', edge: 'end'},
  {story: 'core-overflowlist--collapse-from-start', edge: 'start'},
  {story: 'core-overflowlist--capped-items', edge: 'end'},
  {story: 'core-overflowlist--multi-row', edge: 'end'},
  {story: 'core-overflowlist--capped-multi-row', edge: 'end'},
];

for (const {story, edge} of restStories) {
  const name = story.replace('core-overflowlist--', '');
  for (const mode of ['light', 'dark'] as const) {
    for (const direction of ['ltr', 'rtl'] as const) {
      cases.push({
        key: `${name}-neutral-${mode}-${direction}`,
        group: 'rest',
        story,
        theme: 'neutral',
        mode,
        direction,
        viewport: DESKTOP,
        edge,
      });
    }
  }
  for (const mode of ['light', 'dark'] as const) {
    cases.push({
      key: `${name}-matcha-${mode}-ltr`,
      group: 'themed',
      story,
      theme: 'matcha',
      mode,
      direction: 'ltr',
      viewport: DESKTOP,
      edge,
    });
  }
}

/**
 * The Resizable story's frame is a person-resizable box. Narrowing it step by
 * step stands in for that drag: at every width, nothing the list shows may
 * reach past the list's edges, in a theme with the default spacing scale and
 * in one with a larger scale.
 */
const RESIZE_WIDTHS = [520, 460, 400, 360, 320, 280, 240, 200, 160, 120];

for (const theme of ['neutral', 'matcha'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `resize-${theme}-light-${direction}`,
      group: 'resize',
      story: 'core-overflowlist--resizable',
      theme,
      mode: 'light',
      direction,
      viewport: DESKTOP,
      edge: 'end',
      run: async (page, check, frame) => {
        const steps: unknown[] = [];
        let previousExtent = Number.POSITIVE_INFINITY;
        for (const width of RESIZE_WIDTHS) {
          const resized = await page.evaluate(w => {
            const frameEl = document.querySelector(
              '#storybook-root .astryx-overflow-list',
            )?.parentElement;
            if (frameEl == null) {
              return false;
            }
            frameEl.style.width = `${w}px`;
            return true;
          }, width);
          check(resized, `no resizable frame at ${width}px`);
          await settle(page);
          const [list] = await lists(page);
          if (list == null) {
            check(false, `no list at ${width}px`);
            continue;
          }
          checkList(check, list, `${width}px`, 'end');
          const extent = list.box.right - list.box.left;
          check(
            extent <= previousExtent,
            `the list did not narrow at ${width}px: ${extent}`,
          );
          previousExtent = extent;
          if (width === RESIZE_WIDTHS[RESIZE_WIDTHS.length - 1]) {
            check(list.indicator >= 0, `no indicator at ${width}px`);
          }
          steps.push({
            width,
            gap: list.gap,
            shown: list.children.map(child => child.text),
            clipped: list.clipped,
          });
          if (width === 240) {
            await frame('w240', {list});
          }
        }
        await frame('w120', {steps});
      },
    });
  }
}

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `dropdown-${mode}-ltr`,
    group: 'dropdown',
    story: 'core-overflowlist--with-dropdown-overflow',
    theme: 'neutral',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    edge: 'end',
    run: async (page, check, frame) => {
      await page.evaluate(() => {
        const frameEl = document.querySelector(
          '#storybook-root .astryx-overflow-list',
        )?.parentElement;
        if (frameEl != null) {
          frameEl.style.width = '220px';
        }
      });
      await settle(page);
      const [list] = await lists(page);
      if (list == null) {
        check(false, 'no list');
        return;
      }
      checkList(check, list, 'narrowed', 'end');
      const trigger = page
        .locator(`${LIST} button`)
        .filter({hasText: /^\+\d+$/});
      check((await trigger.count()) === 1, 'no "+N" trigger');
      const label = ((await trigger.first().textContent()) ?? '').trim();
      const collapsed = Number(label.slice(1));
      await trigger.first().click();
      const menu = page.getByRole('menu');
      await menu.waitFor({timeout: 5000}).catch(() => undefined);
      await settle(page);
      const items = await page.getByRole('menuitem').allTextContents();
      check(
        items.length === collapsed,
        `menu holds ${items.length} items for "${label}"`,
      );
      const shown = list.children
        .filter(child => !child.text.startsWith('+'))
        .map(child => child.text);
      check(
        items.every(item => !shown.includes(item.trim())),
        `menu repeats a shown item: ${JSON.stringify({items, shown})}`,
      );
      await frame('menu', {label, items, shown});
    },
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `default-narrow-light-${direction}`,
    group: 'narrow',
    story: 'core-overflowlist--default',
    theme: 'neutral',
    mode: 'light',
    direction,
    viewport: NARROW,
    edge: 'end',
    run: async (page, check, frame) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      check(overflow <= 0, `page scrolls sideways by ${overflow}px`);
      await frame('narrow', {overflow});
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

async function runCase(page: Page, item: AuditCase) {
  await page.setViewportSize(item.viewport);
  await page.emulateMedia({colorScheme: item.mode, reducedMotion: 'reduce'});
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
  await page.mouse.move(0, 0);
  await page.goto(url, {waitUntil: 'load'});
  await page.locator(LIST).first().waitFor();
  await settle(page);
  const failures: string[] = [];
  const check: Check = (condition, message) => {
    if (!condition) {
      failures.push(message);
    }
  };
  const sensors = await pageSensors(page);
  check(!sensors.storybookError, 'storybook error display');
  check(sensors.mode === item.mode, `mode ${sensors.mode}`);
  check(sensors.theme === item.theme, `theme ${sensors.theme}`);
  check(sensors.direction === item.direction, `direction ${sensors.direction}`);
  check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
  check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
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
  try {
    const read = await lists(page);
    check(read.length > 0, 'no visible list');
    read.forEach((list, index) =>
      checkList(check, list, `list ${index}`, item.edge),
    );
    const axe = await axeRoot(page);
    check(axe.length === 0, `axe: ${axe.join(' | ')}`);
    await frame('rest', {read, axe});
    if (item.run != null) {
      await item.run(page, check, frame);
    }
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'OverflowList',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    theme: item.theme,
    mode: item.mode,
    direction: item.direction,
    viewport: item.viewport,
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
