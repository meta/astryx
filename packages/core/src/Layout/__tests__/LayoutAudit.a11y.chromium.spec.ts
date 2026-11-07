// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Layout

/**
 * @file LayoutAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/Layout stories across themes, modes, direction, and width
 * @output Screenshots and fail-closed sensor receipts for the Layout whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a Layout audit pull request
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

const OUTPUT = path.resolve('layout-audit-evidence');
const WIDE = {width: 1280, height: 800};
const TALL = {width: 1280, height: 1400};
const NARROW = {width: 320, height: 900};

type Mode = 'light' | 'dark';
type Theme = 'neutral' | 'butter';
type Direction = 'ltr' | 'rtl';
type Story =
  | 'basic-card'
  | 'with-sidebar'
  | 'dual-panels'
  | 'no-dividers'
  | 'full-bleed-content'
  | 'content-only'
  | 'closed-regions'
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

// The number of Layout roots each story renders, so a story that stops
// rendering one fails instead of passing with nothing to check.
const LAYOUTS: Record<Story, number> = {
  'basic-card': 1,
  'with-sidebar': 1,
  'dual-panels': 1,
  'no-dividers': 1,
  'full-bleed-content': 1,
  'content-only': 1,
  'closed-regions': 3,
  'content-width-scrollbar-placement': 4,
  'nested-in-app-shell': 3,
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

add('basic-card');
add('basic-card', {theme: 'butter', modes: ['light']});
add('with-sidebar');
add('with-sidebar', {direction: 'rtl', modes: ['light']});
add('dual-panels', {modes: ['light']});
add('dual-panels', {direction: 'rtl', modes: ['light']});
add('no-dividers', {modes: ['light']});
add('full-bleed-content', {modes: ['light']});
add('content-only', {modes: ['light']});
add('closed-regions');
add('closed-regions', {theme: 'butter', modes: ['light']});
add('closed-regions', {direction: 'rtl', modes: ['light']});
add('content-width-scrollbar-placement', {modes: ['light'], viewport: TALL});
add('nested-in-app-shell', {modes: ['light']});
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
    type Box = {
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    };
    function box(element: Element): Box {
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
    function padding(element: Element) {
      const style = getComputedStyle(element);
      return {
        blockStart: px(style.paddingBlockStart),
        blockEnd: px(style.paddingBlockEnd),
        inlineStart: px(style.paddingInlineStart),
        inlineEnd: px(style.paddingInlineEnd),
      };
    }
    const EDGES = [
      'inline-start',
      'inline-end',
      'block-start',
      'block-end',
    ] as const;
    // Resolve each published padding to pixels in the element's own scope:
    // the custom property holds an unresolved length such as a rem value.
    function published(element: Element) {
      const values = EDGES.map(edge => {
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;visibility:hidden;width:var(--container-padding-${edge}, 0px)`;
        element.appendChild(probe);
        const width = px(getComputedStyle(probe).width);
        probe.remove();
        return [edge, width];
      });
      return Object.fromEntries(values) as Record<
        (typeof EDGES)[number],
        number
      >;
    }
    const REGION_KINDS = ['header', 'panel', 'content', 'footer'] as const;
    function regionKind(element: Element) {
      return REGION_KINDS.find(kind =>
        element.classList.contains(`astryx-layout-${kind}`),
      );
    }
    function regionsOf(root: Element) {
      return Array.from(
        root.querySelectorAll(
          REGION_KINDS.map(kind => `.astryx-layout-${kind}`).join(','),
        ),
      ).filter(region => region.closest('.astryx-layout') === root);
    }

    const roots = Array.from(
      document.querySelectorAll('#storybook-root .astryx-layout'),
    );
    const layouts = roots.map(root => {
      const style = getComputedStyle(root);
      const inner = root.firstElementChild;
      return {
        role: root.getAttribute('role'),
        ariaLabel: root.getAttribute('aria-label'),
        ariaLabelledby: root.getAttribute('aria-labelledby'),
        height: root.getAttribute('data-height'),
        targets: Array.from(root.classList).filter(name =>
          name.startsWith('astryx-'),
        ),
        background: style.backgroundColor,
        direction: style.direction,
        box: box(root),
        margins: {
          'inline-start': px(style.marginInlineStart),
          'inline-end': px(style.marginInlineEnd),
          'block-start': px(style.marginBlockStart),
          'block-end': px(style.marginBlockEnd),
        },
        parentPublished: published(root.parentElement as Element),
        innerPublished: inner == null ? null : published(inner),
        frame: box(root.parentElement as Element),
        regions: regionsOf(root).map(region => ({
          kind: regionKind(region),
          box: box(region),
        })),
      };
    });

    function closedCase(name: string) {
      const host = document.querySelector(`[data-closed-region="${name}"]`);
      if (host == null) {
        return null;
      }
      const root = host.querySelector('.astryx-layout');
      const content = root?.querySelector('.astryx-layout-content');
      if (root == null || content == null) {
        return {found: false as const};
      }
      const hostBox = box(host);
      const contentBox = box(content);
      return {
        found: true as const,
        regionKinds: regionsOf(root).map(regionKind),
        rootBox: box(root),
        contentBox,
        contentOffset: {
          inlineStart: round(contentBox.left - hostBox.left),
          inlineEnd: round(hostBox.right - contentBox.right),
          blockStart: round(contentBox.top - hostBox.top),
          blockEnd: round(hostBox.bottom - contentBox.bottom),
        },
        contentPadding: padding(content),
      };
    }

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
      layouts,
      closed: {
        omitted: closedCase('omitted'),
        closed: closedCase('closed'),
        contentWidth: closedCase('content-width'),
      },
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
    await page.locator('#storybook-root .astryx-layout').first().waitFor();
    await settle(page);

    const first = await observe(page);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page);
    const geometryStable =
      JSON.stringify(first.layouts.map(layout => layout.box)) ===
      JSON.stringify(observed.layouts.map(layout => layout.box));

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
      observed.layouts.length === LAYOUTS[item.story],
      `${observed.layouts.length} layouts, expected ${LAYOUTS[item.story]}`,
    );
    if (item.viewport !== NARROW) {
      check(
        observed.documentOverflow <= 0,
        `document scrolls sideways by ${observed.documentOverflow}px`,
      );
    }

    observed.layouts.forEach((layout, index) => {
      const where = `layout ${index}`;
      // Layout adds no role or name.
      check(
        layout.role == null &&
          layout.ariaLabel == null &&
          layout.ariaLabelledby == null,
        `${where} role ${layout.role} label ${layout.ariaLabel} labelledby ${layout.ariaLabelledby}`,
      );
      // One `layout` target that reflects height; Layout paints nothing.
      check(
        JSON.stringify(layout.targets) === '["astryx-layout"]',
        `${where} targets ${layout.targets.join(' ')}`,
      );
      check(
        layout.height === 'fill' || layout.height === 'auto',
        `${where} data-height ${layout.height}`,
      );
      check(
        layout.background === 'rgba(0, 0, 0, 0)',
        `${where} paints background ${layout.background}`,
      );
      check(
        layout.direction === item.direction,
        `${where} direction ${layout.direction}`,
      );
      // The root escapes the published container padding on all four
      // edges, and the inner stack publishes zero.
      for (const [edge, value] of Object.entries(layout.parentPublished)) {
        const margin =
          layout.margins[edge as keyof typeof layout.margins] ?? NaN;
        check(
          near(margin, -value),
          `${where} margin ${edge} ${margin}, expected ${-value}`,
        );
      }
      check(
        layout.innerPublished != null &&
          Object.values(layout.innerPublished).every(value => value === 0),
        `${where} inner stack publishes ${JSON.stringify(layout.innerPublished)}`,
      );
      // Header, then the middle row, then footer, in DOM and on screen;
      // the start panel sits at the inline start of the content.
      const rank = {header: 0, panel: 1, content: 1, footer: 2} as const;
      const kinds = layout.regions.map(region => region.kind);
      const ranks = kinds.map(kind => (kind == null ? -1 : rank[kind]));
      check(
        ranks.every((value, at) => at === 0 || value >= ranks[at - 1]),
        `${where} region order ${kinds.join(',')}`,
      );
      const contentAt = kinds.indexOf('content');
      const header = layout.regions.find(region => region.kind === 'header');
      const footer = layout.regions.find(region => region.kind === 'footer');
      layout.regions.forEach((region, at) => {
        const label = `${where} ${region.kind} ${at}`;
        check(
          region.box.left >= layout.box.left - 0.5 &&
            region.box.right <= layout.box.right + 0.5,
          `${label} ${JSON.stringify(region.box)} leaves layout ${JSON.stringify(layout.box)}`,
        );
        if (region.kind === 'panel' || region.kind === 'content') {
          if (header != null) {
            check(
              region.box.top >= header.box.bottom - 0.5,
              `${label} starts above the header`,
            );
          }
          if (footer != null) {
            check(
              region.box.bottom <= footer.box.top + 0.5,
              `${label} ends below the footer`,
            );
          }
        }
        if (region.kind === 'panel' && contentAt >= 0) {
          const content = layout.regions[contentAt].box;
          const isStart = at < contentAt;
          const towardStart =
            item.direction === 'rtl'
              ? region.box.left >= content.right - 0.5
              : region.box.right <= content.left + 0.5;
          const towardEnd =
            item.direction === 'rtl'
              ? region.box.right <= content.left + 0.5
              : region.box.left >= content.right - 0.5;
          check(
            isStart ? towardStart : towardEnd,
            `${label} is not at the inline ${isStart ? 'start' : 'end'} of the content`,
          );
        }
      });
    });

    // A slot left `false` by `isOpen && <Region />` is
    // absent. The closed column matches the column that omits the slots,
    // and a closed end panel gives the no-panel content-width composition.
    if (item.story === 'closed-regions') {
      const {omitted, closed, contentWidth} = observed.closed;
      check(
        omitted?.found === true &&
          closed?.found === true &&
          contentWidth?.found === true,
        'closed-regions fixtures missing',
      );
      if (omitted?.found && closed?.found) {
        check(
          JSON.stringify(closed.regionKinds) === '["content"]',
          `closed layout renders ${closed.regionKinds.join(',')}`,
        );
        for (const [side, value] of Object.entries(omitted.contentPadding)) {
          const actual =
            closed.contentPadding[side as keyof typeof closed.contentPadding];
          check(
            near(actual, value),
            `closed content padding ${side} ${actual}, expected ${value} as when the slots are omitted`,
          );
        }
        for (const [side, value] of Object.entries(omitted.contentOffset)) {
          const actual =
            closed.contentOffset[side as keyof typeof closed.contentOffset];
          check(
            near(actual, value),
            `closed content offset ${side} ${actual}, expected ${value} as when the slots are omitted`,
          );
        }
      }
      if (contentWidth?.found) {
        check(
          JSON.stringify(contentWidth.regionKinds) === '["header","content"]',
          `content-width layout renders ${contentWidth.regionKinds.join(',')}`,
        );
        check(
          near(contentWidth.contentBox.left, contentWidth.rootBox.left) &&
            near(contentWidth.contentBox.right, contentWidth.rootBox.right),
          `content ${JSON.stringify(contentWidth.contentBox)} does not span the layout ${JSON.stringify(contentWidth.rootBox)}`,
        );
      }
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
        layouts: LAYOUTS[item.story],
        anatomy:
          'each Layout root carries only the astryx-layout target, reflects data-height fill or auto, paints no background, and has no role, aria-label, or aria-labelledby',
        padding:
          'each root margin is the negative of the container padding published to it on all four edges; the inner stack publishes zero on all four edges',
        order:
          'regions run header, middle row, footer in DOM and on screen; panels and content sit below the header and above the footer; a panel before the content sits at its inline start and one after it at its inline end; every region stays inside its layout horizontally',
        closedRegions:
          item.story === 'closed-regions'
            ? 'the closed layout renders only content, with the same padding and the same offsets inside its card as the layout that omits the slots; with contentWidth and a closed end panel, the content spans the whole layout'
            : 'not applicable',
        overflow:
          item.viewport === NARROW
            ? 'not asserted at the document: the story frames are wider than 320px; regions stay inside their layouts'
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
        component: 'core/Layout',
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
