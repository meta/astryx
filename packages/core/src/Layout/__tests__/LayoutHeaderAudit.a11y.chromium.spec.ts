// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit LayoutHeader

/**
 * @file LayoutHeaderAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/Layout stories across themes, modes, direction, and width
 * @output Screenshots and fail-closed sensor receipts for the LayoutHeader whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a LayoutHeader audit pull request
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

const OUTPUT = path.resolve('layout-header-audit-evidence');
const WIDE = {width: 1280, height: 1000};
const NARROW = {width: 320, height: 900};

type Mode = 'light' | 'dark';
type Theme = 'neutral' | 'butter';
type Direction = 'ltr' | 'rtl';
type Story =
  | 'header-states'
  | 'basic-card'
  | 'with-sidebar'
  | 'no-dividers'
  | 'full-bleed-content';

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

// The number of LayoutHeader regions each story renders, so a story that
// stops rendering one fails instead of passing with nothing to check.
const HEADERS: Record<Story, number> = {
  // Header States has eleven cases plus the outer header of the nested case.
  'header-states': 12,
  'basic-card': 1,
  'with-sidebar': 1,
  'no-dividers': 1,
  'full-bleed-content': 1,
};

type HeaderExpectation = {
  // The padding the inner wrapper applies on each edge, as a spacing step:
  // 6 is the Layout's `padding={6}`, 4 the inner inset. Not asserted when
  // absent.
  insets?: Record<Edge, Step>;
  hasDivider: boolean;
  // The block-start padding of the content below, as a spacing step: 0 when
  // it collapses against a header without a divider.
  contentBlockStart: Step;
  height?: number;
  contentWidth?: number;
};

const AUTOMATIC: Record<Edge, Step> = {
  inlineStart: 6,
  inlineEnd: 6,
  blockStart: 6,
  blockEnd: 4,
};

const CASES: Record<string, HeaderExpectation> = {
  automatic: {insets: AUTOMATIC, hasDivider: false, contentBlockStart: 0},
  divider: {insets: AUTOMATIC, hasDivider: true, contentBlockStart: 4},
  'layout-default': {insets: AUTOMATIC, hasDivider: true, contentBlockStart: 4},
  'explicit-off': {insets: AUTOMATIC, hasDivider: false, contentBlockStart: 0},
  'padding-2': {
    insets: {inlineStart: 2, inlineEnd: 2, blockStart: 2, blockEnd: 2},
    hasDivider: true,
    contentBlockStart: 4,
  },
  'full-bleed': {
    insets: {inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0},
    hasDivider: true,
    contentBlockStart: 4,
  },
  height: {
    insets: AUTOMATIC,
    hasDivider: true,
    contentBlockStart: 4,
    height: 72,
  },
  'content-width': {
    insets: AUTOMATIC,
    hasDivider: true,
    contentBlockStart: 4,
    contentWidth: 240,
  },
  'padding-block-end': {
    insets: {inlineStart: 6, inlineEnd: 6, blockStart: 6, blockEnd: 0},
    hasDivider: true,
    contentBlockStart: 4,
  },
  // The outer header has no divider, but the collapse stops at the nested
  // Layout: the nested content keeps its spacing below its divided header.
  // LayoutContent is not a padding container, so the nested header takes
  // the step-4 default on every edge.
  nested: {
    insets: {inlineStart: 4, inlineEnd: 4, blockStart: 4, blockEnd: 4},
    hasDivider: true,
    contentBlockStart: 4,
  },
  // The caller's `data-divider="false"` must not replace the reflected value:
  // no line, no attribute, and the content below still collapses.
  'caller-attribute': {
    insets: AUTOMATIC,
    hasDivider: false,
    contentBlockStart: 0,
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

add('header-states');
add('header-states', {theme: 'butter', modes: ['light']});
add('header-states', {direction: 'rtl', modes: ['light']});
add('header-states', {suffix: 'narrow', modes: ['light'], viewport: NARROW});
add('basic-card');
add('with-sidebar', {direction: 'rtl', modes: ['light']});
add('no-dividers', {modes: ['light']});
add('full-bleed-content', {modes: ['light']});

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
    function edges(style: CSSStyleDeclaration) {
      return {
        inlineStart: px(style.paddingInlineStart),
        inlineEnd: px(style.paddingInlineEnd),
        blockStart: px(style.paddingBlockStart),
        blockEnd: px(style.paddingBlockEnd),
      };
    }
    const root = document.querySelector('#storybook-root') as Element;
    const steps = {
      2: resolve(root, 'var(--spacing-2)'),
      4: resolve(root, 'var(--spacing-4)'),
      6: resolve(root, 'var(--spacing-6)'),
    };
    const headers = Array.from(
      document.querySelectorAll('#storybook-root .astryx-layout-header'),
    ).map(header => {
      const style = getComputedStyle(header);
      const inner = header.firstElementChild as Element;
      const innerStyle = getComputedStyle(inner);
      const layout = header.closest('.astryx-layout');
      const content = Array.from(
        layout?.querySelectorAll('.astryx-layout-content') ?? [],
      ).find(candidate => candidate.closest('.astryx-layout') === layout);
      return {
        headerCase: header.getAttribute('data-header-case'),
        targets: Array.from(header.classList).filter(name =>
          name.startsWith('astryx-'),
        ),
        innerTargets: Array.from(inner.classList).filter(name =>
          name.startsWith('astryx-'),
        ),
        dataDivider: header.getAttribute('data-divider'),
        role: header.getAttribute('role'),
        name: header.getAttribute('aria-label'),
        flexShrink: style.flexShrink,
        direction: style.direction,
        border: {
          width: px(style.borderBlockEndWidth),
          style: style.borderBlockEndStyle,
          color: style.borderBlockEndColor,
          expectedColor: color(header, 'var(--color-border)'),
        },
        box: box(header),
        innerBox: box(inner),
        innerMaxWidth: innerStyle.maxWidth,
        layoutBox: layout == null ? null : box(layout),
        applied: edges(innerStyle),
        published: {
          inlineStart: resolve(
            inner,
            'var(--container-padding-inline-start, 0px)',
          ),
          inlineEnd: resolve(inner, 'var(--container-padding-inline-end, 0px)'),
          blockStart: resolve(
            inner,
            'var(--container-padding-block-start, 0px)',
          ),
          blockEnd: resolve(inner, 'var(--container-padding-block-end, 0px)'),
        },
        contentBlockStart:
          content == null
            ? null
            : px(getComputedStyle(content).paddingBlockStart),
        contentScrolls:
          content == null
            ? null
            : content.scrollHeight > content.clientHeight + 1,
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
      headers,
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
      .locator('#storybook-root .astryx-layout-header')
      .first()
      .waitFor();
    await settle(page);

    const first = await observe(page);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page);
    const geometryStable =
      JSON.stringify(first.headers.map(header => header.box)) ===
      JSON.stringify(observed.headers.map(header => header.box));

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
      observed.headers.length === HEADERS[item.story],
      `${observed.headers.length} headers, expected ${HEADERS[item.story]}`,
    );
    if (item.viewport !== NARROW) {
      check(
        observed.documentOverflow <= 0,
        `document scrolls sideways by ${observed.documentOverflow}px`,
      );
    }

    const headerCases = new Set<string>();
    observed.headers.forEach((header, index) => {
      const where = `header ${index}${header.headerCase ? ` (${header.headerCase})` : ''}`;
      // One `layout-header` target on the root; the inner wrapper has none.
      check(
        JSON.stringify(header.targets) === '["astryx-layout-header"]',
        `${where} targets ${header.targets.join(' ')}`,
      );
      check(
        header.innerTargets.length === 0,
        `${where} inner targets ${header.innerTargets.join(' ')}`,
      );
      check(
        header.flexShrink === '0',
        `${where} flex-shrink ${header.flexShrink}`,
      );
      check(
        header.direction === item.direction,
        `${where} direction ${header.direction}`,
      );
      // No role or name of its own.
      check(
        header.role == null && header.name == null,
        `${where} has role ${header.role} name ${header.name}`,
      );
      // A divider is a 1px solid --color-border line on the block-end
      // edge, reflected as data-divider="true"; no divider, no line and no
      // attribute.
      const drawsLine = header.border.width > 0;
      check(
        drawsLine === (header.dataDivider === 'true'),
        `${where} line ${header.border.width}px but data-divider ${header.dataDivider}`,
      );
      check(
        header.dataDivider == null || header.dataDivider === 'true',
        `${where} data-divider ${header.dataDivider}`,
      );
      if (drawsLine) {
        check(
          near(header.border.width, 1, 0.01) &&
            header.border.style === 'solid' &&
            header.border.color === header.border.expectedColor,
          `${where} line ${JSON.stringify(header.border)}`,
        );
      }
      // The inner wrapper publishes the padding it applies, stays inside the
      // header, and is centered in it.
      for (const edge of EDGES) {
        check(
          near(header.applied[edge], header.published[edge]),
          `${where} ${edge} applies ${header.applied[edge]} but publishes ${header.published[edge]}`,
        );
      }
      check(
        header.innerBox.left >= header.box.left - 0.6 &&
          header.innerBox.right <= header.box.right + 0.6,
        `${where} inner ${JSON.stringify(header.innerBox)} leaves ${JSON.stringify(header.box)}`,
      );
      check(
        near(
          header.innerBox.left - header.box.left,
          header.box.right - header.innerBox.right,
        ),
        `${where} inner is not centered`,
      );
      if (header.layoutBox != null) {
        check(
          header.box.left >= header.layoutBox.left - 0.6 &&
            header.box.right <= header.layoutBox.right + 0.6 &&
            header.box.top >= header.layoutBox.top - 0.6,
          `${where} ${JSON.stringify(header.box)} leaves its layout ${JSON.stringify(header.layoutBox)}`,
        );
      }

      if (header.headerCase != null) {
        headerCases.add(header.headerCase);
        const expected = CASES[header.headerCase];
        check(expected != null, `${where} is not an expected case`);
        if (expected == null) {
          return;
        }
        const insets = expected.insets;
        if (insets != null) {
          for (const edge of EDGES) {
            check(
              near(header.applied[edge], stepPx(insets[edge])),
              `${where} ${edge} applies ${header.applied[edge]}, expected ${stepPx(insets[edge])} (step ${insets[edge]})`,
            );
          }
        }
        check(
          (header.dataDivider === 'true') === expected.hasDivider,
          `${where} data-divider ${header.dataDivider}, expected divider ${expected.hasDivider}`,
        );
        check(
          header.contentBlockStart != null &&
            near(header.contentBlockStart, stepPx(expected.contentBlockStart)),
          `${where} content below starts with ${header.contentBlockStart}, expected ${stepPx(expected.contentBlockStart)} (step ${expected.contentBlockStart})`,
        );
        if (expected.height != null) {
          check(
            near(header.box.height, expected.height),
            `${where} height ${header.box.height}, expected ${expected.height}`,
          );
          check(
            header.contentScrolls === true,
            `${where} content below does not overflow, so shrinking is not exercised`,
          );
        }
        if (expected.contentWidth != null) {
          check(
            header.innerMaxWidth === `${expected.contentWidth}px` &&
              near(header.innerBox.width, expected.contentWidth),
            `${where} inner max ${header.innerMaxWidth} width ${header.innerBox.width}, expected ${expected.contentWidth}`,
          );
        } else if (item.viewport !== NARROW) {
          // Without a content width the inner wrapper spans the header. In
          // the 320px viewport the story frames are wider than the viewport,
          // so the Layout's default content width caps the wrapper there.
          check(
            near(header.innerBox.width, header.box.width),
            `${where} inner width ${header.innerBox.width}, header ${header.box.width}`,
          );
        }
      }
    });
    if (item.story === 'header-states') {
      check(
        JSON.stringify([...headerCases].sort()) ===
          JSON.stringify(Object.keys(CASES).sort()),
        `header cases ${[...headerCases].join(',')}`,
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
        headers: HEADERS[item.story],
        anatomy:
          'each header root carries only the astryx-layout-header target, does not shrink, follows the page direction, and stays inside its layout; its inner wrapper has no target and is centered',
        semantics: 'no role or name without a caller role',
        divider:
          'a line exists exactly when data-divider is "true", and it is 1px solid --color-border on the block-end edge',
        publication:
          'the inner wrapper applies exactly the padding it publishes',
        cases: item.story === 'header-states' ? CASES : 'not applicable',
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
        component: 'core/LayoutHeader',
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
