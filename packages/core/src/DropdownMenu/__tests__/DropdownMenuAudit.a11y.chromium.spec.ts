// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit DropdownMenu

/**
 * @file DropdownMenuAudit.a11y.chromium.spec.ts
 * @input Component-owned `Core/DropdownMenu` Storybook fixtures, the exact-head
 *   build stamp, and real keyboard, mouse, and touch-emulated input
 * @output Chromium screenshots plus fail-closed sensor receipts, a
 *   state-visual matrix, and a rendered contrast-pair matrix
 * @position Browser evidence for the DropdownMenu component audit; it also
 *   observes the forced-colors focus outline every menu row paints
 *
 * Each frame drives an existing story into one state — closed, keyboard open,
 * pointer open, hovered and pressed rows, disabled, destructive, selectable,
 * nested, sheet, overflow, header and footer, narrow and coarse — and records
 * what the page actually rendered: build, story, theme, mode, direction,
 * viewport and media, the focused element, geometry, and errors. The receipts
 * are evidence; the spec fails only when a frame could not be taken truthfully
 * or when the forced-colors focus outline is missing.
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Browser, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('test-results/dropdown-menu-audit-evidence');
const WIDE = {width: 1024, height: 720};
const PHONE = {width: 390, height: 720};
const NARROW = {width: 320, height: 640};
const TRIGGER = '#storybook-root button[aria-haspopup]';

type Theme = 'neutral' | 'butter' | 'probe';
type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';

/** How the frame drives the story into its state. */
type Drive =
  | 'closed'
  | 'keyboard-open'
  | 'pointer-open'
  | 'hover-second-row'
  | 'press-second-row'
  | 'keyboard-last-row'
  | 'keyboard-submenu'
  | 'story-play';

interface Case {
  state: string;
  storyId: string;
  drive: Drive;
  theme: Theme;
  mode: Mode;
  direction: Direction;
  viewport: {width: number; height: number};
  pointer?: 'coarse';
  forcedColors?: 'after' | 'before-control';
  /** The approved state representation this frame claims. */
  representation: string;
}

function c(
  state: string,
  storyId: string,
  drive: Drive,
  representation: string,
  options: Partial<Omit<Case, 'state' | 'storyId' | 'drive'>> = {},
): Case {
  return {
    state,
    storyId: `core-dropdownmenu--${storyId}`,
    drive,
    theme: 'neutral',
    mode: 'light',
    direction: 'ltr',
    viewport: WIDE,
    representation,
    ...options,
  };
}

const OVERLAY =
  'Hovered/Focused — Overlay style (alpha tint over the row base)';

