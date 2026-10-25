// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit CheckboxList, CheckboxListItem

/**
 * @file CheckboxList.a11y.chromium.spec.ts
 * @input Exact-head Storybook build and the CheckboxList stories
 * @output Light/dark PNGs, 10-sensor receipts, D7 contrast pairs, recorded
 *   measurements, a contact sheet, and a fail-closed manifest
 * @position Real-browser evidence for the CheckboxList component audit. Sensors
 *   prove that each frame is the intended render; measurements (focus
 *   indicators, row paint, hit targets, wrapping, list structure) are recorded
 *   for the audit and never gate. Only frames that prove a shipped remediation
 *   gate on its outcome. The select-all CLI block renders through its own
 *   story, and its source blob is bound in the manifest. Disabled rows expect
 *   focusable aria-disabled controls under AST-085 FR1 and FR7.
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('test-results/checkbox-list-audit-evidence');
const PREFIX = 'core-checkboxlist--';
const BLOCK_DIR =
  'packages/cli/assets/templates/blocks/components/CheckboxList';
const BLOCK_SOURCE = `${BLOCK_DIR}/CheckboxListSelectAllPattern.tsx`;

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Interaction = 'rest' | 'hover' | 'pressed' | 'focus-visible';
type Checked = boolean | 'mixed';
type Disabled = 'native' | 'focusable' | false;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RowExpectation {
  checked: Checked;
  disabled?: Disabled;
  busy?: boolean;
  readOnly?: boolean;
}

interface CaseExpectation {
  /** Accessible name of the role="group"; null means a standalone List. */
  groupName: string | null;
  rows: RowExpectation[];
  status?: {type: 'error' | 'warning' | 'success'; text: string};
  tooltipText?: string;
  density?: 'compact' | 'balanced' | 'spacious';
  labelHidden?: boolean;
}

interface AuditCase {
  key: string;
  story: string;
  modes: ReadonlyArray<Mode>;
  direction?: Direction;
  narrowCoarse?: boolean;
  forcedColors?: boolean;
  /** Pointer clicks on rows (by index) before args and the interaction. */
  clickRows?: number[];
  /** Args applied through the Storybook channel after mount. */
  args?: Record<string, unknown>;
  /** Freeze timers so a pending changeAction stays pending for capture. */
  pauseClock?: boolean;
  /** Advance the frozen clock after the clicks (settled evidence). */
  settleMs?: number;
  interaction?: Interaction;
  interactionRow?: number;
  expect: CaseExpectation;
  /** A remediation this frame proves; its outcome is authored from the contract. */
  remediation?: string;
}

interface SensorResult {
  expected: unknown;
  observed: unknown;
  passed: boolean;
}

interface ContrastPair {
  part: string;
  /** The component or caller that owns the painted part. */
  owner: string;
  meaningful: boolean;
  foreground: string;
  backdrop: string;
  ratio: number | null;
  threshold: number | null;
  exception: string | null;
  passed: boolean;
}

interface ImageReceipt {
  file: string;
  sha256: string;
  width: number;
  height: number;
  distinctColors: number;
  nonBlank: boolean;
}

interface FrameReceipt {
  frame: string;
  case: string;
  story: string;
  mode: Mode;
  direction: Direction;
  remediation: string | null;
  passed: boolean;
  failures: string[];
  sensors: Record<string, SensorResult>;
  contrastPairs: ContrastPair[];
  measurements: Record<string, unknown>;
  ariaSnapshot: string;
  image: ImageReceipt;
}

const ROWS_DEFAULT: RowExpectation[] = [
  {checked: false},
  {checked: false},
  {checked: false},
];
const EMAIL_CHECKED: RowExpectation[] = [
  {checked: true},
  {checked: false},
  {checked: false},
];
const BOTH: ReadonlyArray<Mode> = ['light', 'dark'];
const GROUP = 'Notification preferences';

