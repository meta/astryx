// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit MoreMenu

/**
 * @file MoreMenuAudit.a11y.chromium.spec.ts
 * @input Exact-head MoreMenu stories across modes, direction, sizes, variants, and presentations
 * @output Screenshots and fail-closed sensor receipts for the MoreMenu whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a MoreMenu audit pull request
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

const OUTPUT = path.resolve('more-menu-audit-evidence');

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

const DESKTOP = {width: 900, height: 600};
const PHONE = {width: 390, height: 844};

/** WCAG 2.2 SC 2.5.8 minimum target, and SC 1.4.11 non-text contrast. */
const MIN_TARGET_PX = 24;
const MIN_ICON_CONTRAST = 3;
/** Edges that line up may differ by sub-pixel rounding. */
const EDGE_TOLERANCE_PX = 1;

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

/**
 * Every trigger with this accessible name: markup, ARIA, the element its
 * `aria-controls` names, box, cursor, and the contrast of its icon against
 * the backdrop it paints on. Colors are normalized through a canvas so any
 * CSS color syntax reads as sRGB.
 */
async function triggers(page: Page, name: string) {
  return page.evaluate(label => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    const unreadable: string[] = [];
    const rgba = (value: string) => {
      if (ctx == null) {
        unreadable.push(value);
        return [0, 0, 0, 0];
      }
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#010203';
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const backdrop = (el: Element) => {
      const layers: number[][] = [];
      let node: Element | null = el;
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
    return Array.from(
      document.querySelectorAll<HTMLElement>('#storybook-root button'),
    )
      .filter(button => button.getAttribute('aria-label') === label)
      .map(button => {
        const rect = button.getBoundingClientRect();
        const controls = button.getAttribute('aria-controls');
        const controlled = controls ? document.getElementById(controls) : null;
        const icon = button.querySelector('svg');
        let contrast = null;
        if (icon != null) {
          const fg = rgba(getComputedStyle(icon).color);
          const bg = backdrop(button);
          const composite = bg.map((c, i) => fg[i] * fg[3] + c * (1 - fg[3]));
          const [hi, lo] = [luminance(composite), luminance(bg)].sort(
            (a, b) => b - a,
          );
          contrast = {
            foreground: getComputedStyle(icon).color,
            backdrop: `rgb(${bg.map(Math.round).join(', ')})`,
            ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
          };
        }
        return {
          type: button.getAttribute('type'),
          text: button.textContent?.trim() ?? '',
          haspopup: button.getAttribute('aria-haspopup'),
          expanded: button.getAttribute('aria-expanded'),
          disabled: button.disabled,
          ariaDisabled: button.getAttribute('aria-disabled'),
          tabIndex: button.tabIndex,
          variant: button.getAttribute('data-variant'),
          size: button.getAttribute('data-size'),
          buttonTarget: button.classList.contains('astryx-button'),
          moreMenuOnTrigger: button.classList.contains('astryx-more-menu'),
          controls,
          controlledRole: controlled?.getAttribute('role') ?? null,
          controlledTarget:
            controlled?.classList.contains('astryx-more-menu') ?? false,
          cursor: getComputedStyle(button).cursor,
          box: {
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            top: Math.round(rect.top * 10) / 10,
            bottom: Math.round(rect.bottom * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
          },
          iconCount: button.querySelectorAll('svg').length,
          contrast,
          unreadable,
        };
      });
  }, name);
}

type Trigger = Awaited<ReturnType<typeof triggers>>[number];

/** The menu-button parts, the 24 px target, and the icon's contrast. */
function checkTrigger(
  check: Check,
  trigger: Trigger,
  label: string,
  expected: {variant: string; size: string},
) {
  check(trigger.type === 'button', `${label} type ${trigger.type}`);
  check(trigger.buttonTarget, `${label} has no button target`);
  check(!trigger.moreMenuOnTrigger, `${label} trigger carries more-menu`);
  check(trigger.text === '', `${label} shows text "${trigger.text}"`);
  check(
    trigger.haspopup === 'menu',
    `${label} aria-haspopup ${trigger.haspopup}`,
  );
  check(
    trigger.expanded === 'false',
    `${label} aria-expanded ${trigger.expanded}`,
  );
  check(
    trigger.controlledRole === 'menu' && trigger.controlledTarget,
    `${label} aria-controls names role ${trigger.controlledRole} (more-menu ${trigger.controlledTarget})`,
  );
  check(
    trigger.variant === expected.variant,
    `${label} variant ${trigger.variant}`,
  );
  check(trigger.size === expected.size, `${label} size ${trigger.size}`);
  check(
    trigger.box.width >= MIN_TARGET_PX && trigger.box.height >= MIN_TARGET_PX,
    `${label} target ${trigger.box.width}x${trigger.box.height}`,
  );
  check(trigger.iconCount === 1, `${label} has ${trigger.iconCount} icons`);
  check(
    trigger.unreadable.length === 0,
    `${label} colors not read: ${trigger.unreadable.join(', ')}`,
  );
  check(
    trigger.contrast != null && trigger.contrast.ratio >= MIN_ICON_CONTRAST,
    `${label} icon contrast ${trigger.contrast?.ratio} below ${MIN_ICON_CONTRAST}`,
  );
}

/** Axe on the story root, WCAG 2.2 A and AA rules. */
async function axe(page: Page) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return {
    violations: results.violations.flatMap(violation =>
      violation.nodes.map(node => `${violation.id}: ${node.failureSummary}`),
    ),
    passes: results.passes.map(pass => pass.id),
  };
}

function checkAxe(check: Check, result: Awaited<ReturnType<typeof axe>>) {
  check(
    result.violations.length === 0,
    `axe: ${result.violations.join(' | ')}`,
  );
  check(result.passes.includes('button-name'), 'axe did not check names');
}

/** Chromium's accessibility-tree node for the named button. */
async function axButton(page: Page, name: string) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: {
        ignored?: boolean;
        role?: {value?: string};
        name?: {value?: string};
        properties?: {name: string; value: {value?: unknown}}[];
      }[];
    };
    return nodes
      .filter(
        node =>
          !node.ignored &&
          node.role?.value === 'button' &&
          node.name?.value === name,
      )
      .map(node => ({
        expanded:
          node.properties?.find(p => p.name === 'expanded')?.value.value ??
          null,
        haspopup:
          node.properties?.find(p => p.name === 'hasPopup')?.value.value ??
          null,
      }));
  } finally {
    await cdp.detach();
  }
}

