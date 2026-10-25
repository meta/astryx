// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuRadioItemAudit.a11y.chromium.spec.ts
 * @input Exact-head DropdownMenuRadioItem row-state story across states, themes, sizes, direction, pointer, forced colors, and viewport widths
 * @output Screenshots and fail-closed sensor receipts for the DropdownMenuRadioItem component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a DropdownMenuRadioItem audit pull request
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

const OUTPUT = path.resolve('dropdown-menu-radio-item-audit-evidence');
const STORY_ID = 'core-dropdownmenuradioitem--row-states';
const WIDE = {width: 1024, height: 768};
const NARROW = {width: 320, height: 720};

type Interaction =
  'rest' | 'hover' | 'focus' | 'pressed' | 'select' | 'disabled-hover';
type AuditCase = {
  key: string;
  mode: 'light' | 'dark';
  direction: 'ltr' | 'rtl';
  theme: 'neutral' | 'butter';
  size: 'sm' | 'md' | 'lg';
  pointer: 'fine' | 'coarse';
  forcedColors: boolean;
  viewport: {width: number; height: number};
  interaction: Interaction;
};

const defaults: Omit<AuditCase, 'key' | 'interaction'> = {
  mode: 'light',
  direction: 'ltr',
  theme: 'neutral',
  size: 'md',
  pointer: 'fine',
  forcedColors: false,
  viewport: WIDE,
};

const overrides: (Partial<AuditCase> &
  Pick<AuditCase, 'key' | 'interaction'>)[] = [
  {key: 'neutral-light-rest', interaction: 'rest'},
  {key: 'neutral-dark-rest', mode: 'dark', interaction: 'rest'},
  {key: 'butter-light-rest', theme: 'butter', interaction: 'rest'},
  {key: 'butter-dark-rest', theme: 'butter', mode: 'dark', interaction: 'rest'},
  {key: 'rtl-light-rest', direction: 'rtl', interaction: 'rest'},
  {key: 'rtl-dark-rest', direction: 'rtl', mode: 'dark', interaction: 'rest'},
  {key: 'narrow-light-rest', viewport: NARROW, interaction: 'rest'},
  {
    key: 'narrow-dark-rest',
    viewport: NARROW,
    mode: 'dark',
    interaction: 'rest',
  },
  {key: 'size-sm-light-rest', size: 'sm', interaction: 'rest'},
  {key: 'size-lg-light-rest', size: 'lg', interaction: 'rest'},
  {key: 'size-sm-dark-rest', size: 'sm', mode: 'dark', interaction: 'rest'},
  {key: 'size-lg-dark-rest', size: 'lg', mode: 'dark', interaction: 'rest'},
  {key: 'coarse-light-rest', pointer: 'coarse', interaction: 'rest'},
  {
    key: 'coarse-rtl-light-rest',
    pointer: 'coarse',
    direction: 'rtl',
    interaction: 'rest',
  },
  {key: 'neutral-light-hover', interaction: 'hover'},
  {key: 'neutral-dark-hover', mode: 'dark', interaction: 'hover'},
  {key: 'neutral-light-focus', interaction: 'focus'},
  {key: 'neutral-dark-focus', mode: 'dark', interaction: 'focus'},
  {key: 'butter-light-focus', theme: 'butter', interaction: 'focus'},
  {key: 'neutral-light-pressed', interaction: 'pressed'},
  {key: 'neutral-light-select', interaction: 'select'},
  {key: 'neutral-dark-pressed', mode: 'dark', interaction: 'pressed'},
  {key: 'neutral-dark-select', mode: 'dark', interaction: 'select'},
  {key: 'neutral-light-disabled-hover', interaction: 'disabled-hover'},
  {
    key: 'neutral-dark-disabled-hover',
    mode: 'dark',
    interaction: 'disabled-hover',
  },
  {key: 'forced-colors-focus', forcedColors: true, interaction: 'focus'},
];
const cases: AuditCase[] = overrides.map(item => ({...defaults, ...item}));

// Authored before observation: which row each interaction leaves checked and
// active, and how many consumer handler calls the fixture must record.
const expectedChecked = (item: AuditCase) =>
  item.interaction === 'select' ? 'List' : 'Board';
