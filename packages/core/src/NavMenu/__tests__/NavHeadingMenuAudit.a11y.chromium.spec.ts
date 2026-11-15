// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit NavHeadingMenu

/**
 * @file NavHeadingMenuAudit.a11y.chromium.spec.ts
 * @input Exact-head NavHeadingMenu stories, standalone and inside a TopNavHeading, across modes, direction, and sizes
 * @output Screenshots and fail-closed sensor receipts for the NavHeadingMenu whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a NavHeadingMenu audit pull request
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

const OUTPUT = path.resolve('nav-heading-menu-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};

type Check = (condition: boolean, message: string) => void;

type Frame = {state: string; observed: unknown};

type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  story: string;
  ready: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 700};
const NARROW = {width: 320, height: 700};

/** WCAG 2.2 SC 2.5.8 minimum target, SC 1.4.3 text, and SC 1.4.11 non-text contrast. */
const MIN_TARGET_PX = 24;
const MIN_TEXT_CONTRAST = 4.5;

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
 * The menu and its rows: roles, tab index, target and size, disabled state,
 * destination, box, the icon's inline position against the label, and the
 * contrast of each row's text against the backdrop it paints on. A focused
 * row also reports its outline and its fill against the menu.
 */
async function readMenu(page: Page, scope: string) {
  return page.evaluate(selector => {
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
    const menu = document.querySelector<HTMLElement>(
      `${selector} .astryx-nav-heading-menu`,
    );
    const rows = menu
      ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      : [];
    const menuBox = menu?.getBoundingClientRect();
    return {
      role: menu?.getAttribute('role') ?? null,
      name: menu?.getAttribute('aria-label') ?? null,
      size: menu?.getAttribute('data-size') ?? null,
      width: menuBox ? Math.round(menuBox.width * 10) / 10 : null,
      nestedInMenu: menu?.parentElement?.closest('[role="menu"]') != null,
      rows: rows.map(row => {
        const rect = row.getBoundingClientRect();
        const icon = row.querySelector('svg');
        const label = row.querySelector('.astryx-text');
        const iconRect = icon?.getBoundingClientRect();
        const labelRect = label?.getBoundingClientRect();
        const style = getComputedStyle(row);
        return {
          name: row.textContent?.trim() ?? '',
          tag: row.tagName.toLowerCase(),
          tabIndex: row.tabIndex,
          target: row.classList.contains('astryx-nav-heading-menu-item'),
          size: row.getAttribute('data-size'),
          disabled: row.getAttribute('aria-disabled'),
          href: row.getAttribute('href'),
          cursor: style.cursor,
          height: Math.round(rect.height * 10) / 10,
          textContrast: label ? textRatio(label) : null,
          iconLeft: iconRect ? iconRect.left : null,
          labelLeft: labelRect ? labelRect.left : null,
          focused: row === document.activeElement,
          outline: `${style.outlineStyle} ${style.outlineWidth}`,
          fillVsMenu: menu ? pair(backdrop(row), backdrop(menu)) : null,
        };
      }),
    };
  }, scope);
}
type Menu = Awaited<ReturnType<typeof readMenu>>;

/** The standing row contract: roles, tab stops, target, size, and text. */
function checkRows(check: Check, menu: Menu, size: string) {
  check(menu.role === 'menu', `menu role ${menu.role}`);
  check(menu.size === size, `menu data-size ${menu.size}`);
  check(menu.rows.length > 0, 'no menuitem rows');
  for (const row of menu.rows) {
    check(row.tabIndex === -1, `${row.name}: tabIndex ${row.tabIndex}`);
    check(row.target, `${row.name}: no nav-heading-menu-item target`);
    check(row.size === size, `${row.name}: data-size ${row.size}`);
    check(row.height >= MIN_TARGET_PX, `${row.name}: height ${row.height}`);
    if (row.disabled !== 'true' && row.textContrast != null) {
      check(
        row.textContrast >= MIN_TEXT_CONTRAST,
        `${row.name}: text contrast ${row.textContrast}`,
      );
    }
  }
}