const CASES: AuditCase[] = [
  {
    key: 'rest',
    story: 'default',
    modes: BOTH,
    expect: {groupName: GROUP, rows: ROWS_DEFAULT},
  },
  {
    key: 'checked',
    story: 'default',
    modes: BOTH,
    clickRows: [0],
    expect: {groupName: GROUP, rows: EMAIL_CHECKED},
  },
  {
    key: 'hover-unchecked',
    story: 'default',
    modes: BOTH,
    interaction: 'hover',
    interactionRow: 1,
    expect: {groupName: GROUP, rows: ROWS_DEFAULT},
  },
  {
    key: 'hover-checked',
    story: 'default',
    modes: BOTH,
    clickRows: [0],
    interaction: 'hover',
    interactionRow: 0,
    expect: {groupName: GROUP, rows: EMAIL_CHECKED},
  },
  {
    key: 'pressed-unchecked',
    story: 'default',
    modes: BOTH,
    interaction: 'pressed',
    interactionRow: 1,
    expect: {groupName: GROUP, rows: ROWS_DEFAULT},
  },
  {
    key: 'pressed-checked',
    story: 'default',
    modes: BOTH,
    clickRows: [0],
    interaction: 'pressed',
    interactionRow: 0,
    expect: {groupName: GROUP, rows: EMAIL_CHECKED},
  },
  {
    key: 'focus-visible',
    story: 'default',
    modes: BOTH,
    interaction: 'focus-visible',
    interactionRow: 0,
    expect: {groupName: GROUP, rows: ROWS_DEFAULT},
  },
  {
    key: 'descriptions-dividers',
    story: 'with-descriptions',
    modes: BOTH,
    expect: {groupName: GROUP, rows: ROWS_DEFAULT},
  },
  {
    key: 'rich-content',
    story: 'rich-descriptions',
    modes: BOTH,
    expect: {
      groupName: 'Data sharing',
      rows: [{checked: true}, {checked: false}],
    },
  },
  {
    key: 'end-content',
    story: 'with-end-content',
    modes: BOTH,
    expect: {
      groupName: 'Add-on packages',
      rows: [{checked: true}, {checked: false}, {checked: false}],
    },
  },
  {
    key: 'indeterminate',
    story: 'select-all-with-indeterminate',
    modes: BOTH,
    expect: {
      groupName: 'Notifications',
      rows: [
        {checked: 'mixed'},
        {checked: true},
        {checked: false},
        {checked: false},
      ],
    },
  },
  {
    key: 'select-all-block',
    story: 'select-all-pattern-block',
    modes: BOTH,
    expect: {
      groupName: 'Include in export',
      rows: [
        {checked: 'mixed'},
        {checked: true},
        {checked: false},
        {checked: false},
        {checked: false},
      ],
    },
  },
  {
    key: 'disabled-group',
    story: 'disabled',
    modes: BOTH,
    expect: {
      groupName: GROUP,
      rows: [
        {checked: true, disabled: 'focusable'},
        {checked: false, disabled: 'focusable'},
        {checked: false, disabled: 'focusable'},
      ],
    },
  },
  {
    key: 'disabled-item',
    story: 'disabled-item',
    modes: BOTH,
    expect: {
      groupName: GROUP,
      rows: [
        {checked: false, disabled: false},
        {checked: false, disabled: 'focusable'},
        {checked: false, disabled: false},
      ],
    },
  },
  {
    key: 'disabled-message-focus',
    story: 'disabled-with-message',
    modes: BOTH,
    interaction: 'focus-visible',
    interactionRow: 0,
    expect: {
      groupName: GROUP,
      rows: [
        {checked: true, disabled: 'focusable'},
        {checked: false, disabled: 'focusable'},
        {checked: false, disabled: 'focusable'},
      ],
      tooltipText: 'Notifications are managed by your administrator',
    },
  },
  {
    key: 'loading-item',
    story: 'loading',
    modes: BOTH,
    expect: {
      groupName: GROUP,
      rows: [
        {checked: true, busy: false},
        {checked: false, busy: true},
        {checked: false, busy: false},
      ],
    },
  },
  {
    key: 'pending-single',
    story: 'change-action',
    modes: BOTH,
    pauseClock: true,
    clickRows: [1],
    expect: {
      groupName: GROUP,
      rows: [
        {checked: true, busy: false},
        {checked: true, busy: true},
        {checked: false, busy: false},
      ],
    },
  },
  {
    // The changeAction contract: while an item's action is pending it shows a
    // spinner, is marked aria-busy, and cannot be re-toggled; other items stay
    // interactive. Toggling a second item must not clear the first.
    key: 'pending-concurrent',
    story: 'change-action',
    modes: BOTH,
    pauseClock: true,
    clickRows: [1, 2],
    remediation: 'concurrent-changeAction-pending',
    expect: {
      groupName: GROUP,
      rows: [
        {checked: true, busy: false},
        {checked: true, busy: true},
        {checked: true, busy: true},
      ],
    },
  },
  {
    key: 'pending-settled',
    story: 'change-action',
    modes: BOTH,
    pauseClock: true,
    clickRows: [1, 2],
    settleMs: 1600,
    expect: {
      groupName: GROUP,
      rows: [
        {checked: true, busy: false},
        {checked: true, busy: false},
        {checked: true, busy: false},
      ],
    },
  },
  {
    key: 'status-error',
    story: 'with-error-status',
    modes: BOTH,
    expect: {
      groupName: GROUP,
      rows: ROWS_DEFAULT,
      status: {
        type: 'error',
        text: 'Please select at least one notification method',
      },
    },
  },
  {
    key: 'status-warning',
    story: 'default',
    modes: BOTH,
    args: {
      status: {type: 'warning', message: 'SMS delivery may be delayed'},
    },
    expect: {
      groupName: GROUP,
      rows: ROWS_DEFAULT,
      status: {type: 'warning', text: 'SMS delivery may be delayed'},
    },
  },
  {
    key: 'status-success',
    story: 'default',
    modes: BOTH,
    args: {status: {type: 'success', message: 'Preferences saved'}},
    expect: {
      groupName: GROUP,
      rows: ROWS_DEFAULT,
      status: {type: 'success', text: 'Preferences saved'},
    },
  },
  {
    key: 'read-only',
    story: 'default',
    modes: BOTH,
    clickRows: [0],
    args: {isReadOnly: true},
    expect: {
      groupName: GROUP,
      rows: [
        {checked: true, readOnly: true},
        {checked: false, readOnly: true},
        {checked: false, readOnly: true},
      ],
    },
  },
  {
    key: 'density-compact',
    story: 'default',
    modes: BOTH,
    args: {density: 'compact'},
    expect: {groupName: GROUP, rows: ROWS_DEFAULT, density: 'compact'},
  },
  {
    key: 'density-spacious',
    story: 'default',
    modes: BOTH,
    args: {density: 'spacious'},
    expect: {groupName: GROUP, rows: ROWS_DEFAULT, density: 'spacious'},
  },
  {
    key: 'label-hidden',
    story: 'default',
    modes: BOTH,
    args: {isLabelHidden: true},
    expect: {groupName: GROUP, rows: ROWS_DEFAULT, labelHidden: true},
  },
  {
    key: 'standalone',
    story: 'standalone-mode',
    modes: BOTH,
    expect: {
      groupName: null,
      rows: [{checked: false}, {checked: true}, {checked: false}],
    },
  },
  {
    // Records the exact AST-021 known failure; the handlerless meaning is an
    // owner decision, so no read-only expectation is authored here.
    key: 'handlerless',
    story: 'read-only',
    modes: BOTH,
    expect: {
      groupName: null,
      rows: [{checked: true}, {checked: false}, {checked: 'mixed'}],
    },
  },
  {
    key: 'inside-card',
    story: 'inside-card',
    modes: BOTH,
    expect: {
      groupName: 'Notifications',
      rows: [
        {checked: true},
        {checked: false},
        {checked: false, disabled: 'focusable'},
      ],
    },
  },
  {
    key: 'long-content-narrow',
    story: 'long-content',
    modes: BOTH,
    narrowCoarse: true,
    expect: {
      groupName:
        'Notification channels for workspace activity and account security',
      rows: [{checked: true}, {checked: false}, {checked: false}],
    },
  },
  {
    key: 'rtl',
    story: 'with-descriptions',
    modes: BOTH,
    direction: 'rtl',
    expect: {groupName: GROUP, rows: ROWS_DEFAULT},
  },
  {
    key: 'forced-colors-checked',
    story: 'default',
    modes: ['light'],
    forcedColors: true,
    clickRows: [0],
    expect: {groupName: GROUP, rows: EMAIL_CHECKED},
  },
  {
    key: 'forced-colors-focus',
    story: 'default',
    modes: ['light'],
    forcedColors: true,
    interaction: 'focus-visible',
    interactionRow: 1,
    expect: {groupName: GROUP, rows: ROWS_DEFAULT},
  },
];

let server: StaticServer | undefined;
let head = '';
let storybookHead = '';
let blockBlob = '';
let browserVersion = 'unknown';
const receipts: FrameReceipt[] = [];

function frameName(auditCase: AuditCase, mode: Mode): string {
  const theme = auditCase.forcedColors ? `forced-${mode}` : `neutral-${mode}`;
  return `${auditCase.key}__${theme}__${auditCase.direction ?? 'ltr'}`;
}

function inspectPng(file: string, bytes: Buffer): ImageReceipt {
  const png = PNG.sync.read(bytes);
  const colors = new Set<string>();
  for (let index = 0; index < png.data.length; index += 4) {
    colors.add(
      `${png.data[index]},${png.data[index + 1]},${png.data[index + 2]},${png.data[index + 3]}`,
    );
  }
  return {
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: png.width,
    height: png.height,
    distinctColors: colors.size,
    nonBlank: colors.size > 1,
  };
}

function composite(front: Rgba, back: Rgba): Rgba {
  const alpha = front.a + back.a * (1 - front.a);
  const channel = (f: number, b: number) =>
    alpha === 0 ? 0 : (f * front.a + b * back.a * (1 - front.a)) / alpha;
  return {
    r: channel(front.r, back.r),
    g: channel(front.g, back.g),
    b: channel(front.b, back.b),
    a: alpha,
  };
}