const CASES: Case[] = [
  c('trigger-rest', 'default', 'closed', 'Button rest (delegated)'),
  c('trigger-rest-dark', 'default', 'closed', 'Button rest (delegated)', {
    mode: 'dark',
  }),
  c('keyboard-open', 'default', 'keyboard-open', OVERLAY),
  c('keyboard-open-dark', 'default', 'keyboard-open', OVERLAY, {mode: 'dark'}),
  c('keyboard-open-butter', 'default', 'keyboard-open', OVERLAY, {
    theme: 'butter',
  }),
  c('keyboard-open-butter-dark', 'default', 'keyboard-open', OVERLAY, {
    theme: 'butter',
    mode: 'dark',
  }),
  c('keyboard-open-probe', 'default', 'keyboard-open', OVERLAY, {
    theme: 'probe',
  }),
  c('keyboard-open-rtl', 'with-icons', 'keyboard-open', OVERLAY, {
    direction: 'rtl',
  }),
  c(
    'pointer-open',
    'default',
    'pointer-open',
    'Pointer open: menu container focused, no row highlighted',
  ),
  c('hover-row', 'default', 'hover-second-row', OVERLAY),
  c('hover-row-dark', 'default', 'hover-second-row', OVERLAY, {mode: 'dark'}),
  c(
    'pressed-row',
    'default',
    'press-second-row',
    'Pressed — overlay (row archetype: no scale)',
  ),
  c(
    'disabled-row',
    'with-disabled-items',
    'keyboard-last-row',
    'Disabled — aria-disabled row, muted, skipped by focus',
  ),
  c(
    'disabled-row-dark',
    'with-disabled-items',
    'keyboard-last-row',
    'Disabled — aria-disabled row, muted, skipped by focus',
    {mode: 'dark'},
  ),
  c(
    'destructive-row',
    'destructive-item',
    'keyboard-last-row',
    `${OVERLAY}; destructive text in the error color`,
  ),
  c(
    'destructive-row-dark',
    'destructive-item',
    'keyboard-last-row',
    `${OVERLAY}; destructive text in the error color`,
    {mode: 'dark'},
  ),
  c(
    'checkbox-rows',
    'lab-checkbox-items',
    // The story's play opens its own menu; Enter on the trigger would close it.
    'story-play',
    'Selected — aria-checked backs the shared checkbox indicator',
  ),
  c(
    'checkbox-rows-dark',
    'lab-checkbox-items',
    // The story's play opens its own menu; Enter on the trigger would close it.
    'story-play',
    'Selected — aria-checked backs the shared checkbox indicator',
    {mode: 'dark'},
  ),
  c(
    'radio-rows',
    'lab-radio-group',
    'keyboard-open',
    'Selected — aria-checked backs the shared radio indicator',
  ),
  c(
    'submenu-open',
    'submenu',
    'keyboard-submenu',
    'Open branch keeps the overlay on its row; flyout focused',
  ),
  c(
    'submenu-open-dark',
    'submenu',
    'keyboard-submenu',
    'Open branch keeps the overlay on its row; flyout focused',
    {mode: 'dark'},
  ),
  c(
    'submenu-open-rtl',
    'submenu',
    'keyboard-submenu',
    'Open branch keeps the overlay on its row; flyout focused',
    {direction: 'rtl'},
  ),
  c(
    'overflow-scroll',
    'tall-content-overflow',
    'story-play',
    'Overflow — capped menu scrolls internally',
    {viewport: PHONE},
  ),
  c(
    'bottom-sheet',
    'action-sheet-presentation',
    'story-play',
    'Touch sheet frame delegated to BottomSheet',
    {viewport: PHONE},
  ),
  c(
    'bottom-sheet-dark',
    'action-sheet-presentation',
    'story-play',
    'Touch sheet frame delegated to BottomSheet',
    {viewport: PHONE, mode: 'dark'},
  ),
  c(
    'adaptive-narrow-coarse',
    'adaptive-action-presentation',
    'story-play',
    'Adaptive resolves to the touch sheet on a compact coarse layout',
    {viewport: NARROW, pointer: 'coarse'},
  ),
  c(
    'popover-narrow',
    'default',
    'keyboard-open',
    'Anchored menu within a 320px viewport',
    {viewport: NARROW},
  ),
  c(
    'header-footer',
    'header-and-footer',
    'pointer-open',
    'Header and footer regions beside the menu element',
  ),
  c(
    'forced-colors-focus-icon-end-content',
    'mode-parity',
    'keyboard-open',
    'Forced colors: focused icon/end-content row has a Highlight outline',
    {forcedColors: 'after'},
  ),
  c(
    'forced-colors-focus-icon-end-content-dark',
    'mode-parity',
    'keyboard-open',
    'Forced colors: focused icon/end-content row has a Highlight outline',
    {forcedColors: 'after', mode: 'dark'},
  ),
  c(
    'forced-colors-focus-destructive',
    'mode-parity',
    'keyboard-last-row',
    'Forced colors: focused destructive icon row has a Highlight outline',
    {forcedColors: 'after'},
  ),
  c(
    'forced-colors-focus-before-control',
    'mode-parity',
    'keyboard-open',
    'Helper-isolated control: forced Canvas focus paint with no outline',
    {forcedColors: 'before-control'},
  ),
];

const frames: Record<string, unknown>[] = [];
const stateVisualMatrix: Record<string, unknown>[] = [];
const contrastPairMatrix: Record<string, unknown>[] = [];
let storybook: StaticServer;
let checkoutSha: string;
let storybookSha: string;
let browserVersion = 'unknown';

test.beforeAll(async () => {
  checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const expectedHead = process.env.ASTRYX_HEAD_SHA;
  if (expectedHead && expectedHead !== checkoutSha) {
    throw new Error('The audited checkout does not match the PR head');
  }
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  const stamp = await fetch(`${storybook.origin}/astryx-build-sha.txt`);
  if (!stamp.ok) {
    throw new Error(
      `The Storybook build has no source stamp (${stamp.status})`,
    );
  }
  storybookSha = (await stamp.text()).trim();
  if (storybookSha !== checkoutSha) {
    throw new Error(
      'The served Storybook build does not match the audited checkout',
    );
  }
  fs.mkdirSync(OUTPUT, {recursive: true});
});

