// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Heading

/**
 * @file HeadingAudit.a11y.chromium.spec.ts
 * @input Exact-head Heading audit matrix across themes, modes, direction, and viewport
 * @output Screenshots and fail-closed sensor receipts for the Heading whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a Heading audit pull request
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

const OUTPUT = path.resolve('heading-audit-evidence');
const STORY_ID = 'core-heading--audit-matrix';
const WIDE = {width: 1024, height: 1100};
const NARROW = {width: 320, height: 1400};

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

const EXPECTED_CASES = [
  'level-2',
  'outline-equal',
  'outline-override',
  'display-1',
  'display-2',
  'display-3',
  'display-weight',
  'secondary',
  'justify-center',
  'justify-end',
  'truncate-1',
  'truncate-2',
  'long-token',
];

// Element and accessible level each case must expose (AR1, AR2).
const OUTLINE: Record<string, {tag: string; level: number}> = {
  'level-2': {tag: 'H2', level: 2},
  'outline-equal': {tag: 'H3', level: 3},
  'outline-override': {tag: 'H2', level: 4},
  'display-1': {tag: 'H2', level: 2},
  'display-2': {tag: 'H2', level: 2},
  'display-3': {tag: 'H2', level: 2},
  'display-weight': {tag: 'H2', level: 2},
  secondary: {tag: 'H3', level: 3},
  'justify-center': {tag: 'H4', level: 4},
  'justify-end': {tag: 'H4', level: 4},
  'truncate-1': {tag: 'H3', level: 3},
  'truncate-2': {tag: 'H3', level: 3},
  'long-token': {tag: 'H3', level: 3},
};

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
    type Rgba = {r: number; g: number; b: number; a: number};
    function parseColor(color: string): Rgba | null {
      const match = color.match(/rgba?\(([^)]+)\)/);
      if (!match) {
        return null;
      }
      const [r, g, b, a = 1] = match[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return {r, g, b, a};
    }
    function over(top: Rgba, bottom: Rgba): Rgba {
      return {
        r: top.r * top.a + bottom.r * (1 - top.a),
        g: top.g * top.a + bottom.g * (1 - top.a),
        b: top.b * top.a + bottom.b * (1 - top.a),
        a: 1,
      };
    }
    // The painted backdrop behind an element: every translucent ancestor
    // fill down to the first opaque one (or a white canvas when none is).
    function backdrop(element: Element): Rgba {
      const layers: Rgba[] = [];
      for (
        let node: Element | null = element;
        node != null;
        node = node.parentElement
      ) {
        const color = parseColor(getComputedStyle(node).backgroundColor);
        if (color != null && color.a > 0) {
          layers.push(color);
          if (color.a >= 1) {
            break;
          }
        }
      }
      let result: Rgba = {r: 255, g: 255, b: 255, a: 1};
      for (const layer of layers.reverse()) {
        result = over(layer, result);
      }
      return result;
    }
    function luminance({r, g, b}: Rgba): number {
      const [lr, lg, lb] = [r, g, b].map(channel => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    }
    function contrast(element: Element): number | null {
      const fg = parseColor(getComputedStyle(element).color);
      if (fg == null) {
        return null;
      }
      const bg = backdrop(element);
      const a = luminance(over(fg, bg));
      const b = luminance(bg);
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    }
    const round = (value: number) => Math.round(value * 10) / 10;

    const headings = Array.from(
      document.querySelectorAll<HTMLElement>('[data-audit-case]'),
    ).map(heading => {
      const style = getComputedStyle(heading);
      const rect = heading.getBoundingClientRect();
      const column = heading.parentElement?.getBoundingClientRect() ?? null;
      const fontSize = Number.parseFloat(style.fontSize);
      const lineHeight = Number.parseFloat(style.lineHeight);
      return {
        auditCase: heading.getAttribute('data-audit-case'),
        tagName: heading.tagName,
        ariaLevel: heading.getAttribute('aria-level'),
        title: heading.getAttribute('title'),
        hasTarget: heading.classList.contains('astryx-heading'),
        dataLevel: heading.getAttribute('data-level'),
        dataType: heading.getAttribute('data-type'),
        dataWeight: heading.getAttribute('data-weight'),
        dataColor: heading.getAttribute('data-color'),
        tabIndex: heading.tabIndex,
        text: heading.textContent,
        fontSize,
        fontWeight: Number.parseFloat(style.fontWeight),
        lineHeight: Number.isFinite(lineHeight) ? lineHeight : null,
        textAlign: style.textAlign,
        direction: style.direction,
        whiteSpace: style.whiteSpace,
        textOverflow: style.textOverflow,
        lineClamp: style.webkitLineClamp,
        display: style.display,
        scrollWidth: heading.scrollWidth,
        clientWidth: heading.clientWidth,
        scrollHeight: heading.scrollHeight,
        clientHeight: heading.clientHeight,
        contrast: contrast(heading),
        color: style.color,
        geometry: {
          x: round(rect.x),
          y: round(rect.y),
          width: round(rect.width),
          height: round(rect.height),
        },
        escapesColumn:
          column != null &&
          (rect.left < column.left - 1 || rect.right > column.right + 1),
      };
    });
    const root = document.querySelector<HTMLElement>('[data-audit-case]');
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
      cases: headings.map(heading => heading.auditCase),
      expectedCases,
      headings,
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
      JSON.stringify(first.headings.map(heading => heading.geometry)) ===
      JSON.stringify(observed.headings.map(heading => heading.geometry));

    const failures: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) {
        failures.push(message);
      }
    };
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

    const byCase = Object.fromEntries(
      observed.headings.map(heading => [heading.auditCase, heading]),
    );

    // AR1, AR2: the browser's computed role and level, not the DOM tag alone.
    for (const [id, outline] of Object.entries(OUTLINE)) {
      const heading = byCase[id];
      check(heading != null, `${id}: missing`);
      if (heading == null) {
        continue;
      }
      check(
        heading.tagName === outline.tag,
        `${id}: renders ${heading.tagName}`,
      );
      const exposed = page
        .getByRole('heading', {level: outline.level})
        .and(page.locator(`[data-audit-case="${id}"]`));
      check(
        (await exposed.count()) === 1,
        `${id}: not exposed as a level ${outline.level} heading`,
      );
      check(heading.hasTarget, `${id}: no astryx-heading target`);
      check(
        heading.dataLevel === outline.tag.slice(1),
        `${id}: data-level ${heading.dataLevel}`,
      );
      check(heading.title == null, `${id}: native title ${heading.title}`);
    }
    check(
      byCase['outline-equal']?.ariaLevel == null,
      'outline-equal: carries aria-level although it matches level',
    );
    check(
      byCase['outline-override']?.ariaLevel === '4',
      'outline-override: aria-level is not 4',
    );

    // FR2, ORD1, ORD2: display types replace the level scale in order; an
    // explicit bold weight is reflected and is heavier than the type's default.
    const d1 = byCase['display-1'];
    const d2 = byCase['display-2'];
    const d3 = byCase['display-3'];
    const dw = byCase['display-weight'];
    if (d1 && d2 && d3 && dw) {
      check(
        d1.fontSize > d2.fontSize && d2.fontSize > d3.fontSize,
        `display scale order ${d1.fontSize} > ${d2.fontSize} > ${d3.fontSize}`,
      );
      for (const [id, heading] of [
        ['display-1', d1],
        ['display-2', d2],
        ['display-3', d3],
      ] as const) {
        check(heading.dataType === id, `${id}: data-type ${heading.dataType}`);
      }
      check(dw.dataWeight === 'bold', `display-weight: data-weight`);
      check(
        dw.fontWeight > d2.fontWeight,
        `display-weight: ${dw.fontWeight} not heavier than display-2 ${d2.fontWeight}`,
      );
      check(
        dw.fontSize === d2.fontSize,
        `display-weight: size ${dw.fontSize} differs from display-2 ${d2.fontSize}`,
      );
    }
    check(byCase.secondary?.dataColor === 'secondary', 'secondary: data-color');

    // FR3: logical alignment.
    check(
      byCase['justify-center']?.textAlign === 'center',
      `justify-center: ${byCase['justify-center']?.textAlign}`,
    );
    check(
      byCase['justify-end']?.textAlign === 'end',
      `justify-end: ${byCase['justify-end']?.textAlign}`,
    );

    // FR4: one clipped line with an ellipsis; a two-line clamp.
    const t1 = byCase['truncate-1'];
    if (t1) {
      check(
        t1.whiteSpace === 'nowrap',
        `truncate-1: white-space ${t1.whiteSpace}`,
      );
      check(
        t1.textOverflow === 'ellipsis',
        `truncate-1: text-overflow ${t1.textOverflow}`,
      );
      check(t1.scrollWidth > t1.clientWidth, 'truncate-1: not truncated');
    }
    const t2 = byCase['truncate-2'];
    if (t2) {
      check(t2.lineClamp === '2', `truncate-2: line clamp ${t2.lineClamp}`);
      check(t2.scrollHeight > t2.clientHeight + 1, 'truncate-2: not clamped');
      check(t2.lineHeight != null, 'truncate-2: line height not measurable');
      if (t2.lineHeight != null) {
        check(
          Math.abs(t2.geometry.height - 2 * t2.lineHeight) <= 2,
          `truncate-2: height ${t2.geometry.height} is not two lines`,
        );
      }
    }

    // WCAG 2.2 SC 1.4.3 against the composited backdrop; large text is at
    // least 24px, or 18.66px at weight 700 and above.
    for (const heading of observed.headings) {
      const id = heading.auditCase ?? 'unknown';
      const isLarge =
        heading.fontSize >= 24 ||
        (heading.fontSize >= 18.66 && heading.fontWeight >= 700);
      const threshold = isLarge ? 3 : 4.5;
      check(
        heading.contrast != null && heading.contrast >= threshold,
        `${id}: contrast ${heading.contrast} below ${threshold}`,
      );
      check(heading.direction === item.direction, `${id}: direction`);
      if (id !== 'long-token') {
        check(!heading.escapesColumn, `${id}: escapes its column`);
      }
    }

    const png = await page.screenshot({animations: 'disabled', fullPage: true});
    check(png.length > 1000, 'screenshot is empty');

    // FR4 pointer path: hovering the clipped heading shows its full text.
    const fullText = t1?.text ?? '';
    await page.locator('[data-audit-case="truncate-1"]').hover();
    const tooltip = page.getByRole('tooltip').filter({hasText: fullText});
    const tooltipOnHover = await tooltip
      .waitFor({state: 'visible', timeout: 3000})
      .then(() => true)
      .catch(() => false);
    check(tooltipOnHover, 'truncate-1: hover shows no full-text tooltip');
    await page.mouse.move(0, 0);

    // FR4 keyboard path: recorded, not asserted. The contract lists this as
    // an implementation gap (the heading is not focusable).
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    let keyboardReachesTruncatedHeading = false;
    for (let step = 0; step < 20; step += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(
        () => document.activeElement?.getAttribute('data-audit-case') ?? null,
      );
      if (focused === 'truncate-1') {
        keyboardReachesTruncatedHeading = true;
        break;
      }
    }

    const longToken = byCase['long-token'];
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
        outline: OUTLINE,
        truncation:
          'truncate-1 clips one line with an ellipsis and shows its full text on hover; truncate-2 clamps two lines; no native title',
      },
      observed: {
        build: storybookSha,
        ...observed,
        geometryStable,
        pageErrors,
        tooltipOnHover,
      },
      observations: {
        keyboardReachesTruncatedHeading,
        longToken: longToken
          ? {
              overflowsItsBox: longToken.scrollWidth > longToken.clientWidth,
              escapesColumn: longToken.escapesColumn,
              documentOverflow: observed.documentOverflow,
            }
          : null,
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
        component: 'core/Heading',
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
