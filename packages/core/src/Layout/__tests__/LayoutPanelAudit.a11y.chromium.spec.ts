// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit LayoutPanel

/**
 * @file LayoutPanelAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/Layout stories across themes, modes, direction, and width
 * @output Screenshots and fail-closed sensor receipts for the LayoutPanel whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a LayoutPanel audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('layout-panel-audit-evidence');
const WIDE = {width: 1280, height: 1400};
const NARROW = {width: 320, height: 900};

type Mode = 'light' | 'dark';
type Theme = 'neutral' | 'butter';
type Direction = 'ltr' | 'rtl';
type Story =
  | 'panel-states'
  | 'with-sidebar'
  | 'dual-panels'
  | 'content-width-with-start-panel';

type AuditCase = {
  key: string;
  story: Story;
  mode: Mode;
  theme: Theme;
  direction: Direction;
  viewport: {width: number; height: number};
};

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
  failures: string[];
};

type Edge = 'inlineStart' | 'inlineEnd' | 'blockStart' | 'blockEnd';
const EDGES: Edge[] = ['inlineStart', 'inlineEnd', 'blockStart', 'blockEnd'];
type Step = 0 | 2 | 4 | 6;
type Slot = 'start' | 'end';

// The number of LayoutPanel regions each story renders, so a story that
// stops rendering one fails instead of passing with nothing to check.
const PANELS: Record<Story, number> = {
  'panel-states': 12,
  'with-sidebar': 1,
  'dual-panels': 2,
  'content-width-with-start-panel': 1,
};

type PanelExpectation = {
  slot: Slot;
  // The padding the panel applies on each edge, as a spacing step: 6 is the
  // Layout's `padding={6}`, 4 the inner inset.
  insets: Record<Edge, Step>;
  hasDivider: boolean;
  // The negative margin on the content-facing edge, as a spacing step: the
  // inner inset when the panel shares its gap with the content.
  overlap: Step;
  width?: number;
  role: string | null;
  name: string | null;
  overflow: 'auto' | 'clip';
  overflows?: boolean;
  // A full-bleed Divider inside reaches both inline edges of the panel's
  // padding box.
  hasBleedChild?: boolean;
};

const START_AUTOMATIC: Record<Edge, Step> = {
  inlineStart: 6,
  inlineEnd: 4,
  blockStart: 6,
  blockEnd: 6,
};
const END_AUTOMATIC: Record<Edge, Step> = {
  inlineStart: 4,
  inlineEnd: 6,
  blockStart: 6,
  blockEnd: 6,
};

const CASES: Record<string, PanelExpectation> = {
  'start-automatic': {
    slot: 'start',
    insets: START_AUTOMATIC,
    hasDivider: false,
    overlap: 4,
    width: 120,
    role: null,
    name: null,
    overflow: 'auto',
  },
  'start-divider': {
    slot: 'start',
    insets: START_AUTOMATIC,
    hasDivider: true,
    overlap: 0,
    width: 120,
    role: null,
    name: null,
    overflow: 'auto',
  },
  'end-automatic': {
    slot: 'end',
    insets: END_AUTOMATIC,
    hasDivider: false,
    overlap: 4,
    width: 120,
    role: null,
    name: null,
    overflow: 'auto',
  },
  'end-divider': {
    slot: 'end',
    insets: END_AUTOMATIC,
    hasDivider: true,
    overlap: 0,
    width: 120,
    role: null,
    name: null,
    overflow: 'auto',
  },
  // A header and a footer take the Layout-edge inset on the block edges, so
  // the panel keeps the inner inset there.
  'header-footer': {
    slot: 'start',
    insets: {inlineStart: 6, inlineEnd: 4, blockStart: 4, blockEnd: 4},
    hasDivider: true,
    overlap: 0,
    width: 120,
    role: null,
    name: null,
    overflow: 'auto',
  },
  'bleed-child': {
    slot: 'start',
    insets: START_AUTOMATIC,
    hasDivider: true,
    overlap: 0,
    width: 160,
    role: null,
    name: null,
    overflow: 'auto',
    hasBleedChild: true,
  },
  'padding-2': {
    slot: 'start',
    insets: {inlineStart: 2, inlineEnd: 2, blockStart: 2, blockEnd: 2},
    hasDivider: true,
    overlap: 0,
    width: 120,
    role: null,
    name: null,
    overflow: 'auto',
  },
  'full-bleed': {
    slot: 'start',
    insets: {inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0},
    hasDivider: true,
    overlap: 0,
    width: 120,
    role: null,
    name: null,
    overflow: 'auto',
  },
  'width-string': {
    slot: 'start',
    insets: START_AUTOMATIC,
    hasDivider: true,
    overlap: 0,
    width: 160,
    role: null,
    name: null,
    overflow: 'auto',
  },
  landmark: {
    slot: 'start',
    insets: START_AUTOMATIC,
    hasDivider: true,
    overlap: 0,
    width: 120,
    role: 'navigation',
    name: 'Sections',
    overflow: 'auto',
  },
  // While it overflows, a scrolling panel is a group named "Content".
  scrolling: {
    slot: 'start',
    insets: START_AUTOMATIC,
    hasDivider: true,
    overlap: 0,
    width: 120,
    role: 'group',
    name: 'Content',
    overflow: 'auto',
    overflows: true,
  },
  'not-scrollable': {
    slot: 'start',
    insets: START_AUTOMATIC,
    hasDivider: true,
    overlap: 0,
    width: 120,
    role: null,
    name: null,
    overflow: 'clip',
    overflows: true,
  },
};

const cases: AuditCase[] = [];
function add(
  story: Story,
  options: {
    theme?: Theme;
    direction?: Direction;
    modes?: Mode[];
    viewport?: {width: number; height: number};
    suffix?: string;
  } = {},
) {
  const theme = options.theme ?? 'neutral';
  const direction = options.direction ?? 'ltr';
  for (const mode of options.modes ?? ['light', 'dark']) {
    const parts: string[] = [story, options.suffix ?? '', theme];
    if (direction === 'rtl') {
      parts.push('rtl');
    }
    cases.push({
      key: `${parts.filter(Boolean).join('-')}-${mode}`,
      story,
      mode,
      theme,
      direction,
      viewport: options.viewport ?? WIDE,
    });
  }
}

add('panel-states');
add('panel-states', {theme: 'butter', modes: ['light']});
add('panel-states', {direction: 'rtl', modes: ['light']});
add('panel-states', {suffix: 'narrow', modes: ['light'], viewport: NARROW});
add('with-sidebar');
add('with-sidebar', {direction: 'rtl', modes: ['light']});
add('dual-panels', {modes: ['light']});
add('content-width-with-start-panel', {modes: ['light']});
add('content-width-with-start-panel', {direction: 'rtl', modes: ['light']});

test.describe.configure({retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=core-layout--${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
}

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForTimeout(40);
}

async function observe(page: Page) {
  return page.evaluate(() => {
    const round = (value: number) => Math.round(value * 10) / 10;
    const px = (value: string) => parseFloat(value) || 0;
    function box(element: Element) {
      const rect = element.getBoundingClientRect();
      return {
        left: round(rect.left),
        top: round(rect.top),
        right: round(rect.right),
        bottom: round(rect.bottom),
        width: round(rect.width),
        height: round(rect.height),
      };
    }
    // Resolve a length expression to pixels in the element's own scope.
    function resolve(element: Element, expression: string) {
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;visibility:hidden;width:${expression}`;
      element.appendChild(probe);
      const width = px(getComputedStyle(probe).width);
      probe.remove();
      return round(width);
    }
    // Resolve a color expression to its computed rgb() in the element's scope.
    function color(element: Element, expression: string) {
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;visibility:hidden;color:${expression}`;
      element.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    }
    function border(style: CSSStyleDeclaration, side: 'Start' | 'End') {
      return {
        width: px(
          style.getPropertyValue(`border-inline-${side.toLowerCase()}-width`),
        ),
        style: style.getPropertyValue(
          `border-inline-${side.toLowerCase()}-style`,
        ),
        color: style.getPropertyValue(
          `border-inline-${side.toLowerCase()}-color`,
        ),
      };
    }
    const root = document.querySelector('#storybook-root') as Element;
    const steps = {
      2: resolve(root, 'var(--spacing-2)'),
      4: resolve(root, 'var(--spacing-4)'),
      6: resolve(root, 'var(--spacing-6)'),
    };
    const panels = Array.from(
      document.querySelectorAll('#storybook-root .astryx-layout-panel'),
    ).map(panel => {
      const style = getComputedStyle(panel);
      const layout = panel.closest('.astryx-layout');
      const content = Array.from(
        layout?.querySelectorAll('.astryx-layout-content') ?? [],
      ).find(candidate => candidate.closest('.astryx-layout') === layout);
      return {
        panelCase: panel.getAttribute('data-panel-case'),
        targets: Array.from(panel.classList).filter(name =>
          name.startsWith('astryx-'),
        ),
        role: panel.getAttribute('role'),
        name: panel.getAttribute('aria-label'),
        inert: panel.hasAttribute('inert'),
        flexShrink: style.flexShrink,
        direction: style.direction,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        overflows: panel.scrollHeight > panel.clientHeight + 1,
        borderStart: border(style, 'Start'),
        borderEnd: border(style, 'End'),
        borderColor: color(panel, 'var(--color-border)'),
        marginInlineStart: px(style.marginInlineStart),
        marginInlineEnd: px(style.marginInlineEnd),
        box: box(panel),
        bleedBox: (() => {
          const divider = panel.querySelector(':scope > .astryx-divider');
          return divider == null ? null : box(divider);
        })(),
        contentBox: content == null ? null : box(content),
        layoutBox: layout == null ? null : box(layout),
        applied: {
          inlineStart: px(style.paddingInlineStart),
          inlineEnd: px(style.paddingInlineEnd),
          blockStart: px(style.paddingBlockStart),
          blockEnd: px(style.paddingBlockEnd),
        },
        published: {
          inlineStart: resolve(
            panel,
            'var(--container-padding-inline-start, 0px)',
          ),
          inlineEnd: resolve(panel, 'var(--container-padding-inline-end, 0px)'),
          blockStart: resolve(
            panel,
            'var(--container-padding-block-start, 0px)',
          ),
          blockEnd: resolve(panel, 'var(--container-padding-block-end, 0px)'),
        },
      };
    });
    return {
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      fonts: document.fonts.status,
      storybookError:
        document.querySelector('.sb-show-errordisplay') != null ||
        document.body.classList.contains('sb-show-errordisplay'),
      documentOverflow: round(
        document.documentElement.scrollWidth - innerWidth,
      ),
      steps,
      panels,
    };
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

for (const item of cases) {
  test(item.key, async ({browser}) => {
    const context = await browser.newContext({
      viewport: item.viewport,
      deviceScaleFactor: 2,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page
      .locator('#storybook-root .astryx-layout-panel')
      .first()
      .waitFor();
    await settle(page);

    const first = await observe(page);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page);
    const geometryStable =
      JSON.stringify(first.panels.map(panel => panel.box)) ===
      JSON.stringify(observed.panels.map(panel => panel.box));

    const failures: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) {
        failures.push(message);
      }
    };
    const near = (actual: number, expected: number, tolerance = 0.6) =>
      Math.abs(actual - expected) <= tolerance;
    const stepPx = (step: Step) => (step === 0 ? 0 : observed.steps[step]);

    check(storybookSha === checkoutSha, 'storybook build mismatch');
    check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
    check(!observed.storybookError, 'storybook error display');
    check(observed.theme === item.theme, `theme ${observed.theme}`);
    check(observed.mode === item.mode, `mode ${observed.mode}`);
    check(
      observed.viewport.width === item.viewport.width &&
        observed.viewport.height === item.viewport.height,
      'viewport mismatch',
    );
    check(observed.dpr === 2, `dpr ${observed.dpr}`);
    check(observed.reducedMotion, 'reduced motion not applied');
    check(observed.fonts === 'loaded', `fonts ${observed.fonts}`);
    check(geometryStable, 'geometry changed between samples');
    check(
      observed.steps[2] > 0 &&
        observed.steps[4] > observed.steps[2] &&
        observed.steps[6] > observed.steps[4],
      `spacing steps ${JSON.stringify(observed.steps)}`,
    );
    check(
      observed.panels.length === PANELS[item.story],
      `${observed.panels.length} panels, expected ${PANELS[item.story]}`,
    );
    if (item.viewport !== NARROW) {
      check(
        observed.documentOverflow <= 0,
        `document scrolls sideways by ${observed.documentOverflow}px`,
      );
    }

    const panelCases = new Set<string>();
    observed.panels.forEach((panel, index) => {
      const where = `panel ${index}${panel.panelCase ? ` (${panel.panelCase})` : ''}`;
      check(
        JSON.stringify(panel.targets) === '["astryx-layout-panel"]',
        `${where} targets ${panel.targets.join(' ')}`,
      );
      check(
        panel.flexShrink === '0',
        `${where} flex-shrink ${panel.flexShrink}`,
      );
      check(
        panel.direction === item.direction,
        `${where} direction ${panel.direction}`,
      );
      check(!panel.inert, `${where} is inert`);
      // The panel publishes the padding it applies on every edge.
      for (const edge of EDGES) {
        check(
          near(panel.applied[edge], panel.published[edge]),
          `${where} ${edge} applies ${panel.applied[edge]} but publishes ${panel.published[edge]}`,
        );
      }
      // Its slot, read from its place beside the content: a start panel sits
      // at the content's inline start, which is the left in LTR.
      const contentBox = panel.contentBox;
      const slot: Slot | null =
        contentBox == null
          ? null
          : panel.box.left < contentBox.left === (item.direction === 'ltr')
            ? 'start'
            : 'end';
      // A divider is a 1px solid --color-border line on the content-facing
      // edge only: inline end for a start panel, inline start for an end panel.
      const facing = slot === 'end' ? panel.borderStart : panel.borderEnd;
      const outer = slot === 'end' ? panel.borderEnd : panel.borderStart;
      check(outer.width === 0, `${where} line on its outer edge`);
      if (facing.width > 0) {
        check(
          near(facing.width, 1, 0.01) &&
            facing.style === 'solid' &&
            facing.color === panel.borderColor,
          `${where} line ${JSON.stringify(facing)}`,
        );
      }
      if (panel.layoutBox != null) {
        check(
          panel.box.left >= panel.layoutBox.left - 0.6 &&
            panel.box.right <= panel.layoutBox.right + 0.6,
          `${where} ${JSON.stringify(panel.box)} leaves its layout ${JSON.stringify(panel.layoutBox)}`,
        );
      }

      if (panel.panelCase != null) {
        panelCases.add(panel.panelCase);
        const expected = CASES[panel.panelCase];
        check(expected != null, `${where} is not an expected case`);
        if (expected == null) {
          return;
        }
        check(
          slot === expected.slot,
          `${where} slot ${slot}, expected ${expected.slot}`,
        );
        for (const edge of EDGES) {
          check(
            near(panel.applied[edge], stepPx(expected.insets[edge])),
            `${where} ${edge} applies ${panel.applied[edge]}, expected ${stepPx(expected.insets[edge])} (step ${expected.insets[edge]})`,
          );
        }
        check(
          facing.width > 0 === expected.hasDivider,
          `${where} line ${facing.width}px, expected divider ${expected.hasDivider}`,
        );
        const overlap =
          expected.slot === 'end'
            ? panel.marginInlineStart
            : panel.marginInlineEnd;
        const otherMargin =
          expected.slot === 'end'
            ? panel.marginInlineEnd
            : panel.marginInlineStart;
        check(
          near(overlap, -stepPx(expected.overlap)) && otherMargin === 0,
          `${where} margins ${panel.marginInlineStart}/${panel.marginInlineEnd}, expected an overlap of ${stepPx(expected.overlap)} on the content-facing edge`,
        );
        if (expected.width != null) {
          check(
            near(panel.box.width, expected.width),
            `${where} width ${panel.box.width}, expected ${expected.width}`,
          );
        }
        check(
          panel.role === expected.role && panel.name === expected.name,
          `${where} role ${panel.role} name ${panel.name}, expected ${expected.role} ${expected.name}`,
        );
        check(
          panel.overflowY === expected.overflow,
          `${where} overflow ${panel.overflowX}/${panel.overflowY}, expected ${expected.overflow}`,
        );
        if (expected.hasBleedChild) {
          // The padding box spans the border box less the divider line on
          // the content-facing edge.
          const line = facing.width;
          const paddingLeft =
            panel.box.left + (item.direction === 'rtl' ? line : 0);
          const paddingRight =
            panel.box.right - (item.direction === 'rtl' ? 0 : line);
          check(
            panel.bleedBox != null &&
              near(panel.bleedBox.left, paddingLeft) &&
              near(panel.bleedBox.right, paddingRight),
            `${where} full-bleed child ${JSON.stringify(panel.bleedBox)}, expected ${paddingLeft} to ${paddingRight}`,
          );
        }
        if (expected.overflows != null) {
          check(
            panel.overflows === expected.overflows,
            `${where} overflows ${panel.overflows}, expected ${expected.overflows}`,
          );
        }
      }
    });
    if (item.story === 'panel-states') {
      check(
        JSON.stringify([...panelCases].sort()) ===
          JSON.stringify(Object.keys(CASES).sort()),
        `panel cases ${[...panelCases].join(',')}`,
      );
    }

    const png = await page.screenshot({animations: 'disabled', fullPage: true});
    check(png.length > 1000, 'screenshot is empty');
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: `core-layout--${item.story}`,
        mode: item.mode,
        theme: item.theme,
        direction: item.direction,
        viewport: item.viewport,
        panels: PANELS[item.story],
        anatomy:
          'each panel root carries only the astryx-layout-panel target, does not shrink, follows the page direction, is not inert, and stays inside its layout',
        divider:
          'no line on the outer edge; a line on the content-facing edge is 1px solid --color-border',
        publication: 'the panel applies exactly the padding it publishes',
        cases: item.story === 'panel-states' ? CASES : 'not applicable',
        overflow:
          item.viewport === NARROW
            ? 'not asserted at the document: the story frames are wider than 320px'
            : 'no sideways document scroll',
      },
      observed: {
        build: storybookSha,
        ...observed,
        geometryStable,
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      failures,
      passed: failures.length === 0,
    };
    fs.writeFileSync(path.join(OUTPUT, image), png);
    fs.writeFileSync(
      path.join(OUTPUT, `${item.key}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    await context.close();
    expect(failures).toEqual([]);
  });
}

test('manifest is complete', async () => {
  // Read only this run's frames, so files left by another run do not count.
  const receipts = cases.map(item => {
    const file = path.join(OUTPUT, `${item.key}.sensors.json`);
    return {
      key: item.key,
      receipt: fs.existsSync(file)
        ? (JSON.parse(fs.readFileSync(file, 'utf8')) as AuditReceipt)
        : null,
    };
  });
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        component: 'core/LayoutPanel',
        build: checkoutSha,
        frames: cases.map(item => ({
          key: item.key,
          image: `${item.key}.png`,
          receipt: `${item.key}.sensors.json`,
        })),
      },
      null,
      2,
    )}\n`,
  );
  expect(
    receipts.filter(({receipt}) => receipt == null).map(({key}) => key),
  ).toEqual([]);
  // A receipt left by an earlier build does not count.
  expect(
    receipts
      .filter(({receipt}) => receipt?.expected.build !== checkoutSha)
      .map(({key}) => key),
  ).toEqual([]);
  expect(
    receipts
      .filter(({receipt}) => receipt?.passed !== true)
      .map(({key, receipt}) => ({frame: key, failures: receipt?.failures})),
  ).toEqual([]);
});