test.afterAll(async () => {
  if (checkoutSha && storybookSha) {
    fs.writeFileSync(
      path.join(OUTPUT, 'manifest.json'),
      `${JSON.stringify(
        {
          version: 1,
          component: 'core/DropdownMenu',
          headSha: checkoutSha,
          storybookSha,
          browser: browserVersion,
          frames,
          stateVisualMatrix,
          contrastPairMatrix,
        },
        null,
        2,
      )}\n`,
    );
  }
  await storybook?.close();
});

async function nextFrames(page: Page) {
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** The role and accessible-ish name of the focused element, read structurally. */
async function focusedSummary(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active == null || active === document.body) {
      return null;
    }
    return {
      role: active.getAttribute('role') ?? active.tagName.toLowerCase(),
      className: [...active.classList]
        .filter(name => name.startsWith('astryx-'))
        .join(' '),
      label:
        active.getAttribute('aria-label') ??
        (active.innerText ?? '').trim().split('\n')[0] ??
        '',
      ariaChecked: active.getAttribute('aria-checked'),
      ariaExpanded: active.getAttribute('aria-expanded'),
    };
  });
}

async function drive(page: Page, scenario: Case) {
  const trigger = page.locator(TRIGGER).first();
  if (scenario.drive === 'story-play') {
    await page
      .locator('.astryx-dropdown-menu')
      .first()
      .waitFor({state: 'visible'});
    return;
  }
  await trigger.waitFor();
  if (scenario.drive === 'closed') {
    return;
  }
  if (scenario.drive === 'pointer-open') {
    await trigger.click();
    await page.getByRole('menu').first().waitFor({state: 'visible'});
    return;
  }
  // Keyboard-driven opens: focus the trigger, then Enter.
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu').first();
  await menu.waitFor({state: 'visible'});
  await page.waitForFunction(() =>
    (document.activeElement?.getAttribute('role') ?? '').startsWith('menuitem'),
  );
  if (scenario.drive === 'keyboard-last-row') {
    await page.keyboard.press('End');
  } else if (scenario.drive === 'keyboard-submenu') {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press(
      scenario.direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight',
    );
    // `:popover-open` belongs to the flyout's layer host, not to its inner
    // role="menu" element, so wait on what a user sees instead: a second
    // visible menu, with focus on a row inside it. Bounded, so a flyout that
    // never opens fails this frame quickly instead of stalling the chunk.
    await page.waitForFunction(
      () => {
        const menus = [
          ...document.querySelectorAll<HTMLElement>('[role="menu"]'),
        ].filter(menu => menu.getBoundingClientRect().height > 0);
        const active = document.activeElement;
        return (
          menus.length > 1 &&
          active?.getAttribute('role') === 'menuitem' &&
          active.closest('[role="menu"]') === menus[1]
        );
      },
      undefined,
      {timeout: 5000},
    );
  } else if (
    scenario.drive === 'hover-second-row' ||
    scenario.drive === 'press-second-row'
  ) {
    const row = menu.locator('[role^="menuitem"]').nth(1);
    const box = await row.boundingBox();
    if (box == null) {
      throw new Error(`${scenario.state}: second row has no box`);
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 4,
    });
    if (scenario.drive === 'press-second-row') {
      await page.mouse.down();
    }
  }
}

/** The computed system-color focus indicator on the active menu row. */
async function forcedColorsFocusIndicator(page: Page) {
  return page.locator(':focus').evaluate(node => {
    const probe = document.createElement('span');
    probe.style.color = 'Highlight';
    document.body.append(probe);
    const expectedHighlight = getComputedStyle(probe).color;
    probe.remove();
    const style = getComputedStyle(node);
    return {
      expectedHighlight,
      color: style.outlineColor,
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      offset: style.outlineOffset,
    };
  });
}

type Observed = {
  presentation: string | null;
  menuCount: number;
  rowsSummary: {
    role: string | null;
    label: string;
    checked: string | null;
    disabled: boolean;
    variant: string | null;
  }[];
  focusedRowIndex: number;
  focusedItem: {role: string | null; label: string; menuIndex: number} | null;
  activeIsMenu: boolean;
  menuScroll: {
    scrollHeight: number;
    clientHeight: number;
    overflowY: string;
  } | null;
  regionControls: {inputs: string[]; buttons: string[]};
  triggerExpanded: string | null;
  dialogCount: number;
};