function luminance(color: Rgba): number {
  const linear = [color.r, color.g, color.b].map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(front: Rgba | null, back: Rgba | null): number | null {
  if (front == null || back == null) {
    return null;
  }
  const resolved = front.a < 1 ? composite(front, back) : front;
  const first = luminance(resolved);
  const second = luminance(back);
  return Number(
    (
      (Math.max(first, second) + 0.05) /
      (Math.min(first, second) + 0.05)
    ).toFixed(2),
  );
}

function css(color: Rgba | null): string {
  if (color == null) {
    return 'unresolved';
  }
  const round = (value: number) => Math.round(value);
  return `rgba(${round(color.r)}, ${round(color.g)}, ${round(color.b)}, ${Number(color.a.toFixed(3))})`;
}

function pair(
  part: string,
  owner: string,
  front: Rgba | null,
  back: Rgba | null,
  threshold: number | null,
  exception: string | null = null,
): ContrastPair {
  const ratio = contrast(front, back);
  const meaningful = threshold != null && exception == null;
  return {
    part,
    owner,
    meaningful,
    foreground: css(front),
    backdrop: css(back),
    ratio,
    threshold: meaningful ? threshold : null,
    exception,
    passed: !meaningful || (ratio != null && ratio >= (threshold ?? 0)),
  };
}

function storyUrl(auditCase: AuditCase, mode: Mode): string {
  return (
    `${server?.origin}/iframe.html?id=${PREFIX}${auditCase.story}&viewMode=story` +
    `&globals=colorMode:${mode};astryxTheme:neutral;direction:${auditCase.direction ?? 'ltr'}`
  );
}

async function openCase(
  browser: Browser,
  auditCase: AuditCase,
  mode: Mode,
): Promise<{context: BrowserContext; page: Page; errors: string[]}> {
  const context = await browser.newContext(
    auditCase.narrowCoarse
      ? {
          viewport: {width: 320, height: 640},
          deviceScaleFactor: 1,
          hasTouch: true,
          isMobile: true,
        }
      : {viewport: {width: 1024, height: 768}, deviceScaleFactor: 1},
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  browserVersion = browser.version();
  if (auditCase.pauseClock) {
    await page.clock.install();
  }
  await page.goto(storyUrl(auditCase, mode));
  await page.locator('#storybook-root li').first().waitFor();
  await page.waitForFunction(
    expected =>
      document.documentElement.getAttribute('data-theme') === expected,
    mode,
  );
  await holdMotionStill(page);
  if (auditCase.forcedColors) {
    await page.emulateMedia({forcedColors: 'active', reducedMotion: 'reduce'});
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.mouse.move(0, 0);
  if (auditCase.pauseClock) {
    await page.clock.pauseAt(Date.now() + 60_000);
  }
  return {context, page, errors};
}

function rowCheckbox(page: Page, index: number) {
  return page
    .locator('#storybook-root li')
    .nth(index)
    .locator('input[type="checkbox"]');
}

async function rowLabelCenter(
  page: Page,
  index: number,
): Promise<{x: number; y: number}> {
  const label = page
    .locator('#storybook-root li')
    .nth(index)
    .locator(':scope > span:nth-of-type(2) > span')
    .first();
  const box = await label.boundingBox();
  if (box == null) {
    throw new Error(`row ${index} label has no layout box`);
  }
  return {x: box.x + Math.min(box.width / 2, 40), y: box.y + box.height / 2};
}

async function settleFrames(page: Page): Promise<void> {
  // Real-time wait: page timers may be frozen, so no rAF here.
  await page.waitForTimeout(150);
}

async function applyArgs(page: Page, auditCase: AuditCase): Promise<void> {
  if (auditCase.args == null) {
    return;
  }
  await page.evaluate(
    ({storyId, updatedArgs}) => {
      const channel = (
        window as unknown as {
          __STORYBOOK_ADDONS_CHANNEL__?: {
            emit: (event: string, payload: unknown) => void;
          };
        }
      ).__STORYBOOK_ADDONS_CHANNEL__;
      if (channel == null) {
        throw new Error('Storybook channel is unavailable');
      }
      channel.emit('updateStoryArgs', {storyId, updatedArgs});
    },
    {storyId: `${PREFIX}${auditCase.story}`, updatedArgs: auditCase.args},
  );
  await settleFrames(page);
}

async function drive(page: Page, auditCase: AuditCase): Promise<void> {
  for (const index of auditCase.clickRows ?? []) {
    // A frozen page clock also freezes rAF-based actionability polling, so
    // pending-action cases click without waiting on it.
    await rowCheckbox(page, index).click({
      force: auditCase.pauseClock === true,
    });
    await settleFrames(page);
  }
  if (auditCase.settleMs != null) {
    await page.clock.runFor(auditCase.settleMs);
    await settleFrames(page);
  }
  await applyArgs(page, auditCase);
  if (auditCase.clickRows != null && auditCase.clickRows.length > 0) {
    // Pointer clicks leave focus on the checkbox without :focus-visible and
    // the pointer over the row; park the pointer so rest frames are clean.
    await page.mouse.move(0, 0);
  }
  const row = auditCase.interactionRow ?? 0;
  switch (auditCase.interaction ?? 'rest') {
    case 'hover': {
      const point = await rowLabelCenter(page, row);
      await page.mouse.move(point.x, point.y);
      break;
    }
    case 'pressed': {
      const point = await rowLabelCenter(page, row);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      break;
    }
    case 'focus-visible': {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
      const target = rowCheckbox(page, row);
      for (let press = 0; press < 8; press += 1) {
        await page.keyboard.press('Tab');
        if (await target.evaluate(el => document.activeElement === el)) {
          break;
        }
      }
      if (auditCase.expect.tooltipText != null) {
        await page
          .locator('[role="tooltip"]')
          .filter({hasText: auditCase.expect.tooltipText})
          .waitFor({state: 'visible', timeout: 5000})
          .catch(() => undefined);
      }
      break;
    }
    case 'rest':
      break;
  }
  await settleFrames(page);
}

/**
 * Everything read from the page in one pass. Colors are resolved in the page
 * and composited down the ancestor chain so contrast uses the painted backdrop.
 */
async function readPage(page: Page, auditCase: AuditCase) {
  return page.evaluate(
    ({interactionRow, groupExpected}) => {
      type Color = {r: number; g: number; b: number; a: number};
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', {willReadFrequently: true});
      const parse = (value: string | null | undefined): Color | null => {
        if (value == null || value === '' || value === 'none') {
          return null;
        }
        const rgb = value.match(
          /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/,
        );
        if (rgb) {
          const alpha =
            rgb[4] == null
              ? 1
              : rgb[4].endsWith('%')
                ? Number.parseFloat(rgb[4]) / 100
                : Number(rgb[4]);
          return {
            r: Number(rgb[1]),
            g: Number(rgb[2]),
            b: Number(rgb[3]),
            a: alpha,
          };
        }
        const srgb = value.match(
          /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+))?\)$/,
        );
        if (srgb) {
          return {
            r: Number(srgb[1]) * 255,
            g: Number(srgb[2]) * 255,
            b: Number(srgb[3]) * 255,
            a: srgb[4] == null ? 1 : Number(srgb[4]),
          };
        }
        if (context == null) {
          return null;
        }
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const data = context.getImageData(0, 0, 1, 1).data;
        return {r: data[0], g: data[1], b: data[2], a: data[3] / 255};
      };
      const over = (front: Color, back: Color): Color => {
        const alpha = front.a + back.a * (1 - front.a);
        const channel = (f: number, b: number) =>
          alpha === 0 ? 0 : (f * front.a + b * back.a * (1 - front.a)) / alpha;
        return {
          r: channel(front.r, back.r),
          g: channel(front.g, back.g),
          b: channel(front.b, back.b),
          a: alpha,
        };
      };
      const canvasColor = (): Color =>
        getComputedStyle(document.documentElement).colorScheme.includes('dark')
          ? {r: 18, g: 18, b: 18, a: 1}
          : {r: 255, g: 255, b: 255, a: 1};
      const gradientColors = (image: string): Color[] =>
        image === 'none'
          ? []
          : (image.match(/(rgba?\([^)]+\)|color\(srgb[^)]+\))/g) ?? [])
              .map(value => parse(value))
              .filter((value): value is Color => value != null)
              .slice(0, 1);
      const backdrop = (element: Element | null): Color => {
        const layers: Color[] = [];
        let base: Color | null = null;
        for (let node = element; node != null; node = node.parentElement) {
          const style = getComputedStyle(node);
          layers.push(...gradientColors(style.backgroundImage));
          const color = parse(style.backgroundColor);
          if (color != null && color.a >= 0.999) {
            base = color;
            break;
          }
          if (color != null && color.a > 0) {
            layers.push(color);
          }
        }
        let result = base ?? canvasColor();
        for (let index = layers.length - 1; index >= 0; index -= 1) {
          result = over(layers[index], result);
        }
        return result;
      };
      const box = (element: Element | null) => {
        if (element == null) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
      };
      const text = (element: Element | null) =>
        element == null
          ? null
          : ((element as HTMLElement).innerText ?? element.textContent ?? '')
              .replace(/\s+/g, ' ')
              .trim();
      const firstTextElement = (element: Element | null): Element | null => {
        if (element == null) {
          return null;
        }
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (
          let node = walker.nextNode();
          node != null;
          node = walker.nextNode()
        ) {
          if ((node.textContent ?? '').trim() !== '' && node.parentElement) {
            return node.parentElement;
          }
        }
        return null;
      };
      const byIds = (ids: string | null) =>
        (ids ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .map(id => document.getElementById(id))
          .filter((node): node is HTMLElement => node != null);
      const simpleName = (input: HTMLInputElement): string => {
        const label = input.getAttribute('aria-label');
        if (label) {
          return label.trim();
        }
        const labelled = byIds(input.getAttribute('aria-labelledby'));
        if (labelled.length > 0) {
          return labelled
            .map(node => text(node))
            .join(' ')
            .trim();
        }
        const own = input.id
          ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)
          : null;
        return (own?.textContent ?? '').replace(/\s+/g, ' ').trim();
      };
      const effectiveOpacity = (element: Element) => {
        let opacity = 1;
        for (
          let node: Element | null = element;
          node != null;
          node = node.parentElement
        ) {
          opacity *= Number(getComputedStyle(node).opacity);
        }
        return opacity;
      };
      const outlineOf = (element: Element) => {
        const style = getComputedStyle(element);
        const width = Number.parseFloat(style.outlineWidth);
        return style.outlineStyle !== 'none' && width > 0
          ? {
              className: element.getAttribute('class') ?? '',
              tag: element.tagName,
              opacity: effectiveOpacity(element),
              color: parse(style.outlineColor),
              width,
              offset: Number.parseFloat(style.outlineOffset),
              backdrop: backdrop(element.parentElement),
            }
          : null;
      };

      const storyRoot = document.getElementById('storybook-root');
      const groupRoots = document.querySelectorAll('.astryx-checkbox-list');
      const root: Element | null = groupExpected
        ? (groupRoots[0] ?? null)
        : (storyRoot?.querySelector('ul, ol') ?? null);
      const group = root?.querySelector('[role="group"]') ?? null;
      const listElement = root?.matches('ul, ol')
        ? root
        : (root?.querySelector('ul, ol') ?? null);
      const listChildren = [...(listElement?.children ?? [])].map(child => ({
        tag: child.tagName.toLowerCase(),
        role: child.getAttribute('role'),
      }));
      const labelNode =
        byIds(group?.getAttribute('aria-labelledby') ?? null)[0] ?? null;
      const describedNodes = byIds(
        group?.getAttribute('aria-describedby') ?? null,
      );
      const statusNode = root?.querySelector('.astryx-field-status') ?? null;
      const tooltip =
        [...document.querySelectorAll('[role="tooltip"]')].find(node => {
          const rect = node.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            getComputedStyle(node).visibility !== 'hidden'
          );
        }) ?? null;
      const descriptionNode =
        describedNodes.find(
          node =>
            node !== statusNode && node.getAttribute('role') !== 'tooltip',
        ) ?? null;
      const rows = [...(root?.querySelectorAll('li') ?? [])].map(
        (row, index) => {
          const input = row.querySelector<HTMLInputElement>(
            'input[type="checkbox"]',
          );
          const content = row.querySelector(':scope > span:nth-of-type(2)');
          const label =
            content?.querySelector(':scope > span:nth-of-type(1)') ?? null;
          const description =
            content?.querySelector(':scope > span:nth-of-type(2)') ?? null;
          const endSlot = row.querySelector(':scope > span:nth-of-type(3)');
          const endText = firstTextElement(endSlot);
          const indicator = row.querySelector('.astryx-checkbox-indicator');
          const check = row.querySelector('.astryx-checkbox-indicator-check');
          const dash = row.querySelector('.astryx-checkbox-indicator-dash');
          const spinner = row.querySelector('.astryx-spinner');
          const rowStyle = getComputedStyle(row);
          const indicatorStyle =
            indicator == null ? null : getComputedStyle(indicator);
          const labelBox = box(label);
          const labelElement = label as HTMLElement | null;
          const descriptionElement = description as HTMLElement | null;
          const lineHeight =
            labelElement == null
              ? 0
              : Number.parseFloat(getComputedStyle(labelElement).lineHeight) ||
                0;
          return {
            index,
            checked:
              input == null
                ? null
                : input.indeterminate
                  ? 'mixed'
                  : input.checked,
            disabled:
              input == null
                ? null
                : input.disabled
                  ? 'native'
                  : input.getAttribute('aria-disabled') === 'true'
                    ? 'focusable'
                    : false,
            busy: row.getAttribute('aria-busy') === 'true',
            inputBusy: input?.getAttribute('aria-busy') === 'true',
            spinner: spinner != null,
            readOnly: input?.getAttribute('aria-readonly') === 'true',
            name: input == null ? null : simpleName(input),
            descriptionText: text(
              byIds(input?.getAttribute('aria-describedby') ?? null)[0] ?? null,
            ),
            hovered: row.matches(':hover'),
            active: row.matches(':active'),
            focused: input != null && document.activeElement === input,
            focusVisible: input != null && input.matches(':focus-visible'),
            density: row.getAttribute('data-density'),
            rowCursor: rowStyle.cursor,
            inputCursor: input == null ? null : getComputedStyle(input).cursor,
            rowBackgroundColor: rowStyle.backgroundColor,
            rowBackgroundImage: rowStyle.backgroundImage,
            dividerWidth: Number.parseFloat(rowStyle.borderBlockEndWidth) || 0,
            rowBox: box(row),
            inputBox: box(input),
            indicatorBox: box(indicator),
            labelBox,
            labelTruncated:
              labelElement != null &&
              labelElement.scrollWidth > labelElement.clientWidth + 1,
            labelLines:
              labelBox == null || lineHeight === 0
                ? null
                : Math.round(labelBox.height / lineHeight),
            descriptionTruncated:
              descriptionElement == null
                ? null
                : descriptionElement.scrollWidth >
                  descriptionElement.clientWidth + 1,
            paint: {
              rowBackdrop: backdrop(row),
              label: parse(
                label == null ? null : getComputedStyle(label).color,
              ),
              labelBackdrop: backdrop(label),
              description: parse(
                description == null
                  ? null
                  : getComputedStyle(description).color,
              ),
              descriptionBackdrop: backdrop(description),
              endText: parse(
                endText == null ? null : getComputedStyle(endText).color,
              ),
              endBackdrop: backdrop(endText),
              indicatorBorder: parse(indicatorStyle?.borderTopColor),
              indicatorBorderWidth:
                indicatorStyle == null
                  ? 0
                  : Number.parseFloat(indicatorStyle.borderTopWidth) || 0,
              indicatorFill: parse(indicatorStyle?.backgroundColor),
              indicatorBackdrop: backdrop(indicator?.parentElement ?? null),
              check: parse(
                check == null ? null : getComputedStyle(check).color,
              ),
              dash: parse(
                dash == null ? null : getComputedStyle(dash).backgroundColor,
              ),
              spinner: parse(
                spinner == null ? null : getComputedStyle(spinner).color,
              ),
              contentOpacity:
                content == null ? 1 : Number(getComputedStyle(content).opacity),
            },
          };
        },
      );
      const focusIndicators = [
        ...(root == null ? [] : [root, ...root.querySelectorAll('*')]),
      ]
        .map(node => outlineOf(node))
        .filter(value => value != null);
      const rootElement = root as HTMLElement | null;
      const rootStyle =
        rootElement == null ? null : getComputedStyle(rootElement);
      const surface = backdrop(root?.parentElement ?? storyRoot);
      const surfaceLuminance = (() => {
        const linear = [surface.r, surface.g, surface.b].map(channel => {
          const value = channel / 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      })();
      const errorScreen = [
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
      });
      return {
        storyId: new URL(location.href).searchParams.get('id'),
        groupRootCount: groupRoots.length,
        listChildren,
        listCount: storyRoot?.querySelectorAll('ul, ol').length ?? 0,
        rootFound: root != null,
        groupFound: group != null,
        groupLabelledBy: group?.getAttribute('aria-labelledby') ?? null,
        groupLabelText: text(labelNode),
        groupLabelVisible:
          labelNode != null && labelNode.getBoundingClientRect().width > 1,
        groupDescribedBy: group?.getAttribute('aria-describedby') ?? null,
        describedTexts: describedNodes.map(node => text(node)),
        descriptionText: text(descriptionNode),
        status:
          statusNode == null
            ? null
            : {
                type: statusNode.getAttribute('data-type'),
                text: text(statusNode),
                describesGroup: describedNodes.includes(
                  statusNode as HTMLElement,
                ),
                iconCount: statusNode.querySelectorAll(
                  '.astryx-field-status-icon',
                ).length,
                color: parse(getComputedStyle(statusNode).color),
                backdrop: backdrop(statusNode),
                iconColor: parse(
                  statusNode.querySelector('.astryx-field-status-icon') == null
                    ? null
                    : getComputedStyle(
                        statusNode.querySelector(
                          '.astryx-field-status-icon',
                        ) as Element,
                      ).color,
                ),
              },
        tooltip:
          tooltip == null
            ? null
            : {
                text: text(tooltip),
                open: tooltip.matches(':popover-open'),
                describesGroup: describedNodes.includes(tooltip as HTMLElement),
                color: parse(getComputedStyle(tooltip).color),
                backdrop: backdrop(tooltip),
                box: box(tooltip),
              },
        groupLabelPaint:
          labelNode == null
            ? null
            : {
                color: parse(getComputedStyle(labelNode).color),
                backdrop: backdrop(labelNode),
              },
        descriptionPaint:
          descriptionNode == null
            ? null
            : {
                color: parse(getComputedStyle(descriptionNode).color),
                backdrop: backdrop(descriptionNode),
              },
        rows,
        focusIndicators,
        activeInsideRoot:
          root != null &&
          document.activeElement != null &&
          root.contains(document.activeElement),
        interactionRow,
        direction: rootStyle?.direction ?? null,
        rootBox: box(root),
        rootScrollFits:
          rootElement == null ||
          rootElement.scrollWidth <= rootElement.clientWidth + 1,
        documentScrollFits:
          document.documentElement.scrollWidth <= innerWidth + 1,
        viewport: {width: innerWidth, height: innerHeight},
        devicePixelRatio,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        forcedColors: matchMedia('(forced-colors: active)').matches,
        coarsePointer: matchMedia('(pointer: coarse)').matches,
        hoverCapable: matchMedia('(hover: hover)').matches,
        mode: document.documentElement.getAttribute('data-theme'),
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        theme:
          document
            .querySelector('[data-astryx-theme]')
            ?.getAttribute('data-astryx-theme') ?? null,
        surface,
        surfaceLuminanceClass: surfaceLuminance > 0.5 ? 'light' : 'dark',
        fontsReady: document.fonts.status === 'loaded',
        errorScreen,
      };
    },
    {
      interactionRow: auditCase.interactionRow ?? null,
      groupExpected: auditCase.expect.groupName != null,
    },
  );
}