/** The open menu's box, its items, and where focus sits. */
async function openMenu(page: Page, name: string) {
  return page.evaluate(label => {
    const button = Array.from(
      document.querySelectorAll<HTMLElement>('#storybook-root button'),
    ).find(el => el.getAttribute('aria-label') === label) as HTMLElement;
    const id = button.getAttribute('aria-controls');
    const menu = id ? document.getElementById(id) : null;
    const rect = menu?.getBoundingClientRect();
    const items = menu
      ? Array.from(menu.querySelectorAll('[role="menuitem"]'))
      : [];
    return {
      expanded: button.getAttribute('aria-expanded'),
      menuVisible:
        menu != null && rect != null && rect.width > 0 && rect.height > 0,
      menuTarget: menu?.classList.contains('astryx-more-menu') ?? false,
      items: items.map(item => item.textContent?.trim() ?? ''),
      focusOnFirstItem: items[0] != null && document.activeElement === items[0],
      trigger: (() => {
        const r = button.getBoundingClientRect();
        return {left: r.left, right: r.right, bottom: r.bottom};
      })(),
      menu: rect ? {left: rect.left, right: rect.right, top: rect.top} : null,
    };
  }, name);
}

async function focusTrigger(page: Page, name: string, check: Check) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  const trigger = page.getByRole('button', {name, exact: true});
  let focused = false;
  for (let i = 0; i < 20 && !focused; i++) {
    await page.keyboard.press('Tab');
    focused = await trigger.evaluate(el => el === document.activeElement);
  }
  check(focused, `Tab never reaches ${name}`);
  return trigger;
}

/**
 * Hover shows the label as a tooltip; Tab focuses the trigger; Enter and
 * Space each open the menu below the trigger with focus on the first item;
 * Escape closes it and returns focus to the trigger.
 */