const expectedActive = (item: AuditCase) =>
  ({
    rest: undefined,
    hover: 'List',
    focus: 'Board',
    pressed: 'List',
    select: 'List',
    'disabled-hover': null,
  })[item.interaction];

let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=${STORY_ID}&viewMode=story&args=size:${item.size}&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
}

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(60);
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
  const receipts = fs
    .readdirSync(OUTPUT)
    .filter(file => file.endsWith('.sensors.json'))
    .sort();
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        component: 'core/DropdownMenuRadioItem',
        build: checkoutSha,
        expectedFrames: cases.map(item => item.key),
        receipts: receipts.map(file => {
          const receipt = JSON.parse(
            fs.readFileSync(path.join(OUTPUT, file), 'utf8'),
          );
          return {
            key: file.replace('.sensors.json', ''),
            passed: receipt.passed,
          };
        }),
      },
      null,
      2,
    )}\n`,
  );
});

for (const item of cases) {
  test(item.key, async ({browser}) => {
    const coarse = item.pointer === 'coarse';
    const context = await browser.newContext({
      viewport: item.viewport,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
      forcedColors: item.forcedColors ? 'active' : 'none',
      hasTouch: coarse,
      isMobile: coarse,
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page.locator('#storybook-root').waitFor();

    const fixture = page.getByTestId('dropdown-menu-radio-item-audit');
    const menu = page.getByRole('menu').last();
    await expect(menu).toBeVisible();
    const row = (name: string) =>
      menu.getByRole('menuitemradio', {name: new RegExp(`^${name}`)});
    await expect(menu.getByRole('menuitemradio')).toHaveCount(5);

    if (item.interaction === 'hover') {
      await row('List').hover();
      await expect(row('List')).toBeFocused();
    } else if (item.interaction === 'focus') {
      await page.getByRole('button', {name: 'View'}).focus();
      await page.keyboard.press('ArrowDown');
      await expect(row('Board')).toBeFocused();
    } else if (item.interaction === 'pressed') {
      await row('List').hover();
      await page.mouse.down();
    } else if (item.interaction === 'select') {
      await row('List').click();
      await expect(row('List')).toHaveAttribute('aria-checked', 'true');
    } else if (item.interaction === 'disabled-hover') {
      await row('Archive').hover();
    }
    await settle(page);

    // Geometry must be settled before any frame is trusted: read every row and
    // marker box, wait two animation frames plus a pause, and read again.
    const settledGeometry = await menu.evaluate(async element => {
      const read = () =>
        [
          element,
          ...Array.from(
            element.querySelectorAll(
              '[role="menuitemradio"], .astryx-dropdown-menu-radio',
            ),
          ),
        ]
          .map(node => {
            const box = node.getBoundingClientRect();
            return [box.x, box.y, box.width, box.height]
              .map(value => value.toFixed(2))
              .join(',');
          })
          .join('|');
      const first = read();
      await new Promise<void>(resolve => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(resolve, 120)),
        );
      });
      const second = read();
      return {stable: first === second, boxes: first.split('|').length};
    });

    const observed = await menu.evaluate(element => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      if (ctx === null) {
        throw new Error('2d canvas context is unavailable');
      }
      type Rgba = [number, number, number, number];
      const rgba = (color: string): Rgba => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, b, a / 255];
      };
      const over = (top: Rgba, bottom: Rgba): Rgba => {
        const alpha = top[3] + bottom[3] * (1 - top[3]);
        if (alpha === 0) {
          return [0, 0, 0, 0];
        }
        const mix = (i: number) =>
          (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / alpha;
        return [mix(0), mix(1), mix(2), alpha];
      };
      const backdrop = (node: Element): Rgba => {
        const layers: Rgba[] = [];
        for (let n: Element | null = node; n; n = n.parentElement) {
          layers.push(rgba(getComputedStyle(n).backgroundColor));
        }
        let acc: Rgba = [255, 255, 255, 1];
        for (let i = layers.length - 1; i >= 0; i--) {
          acc = over(layers[i], acc);
        }
        return acc;
      };
      const luminance = ([r, g, b]: Rgba) => {
        const f = (v: number) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (fg: Rgba, bg: Rgba) => {
        const [hi, lo] = [luminance(over(fg, bg)), luminance(bg)].sort(
          (a, b) => b - a,
        );
        return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      };
      const hex = (c: Rgba) =>
        `#${c
          .slice(0, 3)
          .map(v => Math.round(v).toString(16).padStart(2, '0'))
          .join('')}${c[3] < 1 ? `@${c[3].toFixed(2)}` : ''}`;
      const fade = (c: Rgba, opacity: number): Rgba => [
        c[0],
        c[1],
        c[2],
        c[3] * opacity,
      ];
      const menuBackdrop = backdrop(element);
      const rows = Array.from(
        element.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
      ).map(row => {
        const box = row.getBoundingClientRect();
        const style = getComputedStyle(row);
        const opacity = Number(style.opacity);
        const rowBackdrop = backdrop(row);
        const texts = Array.from(row.querySelectorAll('span'))
          .filter(n => n.children.length === 0 && n.textContent?.trim())
          .map(n => {
            const color = rgba(getComputedStyle(n).color);
            const nodeBackdrop = backdrop(n);
            return {
              text: (n.textContent ?? '').trim().slice(0, 24),
              fontSize: getComputedStyle(n).fontSize,
              color: hex(color),
              backdrop: hex(nodeBackdrop),
              contrast: ratio(fade(color, opacity), nodeBackdrop),
            };
          });
        const indicator = row.querySelector<HTMLElement>(
          '.astryx-dropdown-menu-radio',
        );
        const indicatorStyle = indicator ? getComputedStyle(indicator) : null;
        const indicatorBox = indicator?.getBoundingClientRect() ?? null;
        const border = indicatorStyle
          ? rgba(indicatorStyle.borderTopColor)
          : null;
        const fill = indicatorStyle
          ? rgba(indicatorStyle.backgroundColor)
          : null;
        const isRtl = style.direction === 'rtl';
        return {
          name: row.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          checked: row.getAttribute('aria-checked'),
          disabled: row.getAttribute('aria-disabled'),
          tabIndex: row.getAttribute('tabindex'),
          focused: document.activeElement === row,
          focusVisible: row.matches(':focus-visible'),
          cursor: style.cursor,
          opacity,
          outline: `${style.outlineStyle} ${style.outlineWidth}`,
          background: hex(rgba(style.backgroundColor)),
          rowBackdrop: hex(rowBackdrop),
          rowAgainstMenu: ratio(rowBackdrop, menuBackdrop),
          texts,
          indicator:
            indicator && indicatorBox && indicatorStyle && border && fill
              ? {
                  classes: Array.from(indicator.classList).filter(c =>
                    c.startsWith('astryx-'),
                  ),
                  dataSize: indicator.getAttribute('data-size'),
                  dataChecked: indicator.getAttribute('data-checked'),
                  hidden: indicator.closest('[aria-hidden="true"]') !== null,
                  width: indicatorBox.width,
                  height: indicatorBox.height,
                  inlineStartOffset: isRtl
                    ? box.right - indicatorBox.right
                    : indicatorBox.left - box.left,
                  inlineEndOffset: isRtl
                    ? indicatorBox.left - box.left
                    : box.right - indicatorBox.right,
                  border: hex(border),
                  fill: hex(fill),
                  borderContrast: ratio(fade(border, opacity), rowBackdrop),
                  fillContrast:
                    fill[3] > 0
                      ? ratio(fade(fill, opacity), rowBackdrop)
                      : null,
                }
              : null,
          geometry: {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          },
        };
      });
      const fixtureNode = element.ownerDocument.querySelector(
        '[data-testid="dropdown-menu-radio-item-audit"]',
      );
      const menuBox = element.getBoundingClientRect();
      return {
        theme:
          document
            .querySelector('[data-astryx-theme]')
            ?.getAttribute('data-astryx-theme') ?? null,
        mode: document.documentElement.getAttribute('data-theme'),
        direction: getComputedStyle(element).direction,
        viewport: {width: innerWidth, height: innerHeight},
        media: {
          pointerCoarse: matchMedia('(pointer: coarse)').matches,
          forcedColors: matchMedia('(forced-colors: active)').matches,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          devicePixelRatio,
        },
        fonts: document.fonts.status,
        horizontalOverflow:
          document.documentElement.scrollWidth > innerWidth + 1,
        menuBackdrop: hex(menuBackdrop),
        menu: {
          x: menuBox.x,
          y: menuBox.y,
          width: menuBox.width,
          height: menuBox.height,
        },
        activeRow:
          document.activeElement?.getAttribute('role') === 'menuitemradio'
            ? (document.activeElement.textContent
                ?.replace(/\s+/g, ' ')
                .trim() ?? null)
            : null,
        consumerClicks: Number(
          fixtureNode?.getAttribute('data-row-click-count') ?? 'NaN',
        ),
        consumerPointerMoves: Number(
          fixtureNode?.getAttribute('data-row-pointer-move-count') ?? 'NaN',
        ),
        rows,
      };
    });
    await expect(fixture).toBeAttached();

    const checked = observed.rows
      .filter(row => row.checked === 'true')
      .map(row => row.name);
    const active = expectedActive(item);
    const markerSize = item.size === 'sm' ? 'sm' : 'md';
    const checks = {
      build: storybookSha === checkoutSha,
      noPageErrors: pageErrors.length === 0,
      theme: observed.theme === item.theme,
      mode: observed.mode === item.mode,
      direction: observed.direction === item.direction,
      viewport:
        observed.viewport.width === item.viewport.width &&
        observed.viewport.height === item.viewport.height,
      pointer: observed.media.pointerCoarse === (item.pointer === 'coarse'),
      forcedColors: observed.media.forcedColors === item.forcedColors,
      reducedMotion: observed.media.reducedMotion,
      fonts: observed.fonts === 'loaded',
      noHorizontalOverflow: !observed.horizontalOverflow,
      rows: observed.rows.length === 5,
      checked:
        checked.length === 1 && checked[0].startsWith(expectedChecked(item)),
      disabledRow:
        observed.rows[4]?.disabled === 'true' &&
        observed.rows[4]?.tabIndex === null,
      activeRow:
        active === undefined
          ? true
          : active === null
            ? !(observed.activeRow ?? '').startsWith('Archive')
            : (observed.activeRow ?? '').startsWith(active),
      decorativeMarker: observed.rows.every(
        row =>
          row.indicator !== null &&
          row.indicator.hidden &&
          row.indicator.dataSize === markerSize &&
          row.indicator.width > 0 &&
          row.indicator.classes.includes('astryx-radio-indicator'),
      ),
      markerPlacement: observed.rows.every(row =>
        row.indicator === null
          ? false
          : item.pointer === 'coarse'
            ? row.indicator.inlineEndOffset < row.indicator.inlineStartOffset
            : row.indicator.inlineStartOffset < row.indicator.inlineEndOffset,
      ),
      geometrySettled: settledGeometry.stable && settledGeometry.boxes === 11,
      geometry: observed.rows.every(
        row => row.geometry.width > 0 && row.geometry.height >= 24,
      ),
      // The fixture's consumer handlers record every call; a selection click
      // must reach the consumer click handler and the hover that preceded it
      // must reach the consumer pointer-move handler.
      consumerHandlers:
        item.interaction === 'select'
          ? observed.consumerClicks === 1 && observed.consumerPointerMoves > 0
          : observed.consumerClicks === 0,
    };

    const png = await page.screenshot({animations: 'disabled'});
    if (item.interaction === 'pressed') {
      await page.mouse.up();
    }
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: STORY_ID,
        ...item,
        checked: expectedChecked(item),
        activeRow: active,
      },
      observed: {
        build: storybookSha,
        browser: context.browser()?.version() ?? null,
        ...observed,
        settledGeometry,
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      checks,
      passed: Object.values(checks).every(Boolean),
    };
    fs.writeFileSync(path.join(OUTPUT, image), png);
    fs.writeFileSync(
      path.join(OUTPUT, `${item.key}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    await context.close();
    expect(
      Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name),
    ).toEqual([]);
  });
}