type PageRead = Awaited<ReturnType<typeof readPage>>;

const INACTIVE = 'WCAG 1.4.3/1.4.11 inactive user interface component';

/** Focus rings that actually paint; an outline on an opacity:0 input does not. */
function paintedFocusIndicators(actual: PageRead) {
  return actual.focusIndicators.filter(
    (indicator): indicator is NonNullable<typeof indicator> =>
      indicator != null && indicator.opacity > 0,
  );
}

function focusOwner(tag: string): string {
  return tag === 'LI'
    ? 'component:Item (row focus-within ring)'
    : tag === 'SPAN'
      ? 'component:CheckboxInput (indicator ring)'
      : `unexpected ${tag}`;
}

function contrastPairs(actual: PageRead, auditCase: AuditCase): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  if (auditCase.forcedColors) {
    return pairs;
  }
  // A group whose every option is disabled is an inactive component; its
  // label and description carry the same WCAG exception as the options.
  const groupInactive =
    actual.rows.length > 0 &&
    actual.rows.every(
      row => row.disabled === 'native' || row.disabled === 'focusable',
    )
      ? `${INACTIVE} (every option in the group is disabled)`
      : null;
  if (actual.groupLabelPaint != null && actual.groupLabelVisible) {
    pairs.push(
      pair(
        'group label',
        'component:Field',
        actual.groupLabelPaint.color,
        actual.groupLabelPaint.backdrop,
        4.5,
        groupInactive,
      ),
    );
  }
  if (actual.descriptionPaint != null && actual.groupLabelVisible) {
    pairs.push(
      pair(
        'group description',
        'component:Field',
        actual.descriptionPaint.color,
        actual.descriptionPaint.backdrop,
        4.5,
        groupInactive,
      ),
    );
  }
  for (const row of actual.rows) {
    const inactive =
      row.disabled === 'native' || row.disabled === 'focusable'
        ? INACTIVE
        : null;
    const prefix = `row ${row.index + 1}`;
    pairs.push(
      pair(
        `${prefix} label`,
        'component:Item',
        row.paint.label,
        row.paint.labelBackdrop,
        4.5,
        inactive,
      ),
    );
    if (row.paint.description != null && row.descriptionText) {
      pairs.push(
        pair(
          `${prefix} description`,
          'component:Item',
          row.paint.description,
          row.paint.descriptionBackdrop,
          4.5,
          inactive,
        ),
      );
    }
    if (row.paint.endText != null) {
      pairs.push(
        pair(
          `${prefix} end content`,
          'caller (story fixture)',
          row.paint.endText,
          row.paint.endBackdrop,
          4.5,
          inactive,
        ),
      );
    }
    if (row.checked === false && row.paint.indicatorBorderWidth > 0) {
      pairs.push(
        pair(
          `${prefix} checkbox boundary`,
          'component:CheckboxIndicator',
          row.paint.indicatorBorder,
          row.paint.indicatorBackdrop,
          3,
          inactive,
        ),
      );
    }
    if (row.checked !== false && row.paint.indicatorFill != null) {
      pairs.push(
        pair(
          `${prefix} checkbox fill`,
          'component:CheckboxIndicator',
          row.paint.indicatorFill,
          row.paint.indicatorBackdrop,
          3,
          inactive,
        ),
      );
      const fill =
        row.paint.indicatorFill.a < 1
          ? composite(row.paint.indicatorFill, row.paint.indicatorBackdrop)
          : row.paint.indicatorFill;
      const mark = row.checked === 'mixed' ? row.paint.dash : row.paint.check;
      if (!row.spinner) {
        pairs.push(
          pair(
            `${prefix} check mark`,
            'component:CheckboxIndicator',
            mark,
            fill,
            3,
            inactive,
          ),
        );
      }
    }
    if (row.spinner && row.paint.spinner != null) {
      const surface =
        row.paint.indicatorFill != null && row.paint.indicatorFill.a > 0
          ? composite(row.paint.indicatorFill, row.paint.indicatorBackdrop)
          : row.paint.indicatorBackdrop;
      pairs.push(
        pair(
          `${prefix} busy spinner`,
          'component:Spinner',
          row.paint.spinner,
          surface,
          3,
          inactive,
        ),
      );
    }
    if (row.checked === true) {
      pairs.push(
        pair(
          `${prefix} checked-row fill`,
          'component:CheckboxList',
          row.paint.rowBackdrop,
          actual.surface,
          null,
          'Redundant: the checkbox state carries selection; the row fill is supplementary.',
        ),
      );
    }
  }
  if (actual.status != null) {
    pairs.push(
      pair(
        'status message',
        'component:FieldStatus',
        actual.status.color,
        actual.status.backdrop,
        4.5,
      ),
    );
    if (actual.status.iconColor != null) {
      pairs.push(
        pair(
          'status icon',
          'component:FieldStatus',
          actual.status.iconColor,
          actual.status.backdrop,
          null,
          'Redundant: the adjacent message text names the status.',
        ),
      );
    }
  }
  if (actual.tooltip != null) {
    pairs.push(
      pair(
        'disabled-reason tooltip text',
        'Tooltip',
        actual.tooltip.color,
        actual.tooltip.backdrop,
        4.5,
      ),
    );
  }
  paintedFocusIndicators(actual).forEach((indicator, index) => {
    pairs.push(
      pair(
        `focus indicator ${index + 1} (${indicator.tag})`,
        focusOwner(indicator.tag),
        indicator.color,
        indicator.backdrop,
        3,
      ),
    );
  });
  return pairs;
}