async function driveMenu(
  page: Page,
  check: Check,
  frame: FrameSink,
  name: string,
  direction: Direction,
) {
  const trigger = page.getByRole('button', {name, exact: true});
  await page.mouse.move(0, 0);
  await settle(page);
  const rest = await trigger.screenshot({animations: 'disabled'});
  await trigger.hover();
  const tooltip = page.locator('[role="tooltip"]', {hasText: name});
  const tooltipShown = await tooltip
    .first()
    .waitFor({state: 'visible', timeout: 3000})
    .then(() => true)
    .catch(() => false);
  check(tooltipShown, `hover shows no "${name}" tooltip`);
  await settle(page);
  const hover = await trigger.screenshot({animations: 'disabled'});
  check(!hover.equals(rest), 'hover paints like rest');
  await frame('hover', {tooltipShown});
  await focusTrigger(page, name, check);
  await settle(page);
  const focusVisible = await trigger.evaluate(el =>
    el.matches(':focus-visible'),
  );
  check(focusVisible, 'trigger is not :focus-visible after Tab');
  await frame('focus-visible', {focusVisible});
  for (const key of ['Enter', 'Space']) {
    await page.keyboard.press(key);
    await page.waitForFunction(
      label =>
        Array.from(document.querySelectorAll('#storybook-root button'))
          .find(el => el.getAttribute('aria-label') === label)
          ?.getAttribute('aria-expanded') === 'true',
      name,
    );
    await settle(page);
    const open = await openMenu(page, name);
    check(open.menuVisible, `${key}: menu not visible`);
    check(open.menuTarget, `${key}: open menu has no more-menu target`);
    check(open.items.length > 0, `${key}: open menu has no items`);
    check(open.focusOnFirstItem, `${key}: focus is not on the first item`);
    if (open.menu != null) {
      check(
        open.menu.top >= open.trigger.bottom - EDGE_TOLERANCE_PX,
        `${key}: menu top ${open.menu.top} above trigger bottom ${open.trigger.bottom}`,
      );
      const startEdge =
        direction === 'ltr'
          ? Math.abs(open.menu.left - open.trigger.left)
          : Math.abs(open.menu.right - open.trigger.right);
      check(
        startEdge <= EDGE_TOLERANCE_PX,
        `${key}: menu start edge is ${startEdge}px from the trigger's`,
      );
    }
    if (key === 'Enter') {
      await frame('open', open);
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      label =>
        Array.from(document.querySelectorAll('#storybook-root button'))
          .find(el => el.getAttribute('aria-label') === label)
          ?.getAttribute('aria-expanded') === 'false',
      name,
    );
    await settle(page);
    const returned = await trigger.evaluate(
      el => el === document.activeElement,
    );
    check(returned, `${key}: focus did not return to the trigger`);
  }
  const ax = await axButton(page, name);
  check(
    ax.length === 1 && ax[0].expanded === false && ax[0].haspopup === 'menu',
    `accessibility tree after close: ${JSON.stringify(ax)}`,
  );
  await frame('closed', {ax});
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `default-${mode}-${direction}`,
      group: 'default',
      story: 'core-moremenu--default',
      ready: '#storybook-root button',
      mode,
      direction,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const list = await triggers(page, 'More options');
        check(list.length === 1, `${list.length} triggers`);
        if (list[0] != null) {
          checkTrigger(check, list[0], 'More options', {
            variant: 'ghost',
            size: 'md',
          });
        }
        const result = await axe(page);
        checkAxe(check, result);
        await frame('rest', {list, axe: result});
        await driveMenu(page, check, frame, 'More options', direction);
      },
    });
  }

  const statics: {
    story: string;
    triggers: {label: string; variant: string; size: string}[];
  }[] = [
    {
      story: 'core-moremenu--small-size',
      triggers: [{label: 'Row actions', variant: 'ghost', size: 'sm'}],
    },
    {
      story: 'core-moremenu--variants',
      triggers: [
        {label: 'Ghost variant', variant: 'ghost', size: 'md'},
        {label: 'Secondary variant', variant: 'secondary', size: 'md'},
        {label: 'Primary variant', variant: 'primary', size: 'md'},
      ],
    },
    {
      story: 'core-moremenu--custom-icon',
      triggers: [
        {label: 'Settings', variant: 'ghost', size: 'md'},
        {label: 'Edit options', variant: 'ghost', size: 'md'},
      ],
    },
  ];
  for (const item of statics) {
    cases.push({
      key: `${item.story.replace('core-moremenu--', '')}-${mode}-ltr`,
      group: 'statics',
      story: item.story,
      ready: '#storybook-root button',
      mode,
      direction: 'ltr',
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const observed: Record<string, unknown> = {};
        for (const expected of item.triggers) {
          const list = await triggers(page, expected.label);
          check(
            list.length === 1,
            `${list.length} "${expected.label}" triggers`,
          );
          if (list[0] != null) {
            checkTrigger(check, list[0], expected.label, expected);
          }
          observed[expected.label] = list;
        }
        const result = await axe(page);
        checkAxe(check, result);
        await frame('rest', {observed, axe: result});
      },
    });
  }

  cases.push({
    key: `disabled-${mode}-ltr`,
    group: 'statics',
    story: 'core-moremenu--disabled',
    ready: '#storybook-root button',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const list = await triggers(page, 'More options');
      check(list.length === 1, `${list.length} triggers`);
      const trigger = list[0];
      // Button keeps a disabled control focusable with aria-disabled.
      check(
        trigger?.disabled === false && trigger?.ariaDisabled === 'true',
        `disabled ${trigger?.disabled}, aria-disabled ${trigger?.ariaDisabled}`,
      );
      check(trigger?.tabIndex === 0, `disabled tabIndex ${trigger?.tabIndex}`);
      check(
        trigger?.cursor === 'default',
        `disabled cursor ${trigger?.cursor}`,
      );
      const button = page.getByRole('button', {name: 'More options'});
      await page.mouse.move(0, 0);
      await settle(page);
      const rest = await button.screenshot({animations: 'disabled'});
      await button.hover({force: true});
      await settle(page);
      const hover = await button.screenshot({animations: 'disabled'});
      check(hover.equals(rest), 'disabled trigger paints a hover state');
      await button.click({force: true});
      await settle(page);
      const after = await triggers(page, 'More options');
      check(
        after[0]?.expanded === 'false',
        `disabled trigger opened: aria-expanded ${after[0]?.expanded}`,
      );
      await frame('rest', {list, after});
    },
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `alignment-light-${direction}`,
    group: 'alignment',
    story: 'core-moremenu--alignment',
    ready: '#storybook-root button',
    mode: 'light',
    direction,
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const observed: Record<string, unknown> = {};
      for (const [label, edge] of [
        ['Start aligned', 'start'],
        ['End aligned', 'end'],
      ] as const) {
        await page.getByRole('button', {name: label, exact: true}).click();
        await page.waitForFunction(
          name =>
            Array.from(document.querySelectorAll('#storybook-root button'))
              .find(el => el.getAttribute('aria-label') === name)
              ?.getAttribute('aria-expanded') === 'true',
          label,
        );
        await settle(page);
        const open = await openMenu(page, label);
        observed[label] = open;
        if (open.menu == null) {
          check(false, `${label}: menu not measured`);
        } else {
          const leftAligned =
            edge === 'start' ? direction === 'ltr' : direction === 'rtl';
          const gap = leftAligned
            ? Math.abs(open.menu.left - open.trigger.left)
            : Math.abs(open.menu.right - open.trigger.right);
          check(
            gap <= EDGE_TOLERANCE_PX,
            `${label}: menu ${edge} edge is ${gap}px from the trigger's`,
          );
        }
        await frame(`open-${edge}`, open);
        await page.keyboard.press('Escape');
        await settle(page);
      }
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `sheet-${mode}-ltr`,
    group: 'sheet',
    story: 'core-moremenu--bottom-sheet-presentation',
    ready: '#storybook-root button',
    mode,
    direction: 'ltr',
    viewport: PHONE,
    run: async (page, check, frame) => {
      const trigger = page.getByRole('button', {name: 'Project actions'});
      const haspopup = await trigger.getAttribute('aria-haspopup');
      check(haspopup === 'dialog', `aria-haspopup ${haspopup}`);
      const dialog = page.getByRole('dialog');
      const open = await dialog
        .first()
        .waitFor({state: 'visible', timeout: 3000})
        .then(() => true)
        .catch(() => false);
      if (!open) {
        await trigger.click();
      }
      await dialog.first().waitFor({state: 'visible', timeout: 3000});
      await settle(page);
      const sheet = await dialog.first().evaluate(el => ({
        text: el.textContent ?? '',
        rows: el.querySelectorAll('button').length,
      }));
      for (const label of ['Edit', 'Duplicate', 'Share', 'Delete']) {
        check(sheet.text.includes(label), `sheet has no "${label}" row`);
      }
      const expanded = await trigger.getAttribute('aria-expanded');
      check(expanded === 'true', `open aria-expanded ${expanded}`);
      await frame('open', {haspopup, sheet, expanded});
      await page.keyboard.press('Escape');
      await dialog
        .first()
        .waitFor({state: 'hidden', timeout: 3000})
        .catch(() => check(false, 'Escape did not close the sheet'));
      await settle(page);
      const returned = await trigger.evaluate(
        el => el === document.activeElement,
      );
      check(returned, 'focus did not return to the trigger');
      await frame('closed', {returned});
    },
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
    component: 'MoreMenu',
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
