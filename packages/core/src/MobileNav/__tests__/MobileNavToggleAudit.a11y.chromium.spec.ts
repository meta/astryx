// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit MobileNavToggle

/**
 * @file MobileNavToggleAudit.a11y.chromium.spec.ts
 * @input Exact-head AppShell and MobileNav stories at phone, narrow, and wide widths, across modes and direction
 * @output Screenshots and fail-closed sensor receipts for the MobileNavToggle whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a MobileNavToggle audit pull request
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

const OUTPUT = path.resolve('mobile-nav-toggle-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};

type Check = (condition: boolean, message: string) => void;

type Frame = {state: string; observed: unknown};

type FrameSink = (state: string, observed: unknown) => Promise<Buffer>;

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

const PHONE = {width: 390, height: 844};
const NARROW = {width: 320, height: 640};
const WIDE = {width: 1180, height: 800};
/** Above the `xl` breakpoint the page-placed story uses. */
const WIDER = {width: 1440, height: 800};

const TOGGLE = '[data-testid="mobile-nav-toggle"]';
const DEFAULT_NAME = 'Open navigation';
/** WCAG 2.2 SC 2.5.8 minimum target, and SC 1.4.11 non-text contrast. */
const MIN_TARGET_PX = 24;
const MIN_ICON_CONTRAST = 3;
/** The drawer closes within 250 ms of the request. Allow time for a frame. */
const CLOSE_WAIT_MS = 1000;

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
 * Every rendered toggle: markup, ARIA, box, icon, and the contrast of its
 * icon against the backdrop it paints on. Colors are normalized through a
 * canvas so any CSS color syntax reads as sRGB.
 */
async function toggles(page: Page, selector: string) {
  return page.evaluate(sel => {
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
    return Array.from(document.querySelectorAll(sel)).map(el => {
      const button = el as HTMLElement;
      const rect = button.getBoundingClientRect();
      const controls = button.getAttribute('aria-controls');
      const controlled = controls ? document.getElementById(controls) : null;
      const icons = Array.from(button.querySelectorAll('svg'));
      const icon = icons[0] ?? null;
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
        tag: button.tagName,
        type: button.getAttribute('type'),
        name: button.getAttribute('aria-label'),
        text: button.textContent?.trim() ?? '',
        expanded: button.getAttribute('aria-expanded'),
        controls,
        controlledTag: controlled?.tagName ?? null,
        controlledOpen:
          controlled instanceof HTMLDialogElement ? controlled.open : null,
        buttonTarget: button.classList.contains('astryx-button'),
        box: {
          left: Math.round(rect.left * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          top: Math.round(rect.top * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        },
        iconCount: icons.length,
        customIcon:
          button.querySelector('[data-testid="custom-toggle-icon"]') != null,
        contrast,
        unreadable,
      };
    });
  }, selector);
}

/** Chromium's accessibility-tree buttons with this name, and their expanded state. */
async function axButtons(page: Page, name: string) {
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
      }));
  } finally {
    await cdp.detach();
  }
}

/** Axe on the toggle alone, WCAG 2.2 A and AA rules. */
async function axeToggle(page: Page) {
  const results = await new AxeBuilder({page})
    .include(TOGGLE)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return {
    violations: results.violations.flatMap(violation =>
      violation.nodes.map(node => `${violation.id}: ${node.failureSummary}`),
    ),
    passes: results.passes.map(pass => pass.id),
  };
}

type Toggle = Awaited<ReturnType<typeof toggles>>[number];

/** Name, expanded state, controlled dialog, the 24 px target, and icon contrast. */
function checkToggle(
  check: Check,
  toggle: Toggle,
  name: string,
  viewport: Viewport,
) {
  check(toggle.tag === 'BUTTON', `toggle is a ${toggle.tag}`);
  check(toggle.type === 'button', `toggle type ${toggle.type}`);
  check(toggle.buttonTarget, 'toggle has no button target');
  check(toggle.name === name, `toggle name ${toggle.name}`);
  check(toggle.text === '', `toggle shows text "${toggle.text}"`);
  check(toggle.expanded === 'false', `aria-expanded ${toggle.expanded}`);
  check(
    toggle.controlledTag === 'DIALOG',
    `aria-controls ${toggle.controls} names a ${toggle.controlledTag}`,
  );
  check(toggle.controlledOpen === false, 'the controlled dialog is open');
  check(
    toggle.box.width >= MIN_TARGET_PX && toggle.box.height >= MIN_TARGET_PX,
    `target ${toggle.box.width}x${toggle.box.height}`,
  );
  check(
    toggle.box.left >= 0 && toggle.box.right <= viewport.width,
    `toggle leaves the viewport: ${toggle.box.left}..${toggle.box.right}`,
  );
  check(toggle.iconCount === 1, `${toggle.iconCount} icons`);
  check(
    toggle.unreadable.length === 0,
    `colors not read: ${toggle.unreadable.join(', ')}`,
  );
  check(
    toggle.contrast != null && toggle.contrast.ratio >= MIN_ICON_CONTRAST,
    `icon contrast ${toggle.contrast?.ratio} below ${MIN_ICON_CONTRAST}`,
  );
}

