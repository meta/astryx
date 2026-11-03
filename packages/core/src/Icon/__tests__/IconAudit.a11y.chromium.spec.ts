// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Icon

/**
 * @file IconAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/Icon stories across themes, modes, direction, and viewport
 * @output Screenshots and fail-closed sensor receipts for the Icon whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for an Icon audit pull request
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

const OUTPUT = path.resolve('icon-audit-evidence');
const WIDE = {width: 1024, height: 900};
const NARROW = {width: 320, height: 900};

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter';
type Story =
  | 'semantic-names'
  | 'all-colors'
  | 'non-semantic-colors'
  | 'all-sizes'
  | 'accessible-name'
  | 'inherit-color';

type AuditCase = {
  key: string;
  story: Story;
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

const SIZES = ['xsm', 'sm', 'md', 'lg'];
const NEUTRAL_SIZE_PX = [12, 16, 20, 24];
const SEMANTIC_COLORS = [
  'primary',
  'secondary',
  'tertiary',
  'disabled',
  'accent',
  'info',
  'success',
  'error',
  'warning',
];
const PALETTE_COLORS = [
  'blue',
  'red',
  'green',
  'gray',
  'cyan',
  'teal',
  'yellow',
  'orange',
  'pink',
  'purple',
];
// The token each color reads, as shipped. Used to read the expected
// computed color from a probe element in the same frame.
const COLOR_TOKEN: Record<string, string> = {
  primary: '--color-icon-primary',
  secondary: '--color-icon-secondary',
  tertiary: '--color-icon-secondary',
  disabled: '--color-icon-disabled',
  accent: '--color-accent',
  info: '--color-icon-info',
  success: '--color-icon-success',
  error: '--color-icon-error',
  warning: '--color-icon-warning',
  ...Object.fromEntries(PALETTE_COLORS.map(c => [c, `--color-icon-${c}`])),
};

const cases: AuditCase[] = [];
function add(
  story: Story,
  variant: string,
  options: Partial<Omit<AuditCase, 'key' | 'story' | 'mode'>> = {},
  modes: Mode[] = ['light', 'dark'],
) {
  for (const mode of modes) {
    cases.push({
      key: `${story}-${variant}-${mode}`,
      story,
      mode,
      direction: options.direction ?? 'ltr',
      theme: options.theme ?? 'neutral',
      viewport: options.viewport ?? WIDE,
    });
  }
}

add('semantic-names', 'neutral');
add('semantic-names', 'butter', {theme: 'butter'});
add('semantic-names', 'rtl', {direction: 'rtl'}, ['light']);
add('semantic-names', 'narrow', {viewport: NARROW}, ['light']);
add('all-colors', 'neutral');
add('all-colors', 'butter', {theme: 'butter'});
add('non-semantic-colors', 'neutral');
add('non-semantic-colors', 'narrow', {viewport: NARROW}, ['light']);
add('all-sizes', 'neutral');
add('accessible-name', 'neutral');
add('inherit-color', 'neutral');

test.describe.configure({retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=core-icon--${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
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

async function observe(page: Page, colorToken: Record<string, string>) {
  return page.evaluate(tokens => {
    const round = (value: number) => Math.round(value * 10) / 10;
    function box(element: Element) {
      const rect = element.getBoundingClientRect();
      return {
        left: round(rect.left),
        top: round(rect.top),
        width: round(rect.width),
        height: round(rect.height),
      };
    }
    function parseRgb(value: string) {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) {
        return null;
      }
      const [r, g, b, a = '1'] = match[1].split(/[\s,/]+/).filter(Boolean);
      return [Number(r), Number(g), Number(b), Number(a)];
    }
    function luminance(rgb: number[]) {
      const [r, g, b] = rgb
        .slice(0, 3)
        .map(v => v / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function backdrop(element: Element): string {
      let node: Element | null = element.parentElement;
      while (node) {
        const color = getComputedStyle(node).backgroundColor;
        const rgb = parseRgb(color);
        if (rgb && rgb[3] > 0) {
          return color;
        }
        node = node.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    }
    const root = document.querySelector('#storybook-root') ?? document.body;
    // Read tokens beside the first glyph so the probe sits inside the same
    // theme scope.
    const scope = root.querySelector('.astryx-icon')?.parentElement ?? root;
    const probe = document.createElement('span');
    scope.appendChild(probe);
    const tokenColor = (token: string) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };
    const resolvedTokens = Object.fromEntries(
      Object.entries(tokens).map(([name, token]) => [name, tokenColor(token)]),
    );
    probe.remove();
    const icons = Array.from(root.querySelectorAll('.astryx-icon')).map(
      icon => {
        const style = getComputedStyle(icon);
        const svg =
          icon.tagName.toLowerCase() === 'svg'
            ? icon
            : icon.querySelector('svg');
        const fg = parseRgb(style.color);
        const bgColor = backdrop(icon);
        const bg = parseRgb(bgColor);
        let contrast: number | null = null;
        if (fg && bg) {
          const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
          contrast = Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
        }
        return {
          tagName: icon.tagName.toLowerCase(),
          dataSize: icon.getAttribute('data-size'),
          dataColor: icon.getAttribute('data-color'),
          dataVariant: icon.getAttribute('data-variant'),
          ariaHidden: icon.getAttribute('aria-hidden'),
          role: icon.getAttribute('role'),
          ariaLabel: icon.getAttribute('aria-label'),
          tabIndex: icon.getAttribute('tabindex'),
          color: style.color,
          parentColor: icon.parentElement
            ? getComputedStyle(icon.parentElement).color
            : null,
          backdrop: bgColor,
          contrast,
          transform: style.transform,
          fontSize: style.fontSize,
          box: box(icon),
          glyphBox: svg ? box(svg) : null,
          glyphPaths: svg
            ? svg.querySelectorAll(
                'path, circle, rect, line, polyline, polygon, ellipse',
              ).length
            : 0,
        };
      },
    );
    return {
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      direction: getComputedStyle(root.querySelector('.astryx-icon') ?? root)
        .direction,
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
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
      resolvedTokens,
      icons,
    };
  }, colorToken);
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
      deviceScaleFactor: 1,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page.locator('#storybook-root .astryx-icon').first().waitFor();

    await settle(page);
    const first = await observe(page, COLOR_TOKEN);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page, COLOR_TOKEN);
    const geometryStable =
      JSON.stringify(first.icons.map(icon => icon.box)) ===
      JSON.stringify(observed.icons.map(icon => icon.box));

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
    check(!observed.documentOverflow, 'document scrolls horizontally');

    const {icons} = observed;
    // Every glyph: one icon target, square box, painted artwork, no tab stop,
    // no mirroring, no variant reflection.
    icons.forEach((icon, index) => {
      const id = `icon ${index}`;
      check(icon.glyphBox != null && icon.glyphPaths > 0, `${id}: no artwork`);
      check(icon.box.width > 0 && icon.box.height > 0, `${id}: empty box`);
      check(near(icon.box.width, icon.box.height), `${id}: not square`);
      check(icon.tabIndex == null, `${id}: adds a tab stop`);
      check(icon.transform === 'none', `${id}: transformed ${icon.transform}`);
      check(icon.dataVariant == null, `${id}: reflects a variant`);
      check(
        SIZES.includes(icon.dataSize ?? ''),
        `${id}: data-size ${icon.dataSize}`,
      );
      check(icon.dataColor != null, `${id}: no data-color`);
      if (icon.tagName === 'span' && icon.glyphBox) {
        check(
          near(icon.glyphBox.width, icon.box.width) &&
            near(icon.glyphBox.height, icon.box.height),
          `${id}: registry artwork does not fill its box`,
        );
      }
      if (icon.dataColor && icon.dataColor !== 'inherit') {
        check(
          icon.color === observed.resolvedTokens[icon.dataColor],
          `${id}: ${icon.dataColor} paints ${icon.color}, token ${observed.resolvedTokens[icon.dataColor]}`,
        );
      }
    });
    const decorative = (from: number, to: number) => {
      icons.slice(from, to).forEach((icon, offset) => {
        check(
          icon.ariaHidden === 'true' &&
            icon.role == null &&
            icon.ariaLabel == null,
          `icon ${from + offset}: not decorative`,
        );
      });
    };
    const sizes = (from: number, tagName: string) => {
      const row = icons.slice(from, from + 4);
      check(
        JSON.stringify(row.map(icon => icon.dataSize)) ===
          JSON.stringify(SIZES),
        `size row ${row.map(icon => icon.dataSize).join(',')}`,
      );
      row.forEach((icon, offset) => {
        check(
          icon.tagName === tagName,
          `size ${SIZES[offset]}: ${icon.tagName}`,
        );
        if (offset > 0) {
          check(
            icon.box.width > row[offset - 1].box.width,
            `size ${SIZES[offset]} is not larger than ${SIZES[offset - 1]}`,
          );
        }
        if (item.theme === 'neutral') {
          check(
            near(icon.box.width, NEUTRAL_SIZE_PX[offset]),
            `size ${SIZES[offset]}: ${icon.box.width}px`,
          );
        }
      });
    };

    if (item.story === 'semantic-names') {
      sizes(0, 'span');
      const grid = icons.slice(4);
      check(grid.length >= 29, `only ${grid.length} built-in names`);
      grid.forEach((icon, index) => {
        check(icon.tagName === 'span', `name ${index}: ${icon.tagName}`);
        check(icon.dataSize === 'md', `name ${index}: size ${icon.dataSize}`);
        check(
          icon.dataColor === 'secondary',
          `name ${index}: ${icon.dataColor}`,
        );
      });
      decorative(0, icons.length);
    }
    if (item.story === 'all-colors') {
      check(
        JSON.stringify(icons.map(icon => icon.dataColor)) ===
          JSON.stringify(SEMANTIC_COLORS),
        `colors ${icons.map(icon => icon.dataColor).join(',')}`,
      );
      check(
        icons.every(icon => icon.tagName === 'svg'),
        'not component mode',
      );
      check(
        icons.every(icon => icon.dataSize === 'md'),
        'not the md fallback',
      );
      decorative(0, icons.length);
    }
    if (item.story === 'non-semantic-colors') {
      check(
        JSON.stringify(icons.map(icon => icon.dataColor)) ===
          JSON.stringify(PALETTE_COLORS),
        `colors ${icons.map(icon => icon.dataColor).join(',')}`,
      );
      decorative(0, icons.length);
    }
    if (item.story === 'all-sizes') {
      check(icons.length === 4, `${icons.length} icons`);
      sizes(0, 'svg');
      decorative(0, icons.length);
    }
    if (item.story === 'accessible-name') {
      check(icons.length === 2, `${icons.length} icons`);
      const [meaningful, plain] = icons;
      check(
        meaningful?.role === 'img' &&
          meaningful.ariaLabel === 'Completed' &&
          meaningful.ariaHidden == null,
        'labelled icon is not a named image',
      );
      check(
        plain?.ariaHidden === 'true' && plain.role == null,
        'unlabelled icon is not decorative',
      );
    }
    if (item.story === 'inherit-color') {
      check(icons.length === 3, `${icons.length} icons`);
      icons.forEach((icon, index) => {
        check(
          icon.dataColor === 'inherit',
          `inherit ${index}: ${icon.dataColor}`,
        );
        check(
          icon.color === icon.parentColor,
          `inherit ${index}: ${icon.color} vs parent ${icon.parentColor}`,
        );
      });
    }

    const png = await page.screenshot({animations: 'disabled', fullPage: true});
    check(png.length > 1000, 'screenshot is empty');
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: `core-icon--${item.story}`,
        mode: item.mode,
        direction: item.direction,
        theme: item.theme,
        viewport: item.viewport,
        glyph:
          'every glyph carries one astryx-icon target with data-size and data-color, is square, paints artwork, has no tab stop, no transform, and no variant reflection; registry artwork fills its wrapper',
        color:
          'each non-inherit color paints the computed value of its token in this frame; inherit paints the parent text color',
        size: 'sizes grow xsm < sm < md < lg; at the neutral theme they are 12, 16, 20, and 24px',
        accessibility:
          'icons without label are aria-hidden with no role; a label gives role="img" and that accessible name',
        contrast:
          'recorded per icon against the nearest painted backdrop for review; not a pass condition',
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
        component: 'core/Icon',
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
  // A receipt left by an earlier build does not count.
  expect(
    receipts
      .filter(receipt => receipt.expected.build !== checkoutSha)
      .map(receipt => receipt.expected),
  ).toEqual([]);
  expect(
    receipts
      .filter(receipt => !receipt.passed)
      .map(receipt => ({frame: receipt.expected, failures: receipt.failures})),
  ).toEqual([]);
});
