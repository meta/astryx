// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit NavHeadingMenuItem

/**
 * @file NavHeadingMenuItemAudit.a11y.chromium.spec.ts
 * @input Exact-head NavHeadingMenuItem and NavMenu stories across modes,
 *   direction, sizes, a second theme, forced colors, and a narrow viewport
 * @output Screenshots and fail-closed sensor receipts for the
 *   NavHeadingMenuItem whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for
 *   a NavHeadingMenuItem audit pull request
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

const OUTPUT = path.resolve('nav-heading-menu-item-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'matcha';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  story: string;
  mode: Mode;
  direction: Direction;
  theme: Theme;
  viewport: Viewport;
  forcedColors?: boolean;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 700};
const NARROW = {width: 320, height: 700};

/** WCAG 2.2 SC 2.5.8 target, SC 1.4.3 text, and SC 1.4.11 non-text contrast. */
const MIN_TARGET_PX = 24;
const MIN_TEXT_CONTRAST = 4.5;
const MIN_NON_TEXT_CONTRAST = 3;

test.describe.configure({retries: 0});

let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

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

async function pageSensors(page: Page) {
  return page.evaluate(() => ({
    mode: document.documentElement.getAttribute('data-theme'),
    theme:
      document
        .querySelector('#storybook-root [data-astryx-theme]')
        ?.getAttribute('data-astryx-theme') ?? null,
    direction: getComputedStyle(
      document.querySelector('#storybook-root [dir]') as Element,
    ).direction,
    viewport: {width: innerWidth, height: innerHeight},
    dpr: devicePixelRatio,
    fonts: document.fonts.status,
    forcedColors: matchMedia('(forced-colors: active)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    storybookError:
      document.querySelector('.sb-show-errordisplay') != null ||
      document.body.classList.contains('sb-show-errordisplay'),
  }));
}

async function axe(page: Page) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return {
    violations: results.violations.flatMap(violation =>
      violation.nodes.map(
        node =>
          `${violation.id} ${node.target.join(' ')}: ${node.failureSummary}`,
      ),
    ),
    passes: results.passes.map(pass => pass.id),
  };
}

function checkAxe(check: Check, result: Awaited<ReturnType<typeof axe>>) {
  check(
    result.violations.length === 0,
    `axe: ${result.violations.join(' | ')}`,
  );
  check(result.passes.length > 0, 'axe checked nothing');
}

/**
 * Every row of the first menu on the page: role, tab index, target, size,
 * disabled state, destination, cursor, opacity, box and padding, the icon's
 * inline position, the contrast of its label and description against the
 * backdrop it paints on, its own fill (with alpha) and that fill against the
 * menu, and, for the focused row, its outline and the outline's contrast
 * against the menu.
 */