/**
 * Drives the toggle through hover, keyboard focus, open, and Escape. Each
 * state must paint differently from rest, and focus must come back to the
 * toggle after the drawer closes.
 */
async function driveStates(
  page: Page,
  check: Check,
  frame: FrameSink,
  name: string,
) {
  const toggle = page.locator(TOGGLE);
  await page.mouse.move(0, 0);
  await settle(page);
  const rest = await toggle.screenshot({animations: 'disabled'});
  await toggle.hover();
  await settle(page);
  const hover = await toggle.screenshot({animations: 'disabled'});
  check(!hover.equals(rest), 'hover paints like rest');
  await frame('hover', {});
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  let focused = false;
  for (let i = 0; i < 40 && !focused; i++) {
    await page.keyboard.press('Tab');
    focused = await toggle.evaluate(el => el === document.activeElement);
  }
  check(focused, 'Tab never reaches the toggle');
  await settle(page);
  const focus = await toggle.screenshot({animations: 'disabled'});
  const outline = await toggle.evaluate(el => {
    const style = getComputedStyle(el);
    return {
      focusVisible: el.matches(':focus-visible'),
      style: style.outlineStyle,
      width: style.outlineWidth,
      color: style.outlineColor,
    };
  });
  check(outline.focusVisible, 'toggle is not :focus-visible after Tab');
  check(!focus.equals(rest), 'keyboard focus paints like rest');
  await frame('focus-visible', {outline});
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    sel =>
      document.querySelector(sel)?.getAttribute('aria-expanded') === 'true',
    TOGGLE,
  );
  await settle(page);
  const open = await page.evaluate(sel => {
    const button = document.querySelector(sel) as HTMLElement;
    const id = button.getAttribute('aria-controls');
    const dialog = id ? document.getElementById(id) : null;
    return {
      expanded: button.getAttribute('aria-expanded'),
      dialogOpen: dialog instanceof HTMLDialogElement && dialog.open,
      focusInDialog: dialog?.contains(document.activeElement) ?? false,
    };
  }, TOGGLE);
  check(open.expanded === 'true', `open aria-expanded ${open.expanded}`);
  check(open.dialogOpen, 'the dialog aria-controls names did not open');
  check(open.focusInDialog, 'focus did not move into the open drawer');
  await frame('open', open);
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    sel => {
      const button = document.querySelector(sel) as HTMLElement;
      const id = button.getAttribute('aria-controls');
      const dialog = id ? document.getElementById(id) : null;
      return dialog instanceof HTMLDialogElement && !dialog.open;
    },
    TOGGLE,
    {timeout: CLOSE_WAIT_MS},
  );
  await settle(page);
  const closed = await page.evaluate(sel => {
    const button = document.querySelector(sel) as HTMLElement;
    return {
      expanded: button.getAttribute('aria-expanded'),
      focusReturned: document.activeElement === button,
    };
  }, TOGGLE);
  check(closed.expanded === 'false', `closed aria-expanded ${closed.expanded}`);
  check(closed.focusReturned, 'focus did not return to the toggle');
  const ax = await axButtons(page, name);
  check(
    ax.length === 1 && ax[0].expanded === false,
    `accessibility tree after close: ${JSON.stringify(ax)}`,
  );
  await frame('closed', closed);
}

const AUTO_STORIES = [
  'core-appshell--side-nav-only',
  'core-appshell--top-nav-with-side-nav',
];
const PLACED_STORY = 'core-mobilenav--toggle-in-app-shell';
const PLACED_NAME = 'Open menu';

const cases: AuditCase[] = [];

