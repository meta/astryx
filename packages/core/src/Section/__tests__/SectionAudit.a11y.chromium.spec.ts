// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Section

/**
 * @file SectionAudit.a11y.chromium.spec.ts
 * @input Exact-head Section stories: dividers, the three variants, nested padding inheritance and per-edge padding, in light
 *   and dark, both directions, phone width and forced colors
 * @output Screenshots and fail-closed sensor receipts for the Section
 *   whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for
 *   a Section audit pull request
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

const EVIDENCE = path.resolve('test-results/section-audit-evidence');
const DIVIDERS_STORY = 'core-section--dividers';
const VARIANTS_STORY = 'core-section--variants';
const NESTED_STORY = 'core-section--nested-padding-inheritance';
const EDGES_STORY = 'core-section--asymmetric-padding';

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
    const root = document.querySelector('#storybook-root .astryx-section');
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

/** Wrapper and painted boxes, paint and borders for every Section on the page. */
async function readSections(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#storybook-root .astryx-section')].map(
      painted => {
        const wrapper = painted.parentElement as HTMLElement;
        const style = getComputedStyle(painted);
        const box = (element: Element) => {
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          };
        };
        const parent = wrapper.parentElement?.closest('.astryx-section');
        return {
          evidence: wrapper.getAttribute('data-evidence'),
          variant: painted.getAttribute('data-variant'),
          wrapper: box(wrapper),
          painted: box(painted),
          parent: parent == null ? null : box(parent),
          parentPadding:
            parent == null ? null : getComputedStyle(parent).paddingLeft,
          background: style.backgroundColor,
          padding: [
            style.paddingTop,
            style.paddingRight,
            style.paddingBottom,
            style.paddingLeft,
          ],
          borders: [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ],
          borderColors: [
            style.borderTopColor,
            style.borderRightColor,
            style.borderBottomColor,
            style.borderLeftColor,
          ],
        };
      },
    ),
  );
}

type SectionRead = Awaited<ReturnType<typeof readSections>>[number];

function byEvidence(sections: SectionRead[], evidence: string) {
  const found = sections.find(section => section.evidence === evidence);
  if (found == null) {
    throw new Error(`no section ${evidence}`);
  }
  return found;
}

async function noSidewaysScroll(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `dividers__${mode}__${direction}`,
      group: 'dividers',
      story: DIVIDERS_STORY,
      mode,
      direction,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const sections = await readSections(page);
        const block = byEvidence(sections, 'dividers-block');
        const start = byEvidence(sections, 'dividers-start');
        const end = byEvidence(sections, 'dividers-end');
        check(
          block.borders.join(' ') === '1px 0px 1px 0px',
          `top and bottom dividers ${block.borders.join(' ')}`,
        );
        const startBorders =
          direction === 'rtl' ? '0px 1px 0px 0px' : '0px 0px 0px 1px';
        const endBorders =
          direction === 'rtl' ? '0px 0px 0px 1px' : '0px 1px 0px 0px';
        check(
          start.borders.join(' ') === startBorders,
          `start divider ${start.borders.join(' ')}`,
        );
        check(
          end.borders.join(' ') === endBorders,
          `end divider ${end.borders.join(' ')}`,
        );
        check(
          end.background === 'rgba(0, 0, 0, 0)',
          `transparent paint ${end.background}`,
        );
        const axe = await checkAxe(page, check);
        await frame('rest', {sections, axe});
      },
    });
  }
  cases.push({
    key: `variants__${mode}__ltr`,
    group: 'variants',
    story: VARIANTS_STORY,
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const sections = await readSections(page);
      const paint = Object.fromEntries(
        sections.map(section => [section.variant, section.background]),
      );
      check(
        paint.transparent === 'rgba(0, 0, 0, 0)',
        `transparent ${paint.transparent}`,
      );
      check(
        paint.section !== paint.muted &&
          paint.section !== 'rgba(0, 0, 0, 0)' &&
          paint.muted !== 'rgba(0, 0, 0, 0)',
        `section ${paint.section} muted ${paint.muted}`,
      );
      const axe = await checkAxe(page, check);
      await frame('rest', {paint, axe});
    },
  });
  cases.push({
    key: `nested__${mode}__ltr`,
    group: 'nested padding',
    story: NESTED_STORY,
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const nested = (await readSections(page)).filter(
        section => section.parent != null,
      );
      check(nested.length === 3, `nested sections ${nested.length}`);
      for (const section of nested) {
        const {parent} = section;
        if (parent == null) {
          continue;
        }
        check(
          section.wrapper.left === parent.left &&
            section.wrapper.right === parent.right &&
            section.wrapper.top === parent.top &&
            section.wrapper.bottom === parent.bottom,
          `nested escape ${JSON.stringify({wrapper: section.wrapper, parent})}`,
        );
        check(
          section.parentPadding !== '0px',
          `parent has no padding to escape`,
        );
      }
      const insets = nested.map(section => section.padding[3]);
      check(
        insets.join(' ') === '24px 8px 8px',
        `nested content insets ${insets.join(' ')}`,
      );
      const axe = await checkAxe(page, check);
      await frame('rest', {nested, axe});
    },
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `edges__light__${direction}`,
    group: 'edge padding',
    story: EDGES_STORY,
    mode: 'light',
    direction,
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const sections = await readSections(page);
      const paddings = sections.map(section => section.padding.join(' '));
      // top right bottom left, physical; the inline-start edge is left in LTR.
      const expected =
        direction === 'rtl'
          ? [
              '24px 24px 24px 24px',
              '8px 24px 24px 24px',
              '24px 24px 0px 24px',
              '24px 12px 4px 12px',
              '24px 8px 24px 24px',
              '12px 4px 16px 8px',
            ]
          : [
              '24px 24px 24px 24px',
              '8px 24px 24px 24px',
              '24px 24px 0px 24px',
              '24px 12px 4px 12px',
              '24px 24px 24px 8px',
              '12px 8px 16px 4px',
            ];
      check(
        JSON.stringify(paddings) === JSON.stringify(expected),
        `edge padding ${JSON.stringify(paddings)}`,
      );
      const axe = await checkAxe(page, check);
      await frame('rest', {paddings, axe});
    },
  });
  cases.push({
    key: `dividers__light__${direction}__phone`,
    group: 'phone width',
    story: DIVIDERS_STORY,
    mode: 'light',
    direction,
    viewport: PHONE,
    run: async (page, check, frame) => {
      const scroll = await noSidewaysScroll(page);
      check(
        scroll.scrollWidth <= scroll.clientWidth,
        `sideways page scroll ${JSON.stringify(scroll)}`,
      );
      const axe = await checkAxe(page, check);
      await frame('rest', {scroll, axe});
    },
  });
}

cases.push({
  key: 'dividers__light__ltr__forced-colors',
  group: 'forced colors',
  story: DIVIDERS_STORY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  forcedColors: true,
  run: async (page, check, frame) => {
    const block = byEvidence(await readSections(page), 'dividers-block');
    check(
      block.borders.join(' ') === '1px 0px 1px 0px',
      `forced-colors dividers ${block.borders.join(' ')}`,
    );
    check(
      block.borderColors[0] !== 'rgba(0, 0, 0, 0)' &&
        block.borderColors[0] !== block.background,
      `forced-colors divider color ${block.borderColors[0]} on ${block.background}`,
    );
    await frame('rest', {block});
  },
});

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
    await page.locator('#storybook-root .astryx-section').first().waitFor();
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
    component: 'Section',
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