function focusedRow(menu: Menu) {
  return menu.rows.find(row => row.focused)?.name ?? null;
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `icons-${mode}-${direction}`,
      group: 'standalone',
      story: 'core-navmenu--with-icons',
      ready: '#storybook-root [role="menuitem"]',
      mode,
      direction,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const rest = await readMenu(page, '#storybook-root');
        checkRows(check, rest, 'md');
        for (const row of rest.rows) {
          check(row.tag === 'a' && row.href === '#', `${row.name}: ${row.tag}`);
          if (row.iconLeft != null && row.labelLeft != null) {
            check(
              direction === 'ltr'
                ? row.iconLeft < row.labelLeft
                : row.iconLeft > row.labelLeft,
              `${row.name}: icon is not at the inline start of its label`,
            );
          } else {
            check(false, `${row.name}: icon or label not measured`);
          }
        }
        const result = await axe(page);
        checkAxe(check, result);
        await frame('rest', {rest, axe: result});

        const rows = page.getByRole('menuitem');
        await page.mouse.move(0, 0);
        await settle(page);
        const restShot = await rows.nth(1).screenshot({animations: 'disabled'});
        await rows.nth(1).hover();
        await settle(page);
        const hoverShot = await rows
          .nth(1)
          .screenshot({animations: 'disabled'});
        check(!hoverShot.equals(restShot), 'hover paints like rest');
        await frame('hover', {});

        await page.mouse.move(0, 0);
        await rows.first().focus();
        const order: (string | null)[] = [];
        for (const key of ['ArrowDown', 'ArrowUp', 'ArrowUp', 'Home', 'End']) {
          await page.keyboard.press(key);
          order.push(focusedRow(await readMenu(page, '#storybook-root')));
        }
        check(
          JSON.stringify(order) ===
            JSON.stringify([
              'Documents',
              'Profile',
              'Settings',
              'Profile',
              'Settings',
            ]),
          `keyboard order ${JSON.stringify(order)}`,
        );
        await page.keyboard.press('a');
        const typed = focusedRow(await readMenu(page, '#storybook-root'));
        check(typed === 'Analytics', `typeahead "a" reached ${typed}`);
        await settle(page);
        const focused = await readMenu(page, '#storybook-root');
        // The focused row's fill is under 3:1 and draws no outline. The
        // receipt records both and does not fail on them.
        await frame('keyboard-focus', {
          order,
          typed,
          focused: focused.rows.find(row => row.focused),
        });
      },
    });
  }

  for (const [story, size, names] of [
    ['default', 'md', ['Dashboard', 'Analytics', 'Settings']],
    ['with-descriptions', 'lg', ['Profile', 'Settings', 'Sign out']],
    ['small-size', 'sm', ['Edit', 'Duplicate', 'Delete']],
  ] as const) {
    cases.push({
      key: `${story}-${mode}-ltr`,
      group: 'standalone',
      story: `core-navmenu--${story}`,
      ready: '#storybook-root [role="menuitem"]',
      mode,
      direction: 'ltr',
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const rest = await readMenu(page, '#storybook-root');
        checkRows(check, rest, size);
        check(
          rest.rows.length === names.length &&
            names.every((name, i) => rest.rows[i]?.name.startsWith(name)),
          `rows ${rest.rows.map(row => row.name).join(', ')}`,
        );
        const result = await axe(page);
        checkAxe(check, result);
        await frame('rest', {rest, axe: result});
      },
    });
  }

  cases.push({
    key: `disabled-${mode}-ltr`,
    group: 'standalone',
    story: 'core-navmenu--disabled-items',
    ready: '#storybook-root [role="menuitem"]',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readMenu(page, '#storybook-root');
      checkRows(check, rest, 'md');
      const byName = Object.fromEntries(rest.rows.map(row => [row.name, row]));
      check(
        byName.Analytics?.disabled === 'true' &&
          byName.Analytics?.tag === 'a' &&
          byName.Analytics?.href == null,
        `disabled link ${JSON.stringify(byName.Analytics)}`,
      );
      check(
        byName.Admin?.disabled === 'true' && byName.Admin?.tag === 'div',
        `disabled action ${JSON.stringify(byName.Admin)}`,
      );
      check(
        byName.Analytics?.cursor === 'default',
        `disabled cursor ${byName.Analytics?.cursor}`,
      );
      const rows = page.getByRole('menuitem');
      await page.mouse.move(0, 0);
      await settle(page);
      const disabledRow = rows.nth(1);
      const restShot = await disabledRow.screenshot({animations: 'disabled'});
      await disabledRow.hover({force: true});
      await settle(page);
      const hoverShot = await disabledRow.screenshot({animations: 'disabled'});
      check(hoverShot.equals(restShot), 'disabled row paints a hover');
      const before = page.url();
      await disabledRow.click({force: true});
      await settle(page);
      check(page.url() === before, `disabled link navigated to ${page.url()}`);
      await page.mouse.move(0, 0);
      await rows.first().focus();
      await page.keyboard.press('ArrowDown');
      const reached = focusedRow(await readMenu(page, '#storybook-root'));
      check(reached === 'Analytics', `ArrowDown reached ${reached}`);
      const result = await axe(page);
      checkAxe(check, result);
      await frame('focus-disabled', {rest, reached, axe: result});
    },
  });

  cases.push({
    key: `heading-${mode}-ltr`,
    group: 'heading',
    story: 'core-topnav--with-heading-menu',
    ready: '#storybook-root nav',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const trigger = page.getByRole('button', {name: /Acme Suite/});
      check((await trigger.count()) === 1, 'no Acme Suite heading button');
      const restAxe = await axe(page);
      checkAxe(check, restAxe);
      await frame('rest', {restAxe});
      await trigger.focus();
      await page.keyboard.press('Enter');
      await page.locator('.astryx-nav-heading-menu').waitFor();
      await settle(page);
      const open = await readMenu(page, 'body');
      checkRows(check, open, 'md');
      const openAxe = await axe(page);
      checkAxe(check, openAxe);
      // The menu sits inside the heading's own menu and has no name of its
      // own. The receipt records both facts and does not fail on them.
      await frame('open', {
        open,
        focus: focusedRow(open),
        nested: open.nestedInMenu,
        name: open.name,
        axe: openAxe,
      });
      await page.keyboard.press('Escape');
      await page.locator('.astryx-nav-heading-menu').waitFor({state: 'hidden'});
      await settle(page);
      const returned = await trigger.evaluate(
        el => el === document.activeElement,
      );
      check(returned, 'Escape did not return focus to the heading');
      await page.keyboard.press('Enter');
      await page.locator('.astryx-nav-heading-menu').waitFor();
      await settle(page);
      await page.getByRole('menuitem', {name: 'Billing'}).focus();
      await page.keyboard.press('Enter');
      await page.locator('.astryx-nav-heading-menu').waitFor({state: 'hidden'});
      await settle(page);
      await frame('chosen', {returned});
    },
  });
}