for (const story of AUTO_STORIES) {
  const short = story.replace('core-appshell--', '');
  for (const mode of ['light', 'dark'] as const) {
    for (const direction of ['ltr', 'rtl'] as const) {
      cases.push({
        key: `auto-${short}-${mode}-${direction}`,
        group: 'auto',
        story,
        ready: TOGGLE,
        mode,
        direction,
        viewport: PHONE,
        run: async (page, check, frame) => {
          const list = await toggles(page, TOGGLE);
          check(list.length === 1, `${list.length} toggles`);
          if (list[0] != null) {
            checkToggle(check, list[0], DEFAULT_NAME, PHONE);
          }
          const ax = await axButtons(page, DEFAULT_NAME);
          check(
            ax.length === 1 && ax[0].expanded === false,
            `accessibility tree: ${JSON.stringify(ax)}`,
          );
          const axe = await axeToggle(page);
          check(
            axe.violations.length === 0,
            `axe: ${axe.violations.join(' | ')}`,
          );
          check(
            axe.passes.includes('button-name'),
            'axe did not check the name',
          );
          await frame('rest', {list, ax, axe});
          await driveStates(page, check, frame, DEFAULT_NAME);
        },
      });
    }
  }
  cases.push({
    key: `wide-${short}-light-ltr`,
    group: 'wide',
    story,
    ready: '#storybook-root nav',
    mode: 'light',
    direction: 'ltr',
    viewport: WIDE,
    run: async (page, check, frame) => {
      const list = await toggles(page, TOGGLE);
      check(list.length === 0, `${list.length} toggles above the breakpoint`);
      const ax = await axButtons(page, DEFAULT_NAME);
      check(ax.length === 0, `${ax.length} toggles in the accessibility tree`);
      await frame('rest', {list, ax});
    },
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `narrow-side-nav-only-light-${direction}`,
    group: 'narrow',
    story: 'core-appshell--side-nav-only',
    ready: TOGGLE,
    mode: 'light',
    direction,
    viewport: NARROW,
    run: async (page, check, frame) => {
      const list = await toggles(page, TOGGLE);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      check(overflow <= 0, `page scrolls sideways by ${overflow}px`);
      check(list.length === 1, `${list.length} toggles`);
      if (list[0] != null) {
        checkToggle(check, list[0], DEFAULT_NAME, NARROW);
      }
      await frame('rest', {list, overflow});
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `placed-${mode}-${direction}`,
      group: 'placed',
      story: PLACED_STORY,
      ready: TOGGLE,
      mode,
      direction,
      viewport: PHONE,
      run: async (page, check, frame) => {
        const list = await toggles(page, TOGGLE);
        check(list.length === 1, `${list.length} toggles`);
        if (list[0] != null) {
          checkToggle(check, list[0], PLACED_NAME, PHONE);
          check(list[0].customIcon, 'children did not replace the menu icon');
        }
        const ax = await axButtons(page, PLACED_NAME);
        check(
          ax.length === 1 && ax[0].expanded === false,
          `accessibility tree: ${JSON.stringify(ax)}`,
        );
        const axe = await axeToggle(page);
        check(
          axe.violations.length === 0,
          `axe: ${axe.violations.join(' | ')}`,
        );
        check(axe.passes.includes('button-name'), 'axe did not check the name');
        await frame('rest', {list, ax, axe});
        await driveStates(page, check, frame, PLACED_NAME);
      },
    });
  }
}
cases.push({
  key: 'placed-wider-light-ltr',
  group: 'placed',
  story: PLACED_STORY,
  ready: '#storybook-root nav',
  mode: 'light',
  direction: 'ltr',
  viewport: WIDER,
  run: async (page, check, frame) => {
    const list = await toggles(page, TOGGLE);
    check(list.length === 0, `${list.length} toggles above the breakpoint`);
    const ax = await axButtons(page, PLACED_NAME);
    check(ax.length === 0, `${ax.length} toggles in the accessibility tree`);
    await frame('rest', {list, ax});
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
  await page.goto(url, {waitUntil: 'load'});
  await page.locator(item.ready).first().waitFor();
  await settle(page);
  const failures: string[] = [];
  const check: Check = (condition, message) => {
    if (!condition) {
      failures.push(message);
    }
  };
  const sensors = await pageSensors(page);
  check(!sensors.storybookError, 'storybook error display');
  check(sensors.mode === item.mode, `mode ${sensors.mode}`);
  check(sensors.theme === 'neutral', `theme ${sensors.theme}`);
  check(sensors.direction === item.direction, `direction ${sensors.direction}`);
  check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
  check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
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
    return screenshot;
  };
  try {
    await item.run(page, check, frame);
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'MobileNavToggle',
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