async function readRows(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    const rgba = (value: string) => {
      if (ctx == null) {
        return [0, 0, 0, 0];
      }
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#010203';
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const backdrop = (node0: Element) => {
      const layers: number[][] = [];
      let node: Element | null = node0;
      while (node != null) {
        const color = rgba(getComputedStyle(node).backgroundColor);
        if (color[3] > 0) {
          layers.push(color);
          if (color[3] >= 1) {
            break;
          }
        }
        node = node.parentElement;
      }
      let base = [255, 255, 255];
      for (const layer of layers.reverse()) {
        base = base.map((c, i) => layer[i] * layer[3] + c * (1 - layer[3]));
      }
      return base;
    };
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map(c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const pair = (a: number[], b: number[]) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    };
    const textRatio = (node: Element) => {
      const fg = rgba(getComputedStyle(node).color);
      const bg = backdrop(node);
      return pair(
        bg.map((c, i) => fg[i] * fg[3] + c * (1 - fg[3])),
        bg,
      );
    };
    // The ring's own alpha and the row's opacity both blend it into the
    // backdrop it is drawn on.
    const ringRatio = (color: number[], against: Element) => {
      const bg = backdrop(against);
      const alpha = color[3] * Number(getComputedStyle(against).opacity || 1);
      return pair(
        bg.map((c, i) => color[i] * alpha + c * (1 - alpha)),
        bg,
      );
    };
    const menu = document.querySelector<HTMLElement>(
      '#storybook-root .astryx-nav-heading-menu',
    );
    const rows = menu
      ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      : [];
    return {
      menuRole: menu?.getAttribute('role') ?? null,
      menuName: menu?.getAttribute('aria-label') ?? null,
      rows: rows.map(row => {
        const rect = row.getBoundingClientRect();
        const style = getComputedStyle(row);
        const icon = row.querySelector('svg');
        const texts = Array.from(row.querySelectorAll('.astryx-text'));
        const label = texts[0] ?? null;
        const description = texts[1] ?? null;
        const iconRect = icon?.getBoundingClientRect();
        const labelRect = label?.getBoundingClientRect();
        const outlineColor = rgba(style.outlineColor);
        return {
          name: label?.textContent?.trim() ?? row.textContent?.trim() ?? '',
          tag: row.tagName.toLowerCase(),
          role: row.getAttribute('role'),
          tabIndex: row.tabIndex,
          target: row.classList.contains('astryx-nav-heading-menu-item'),
          size: row.getAttribute('data-size'),
          disabled: row.getAttribute('aria-disabled'),
          href: row.getAttribute('href'),
          cursor: style.cursor,
          opacity: Number(style.opacity),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          paddingBlock: parseFloat(style.paddingBlockStart),
          paddingInline: parseFloat(style.paddingInlineStart),
          labelContrast: label ? textRatio(label) : null,
          descriptionContrast: description ? textRatio(description) : null,
          labelCut: label
            ? (label as HTMLElement).scrollWidth >
              (label as HTMLElement).clientWidth
            : null,
          descriptionCut: description
            ? (description as HTMLElement).scrollWidth >
              (description as HTMLElement).clientWidth
            : null,
          iconLeft: iconRect ? iconRect.left : null,
          labelLeft: labelRect ? labelRect.left : null,
          focused: row === document.activeElement,
          fill: rgba(style.backgroundColor),
          outlineStyle: style.outlineStyle,
          outlineWidth: parseFloat(style.outlineWidth),
          outlineOffset: parseFloat(style.outlineOffset),
          outlineVsMenu:
            menu && outlineColor[3] > 0 ? ringRatio(outlineColor, menu) : null,
          outlineVsRow:
            outlineColor[3] > 0 ? ringRatio(outlineColor, row) : null,
        };
      }),
    };
  });
}
type Rows = Awaited<ReturnType<typeof readRows>>;
type Row = Rows['rows'][number];

/** The standing row contract: role, tab stop, target, size, box, and text. */
function checkRows(
  check: Check,
  read: Rows,
  size: string,
  described: ReadonlySet<string> = new Set(),
) {
  check(read.menuRole === 'menu', `menu role ${read.menuRole}`);
  check(read.rows.length > 0, 'no menuitem rows');
  for (const row of read.rows) {
    check(row.role === 'menuitem', `${row.name}: role ${row.role}`);
    check(row.tabIndex === -1, `${row.name}: tabIndex ${row.tabIndex}`);
    check(row.target, `${row.name}: no nav-heading-menu-item target`);
    check(row.size === size, `${row.name}: data-size ${row.size}`);
    check(row.height >= MIN_TARGET_PX, `${row.name}: height ${row.height}`);
    if (row.disabled !== 'true') {
      check(row.opacity === 1, `${row.name}: opacity ${row.opacity}`);
      check(row.cursor === 'pointer', `${row.name}: cursor ${row.cursor}`);
      check(
        row.labelContrast != null && row.labelContrast >= MIN_TEXT_CONTRAST,
        `${row.name}: label contrast ${row.labelContrast}`,
      );
      if (described.has(row.name)) {
        check(
          row.descriptionContrast != null &&
            row.descriptionContrast >= MIN_TEXT_CONTRAST,
          `${row.name}: description contrast ${row.descriptionContrast}`,
        );
      }
    }
  }
}

function focusedRow(read: Rows): Row | undefined {
  return read.rows.find(row => row.focused);
}

