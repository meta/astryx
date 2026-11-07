// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit LayoutContent

/**
 * @file LayoutContentAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/Layout stories across themes, modes, direction, and width
 * @output Screenshots and fail-closed sensor receipts for the LayoutContent whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a LayoutContent audit pull request
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

const OUTPUT = path.resolve('layout-content-audit-evidence');
const WIDE = {width: 1280, height: 800};
const TALL = {width: 1280, height: 1400};
const NARROW = {width: 320, height: 900};

type Mode = 'light' | 'dark';
type Theme = 'neutral' | 'butter';
type Direction = 'ltr' | 'rtl';
type Story =
  | 'content-insets'
  | 'content-only'
  | 'with-sidebar'
  | 'dual-panels'
  | 'no-dividers'
  | 'full-bleed-content'
  | 'content-width-scrollbar-placement'
  | 'nested-in-app-shell';

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

// The number of LayoutContent regions each story renders, so a story that
// stops rendering one fails instead of passing with nothing to check.
const REGIONS: Record<Story, number> = {
  'content-insets': 7,
  'content-only': 1,
  'with-sidebar': 1,
  'dual-panels': 1,
  'no-dividers': 1,
  'full-bleed-content': 1,
  'content-width-scrollbar-placement': 4,
  'nested-in-app-shell': 3,
};

// Stories whose Layout sets `contentWidth`: there the inline padding may add
// an alignment gutter on top of the published inset.
const CONTENT_WIDTH = new Set<Story>(['content-width-scrollbar-placement']);

// The inset each Content Insets case must apply on each edge, as a spacing
// step (4 is the inner inset, 6 the Layout's `padding={6}`) or 0. A missing
// edge is not asserted.
const INSETS: Record<string, Partial<Record<Edge, 0 | 4 | 6>>> = {
  'start-panel': {inlineStart: 4, inlineEnd: 6, blockStart: 6, blockEnd: 6},
  'end-panel': {inlineStart: 6, inlineEnd: 4, blockStart: 6, blockEnd: 6},
  'header-without-divider': {
    inlineStart: 6,
    inlineEnd: 6,
    blockStart: 0,
    blockEnd: 4,
  },
  'full-bleed-start-panel': {
    inlineStart: 4,
    inlineEnd: 0,
    blockStart: 0,
    blockEnd: 0,
  },
  nested: {blockStart: 4},
  // Only the block edges: the inline padding adds the content-width gutter.
  'content-width-start-panel': {blockStart: 4, blockEnd: 6},
};

// Cases whose Layout sets `contentWidth` with one start panel. The header
// content spans the content-width frame, and the content children end one
// Layout-edge inset (step 6) inside its end, as they do without panels.
const ALIGNED_TO_HEADER = new Set(['content-width-start-panel']);

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

add('content-insets');
add('content-insets', {theme: 'butter', modes: ['light']});
add('content-insets', {direction: 'rtl', modes: ['light']});
add('content-only', {modes: ['light']});
add('with-sidebar');
add('with-sidebar', {direction: 'rtl', modes: ['light']});
add('dual-panels', {modes: ['light']});
add('no-dividers', {modes: ['light']});
add('full-bleed-content', {modes: ['light']});
add('content-width-scrollbar-placement', {modes: ['light'], viewport: TALL});
add('nested-in-app-shell', {
  suffix: 'narrow',
  modes: ['light'],
  viewport: NARROW,
});

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
    const root = document.querySelector('#storybook-root') as Element;
    const steps = {
      4: resolve(root, 'var(--spacing-4)'),
      6: resolve(root, 'var(--spacing-6)'),
    };
    const regions = Array.from(
      document.querySelectorAll('#storybook-root .astryx-layout-content'),
    ).map(region => {
      const style = getComputedStyle(region);
      // The area Layout gives the region is the nearest ancestor that
      // generates a box.
      let parent = region.parentElement as Element;
      while (
        getComputedStyle(parent).display === 'contents' &&
        parent.parentElement != null
      ) {
        parent = parent.parentElement;
      }
      const layout = region.closest('.astryx-layout');
      const header = Array.from(
        layout?.querySelectorAll('.astryx-layout-header') ?? [],
      ).find(candidate => candidate.closest('.astryx-layout') === layout);
      const firstChild = region.firstElementChild;
      const headerChild = header?.firstElementChild;
      return {
        insetCase: region.getAttribute('data-content-inset'),
        childBox: firstChild == null ? null : box(firstChild),
        headerChildBox: headerChild == null ? null : box(headerChild),
        targets: Array.from(region.classList).filter(name =>
          name.startsWith('astryx-'),
        ),
        role: region.getAttribute('role'),
        name: region.getAttribute('aria-label'),
        scrolls: region.scrollHeight > region.clientHeight + 1,
        overflowY: style.overflowY,
        direction: style.direction,
        box: box(region),
        parentBox: box(parent),
        applied: {
          inlineStart: px(style.paddingInlineStart),
          inlineEnd: px(style.paddingInlineEnd),
          blockStart: px(style.paddingBlockStart),
          blockEnd: px(style.paddingBlockEnd),
        },
        published: {
          inlineStart: resolve(
            region,
            'var(--container-padding-inline-start, 0px)',
          ),
          inlineEnd: resolve(
            region,
            'var(--container-padding-inline-end, 0px)',
          ),
          blockStart: resolve(
            region,
            'var(--container-padding-block-start, 0px)',
          ),
          blockEnd: resolve(region, 'var(--container-padding-block-end, 0px)'),
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
      regions,
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
      .locator('#storybook-root .astryx-layout-content')
      .first()
      .waitFor();
    await settle(page);

    const first = await observe(page);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page);
    const geometryStable =
      JSON.stringify(first.regions.map(region => region.box)) ===
      JSON.stringify(observed.regions.map(region => region.box));

    const failures: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) {
        failures.push(message);
      }
    };
    const near = (actual: number, expected: number, tolerance = 0.6) =>
      Math.abs(actual - expected) <= tolerance;

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
      observed.steps[4] > 0 && observed.steps[6] > observed.steps[4],
      `spacing steps ${JSON.stringify(observed.steps)}`,
    );
    check(
      observed.regions.length === REGIONS[item.story],
      `${observed.regions.length} content regions, expected ${REGIONS[item.story]}`,
    );
    if (item.viewport !== NARROW) {
      check(
        observed.documentOverflow <= 0,
        `document scrolls sideways by ${observed.documentOverflow}px`,
      );
    }

    const insetCases = new Set<string>();
    observed.regions.forEach((region, index) => {
      const where = `content ${index}${region.insetCase ? ` (${region.insetCase})` : ''}`;
      // One `layout-content` target; it scrolls by default.
      check(
        JSON.stringify(region.targets) === '["astryx-layout-content"]',
        `${where} targets ${region.targets.join(' ')}`,
      );
      check(
        region.overflowY === 'auto',
        `${where} overflow ${region.overflowY}`,
      );
      check(
        region.direction === item.direction,
        `${where} direction ${region.direction}`,
      );
      // It fills the area Layout gives it.
      check(
        near(region.box.width, region.parentBox.width) &&
          near(region.box.height, region.parentBox.height),
        `${where} ${JSON.stringify(region.box)} does not fill ${JSON.stringify(region.parentBox)}`,
      );
      // Without a caller role, a region that fits exposes no role or name; a
      // scrolling one is a named group.
      if (region.role !== 'main' && region.role !== 'region') {
        if (region.scrolls) {
          check(
            region.role === 'group' && Boolean(region.name),
            `${where} scrolls with role ${region.role} name ${region.name}`,
          );
        } else {
          check(
            region.role == null && region.name == null,
            `${where} fits but has role ${region.role} name ${region.name}`,
          );
        }
      }
      // The region publishes the padding it applies. With a content width,
      // the applied inline padding may add the alignment gutter on top.
      for (const edge of EDGES) {
        const applied = region.applied[edge];
        const published = region.published[edge];
        const isInline = edge === 'inlineStart' || edge === 'inlineEnd';
        // With one start panel, only the open end edge carries the gutter.
        const hasGutter =
          (CONTENT_WIDTH.has(item.story) && isInline) ||
          (ALIGNED_TO_HEADER.has(region.insetCase ?? '') &&
            edge === 'inlineEnd');
        if (hasGutter) {
          check(
            applied >= published - 0.6,
            `${where} ${edge} applies ${applied}, less than its published ${published}`,
          );
        } else {
          check(
            near(applied, published),
            `${where} ${edge} applies ${applied} but publishes ${published}`,
          );
        }
      }
      if (region.insetCase != null) {
        insetCases.add(region.insetCase);
        const expected = INSETS[region.insetCase] ?? {};
        for (const edge of EDGES) {
          const step = expected[edge];
          if (step == null) {
            continue;
          }
          const value = step === 0 ? 0 : observed.steps[step];
          check(
            near(region.applied[edge], value),
            `${where} ${edge} applies ${region.applied[edge]}, expected ${value} (step ${step})`,
          );
        }
      }
    });
    observed.regions
      .filter(region => ALIGNED_TO_HEADER.has(region.insetCase ?? ''))
      .forEach(region => {
        const where = `content (${region.insetCase})`;
        const child = region.childBox;
        const headerChild = region.headerChildBox;
        check(
          child != null && headerChild != null,
          `${where} has no child or header child to compare`,
        );
        if (child != null && headerChild != null) {
          const isRtl = item.direction === 'rtl';
          const childEnd = isRtl ? child.left : child.right;
          const frameEnd = isRtl ? headerChild.left : headerChild.right;
          const expectedEnd = isRtl
            ? frameEnd + observed.steps[6]
            : frameEnd - observed.steps[6];
          check(
            near(childEnd, expectedEnd),
            `${where} children end at ${childEnd}, expected ${expectedEnd} (frame end ${frameEnd}, inset ${observed.steps[6]})`,
          );
        }
      });
    if (item.story === 'content-insets') {
      check(
        JSON.stringify([...insetCases].sort()) ===
          JSON.stringify(Object.keys(INSETS).sort()),
        `inset cases ${[...insetCases].join(',')}`,
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
        regions: REGIONS[item.story],
        anatomy:
          'each region carries only the astryx-layout-content target, scrolls overflow, fills the area Layout gives it, and follows the page direction',
        semantics:
          'without a caller main or region role, a region that fits has no role or name and a scrolling region is a named group',
        publication: CONTENT_WIDTH.has(item.story)
          ? 'block padding equals the published block padding; inline padding is at least the published inline padding'
          : 'every edge applies exactly the padding it publishes, except the open end edge of the content-width start-panel case, which is at least what it publishes',
        alignedToHeader:
          item.story === 'content-insets'
            ? 'in the content-width start-panel case, the first content child ends one step-6 inset inside the end of the first header child, which spans the content-width frame'
            : 'not applicable',
        insets: item.story === 'content-insets' ? INSETS : 'not applicable',
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
        component: 'core/LayoutContent',
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
