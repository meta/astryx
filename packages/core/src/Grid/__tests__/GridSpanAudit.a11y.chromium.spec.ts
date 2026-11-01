// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit GridSpan

/**
 * @file GridSpanAudit.a11y.chromium.spec.ts
 * @input Exact-head GridSpan span matrix across themes, modes, direction, and viewport
 * @output Screenshots and fail-closed sensor receipts for the GridSpan whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a GridSpan audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('grid-span-audit-evidence');
const STORY_ID = 'core-gridspan--span-matrix';
const WIDE = {width: 1024, height: 900};
const NARROW = {width: 320, height: 1100};
const ROW_HEIGHT = 48;

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter';

type AuditCase = {
  key: string;
  mode: Mode;
  direction: Direction;
  theme: Theme;
  viewport: {width: number; height: number};
};

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
  failures: string[];
};

const EXPECTED_CASES = ['numeric', 'full', 'rows', 'long-content', 'aligned'];

const cases: AuditCase[] = [];
function addPair(
  key: string,
  options: Partial<Omit<AuditCase, 'key' | 'mode'>> = {},
) {
  for (const mode of ['light', 'dark'] as const) {
    cases.push({
      key: `${key}-${mode}`,
      mode,
      direction: options.direction ?? 'ltr',
      theme: options.theme ?? 'neutral',
      viewport: options.viewport ?? WIDE,
    });
  }
}

addPair('default');
addPair('custom-theme', {theme: 'butter'});
addPair('rtl', {direction: 'rtl'});
addPair('narrow', {viewport: NARROW});

test.describe.configure({mode: 'serial', retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=${STORY_ID}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
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
  return page.evaluate((expectedCases: string[]) => {
    const round = (value: number) => Math.round(value * 10) / 10;
    function box(element: Element | null) {
      if (element == null) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        left: round(rect.left),
        right: round(rect.right),
        top: round(rect.top),
        bottom: round(rect.bottom),
        width: round(rect.width),
        height: round(rect.height),
      };
    }
    function tracks(value: string): number[] {
      return value
        .split(' ')
        .map(part => Number.parseFloat(part))
        .filter(part => Number.isFinite(part));
    }

    const spans = Array.from(
      document.querySelectorAll<HTMLElement>('[data-audit-case]'),
    ).map(span => {
      const grid = span.parentElement as HTMLElement;
      const gridStyle = getComputedStyle(grid);
      const style = getComputedStyle(span);
      const child = span.firstElementChild;
      return {
        auditCase: span.getAttribute('data-audit-case'),
        className: span.className,
        hasTarget: span.classList.contains('astryx-grid-span'),
        tagName: span.tagName,
        role: span.getAttribute('role'),
        tabIndex: span.getAttribute('tabindex'),
        ariaLabel: span.getAttribute('aria-label'),
        inlineGridColumn: span.style.gridColumn,
        inlineGridRow: span.style.gridRow,
        display: style.display,
        innerTracks: tracks(style.gridTemplateColumns),
        minWidth: style.minWidth,
        direction: style.direction,
        gridColumnTracks: tracks(gridStyle.gridTemplateColumns),
        gridRowTracks: tracks(gridStyle.gridTemplateRows),
        columnGap: Number.parseFloat(gridStyle.columnGap) || 0,
        rowGap: Number.parseFloat(gridStyle.rowGap) || 0,
        gridPaddingInline:
          (Number.parseFloat(gridStyle.paddingLeft) || 0) +
          (Number.parseFloat(gridStyle.paddingRight) || 0),
        span: box(span),
        grid: box(grid),
        child: box(child),
        childOverflowsSpan:
          child != null &&
          (child.getBoundingClientRect().left <
            span.getBoundingClientRect().left - 0.5 ||
            child.getBoundingClientRect().right >
              span.getBoundingClientRect().right + 0.5),
      };
    });
    const host = document.querySelector('[data-audit-host="long-content"]');
    const truncating = host?.querySelector('[data-audit-text="long-content"]');
    const plain = document.querySelector('[data-audit-item="aligned-plain"]');
    const tall = plain?.previousElementSibling ?? null;
    const root = document.querySelector<HTMLElement>('.astryx-grid-span');
    return {
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      direction: root ? getComputedStyle(root).direction : null,
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      fonts: document.fonts.status,
      runningAnimations: document
        .getAnimations()
        .filter(animation => animation.playState === 'running').length,
      storybookError:
        document.querySelector('.sb-show-errordisplay') != null ||
        document.body.classList.contains('sb-show-errordisplay'),
      cases: spans.map(span => span.auditCase),
      expectedCases,
      spans,
      longContent: {
        host: box(host ?? null),
        text: box(truncating ?? null),
        textClipped:
          truncating != null &&
          (truncating as HTMLElement).scrollWidth >
            (truncating as HTMLElement).clientWidth,
      },
      aligned: {
        tall: box(tall),
        plain: box(plain),
      },
    };
  }, EXPECTED_CASES);
}

test.beforeAll(async () => {
  fs.rmSync(OUTPUT, {recursive: true, force: true});
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
      deviceScaleFactor: 1,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page.locator('#storybook-root').waitFor();
    await expect(page.locator('[data-audit-case]')).toHaveCount(
      EXPECTED_CASES.length,
    );

    await settle(page);
    const first = await observe(page);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page);
    const geometryStable =
      JSON.stringify(first.spans.map(span => span.span)) ===
      JSON.stringify(observed.spans.map(span => span.span));

    const failures: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) {
        failures.push(message);
      }
    };
    const near = (actual: number, expected: number) =>
      Math.abs(actual - expected) <= 1;

    check(storybookSha === checkoutSha, 'storybook build mismatch');
    check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
    check(!observed.storybookError, 'storybook error display');
    check(observed.theme === item.theme, `theme ${observed.theme}`);
    check(observed.mode === item.mode, `mode ${observed.mode}`);
    check(
      observed.direction === item.direction,
      `direction ${observed.direction}`,
    );
    check(
      observed.viewport.width === item.viewport.width &&
        observed.viewport.height === item.viewport.height,
      'viewport mismatch',
    );
    check(observed.dpr === 1, `dpr ${observed.dpr}`);
    check(observed.reducedMotion, 'reduced motion not applied');
    check(observed.fonts === 'loaded', `fonts ${observed.fonts}`);
    check(observed.runningAnimations === 0, 'animations still running');
    check(geometryStable, 'geometry changed between samples');
    check(
      JSON.stringify(observed.cases) === JSON.stringify(EXPECTED_CASES),
      `cases ${observed.cases.join(',')}`,
    );
    check(!observed.documentOverflow, 'document scrolls horizontally');

    const spanAlignedObservation: Record<string, unknown> = {};
    for (const span of observed.spans) {
      const id = span.auditCase ?? 'unknown';
      const spanBox = span.span;
      const gridBox = span.grid;
      if (spanBox == null || gridBox == null) {
        check(false, `${id}: span or grid not measured`);
        continue;
      }
      // FR1: one div carrying the grid-span target, a one-track grid with a
      // zero minimum width. AR1: no role, name, or tab stop of its own.
      check(span.tagName === 'DIV', `${id}: renders ${span.tagName}`);
      check(span.hasTarget, `${id}: no astryx-grid-span target`);
      check(span.display === 'grid', `${id}: display ${span.display}`);
      check(
        span.innerTracks.length === 1,
        `${id}: inner tracks ${span.innerTracks.join(' ')}`,
      );
      check(span.minWidth === '0px', `${id}: min-width ${span.minWidth}`);
      check(
        span.role == null && span.tabIndex == null && span.ariaLabel == null,
        `${id}: span adds role, tab stop, or name`,
      );
      check(span.direction === item.direction, `${id}: direction`);
      check(!span.childOverflowsSpan, `${id}: content escapes the span`);

      const [firstTrack = 0, secondTrack = 0] = span.gridColumnTracks;
      // Auto placement puts every audited span at the inline start.
      const startEdgeMatches =
        item.direction === 'rtl'
          ? near(spanBox.right, gridBox.right)
          : near(spanBox.left, gridBox.left);

      if (id === 'numeric') {
        // FR2: columns={2} spans two explicit tracks and one gap.
        check(span.inlineGridColumn === 'span 2', `${id}: inline column`);
        check(
          near(spanBox.width, firstTrack + secondTrack + span.columnGap),
          `${id}: width ${spanBox.width} is not two tracks plus a gap`,
        );
        check(startEdgeMatches, `${id}: does not start at the inline start`);
      }
      if (id === 'full' || id === 'long-content') {
        // FR2: 'full' covers every explicit column, line 1 to -1.
        check(span.inlineGridColumn === '1 / -1', `${id}: inline column`);
        check(
          near(spanBox.width, gridBox.width - span.gridPaddingInline),
          `${id}: width ${spanBox.width} is not the grid's content width`,
        );
        check(startEdgeMatches, `${id}: does not start at the inline start`);
      }
      if (id === 'rows') {
        // FR2: rows={2} spans two rowHeight tracks and one row gap.
        check(span.inlineGridRow === 'span 2', `${id}: inline row`);
        check(
          near(spanBox.height, ROW_HEIGHT * 2 + span.rowGap),
          `${id}: height ${spanBox.height} is not two rows plus a gap`,
        );
        check(
          near(spanBox.width, firstTrack),
          `${id}: width ${spanBox.width} is not one track`,
        );
        check(startEdgeMatches, `${id}: does not start at the inline start`);
      }
      if (id === 'long-content') {
        // AR2: the zero minimum width keeps shrinkable content in its track.
        const host = observed.longContent.host;
        const text = observed.longContent.text;
        check(host != null && text != null, `${id}: host or text missing`);
        if (host != null && text != null) {
          check(
            spanBox.left >= host.left - 0.5 &&
              spanBox.right <= host.right + 0.5,
            `${id}: span escapes its 240px host`,
          );
          check(
            text.left >= host.left - 0.5 && text.right <= host.right + 0.5,
            `${id}: text escapes its 240px host`,
          );
        }
        check(observed.longContent.textClipped, `${id}: text did not truncate`);
      }
      if (id === 'aligned') {
        // Observation for the owner: Grid align="center" positions plain
        // items, while GridSpan's full height stretches its content.
        const tall = observed.aligned.tall;
        const plain = observed.aligned.plain;
        spanAlignedObservation.tall = tall;
        spanAlignedObservation.plain = plain;
        spanAlignedObservation.span = spanBox;
        spanAlignedObservation.spannedContent = span.child;
        if (tall != null && plain != null && span.child != null) {
          spanAlignedObservation.plainCentered =
            plain.height < tall.height - 1 &&
            near(plain.top - tall.top, tall.bottom - plain.bottom);
          spanAlignedObservation.spannedContentFillsRow = near(
            span.child.height,
            tall.height,
          );
        }
      }
    }

    const png = await page.screenshot({animations: 'disabled', fullPage: true});
    check(png.length > 1000, 'screenshot is empty');
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: STORY_ID,
        mode: item.mode,
        direction: item.direction,
        theme: item.theme,
        viewport: item.viewport,
        cases: EXPECTED_CASES,
        geometry:
          'numeric spans two tracks and a gap; full and long-content span the grid content width; rows spans two 48px rows and a gap; every span starts at the inline start',
        reflow:
          'no span content escapes its span, the long-content span and text stay inside the 240px host, and the document never scrolls horizontally',
      },
      observed: {
        build: storybookSha,
        ...observed,
        geometryStable,
        pageErrors,
      },
      observations: {
        alignCenter: spanAlignedObservation,
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
  });
}

test('manifest is complete', async () => {
  const receiptFiles = fs
    .readdirSync(OUTPUT)
    .filter(file => file.endsWith('.sensors.json'));
  const receipts = receiptFiles.map(
    (file): AuditReceipt =>
      JSON.parse(
        fs.readFileSync(path.join(OUTPUT, file), 'utf8'),
      ) as AuditReceipt,
  );
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        component: 'core/GridSpan',
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
  expect(receiptFiles).toHaveLength(cases.length);
  expect(
    receipts
      .filter(receipt => !receipt.passed)
      .map(receipt => ({frame: receipt.expected, failures: receipt.failures})),
  ).toEqual([]);
});