/**
 * Each frame proves the state it claims, not merely that a menu exists. A
 * frame whose claim this cannot check fails rather than passing silently.
 */
function assertClaimedState(
  scenario: Case,
  observed: Observed,
  box: {x: number; y: number; width: number; height: number},
) {
  const {state} = scenario;
  const rows = observed.rowsSummary;
  const focusedRow = rows[observed.focusedRowIndex];
  const expectAnchored = () => {
    expect(observed.presentation, `${state}: anchored menu`).toBe('popover');
  };
  const expectSheet = () => {
    expect(observed.presentation, `${state}: bottom sheet`).toBe(
      'bottom-sheet',
    );
    expect(observed.dialogCount, `${state}: sheet dialog`).toBeGreaterThan(0);
  };

  if (state.startsWith('trigger-rest')) {
    expect(observed.menuCount, `${state}: no menu open`).toBe(0);
    expect(observed.triggerExpanded).toBe('false');
    return;
  }
  if (state.startsWith('forced-colors-focus')) {
    expectAnchored();
    expect(observed.triggerExpanded).toBe('true');
    const expectedIndex =
      scenario.drive === 'keyboard-last-row' ? rows.length - 1 : 0;
    expect(observed.focusedRowIndex, `${state}: expected row focused`).toBe(
      expectedIndex,
    );
    expect(focusedRow?.disabled).toBe(false);
    return;
  }
  if (state.startsWith('keyboard-open') || state === 'popover-narrow') {
    expectAnchored();
    expect(observed.triggerExpanded).toBe('true');
    expect(observed.focusedRowIndex, `${state}: first row focused`).toBe(0);
    expect(focusedRow?.disabled).toBe(false);
    if (state === 'popover-narrow') {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(
        scenario.viewport.width + 0.5,
      );
    }
    return;
  }
  if (state === 'pointer-open' || state === 'header-footer') {
    expectAnchored();
    expect(observed.activeIsMenu, `${state}: the menu itself is focused`).toBe(
      true,
    );
    expect(observed.focusedRowIndex, `${state}: no row focused`).toBe(-1);
    if (state === 'header-footer') {
      expect(observed.regionControls.inputs).toContain('Filter labels');
      expect(observed.regionControls.buttons).toContain('Create label');
    }
    return;
  }
  if (state.startsWith('hover-row') || state === 'pressed-row') {
    expectAnchored();
    expect(observed.focusedRowIndex, `${state}: second row focused`).toBe(1);
    return;
  }
  if (state.startsWith('disabled-row')) {
    expectAnchored();
    const disabledIndexes = rows.flatMap((row, index) =>
      row.disabled ? [index] : [],
    );
    const lastEnabled = rows.reduce(
      (last, row, index) => (row.disabled ? last : index),
      -1,
    );
    expect(disabledIndexes.length, `${state}: a disabled row`).toBeGreaterThan(
      0,
    );
    // End lands on the last enabled row: the trailing disabled row is skipped.
    expect(lastEnabled).toBeLessThan(rows.length - 1);
    expect(observed.focusedRowIndex).toBe(lastEnabled);
    expect(focusedRow?.disabled).toBe(false);
    return;
  }
  if (state.startsWith('destructive-row')) {
    expectAnchored();
    expect(focusedRow?.variant, `${state}: destructive row focused`).toBe(
      'destructive',
    );
    return;
  }
  if (state.startsWith('checkbox-rows')) {
    expectAnchored();
    // Show archived, Show drafts, Sync folders, and the disabled managed row.
    expect(rows.map(row => row.role)).toEqual([
      'menuitemcheckbox',
      'menuitemcheckbox',
      'menuitemcheckbox',
      'menuitemcheckbox',
    ]);
    expect(rows.map(row => row.checked)).toEqual([
      'false',
      'true',
      'true',
      'true',
    ]);
    return;
  }
  if (state === 'radio-rows') {
    expectAnchored();
    expect(rows.map(row => row.role)).toEqual([
      'menuitemradio',
      'menuitemradio',
      'menuitemradio',
    ]);
    const checked = rows.filter(row => row.checked === 'true');
    expect(checked.map(row => row.label)).toEqual(['Newest']);
    return;
  }
  if (state.startsWith('submenu-open')) {
    expectAnchored();
    expect(observed.menuCount).toBeGreaterThan(1);
    // Focus is on the flyout's first row, not anywhere in the root menu.
    expect(observed.focusedItem, `${state}: a row is focused`).not.toBeNull();
    expect(observed.focusedItem?.role).toBe('menuitem');
    expect(observed.focusedItem?.label).toBe('Folder A');
    expect(observed.focusedItem?.menuIndex, `${state}: in the flyout`).toBe(1);
    expect(observed.focusedRowIndex, `${state}: not a root row`).toBe(-1);
    return;
  }
  if (state === 'overflow-scroll') {
    expectAnchored();
    const scroll = observed.menuScroll;
    expect(scroll, `${state}: menu measured`).not.toBeNull();
    expect(scroll?.scrollHeight ?? 0).toBeGreaterThan(
      (scroll?.clientHeight ?? 0) + 1,
    );
    expect(['auto', 'scroll']).toContain(scroll?.overflowY);
    return;
  }
  if (state.startsWith('bottom-sheet') || state === 'adaptive-narrow-coarse') {
    expectSheet();
    return;
  }
  throw new Error(`${state}: no claimed-state assertion`);
}