/** The shared focus ring, drawn inside the row and at 3:1 against the menu. */
function checkRing(
  check: Check,
  row: Row | undefined,
  against: 'menu' | 'row',
) {
  check(row != null, 'no focused row');
  if (row == null) {
    return;
  }
  check(row.outlineStyle !== 'none', `${row.name}: no outline`);
  check(row.outlineWidth >= 1, `${row.name}: outline ${row.outlineWidth}px`);
  check(
    row.outlineOffset === -row.outlineWidth,
    `${row.name}: outline offset ${row.outlineOffset} for width ${row.outlineWidth}`,
  );
  const ratio = against === 'menu' ? row.outlineVsMenu : row.outlineVsRow;
  check(
    ratio != null && ratio >= MIN_NON_TEXT_CONTRAST,
    `${row.name}: ring contrast against the ${against} ${ratio}`,
  );
}

async function rowShot(page: Page, index: number) {
  return page
    .locator('#storybook-root [role="menuitem"]')
    .nth(index)
    .screenshot({animations: 'disabled'});
}

/** Rows whose description a contrast read must find. */
const WITH_DESCRIPTIONS: ReadonlySet<string> = new Set([
  'Profile',
  'Settings',
  'Sign out',
]);
const LONG_STORY_DESCRIPTIONS: ReadonlySet<string> = new Set([
  'Profile',
  'Organization-wide notification preferences and delivery schedules',
]);

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `states-${mode}-${direction}`,
      group: 'states',
      story: 'core-navmenu--with-descriptions',
      mode,
      direction,
      theme: 'neutral',
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const rest = await readRows(page);
        checkRows(check, rest, 'lg', WITH_DESCRIPTIONS);
        const names = rest.rows.map(row => row.name);
        check(
          JSON.stringify(names) ===
            JSON.stringify(['Profile', 'Settings', 'Sign out']),
          `rows ${JSON.stringify(names)}`,
        );
        for (const row of rest.rows) {
          check(
            row.iconLeft != null &&
              row.labelLeft != null &&
              (direction === 'ltr'
                ? row.iconLeft < row.labelLeft
                : row.iconLeft > row.labelLeft),
            `${row.name}: icon is not at the inline start of its label`,
          );
          check(
            row.fill[3] === 0,
            `${row.name}: paints ${JSON.stringify(row.fill)} at rest`,
          );
        }
        check(
          rest.rows[0]?.tag === 'a' && rest.rows[0]?.href === '#',
          `link row ${rest.rows[0]?.tag} ${rest.rows[0]?.href}`,
        );
        check(
          rest.rows[2]?.tag === 'div' && rest.rows[2]?.href == null,
          `action row ${rest.rows[2]?.tag}`,
        );
        const result = await axe(page);
        checkAxe(check, result);
        await frame('rest', {rest, axe: result});

        // Hover: a translucent overlay over the row's own transparent base.
        await page.mouse.move(0, 0);
        await settle(page);
        const restShot = await rowShot(page, 1);
        await page.locator('#storybook-root [role="menuitem"]').nth(1).hover();
        await settle(page);
        const hoverShot = await rowShot(page, 1);
        const hovered = (await readRows(page)).rows[1];
        check(!hoverShot.equals(restShot), 'hover paints like rest');
        check(
          hovered != null && hovered.fill[3] > 0 && hovered.fill[3] < 1,
          `hover fill ${JSON.stringify(hovered?.fill)} is not a translucent overlay`,
        );
        await frame('hover', {hovered});

        // After pointer input the focused row keeps the fill alone. The
        // action row has no onClick in this story, so the press only focuses.
        await page.locator('#storybook-root [role="menuitem"]').nth(2).click();
        await page.mouse.move(0, 0);
        await settle(page);
        const pointer = focusedRow(await readRows(page));
        check(pointer?.name === 'Sign out', `pointer focused ${pointer?.name}`);
        check(
          pointer?.outlineStyle === 'none',
          `pointer-focused row draws ${pointer?.outlineStyle}`,
        );
        check(
          pointer != null && pointer.fill[3] > 0 && pointer.fill[3] < 1,
          `pointer-focused fill ${JSON.stringify(pointer?.fill)}`,
        );
        await frame('pointer-focus', {focused: pointer});

        // Keyboard: the focused row draws the shared ring inside its edge.
        await page.mouse.move(0, 0);
        await page.locator('#storybook-root [role="menuitem"]').first().focus();
        await page.keyboard.press('ArrowDown');
        await settle(page);
        const keyboard = await readRows(page);
        const ring = focusedRow(keyboard);
        check(ring?.name === 'Settings', `ArrowDown reached ${ring?.name}`);
        checkRing(check, ring, 'menu');
        await frame('keyboard-focus', {focused: ring});
      },
    });
  }

  cases.push({
    key: `sizes-${mode}-ltr`,
    group: 'sizes',
    story: 'core-navmenu--small-size',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const small = await readRows(page);
      checkRows(check, small, 'sm');
      const result = await axe(page);
      checkAxe(check, result);
      await frame('sm', {small, axe: result});
      const url = page.url();
      await page.goto(
        url.replace('core-navmenu--small-size', 'core-navmenu--default'),
      );
      await page.locator('#storybook-root [role="menuitem"]').first().waitFor();
      await settle(page);
      const medium = await readRows(page);
      checkRows(check, medium, 'md');
      await frame('md', {medium});
      await page.goto(
        url.replace(
          'core-navmenu--small-size',
          'core-navmenu--with-descriptions',
        ),
      );
      await page.locator('#storybook-root [role="menuitem"]').first().waitFor();
      await settle(page);
      const large = await readRows(page);
      checkRows(check, large, 'lg', WITH_DESCRIPTIONS);
      const [sm, md, lg] = [small, medium, large].map(read => read.rows[0]);
      check(
        sm != null &&
          md != null &&
          lg != null &&
          sm.paddingBlock < md.paddingBlock &&
          md.paddingBlock < lg.paddingBlock,
        `block padding sm ${sm?.paddingBlock}, md ${md?.paddingBlock}, lg ${lg?.paddingBlock}`,
      );
      check(
        sm != null &&
          md != null &&
          lg != null &&
          sm.paddingInline === md.paddingInline &&
          md.paddingInline < lg.paddingInline,
        `inline padding sm ${sm?.paddingInline}, md ${md?.paddingInline}, lg ${lg?.paddingInline}`,
      );
      check(
        sm != null && md != null && sm.height < md.height,
        `row height sm ${sm?.height}, md ${md?.height}`,
      );
      await frame('lg', {large});
    },
  });

  cases.push({
    key: `disabled-${mode}-ltr`,
    group: 'disabled',
    story: 'core-navmenu--disabled-items',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readRows(page);
      checkRows(check, rest, 'md');
      const byName = Object.fromEntries(rest.rows.map(row => [row.name, row]));
      for (const [name, tag] of [
        ['Analytics', 'a'],
        ['Admin', 'div'],
      ] as const) {
        const row = byName[name];
        check(
          row?.disabled === 'true' && row.tag === tag && row.href == null,
          `${name}: ${JSON.stringify(row)}`,
        );
        check(row?.opacity === 0.5, `${name}: opacity ${row?.opacity}`);
        check(row?.cursor === 'default', `${name}: cursor ${row?.cursor}`);
      }
      const result = await axe(page);
      checkAxe(check, result);
      await frame('rest', {rest, axe: result});

      const disabledRow = page
        .locator('#storybook-root [role="menuitem"]')
        .nth(1);
      await page.mouse.move(0, 0);
      await settle(page);
      const restShot = await rowShot(page, 1);
      await disabledRow.hover({force: true});
      await settle(page);
      const hoverShot = await rowShot(page, 1);
      check(hoverShot.equals(restShot), 'disabled row paints a hover');
      const before = page.url();
      await disabledRow.click({force: true});
      await settle(page);
      check(page.url() === before, `disabled link navigated to ${page.url()}`);
      await frame('hover', {});

      await page.mouse.move(0, 0);
      await page.locator('#storybook-root [role="menuitem"]').first().focus();
      await page.keyboard.press('ArrowDown');
      await settle(page);
      const focused = focusedRow(await readRows(page));
      check(
        focused?.name === 'Analytics',
        `ArrowDown reached ${focused?.name}`,
      );
      check(
        focused != null && focused.outlineStyle !== 'none',
        `focused disabled row draws ${focused?.outlineStyle}`,
      );
      await frame('keyboard-focus', {focused});
    },
  });
}