cases.push({
  key: 'narrow-light-ltr',
  group: 'standalone',
  story: 'core-navmenu--with-descriptions',
  ready: '#storybook-root [role="menuitem"]',
  mode: 'light',
  direction: 'ltr',
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
    const rest = await readMenu(page, '#storybook-root');
    checkRows(check, rest, 'lg');
    await frame('rest', {scroll, rest});
  },
});

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
  await page.emulateMedia({colorScheme: item.mode, reducedMotion: 'reduce'});
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:neutral;direction:${item.direction}`;
  const failures: string[] = [];
  const check: Check = (condition, message) => {
    if (!condition) {
      failures.push(message);
    }
  };
  let sensors: Awaited<ReturnType<typeof pageSensors>> | null = null;
  const frames: (Frame & {file: string; sha256: string})[] = [];
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
    await page.locator(item.ready).first().waitFor();
    await settle(page);
    sensors = await pageSensors(page);
    check(!sensors.storybookError, 'storybook error display');
    check(sensors.mode === item.mode, `mode ${sensors.mode}`);
    check(sensors.theme === 'neutral', `theme ${sensors.theme}`);
    check(
      sensors.direction === item.direction,
      `direction ${sensors.direction}`,
    );
    check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
    check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
    await item.run(page, check, frame);
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'NavHeadingMenu',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    mode: item.mode,
    direction: item.direction,
    viewport: item.viewport,
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