async function capture(page: Page, scenario: Case) {
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  try {
    await page.emulateMedia({
      reducedMotion: 'reduce',
      forcedColors: scenario.forcedColors != null ? 'active' : 'none',
      colorScheme: scenario.mode,
    });
    browserVersion = page.context().browser()?.version() ?? 'unknown';
    await page.goto(
      `${storybook.origin}/iframe.html?id=${scenario.storyId}&viewMode=story&globals=colorMode:${scenario.mode};astryxTheme:${scenario.theme};direction:${scenario.direction}`,
      {waitUntil: 'load'},
    );
    await page.locator('#storybook-root').waitFor();
    await holdMotionStill(page);
    await page.evaluate(async () => document.fonts.ready);
    await page.waitForFunction(
      expected =>
        document.documentElement.getAttribute('data-theme') === expected,
      scenario.mode,
    );
    if (scenario.forcedColors === 'before-control') {
      // Helper-isolated control, not a base build: restore the forced Canvas
      // focus paint and remove the head outline, leaving the rest of the head
      // build in place.
      await page.addStyleTag({
        content:
          '[role^="menuitem"]:focus { background-color: rgb(0 0 0 / 0.06) !important; color: rgb(0 0 0) !important; outline: none !important; }',
      });
    }
    await nextFrames(page);
    await drive(page, scenario);
    await nextFrames(page);

    const subject = page.locator('.astryx-dropdown-menu').first();
    const isOpen = scenario.drive !== 'closed';
    const measureBox = async () =>
      isOpen ? subject.boundingBox() : page.locator(TRIGGER).boundingBox();
    const firstBox = await measureBox();
    await nextFrames(page);
    const box = await measureBox();
    if (firstBox == null || box == null) {
      throw new Error(`${scenario.state}: subject has no layout box`);
    }
    const geometryDelta = Math.max(
      Math.abs(box.x - firstBox.x),
      Math.abs(box.y - firstBox.y),
      Math.abs(box.width - firstBox.width),
      Math.abs(box.height - firstBox.height),
    );

    const observed = await page.evaluate(
      ({open}) => {
        type Color = {r: number; g: number; b: number; a: number};
        const parseColor = (value: string): Color => {
          const channels = value.match(/[\d.]+/g)?.map(Number);
          if (!channels || channels.length < 3) {
            return {r: 0, g: 0, b: 0, a: 0};
          }
          return {
            r: channels[0] ?? 0,
            g: channels[1] ?? 0,
            b: channels[2] ?? 0,
            a: channels[3] ?? 1,
          };
        };
        const composite = (fg: Color, bg: Color): Color => {
          const a = fg.a + bg.a * (1 - fg.a);
          if (a === 0) {
            return {r: 0, g: 0, b: 0, a: 0};
          }
          const mix = (f: number, b: number) =>
            (f * fg.a + b * bg.a * (1 - fg.a)) / a;
          return {
            r: mix(fg.r, bg.r),
            g: mix(fg.g, bg.g),
            b: mix(fg.b, bg.b),
            a,
          };
        };
        const backdrop = (node: Element): Color => {
          const layers: Color[] = [];
          let current: Element | null = node;
          while (current) {
            const layer = parseColor(getComputedStyle(current).backgroundColor);
            if (layer.a > 0) {
              layers.push(layer);
            }
            if (layer.a >= 0.999) {
              break;
            }
            current = current.parentElement;
          }
          const page = parseColor(
            getComputedStyle(document.body).backgroundColor,
          );
          return layers
            .reverse()
            .reduce(
              (bg, fg) => composite(fg, bg),
              page.a > 0 ? page : {r: 255, g: 255, b: 255, a: 1},
            );
        };
        const luminance = ({r, g, b}: Color) => {
          const ch = (v: number) => {
            const n = v / 255;
            return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
        };
        const ratio = (x: Color, y: Color) => {
          const a = luminance(x);
          const b = luminance(y);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const fmt = ({r, g, b, a}: Color) =>
          `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(3)})`;
        const pair = (node: Element | null) => {
          if (node == null) {
            return null;
          }
          const style = getComputedStyle(node);
          const bg = backdrop(node);
          const fg = composite(parseColor(style.color), bg);
          return {
            color: style.color,
            renderedBackdrop: fmt(bg),
            contrastRatio: Number(ratio(fg, bg).toFixed(2)),
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
          };
        };
        const menus = [
          ...document.querySelectorAll<HTMLElement>('.astryx-dropdown-menu'),
        ].filter(el => el.getBoundingClientRect().height > 0);
        const menu = menus[0] ?? null;
        // The root menu's own rows: a flyout renders inside the root menu's
        // DOM, so rows belonging to a nested menu are left out here.
        const rows = menu
          ? [
              ...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]'),
            ].filter(row => row.closest('[role="menu"]') === menu)
          : [];
        const active = document.activeElement as HTMLElement | null;
        const focusedRow =
          active != null &&
          (active.getAttribute('role') ?? '').startsWith('menuitem')
            ? active
            : null;
        const restRow =
          rows.find(
            row => row !== focusedRow && !row.matches('[aria-disabled="true"]'),
          ) ?? null;
        // The elements that own a row's visible text: the first text run is
        // the label, a later run in another element is the description.
        const textOwners = (row: Element | null): Element[] => {
          if (row == null) {
            return [];
          }
          const owners: Element[] = [];
          const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const owner = node.parentElement;
            if (
              owner != null &&
              (node.textContent ?? '').trim() !== '' &&
              !owner.closest('[aria-hidden="true"]') &&
              !owners.includes(owner)
            ) {
              owners.push(owner);
            }
          }
          return owners;
        };
        const label = (row: Element | null) => textOwners(row)[0] ?? null;
        const destructive = menu?.querySelector(
          '.astryx-dropdown-menu-item[data-variant="destructive"]',
        );
        const describedRow = rows.find(row => textOwners(row).length > 1);
        const description = describedRow ? textOwners(describedRow)[1] : null;
        const heading = menu?.querySelector(
          '.astryx-dropdown-menu-section-heading',
        );
        const focusStyle = focusedRow ? getComputedStyle(focusedRow) : null;
        const isShown = (el: Element) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        // Controls in the popover but outside the role="menu" element: the
        // header and footer regions.
        const host = menu?.closest('[popover]') ?? null;
        const outside =
          host != null && menu != null
            ? [...host.querySelectorAll('input, button')].filter(
                el => !menu.contains(el) && isShown(el),
              )
            : [];
        const menuStyle = menu ? getComputedStyle(menu) : null;
        return {
          open,
          rowsSummary: rows.map(row => ({
            role: row.getAttribute('role'),
            label: (label(row)?.textContent ?? '').trim(),
            checked: row.getAttribute('aria-checked'),
            disabled: row.getAttribute('aria-disabled') === 'true',
            variant: row.getAttribute('data-variant'),
          })),
          focusedRowIndex: focusedRow ? rows.indexOf(focusedRow) : -1,
          // The focused row wherever it is — root menu or a flyout — and the
          // position of its own menu among the visible menus.
          focusedItem: focusedRow
            ? {
                role: focusedRow.getAttribute('role'),
                label: (label(focusedRow)?.textContent ?? '').trim(),
                menuIndex: menus.indexOf(
                  focusedRow.closest<HTMLElement>(
                    '[role="menu"]',
                  ) as HTMLElement,
                ),
              }
            : null,
          activeIsMenu: menu != null && active === menu,
          menuScroll:
            menu && menuStyle
              ? {
                  scrollHeight: menu.scrollHeight,
                  clientHeight: menu.clientHeight,
                  overflowY: menuStyle.overflowY,
                }
              : null,
          regionControls: {
            inputs: outside
              .filter(el => el.matches('input'))
              .map(el => el.getAttribute('placeholder') ?? ''),
            buttons: outside
              .filter(el => el.matches('button'))
              .map(el => (el.textContent ?? '').trim()),
          },
          triggerExpanded:
            document
              .querySelector('#storybook-root button[aria-haspopup]')
              ?.getAttribute('aria-expanded') ?? null,
          dialogCount: [
            ...document.querySelectorAll('[role="dialog"], dialog'),
          ].filter(isShown).length,
          menuCount: menus.length,
          menuRole: menu?.getAttribute('role') ?? null,
          presentation: menu?.getAttribute('data-presentation') ?? null,
          menuDirection: menu ? getComputedStyle(menu).direction : null,
          rowCount: rows.length,
          disabledRows: rows.filter(row =>
            row.matches('[aria-disabled="true"]'),
          ).length,
          focusedRowOutline: focusStyle
            ? {
                style: focusStyle.outlineStyle,
                color: focusStyle.outlineColor,
                width: focusStyle.outlineWidth,
              }
            : null,
          focusedRowBackground: focusStyle?.backgroundColor ?? null,
          pairs: {
            restLabel: pair(label(restRow)),
            focusedLabel: pair(label(focusedRow)),
            destructiveLabel: pair(destructive ? label(destructive) : null),
            description: pair(description ?? null),
            sectionHeading: pair(heading ?? null),
          },
        };
      },
      {open: isOpen},
    );

    const environment = await page.evaluate(() => ({
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      documentDirection:
        document.querySelector('[dir]')?.getAttribute('dir') ?? null,
      fonts: document.fonts.status,
      viewport: {width: innerWidth, height: innerHeight},
      devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      hover: matchMedia('(hover: hover)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      storyError: [
        ...document.querySelectorAll(
          '.sb-errordisplay, [data-testid="story-error"]',
        ),
      ].some(node => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      }),
    }));
    const focused = await focusedSummary(page);
    const focusIndicator =
      scenario.forcedColors != null
        ? await forcedColorsFocusIndicator(page)
        : null;

    // Fail closed when the frame is not what it claims to be.
    expect(environment.theme).toBe(scenario.theme);
    expect(environment.mode).toBe(scenario.mode);
    expect(environment.fonts).toBe('loaded');
    expect(environment.viewport).toEqual(scenario.viewport);
    expect(environment.reducedMotion).toBe(true);
    expect(environment.coarsePointer).toBe(scenario.pointer === 'coarse');
    expect(environment.forcedColors).toBe(scenario.forcedColors != null);
    expect(environment.storyError).toBe(false);
    expect(pageErrors).toEqual([]);
    expect(geometryDelta).toBeLessThanOrEqual(0.5);
    if (isOpen) {
      expect(observed.menuCount).toBeGreaterThan(0);
      expect(
        observed.rowCount + (observed.presentation === 'bottom-sheet' ? 1 : 0),
      ).toBeGreaterThan(0);
      if (scenario.direction === 'rtl' && observed.menuDirection != null) {
        expect(observed.menuDirection).toBe('rtl');
      }
    }
    if (scenario.viewport.width <= NARROW.width) {
      expect(environment.horizontalOverflow).toBe(false);
    }
    if (
      scenario.drive === 'keyboard-open' ||
      scenario.drive === 'keyboard-last-row'
    ) {
      expect(focused?.role ?? '').toMatch(/^menuitem/);
    }
    if (scenario.drive === 'keyboard-submenu') {
      expect(observed.menuCount).toBeGreaterThan(1);
    }
    assertClaimedState(scenario, observed, box);
    if (scenario.forcedColors === 'after') {
      expect(focusIndicator?.style).toBe('solid');
      expect(focusIndicator?.width ?? 0).toBeGreaterThanOrEqual(2);
      // Inset by the ring's own width (the focus-outline-width token).
      expect(focusIndicator?.offset).toBe(`-${focusIndicator?.width}px`);
      expect(focusIndicator?.color).toBe(focusIndicator?.expectedHighlight);
    }
    if (scenario.forcedColors === 'before-control') {
      // With `outline-style: none`, Chromium still computes the declared
      // width, so the style alone says no outline paints.
      expect(focusIndicator?.style).toBe('none');
    }

    const file = `DropdownMenu__${scenario.state}.png`;
    const png = await page.screenshot({animations: 'disabled'});
    expect(png.length).toBeGreaterThan(100);

    const stateRow = {
      stateCaptured: scenario.state,
      screenshot: file,
      approvedRepresentation: scenario.representation,
      tokenSignature: {
        focusedRowBackground: observed.focusedRowBackground,
        focusedRowOutline: observed.focusedRowOutline,
        presentation: observed.presentation,
      },
    };
    const contrastRows = Object.entries(observed.pairs)
      .filter(([, value]) => value != null)
      .map(([part, value]) => ({
        screenshot: file,
        theme: scenario.theme,
        mode: scenario.mode,
        direction: scenario.direction,
        forcedColors: scenario.forcedColors ?? null,
        part,
        meaningful: true,
        foreground: value?.color,
        renderedBackdrop: value?.renderedBackdrop,
        ratio: value?.contrastRatio,
        threshold: 4.5,
        passed: (value?.contrastRatio ?? 0) >= 4.5,
      }));
    const receipt = {
      expected: {
        build: checkoutSha,
        storyId: scenario.storyId,
        drive: scenario.drive,
        theme: scenario.theme,
        mode: scenario.mode,
        direction: scenario.direction,
        pointer: scenario.pointer ?? 'fine',
        forcedColors: scenario.forcedColors ?? 'none',
        viewport: scenario.viewport,
      },
      observed: {
        build: storybookSha,
        storyId: scenario.storyId,
        ...observed,
        ...environment,
        focused,
        forcedColorsFocusIndicator: focusIndicator,
        pageErrors: pageErrors.length,
        geometry: box,
        settledRender: {initial: firstBox, final: box, maxDelta: geometryDelta},
      },
      image: {
        file,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      stateVisualMatrix: [stateRow],
      contrastPairMatrix: contrastRows,
      browser: browserVersion,
      passed: true,
    };
    fs.writeFileSync(path.join(OUTPUT, file), png);
    fs.writeFileSync(
      path.join(OUTPUT, `${file}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    frames.push({state: scenario.state, receipt: `${file}.sensors.json`});
    stateVisualMatrix.push(stateRow);
    contrastPairMatrix.push(...contrastRows);
    if (scenario.drive === 'press-second-row') {
      await page.mouse.up();
    }
    return observed;
  } finally {
    page.off('pageerror', onError);
  }
}

// One frame takes about half a minute on the CI runner, so the frames run as
// bounded serial chunks rather than one long test. They share one results map
// and one manifest; the cross-frame checks run after the last chunk.
const CHUNK_SIZE = 8;
const CHUNKS = Array.from(
  {length: Math.ceil(CASES.length / CHUNK_SIZE)},
  (_, index) => CASES.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
);
const results = new Map<string, Awaited<ReturnType<typeof capture>>>();

test.describe.configure({mode: 'serial'});

for (const [index, chunk] of CHUNKS.entries()) {
  test(`captures DropdownMenu states ${index + 1}/${CHUNKS.length} with sensor receipts`, async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    test.setTimeout(10 * 60 * 1000);
    for (const scenario of chunk) {
      const context = await browser.newContext({
        viewport: scenario.viewport,
        deviceScaleFactor: 2,
        hasTouch: scenario.pointer === 'coarse',
        isMobile: scenario.pointer === 'coarse',
      });
      const page = await context.newPage();
      try {
        results.set(scenario.state, await capture(page, scenario));
      } finally {
        await context.close();
      }
    }
  });
}

test('every frame was captured, and the frames agree across states', () => {
  expect([...results.keys()]).toEqual(CASES.map(scenario => scenario.state));
  // The anchored menu reflects its documented presentation capability.
  expect(results.get('keyboard-open')?.presentation).toBe('popover');
  expect(results.get('bottom-sheet')?.presentation).toBe('bottom-sheet');
  // A non-default theme visibly reaches the menu rows.
  const neutral = results.get('keyboard-open')?.pairs.focusedLabel;
  const probe = results.get('keyboard-open-probe')?.pairs.focusedLabel;
  expect(
    neutral?.renderedBackdrop !== probe?.renderedBackdrop ||
      neutral?.color !== probe?.color,
    'the probe theme must visibly reach the focused row',
  ).toBe(true);
});