cases.push({
  key: 'forced-colors',
  group: 'themes',
  story: 'core-navmenu--with-descriptions',
  mode: 'light',
  direction: 'ltr',
  theme: 'neutral',
  viewport: DESKTOP,
  forcedColors: true,
  run: async (page, check, frame) => {
    await page.locator('#storybook-root [role="menuitem"]').first().focus();
    await page.keyboard.press('ArrowDown');
    await settle(page);
    const read = await readRows(page);
    const ring = focusedRow(read);
    // Forced colors drop the fill; the ring alone marks the focused row.
    checkRing(check, ring, 'row');
    await frame('keyboard-focus', {focused: ring});
  },
});

cases.push({
  key: 'matcha-light',
  group: 'themes',
  story: 'core-navmenu--with-descriptions',
  mode: 'light',
  direction: 'ltr',
  theme: 'matcha',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    const rest = await readRows(page);
    checkRows(check, rest, 'lg', WITH_DESCRIPTIONS);
    await page.locator('#storybook-root [role="menuitem"]').first().focus();
    await page.keyboard.press('ArrowDown');
    await settle(page);
    const ring = focusedRow(await readRows(page));
    checkRing(check, ring, 'menu');
    await frame('keyboard-focus', {rest, focused: ring});
  },
});

cases.push({
  key: 'narrow-light-ltr',
  group: 'themes',
  story: 'core-navmenu--with-descriptions',
  mode: 'light',
  direction: 'ltr',
  theme: 'neutral',
  viewport: NARROW,
  run: async (page, check, frame) => {
    const scroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    check(
      scroll.scrollWidth <= scroll.clientWidth,
      `horizontal scroll at 320px: ${JSON.stringify(scroll)}`,
    );
    const rest = await readRows(page);
    checkRows(check, rest, 'lg', WITH_DESCRIPTIONS);
    await frame('rest', {scroll, rest});
  },
});

