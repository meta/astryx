// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit DropdownMenuSubMenu

/**
 * @file DropdownMenuSubMenuAudit.a11y.chromium.spec.ts
 * @input Exact-head DropdownMenuSubMenu row-state story (and the existing header-and-footer story) across states, themes, sizes, direction, pointer, forced colors, and viewport widths
 * @output Screenshots and fail-closed sensor receipts for the DropdownMenuSubMenu component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a DropdownMenuSubMenu audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('dropdown-menu-submenu-audit-evidence');
const ROW_STORY = 'core-dropdownmenusubmenu--row-states';
const REGIONS_STORY = 'core-dropdownmenu--sub-menu-header-and-footer';
const FLYOUT = '[data-testid="dropdown-menu-submenu-flyout"]';
const WIDE = {width: 1024, height: 768};
const NARROW = {width: 320, height: 720};

type Interaction =
  | 'rest'
  | 'hover'
  | 'focus'
  | 'open'
  | 'pressed'
  | 'disabled-hover'
  | 'drill-in'
  | 'select'
  | 'regions';
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

const states: Interaction[] = [
  'rest',
  'hover',
  'focus',
  'open',
  'pressed',
  'disabled-hover',
  'drill-in',
  'select',
  'regions',
];

const overrides: (Partial<AuditCase> &
  Pick<AuditCase, 'key' | 'interaction'>)[] = [
  ...states.flatMap(interaction =>
    (['light', 'dark'] as const).map(mode => ({
      key: `neutral-${mode}-${interaction}`,
      mode,
      interaction,
    })),
  ),
  ...(['sm', 'lg'] as const).flatMap(size =>
    (['light', 'dark'] as const).map(mode => ({
      key: `size-${size}-${mode}-rest`,
      size,
      mode,
      interaction: 'rest' as const,
    })),
  ),
  {key: 'butter-light-rest', theme: 'butter', interaction: 'rest'},
  {key: 'butter-dark-rest', theme: 'butter', mode: 'dark', interaction: 'rest'},
  {key: 'butter-light-open', theme: 'butter', interaction: 'open'},
  {key: 'rtl-light-rest', direction: 'rtl', interaction: 'rest'},
  {key: 'rtl-dark-rest', direction: 'rtl', mode: 'dark', interaction: 'rest'},
  {key: 'rtl-light-open', direction: 'rtl', interaction: 'open'},
  {key: 'narrow-light-rest', viewport: NARROW, interaction: 'rest'},
  {
    key: 'narrow-dark-rest',
    viewport: NARROW,
    mode: 'dark',
    interaction: 'rest',
  },
  {key: 'narrow-light-open', viewport: NARROW, interaction: 'open'},
  {key: 'coarse-light-rest', pointer: 'coarse', interaction: 'rest'},
  {key: 'forced-colors-focus', forcedColors: true, interaction: 'focus'},
];
const cases: AuditCase[] = overrides.map(item => ({...defaults, ...item}));

// Authored before observation: whether the Share sub-menu is expanded after
// each interaction, which row holds focus, and what the callback counters read.
const expectedExpanded: Record<Interaction, boolean> = {
  rest: false,
  hover: true,
  focus: false,
  open: true,
  pressed: true,
  'disabled-hover': false,
  'drill-in': true,
  select: false,
  regions: true,
};
const expectedActive: Record<Interaction, string | null | undefined> = {
  rest: undefined,
  hover: 'Share',
  focus: 'Share',
  open: 'Copy link',
  pressed: 'Share',
  'disabled-hover': undefined,
  'drill-in': undefined,
  select: undefined,
  regions: undefined,
};
const expectedCounters: Record<
  Interaction,
  {picked: string; open: number; close: number} | null
> = {
  rest: {picked: 'none', open: 0, close: 0},
  hover: {picked: 'none', open: 1, close: 0},
  focus: {picked: 'none', open: 0, close: 0},
  open: {picked: 'none', open: 1, close: 0},
  pressed: {picked: 'none', open: 1, close: 0},
  'disabled-hover': {picked: 'none', open: 0, close: 0},
  'drill-in': {picked: 'none', open: 1, close: 0},
  select: {picked: 'copy-link', open: 1, close: 1},
  regions: null,
};

let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  const story = item.interaction === 'regions' ? REGIONS_STORY : ROW_STORY;
  const presentation =
    item.interaction === 'drill-in' ? 'drill-in' : 'adaptive';
  const args =
    item.interaction === 'regions'
      ? ''
      : `&args=size:${item.size};presentation:${presentation}`;
  return `${server.origin}/iframe.html?id=${story}&viewMode=story${args}&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
}

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(60);
}

const row = (scope: Locator, name: string) =>
  scope.getByRole('menuitem', {name: new RegExp(`^${name}`)}).first();

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
        component: 'core/DropdownMenuSubMenu',
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

    const isRegions = item.interaction === 'regions';
    const rowName = isRegions ? 'Labels' : 'Share';
    if (isRegions) {
      await page.getByRole('button', {name: 'Session'}).click();
    }
    const menu = page.getByRole('menu').first();
    await expect(menu).toBeVisible();
    const subject = row(menu, rowName);
    await expect(subject).toBeVisible();
    const flyout = page.locator(FLYOUT);
    const openKey = item.direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';

    if (item.interaction === 'hover') {
      await subject.hover();
      await expect(flyout).toBeVisible();
    } else if (item.interaction === 'focus' || item.interaction === 'open') {
      await page.getByRole('button', {name: 'Actions'}).focus();
      await page.keyboard.press('ArrowDown');
      await expect(row(menu, 'Rename')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(subject).toBeFocused();
      if (item.interaction === 'open') {
        await page.keyboard.press(openKey);
        await expect(flyout).toBeVisible();
        await expect(row(flyout, 'Copy link')).toBeFocused();
      }
    } else if (item.interaction === 'pressed') {
      await subject.hover();
      await expect(flyout).toBeVisible();
      await page.mouse.down();
    } else if (item.interaction === 'disabled-hover') {
      await row(menu, 'Archive').hover();
      await page.waitForTimeout(600);
    } else if (item.interaction === 'drill-in') {
      await subject.click();
      await expect(flyout).toBeVisible();
      await expect(row(flyout, 'Back to Actions')).toBeVisible();
    } else if (item.interaction === 'select') {
      await subject.click();
      await expect(flyout).toBeVisible();
      await row(flyout, 'Copy link').click();
      await expect(flyout).toBeHidden();
      await expect(menu).toBeHidden();
    } else if (isRegions) {
      await subject.click();
      await expect(
        page.getByRole('dialog', {name: 'Labels', includeHidden: false}),
      ).toBeVisible();
    }
    await settle(page);

    // Geometry must be settled before a frame is trusted: read every row and
    // open surface box, wait two animation frames plus a pause, read again.
    const settledGeometry = await page.evaluate(async () => {
      const read = () =>
        Array.from(
          document.querySelectorAll(
            'button, [role="menu"], [role="menuitem"], [role="dialog"]',
          ),
        )
          .filter(node => node.getClientRects().length > 0)
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

    const observed = await page.evaluate(
      ({rowName, flyoutSelector}) => {
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
        const text = (node: Element | null) =>
          node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const boxOf = (node: Element) => {
          const box = node.getBoundingClientRect();
          return {x: box.x, y: box.y, width: box.width, height: box.height};
        };
        const describeRows = (scope: Element) => {
          const scopeBackdrop = backdrop(scope);
          return Array.from(
            scope.querySelectorAll<HTMLElement>('[role="menuitem"]'),
          )
            .filter(
              node =>
                node.closest('[role="menu"]') === scope &&
                node.getClientRects().length > 0,
            )
            .map(node => {
              const style = getComputedStyle(node);
              const opacity = Number(style.opacity);
              const rowBackdrop = backdrop(node);
              const indicator = node.querySelector<HTMLElement>(
                '.astryx-dropdown-menu-indicator-icon',
              );
              const spinner = node.querySelector('.astryx-spinner');
              return {
                name: text(node),
                haspopup: node.getAttribute('aria-haspopup'),
                expanded: node.getAttribute('aria-expanded'),
                disabled: node.getAttribute('aria-disabled'),
                tabIndex: node.getAttribute('tabindex'),
                focused: document.activeElement === node,
                cursor: style.cursor,
                opacity,
                outline: `${style.outlineStyle} ${style.outlineWidth}`,
                background: hex(rgba(style.backgroundColor)),
                rowAgainstSurface: ratio(rowBackdrop, scopeBackdrop),
                indicatorTransform:
                  indicator === null
                    ? null
                    : getComputedStyle(indicator).transform,
                spinnerHidden:
                  spinner === null
                    ? null
                    : spinner.closest('[aria-hidden="true"]') !== null,
                texts: Array.from(node.querySelectorAll('span'))
                  .filter(n => n.children.length === 0 && n.textContent?.trim())
                  .map(n => {
                    const color = rgba(getComputedStyle(n).color);
                    const nodeBackdrop = backdrop(n);
                    return {
                      text: (n.textContent ?? '').trim().slice(0, 24),
                      fontSize: getComputedStyle(n).fontSize,
                      color: hex(color),
                      backdrop: hex(nodeBackdrop),
                      contrast: ratio(
                        [color[0], color[1], color[2], color[3] * opacity],
                        nodeBackdrop,
                      ),
                    };
                  }),
                geometry: boxOf(node),
              };
            });
        };
        const menus = Array.from(
          document.querySelectorAll<HTMLElement>('[role="menu"]'),
        ).filter(node => node.getClientRects().length > 0);
        const rootMenu = menus[0] ?? null;
        const subject =
          rootMenu === null
            ? null
            : (Array.from(
                rootMenu.querySelectorAll<HTMLElement>('[role="menuitem"]'),
              ).find(node => text(node).startsWith(rowName)) ?? null);
        const flyout = document.querySelector<HTMLElement>(flyoutSelector);
        const flyoutShown =
          flyout !== null && flyout.getClientRects().length > 0;
        const dialog = Array.from(
          document.querySelectorAll<HTMLElement>('[role="dialog"]'),
        ).find(node => node.getClientRects().length > 0);
        const fixture = document.querySelector(
          '[data-testid="dropdown-menu-submenu-audit"]',
        );
        return {
          theme:
            document
              .querySelector('[data-astryx-theme]')
              ?.getAttribute('data-astryx-theme') ?? null,
          mode: document.documentElement.getAttribute('data-theme'),
          // A closed menu leaves only its trigger to read direction from.
          direction: getComputedStyle(
            rootMenu ?? document.querySelector('button') ?? document.body,
          ).direction,
          viewport: {width: innerWidth, height: innerHeight},
          media: {
            pointerCoarse: matchMedia('(pointer: coarse)').matches,
            forcedColors: matchMedia('(forced-colors: active)').matches,
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)')
              .matches,
            devicePixelRatio,
          },
          fonts: document.fonts.status,
          horizontalOverflow:
            document.documentElement.scrollWidth > innerWidth + 1,
          activeElement: text(document.activeElement).slice(0, 40),
          activeRole: document.activeElement?.getAttribute('role') ?? null,
          rootMenu:
            rootMenu === null
              ? null
              : {
                  box: boxOf(rootMenu),
                  backdrop: hex(backdrop(rootMenu)),
                  rows: describeRows(rootMenu),
                },
          subject:
            subject === null
              ? null
              : {
                  name: text(subject),
                  haspopup: subject.getAttribute('aria-haspopup'),
                  expanded: subject.getAttribute('aria-expanded'),
                  controls: subject.getAttribute('aria-controls'),
                  box: boxOf(subject),
                },
          flyout: flyoutShown
            ? {
                box: boxOf(flyout),
                labelledBy: flyout.getAttribute('aria-labelledby'),
                label: flyout.getAttribute('aria-label'),
                backdrop: hex(backdrop(flyout)),
                rows: describeRows(flyout),
              }
            : null,
          dialog:
            dialog === undefined
              ? null
              : {
                  modal: dialog.getAttribute('aria-modal'),
                  labelledBy: dialog.getAttribute('aria-labelledby'),
                  hasField: dialog.querySelector('input') !== null,
                  hasButton: dialog.querySelector('button') !== null,
                  hasMenu: dialog.querySelector('[role="menu"]') !== null,
                  box: boxOf(dialog),
                },
          counters:
            fixture === null
              ? null
              : {
                  picked: fixture.getAttribute('data-picked'),
                  open: Number(fixture.getAttribute('data-open-count')),
                  close: Number(fixture.getAttribute('data-close-count')),
                },
        };
      },
      {rowName, flyoutSelector: FLYOUT},
    );

    const rows = observed.rootMenu?.rows ?? [];
    const subjectBox = observed.subject?.box;
    const flyoutBox = observed.flyout?.box ?? observed.dialog?.box;
    const opensSideways =
      expectedExpanded[item.interaction] &&
      item.interaction !== 'drill-in' &&
      item.viewport.width === WIDE.width;
    const active = expectedActive[item.interaction];
    const counters = expectedCounters[item.interaction];
    const findRow = (name: string) =>
      rows.find(entry => entry.name.startsWith(name));
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
      // A closed menu leaves only its trigger, one box.
      geometrySettled: settledGeometry.stable && settledGeometry.boxes >= 1,
      // A nested selection dismisses the whole stack, root menu included.
      rootClosed:
        (item.interaction === 'select') === (observed.rootMenu === null),
      subjectSemantics:
        item.interaction === 'select' ||
        (observed.subject !== null &&
          observed.subject.haspopup === (isRegions ? 'dialog' : 'menu') &&
          observed.subject.expanded ===
            String(expectedExpanded[item.interaction])),
      surface: isRegions
        ? observed.dialog !== null &&
          observed.dialog.modal === 'true' &&
          observed.dialog.hasField &&
          observed.dialog.hasButton &&
          observed.dialog.hasMenu
        : expectedExpanded[item.interaction] === (observed.flyout !== null),
      drillIn:
        item.interaction !== 'drill-in' ||
        (observed.flyout?.rows[0]?.name.startsWith('Back to Actions') ===
          true &&
          rows.length === 0),
      flyoutSide:
        !opensSideways ||
        (subjectBox !== undefined &&
          flyoutBox !== undefined &&
          (item.direction === 'rtl'
            ? flyoutBox.x + flyoutBox.width <= subjectBox.x + 2
            : flyoutBox.x >= subjectBox.x + subjectBox.width - 2)),
      flyoutInViewport:
        flyoutBox === undefined ||
        (flyoutBox.x >= -1 &&
          flyoutBox.x + flyoutBox.width <= item.viewport.width + 1),
      activeRow:
        active === undefined
          ? true
          : observed.activeElement.startsWith(active ?? ''),
      rowStates:
        isRegions ||
        item.interaction === 'select' ||
        item.interaction === 'drill-in' ||
        (findRow('Archive')?.disabled === 'true' &&
          findRow('Archive')?.tabIndex === null &&
          findRow('Export')?.spinnerHidden === true &&
          findRow('Share')?.haspopup === 'menu'),
      indicatorMirror:
        item.interaction === 'drill-in' ||
        rows
          .filter(entry => entry.indicatorTransform !== null)
          .every(entry =>
            item.direction === 'rtl'
              ? entry.indicatorTransform?.startsWith('matrix(-1') === true
              : entry.indicatorTransform === 'none',
          ),
      rowGeometry: rows.every(
        entry => entry.geometry.width > 0 && entry.geometry.height >= 24,
      ),
      counters:
        counters === null ||
        (observed.counters !== null &&
          observed.counters.picked === counters.picked &&
          observed.counters.open === counters.open &&
          observed.counters.close === counters.close),
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
        storyId: isRegions ? REGIONS_STORY : ROW_STORY,
        ...item,
        expanded: expectedExpanded[item.interaction],
        activeRow: active ?? null,
        counters,
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