async function screenshot(page: Page, actual: PageRead, file: string) {
  const boxes = [actual.rootBox, actual.tooltip?.box ?? null].filter(
    (value): value is Box => value != null,
  );
  const pad = 12;
  const left = Math.max(0, Math.min(...boxes.map(b => b.x)) - pad);
  const top = Math.max(0, Math.min(...boxes.map(b => b.y)) - pad);
  const right = Math.min(
    actual.viewport.width,
    Math.max(...boxes.map(b => b.x + b.width)) + pad,
  );
  const bottom = Math.min(
    actual.viewport.height,
    Math.max(...boxes.map(b => b.y + b.height)) + pad,
  );
  const bytes = await page.screenshot({
    animations: 'disabled',
    clip: {x: left, y: top, width: right - left, height: bottom - top},
  });
  fs.writeFileSync(path.join(OUTPUT, file), bytes);
  return inspectPng(file, bytes);
}

function sameRows(
  observed: PageRead['rows'],
  expected: RowExpectation[],
): string[] {
  const failures: string[] = [];
  if (observed.length !== expected.length) {
    failures.push(
      `expected ${expected.length} options, observed ${observed.length}`,
    );
    return failures;
  }
  expected.forEach((row, index) => {
    const actual = observed[index];
    if (actual.checked !== row.checked) {
      failures.push(
        `row ${index + 1}: expected checked=${row.checked}, observed ${actual.checked}`,
      );
    }
    if (row.disabled !== undefined && actual.disabled !== row.disabled) {
      failures.push(
        `row ${index + 1}: expected disabled=${row.disabled}, observed ${actual.disabled}`,
      );
    }
    if (row.busy !== undefined) {
      const busy = actual.busy && actual.spinner;
      const idle = !actual.busy && !actual.spinner;
      if (row.busy ? !busy : !idle) {
        failures.push(
          `row ${index + 1}: expected busy=${row.busy}, observed aria-busy=${actual.busy} spinner=${actual.spinner}`,
        );
      }
    }
    if (row.readOnly !== undefined && actual.readOnly !== row.readOnly) {
      failures.push(
        `row ${index + 1}: expected aria-readonly=${row.readOnly}, observed ${actual.readOnly}`,
      );
    }
  });
  return failures;
}