for (const mode of ['light', 'dark'] as const) {
  for (const viewport of [DESKTOP, NARROW]) {
    cases.push({
      key: `overflow-${mode}-${viewport.width}`,
      group: 'overflow',
      story: 'core-navheadingmenuitem--states',
      mode,
      direction: 'ltr',
      theme: 'neutral',
      viewport,
      run: async (page, check, frame) => {
        const rest = await readRows(page);
        checkRows(check, rest, 'md', LONG_STORY_DESCRIPTIONS);
        check(rest.menuName === 'Account', `menu name ${rest.menuName}`);
        const long = rest.rows[4];
        const profile = rest.rows[0];
        check(
          long?.labelCut === true && long.descriptionCut === true,
          `long row is not cut: label ${long?.labelCut}, description ${long?.descriptionCut}`,
        );
        check(
          long != null &&
            profile != null &&
            long.height === profile.height &&
            long.width === profile.width,
          `long row box ${long?.width}x${long?.height} vs ${profile?.width}x${profile?.height}`,
        );
        const scroll = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        check(
          scroll.scrollWidth <= scroll.clientWidth,
          `horizontal scroll: ${JSON.stringify(scroll)}`,
        );
        const result = await axe(page);
        checkAxe(check, result);
        await frame('rest', {rest, scroll, axe: result});
      },
    });
  }
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

async function runCase(page: Page, item: AuditCase) {
  await page.setViewportSize(item.viewport);
  await page.emulateMedia({
    colorScheme: item.mode,
    reducedMotion: 'reduce',
    forcedColors: item.forcedColors ? 'active' : 'none',
  });
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
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
    const screenshot = await page.screenshot({animations: 'disabled'});
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
    await page.locator('#storybook-root [role="menuitem"]').first().waitFor();
    await settle(page);
    sensors = await pageSensors(page);
    check(!sensors.storybookError, 'storybook error display');
    check(sensors.mode === item.mode, `mode ${sensors.mode}`);
    check(sensors.theme === item.theme, `theme ${sensors.theme}`);
    check(
      sensors.direction === item.direction,
      `direction ${sensors.direction}`,
    );
    check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
    check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
    check(
      sensors.forcedColors === (item.forcedColors ?? false),
      `forced colors ${sensors.forcedColors}`,
    );
    check(sensors.reducedMotion, 'reduced motion not emulated');
    await item.run(page, check, frame);
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'NavHeadingMenuItem',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    mode: item.mode,
    theme: item.theme,
    direction: item.direction,
    viewport: item.viewport,
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