async function capture(browser: Browser, auditCase: AuditCase, mode: Mode) {
  const frame = frameName(auditCase, mode);
  const {context, page, errors} = await openCase(browser, auditCase, mode);
  try {
    await drive(page, auditCase);
    const actual = await readPage(page, auditCase);
    const groupNameCount =
      auditCase.expect.groupName == null
        ? await page.locator('#storybook-root').getByRole('group').count()
        : await page
            .locator('#storybook-root')
            .getByRole('group', {name: auditCase.expect.groupName, exact: true})
            .count();
    const ariaSnapshot = await page.locator('#storybook-root').ariaSnapshot();
    const image = await screenshot(page, actual, `CheckboxList__${frame}.png`);
    if (auditCase.interaction === 'pressed') {
      await page.mouse.move(0, 0);
      await page.mouse.up();
    }

    const direction = auditCase.direction ?? 'ltr';
    const stateFailures = sameRows(actual.rows, auditCase.expect.rows);
    const expectGroup = auditCase.expect.groupName != null;
    if (expectGroup) {
      if (groupNameCount !== 1) {
        stateFailures.push(
          `expected one group named "${auditCase.expect.groupName}", observed ${groupNameCount}`,
        );
      }
    } else if (groupNameCount !== 0 || actual.groupRootCount !== 0) {
      stateFailures.push(
        'standalone fixture unexpectedly renders a CheckboxList group',
      );
    }
    const status = auditCase.expect.status;
    if (status != null) {
      if (
        actual.status == null ||
        actual.status.type !== status.type ||
        actual.status.text !== status.text ||
        actual.status.iconCount !== 1
      ) {
        stateFailures.push(
          `expected ${status.type} status "${status.text}" with one icon`,
        );
      }
    } else if (actual.status != null) {
      stateFailures.push('unexpected status message');
    }
    if (auditCase.expect.tooltipText != null) {
      if (
        actual.tooltip == null ||
        actual.tooltip.text !== auditCase.expect.tooltipText ||
        !actual.tooltip.open
      ) {
        stateFailures.push('expected the open disabled-reason tooltip');
      }
    } else if (actual.tooltip != null) {
      stateFailures.push('unexpected visible tooltip');
    }
    if (auditCase.expect.density != null) {
      if (actual.rows.some(row => row.density !== auditCase.expect.density)) {
        stateFailures.push(`expected density ${auditCase.expect.density}`);
      }
    }
    if (auditCase.expect.labelHidden === true) {
      if (actual.groupLabelVisible) {
        stateFailures.push('expected the group label to be visually hidden');
      }
    } else if (expectGroup && !actual.groupLabelVisible) {
      stateFailures.push('expected a visible group label');
    }
    const interaction = auditCase.interaction ?? 'rest';
    const row = actual.rows[auditCase.interactionRow ?? 0];
    if (interaction === 'hover' && !(row?.hovered ?? false)) {
      stateFailures.push('target row is not hovered');
    }
    if (interaction === 'pressed' && !(row?.active ?? false)) {
      stateFailures.push('target row is not :active');
    }
    if (
      interaction === 'focus-visible' &&
      !(row?.focused && row.focusVisible)
    ) {
      stateFailures.push('target checkbox does not have keyboard focus');
    }
    if (
      interaction !== 'focus-visible' &&
      actual.rows.some(candidate => candidate.focusVisible)
    ) {
      stateFailures.push('unexpected :focus-visible checkbox');
    }
    if (
      interaction !== 'hover' &&
      interaction !== 'pressed' &&
      actual.rows.some(candidate => candidate.hovered)
    ) {
      stateFailures.push('unexpected hovered row');
    }

    const viewport = auditCase.narrowCoarse
      ? {width: 320, height: 640}
      : {width: 1024, height: 768};
    const sensors: Record<string, SensorResult> = {
      Build: {
        expected: head,
        observed: storybookHead,
        passed: head !== '' && head === storybookHead,
      },
      Story: {
        expected: `${PREFIX}${auditCase.story}`,
        observed: actual.storyId,
        passed: actual.storyId === `${PREFIX}${auditCase.story}`,
      },
      Theme: {
        expected: 'neutral',
        observed: actual.theme,
        passed: actual.theme === 'neutral',
      },
      'Color mode': {
        expected: {
          mode,
          colorScheme: mode,
          surface: auditCase.forcedColors ? 'forced' : mode,
        },
        observed: {
          mode: actual.mode,
          colorScheme: actual.colorScheme,
          surface: actual.surfaceLuminanceClass,
        },
        passed:
          actual.mode === mode &&
          actual.colorScheme.includes(mode) &&
          (auditCase.forcedColors === true ||
            actual.surfaceLuminanceClass === mode),
      },
      Direction: {
        expected: direction,
        observed: actual.direction,
        passed: actual.direction === direction,
      },
      'Viewport/media': {
        expected: {
          ...viewport,
          devicePixelRatio: 1,
          reducedMotion: true,
          forcedColors: auditCase.forcedColors === true,
          coarsePointer: auditCase.narrowCoarse === true,
        },
        observed: {
          ...actual.viewport,
          devicePixelRatio: actual.devicePixelRatio,
          reducedMotion: actual.reducedMotion,
          forcedColors: actual.forcedColors,
          coarsePointer: actual.coarsePointer,
          hoverCapable: actual.hoverCapable,
        },
        passed:
          actual.viewport.width === viewport.width &&
          actual.viewport.height === viewport.height &&
          actual.devicePixelRatio === 1 &&
          actual.reducedMotion &&
          actual.forcedColors === (auditCase.forcedColors === true) &&
          actual.coarsePointer === (auditCase.narrowCoarse === true),
      },
      'Rendered state': {
        expected: {interaction, ...auditCase.expect},
        observed: {
          groupNameCount,
          groupLabel: actual.groupLabelText,
          status:
            actual.status == null
              ? null
              : {type: actual.status.type, text: actual.status.text},
          tooltip:
            actual.tooltip == null
              ? null
              : {text: actual.tooltip.text, open: actual.tooltip.open},
          rows: actual.rows.map(candidate => ({
            checked: candidate.checked,
            disabled: candidate.disabled,
            busy: candidate.busy,
            spinner: candidate.spinner,
            readOnly: candidate.readOnly,
            name: candidate.name,
            hovered: candidate.hovered,
            active: candidate.active,
            focusVisible: candidate.focusVisible,
            density: candidate.density,
          })),
        },
        passed: stateFailures.length === 0,
      },
      'Subject geometry': {
        expected: {
          subjectCount: expectGroup ? 1 : 0,
          visible: true,
          insideViewport: true,
          overflowFree: true,
        },
        observed: {
          groupRootCount: actual.groupRootCount,
          rootBox: actual.rootBox,
          rootScrollFits: actual.rootScrollFits,
          documentScrollFits: actual.documentScrollFits,
        },
        passed:
          actual.rootFound &&
          actual.groupRootCount === (expectGroup ? 1 : 0) &&
          actual.rootBox != null &&
          actual.rootBox.width > 0 &&
          actual.rootBox.height > 0 &&
          actual.rootBox.x >= 0 &&
          actual.rootBox.x + actual.rootBox.width <=
            actual.viewport.width + 0.5 &&
          actual.rootScrollFits &&
          actual.documentScrollFits,
      },
      'Settled render': {
        expected: {fontsReady: true, pageErrors: 0, storyError: false},
        observed: {
          fontsReady: actual.fontsReady,
          pageErrors: errors,
          storyError: actual.errorScreen,
        },
        passed: actual.fontsReady && errors.length === 0 && !actual.errorScreen,
      },
      Image: {
        expected: {nonBlank: true},
        observed: image,
        passed: image.nonBlank && image.width > 0 && image.height > 0,
      },
    };

    const pairs = contrastPairs(actual, auditCase);
    const failures = [
      ...Object.entries(sensors)
        .filter(([, sensor]) => !sensor.passed)
        .map(([name]) => `${name} sensor failed`),
      ...stateFailures,
    ];
    const receipt: FrameReceipt = {
      frame,
      case: auditCase.key,
      story: `${PREFIX}${auditCase.story}`,
      mode,
      direction,
      remediation: auditCase.remediation ?? null,
      passed: failures.length === 0,
      failures,
      sensors,
      contrastPairs: pairs,
      measurements: {
        // Painted rings only; an outline on the opacity:0 native input is
        // listed separately because it never reaches the screen.
        paintedFocusIndicators: paintedFocusIndicators(actual).map(
          indicator => ({
            tag: indicator.tag,
            owner: focusOwner(indicator.tag),
            color: css(indicator.color),
            width: indicator.width,
            offset: indicator.offset,
          }),
        ),
        unpaintedOutlines: actual.focusIndicators
          .filter(indicator => indicator != null && indicator.opacity === 0)
          .map(indicator => ({
            tag: indicator?.tag,
            opacity: indicator?.opacity,
          })),
        groupDescribedBy: actual.groupDescribedBy,
        describedTexts: actual.describedTexts,
        rows: actual.rows.map(candidate => ({
          index: candidate.index,
          name: candidate.name,
          descriptionText: candidate.descriptionText,
          inputBusy: candidate.inputBusy,
          rowCursor: candidate.rowCursor,
          inputCursor: candidate.inputCursor,
          rowBackgroundColor: candidate.rowBackgroundColor,
          rowBackgroundImage: candidate.rowBackgroundImage,
          rowBackdrop: css(candidate.paint.rowBackdrop),
          dividerWidth: candidate.dividerWidth,
          rowBox: candidate.rowBox,
          inputBox: candidate.inputBox,
          indicatorBox: candidate.indicatorBox,
          labelBox: candidate.labelBox,
          labelTruncated: candidate.labelTruncated,
          labelLines: candidate.labelLines,
          descriptionTruncated: candidate.descriptionTruncated,
          contentOpacity: candidate.paint.contentOpacity,
        })),
        surface: css(actual.surface),
        hoverCapable: actual.hoverCapable,
        listChildren: actual.listChildren,
      },
      ariaSnapshot,
      image,
    };
    fs.writeFileSync(
      path.join(OUTPUT, `${frame}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    receipts.push(receipt);
    return receipt;
  } finally {
    await context.close();
  }
}

async function writeContactSheet(browser: Browser): Promise<ImageReceipt> {
  const context = await browser.newContext({
    viewport: {width: 1400, height: 900},
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const figures = receipts
    .map(receipt => {
      const bytes = fs.readFileSync(path.join(OUTPUT, receipt.image.file));
      const verdict = receipt.passed ? 'pass' : 'FAIL';
      return `<figure><img src="data:image/png;base64,${bytes.toString('base64')}" alt=""><figcaption>${receipt.frame} — ${verdict}</figcaption></figure>`;
    })
    .join('');
  await page.setContent(`<!doctype html>
    <style>
      html { color-scheme: light; background: #f3f4f6; }
      body { margin: 20px; font: 12px/1.35 system-ui, sans-serif; color: #111827; }
      h1 { margin: 0 0 16px; font-size: 20px; }
      main { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
      figure { margin: 0; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; background: white; }
      img { display: block; width: 100%; height: 180px; object-fit: contain; }
      figcaption { margin-top: 8px; overflow-wrap: anywhere; }
    </style>
    <h1>CheckboxList exact-head evidence (${head.slice(0, 12)})</h1>
    <main>${figures}</main>`);
  await page.locator('img').evaluateAll(async images => {
    await Promise.all(
      images.map(async image =>
        (image as HTMLImageElement).decode().catch(() => undefined),
      ),
    );
  });
  const file = 'CheckboxList__contact-sheet.png';
  const bytes = await page.screenshot({fullPage: true, animations: 'disabled'});
  fs.writeFileSync(path.join(OUTPUT, file), bytes);
  await context.close();
  return inspectPng(file, bytes);
}

test.describe.configure({mode: 'serial', retries: 0});

test.beforeAll(async () => {
  head = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const dirty = execFileSync(
    'git',
    [
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--',
      'apps/storybook/stories/CheckboxList.stories.tsx',
      'packages/core/src/CheckboxList',
      BLOCK_DIR,
    ],
    {encoding: 'utf8'},
  ).trim();
  if (dirty !== '') {
    throw new Error(
      `browser evidence requires committed source files: ${dirty}`,
    );
  }
  if (process.env.ASTRYX_HEAD_SHA && process.env.ASTRYX_HEAD_SHA !== head) {
    throw new Error('PR head differs from the checked out source');
  }
  blockBlob = execFileSync('git', ['hash-object', BLOCK_SOURCE], {
    encoding: 'utf8',
  }).trim();
  fs.mkdirSync(OUTPUT, {recursive: true});
  server = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  const stamp = await fetch(`${server.origin}/astryx-build-sha.txt`);
  if (!stamp.ok) {
    throw new Error('Storybook build is missing its source stamp');
  }
  storybookHead = (await stamp.text()).trim();
  if (storybookHead !== head) {
    throw new Error('Storybook bytes differ from the PR head');
  }
});

test.afterAll(async () => {
  await server?.close();
});

test('captures the fail-closed CheckboxList state matrix', async ({
  browser,
}) => {
  test.setTimeout(15 * 60 * 1000);
  const failures: string[] = [];
  for (const auditCase of CASES) {
    for (const mode of auditCase.modes) {
      try {
        const receipt = await capture(browser, auditCase, mode);
        failures.push(
          ...receipt.failures.map(failure => `${receipt.frame}: ${failure}`),
        );
      } catch (error) {
        failures.push(
          `${frameName(auditCase, mode)}: capture error ${String(error)}`,
        );
      }
    }
  }
  const expectedFrames = CASES.flatMap(auditCase =>
    auditCase.modes.map(mode => frameName(auditCase, mode)),
  );
  const observed = new Set(receipts.map(receipt => receipt.frame));
  for (const frame of expectedFrames) {
    if (!observed.has(frame)) {
      failures.push(`missing frame: ${frame}`);
    }
  }
  const contactSheet = await writeContactSheet(browser);
  if (!contactSheet.nonBlank) {
    failures.push('contact sheet is blank');
  }
  const failedPairs = receipts.flatMap(receipt =>
    receipt.contrastPairs
      .filter(candidate => !candidate.passed)
      .map(
        candidate => `${receipt.frame}: ${candidate.part} ${candidate.ratio}:1`,
      ),
  );
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(
      {
        version: 1,
        component: 'core/CheckboxList',
        headSha: head,
        storybookSha: storybookHead,
        browser: browserVersion,
        sources: {block: {path: BLOCK_SOURCE, gitBlob: blockBlob}},
        failClosed: true,
        matrixComplete: failures.length === 0,
        matrixFailures: failures,
        contrastFailures: failedPairs,
        sensorCount: 10,
        requiredSensors: [
          'Build',
          'Story',
          'Theme',
          'Color mode',
          'Direction',
          'Viewport/media',
          'Rendered state',
          'Subject geometry',
          'Settled render',
          'Image',
        ],
        remediationFrames: receipts
          .filter(receipt => receipt.remediation != null)
          .map(receipt => ({
            frame: receipt.frame,
            remediation: receipt.remediation,
            passed: receipt.passed,
          })),
        contactSheet,
        notMeasured: {
          assistiveTechnology:
            'Browser semantics and the accessibility tree are recorded; spoken output was not tested with assistive technology.',
          subjectiveVisualAcceptance:
            'Frames are objective evidence; subjective visual direction is not settled here.',
        },
        frames: receipts,
      },
      null,
      2,
    )}\n`,
  );
  // Contrast failures are recorded for the audit and do not gate: token-layer
  // pairs belong to the theme, and the evidence must survive to be reviewed.
  expect(failures, 'complete exact-head evidence matrix').toEqual([]);
});
