// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit DateInput

/**
 * @file DateInputAudit.a11y.chromium.spec.ts
 * @input Exact-head DateInput stories across field states, presentations,
 *   themes, direction, pointers, and viewport sizes
 * @output Screenshots and fail-closed sensor receipts for the DateInput
 *   whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a
 *   DateInput audit pull request
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

const OUTPUT = path.resolve('date-input-audit-evidence');
const WIDE = {width: 1024, height: 768};
const NARROW = {width: 320, height: 720};

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter';
type Pointer = 'fine' | 'coarse';
type Story =
  | 'default'
  | 'with-value'
  | 'disabled'
  | 'disabled-with-message'
  | 'with-error-status'
  | 'with-warning-status'
  | 'with-success-status'
  | 'clearable'
  | 'open-calendar-audit'
  | 'styling-parts';
type State =
  | 'rest'
  | 'hover'
  | 'focus-toggle'
  | 'focus-input'
  | 'typed-invalid'
  | 'clear-hover'
  | 'open'
  | 'sheet-open';
type Surface = 'popover' | 'native' | 'sheet' | 'mixed';

type AuditCase = {
  key: string;
  story: Story;
  args: Record<string, string>;
  surface: Surface;
  mode: Mode;
  direction: Direction;
  theme: Theme;
  state: State;
  pointer: Pointer;
  forcedColors: boolean;
  viewport: {width: number; height: number};
};

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
};

const cases: AuditCase[] = [];
function addPair(
  key: string,
  options: Partial<Omit<AuditCase, 'key' | 'mode'>> = {},
) {
  for (const mode of ['light', 'dark'] as const) {
    cases.push({
      key: `${key}-${mode}`,
      story: options.story ?? 'with-value',
      args: options.args ?? {},
      surface: options.surface ?? 'popover',
      mode,
      direction: options.direction ?? 'ltr',
      theme: options.theme ?? 'neutral',
      state: options.state ?? 'rest',
      pointer: options.pointer ?? 'fine',
      forcedColors: options.forcedColors ?? false,
      viewport: options.viewport ?? WIDE,
    });
  }
}

const BUSY = {isLoading: '!true'};

addPair('empty-rest', {story: 'default'});
addPair('valued-rest');
addPair('valued-hover', {state: 'hover'});
addPair('focus-toggle', {state: 'focus-toggle'});
addPair('focus-input', {state: 'focus-input'});
addPair('typed-invalid', {state: 'typed-invalid'});
addPair('open-calendar', {story: 'open-calendar-audit', state: 'open'});
addPair('size-sm', {args: {size: 'sm'}});
addPair('size-lg', {args: {size: 'lg'}});
addPair('busy-rest', {args: BUSY});
addPair('busy-hover', {args: BUSY, state: 'hover'});
addPair('busy-focus-input', {args: BUSY, state: 'focus-input'});
addPair('disabled-rest', {story: 'disabled'});
addPair('disabled-hover', {story: 'disabled', state: 'hover'});
addPair('disabled-focus-input', {story: 'disabled', state: 'focus-input'});
addPair('disabled-message-focus', {
  story: 'disabled-with-message',
  state: 'focus-toggle',
});
addPair('status-error', {story: 'with-error-status'});
addPair('status-warning', {story: 'with-warning-status'});
addPair('status-success', {story: 'with-success-status'});
addPair('clearable-rest', {story: 'clearable'});
addPair('clearable-hover-clear', {story: 'clearable', state: 'clear-hover'});
addPair('native-rest', {args: {presentation: 'native'}, surface: 'native'});
addPair('native-busy', {
  args: {presentation: 'native', ...BUSY},
  surface: 'native',
});
addPair('sheet-rest', {
  args: {presentation: 'bottom-sheet'},
  surface: 'sheet',
});
addPair('sheet-busy', {
  args: {presentation: 'bottom-sheet', ...BUSY},
  surface: 'sheet',
});
addPair('styling-parts', {story: 'styling-parts', surface: 'mixed'});
addPair('custom-theme-rest', {theme: 'butter'});
addPair('custom-theme-busy', {theme: 'butter', args: BUSY});
addPair('custom-theme-disabled', {theme: 'butter', story: 'disabled'});
addPair('custom-theme-open', {
  theme: 'butter',
  story: 'open-calendar-audit',
  state: 'open',
});
addPair('rtl-clearable', {story: 'clearable', direction: 'rtl'});
addPair('rtl-open', {
  story: 'open-calendar-audit',
  state: 'open',
  direction: 'rtl',
});
addPair('narrow-fine', {viewport: NARROW});
addPair('narrow-coarse-native', {
  viewport: NARROW,
  pointer: 'coarse',
  surface: 'native',
});
addPair('narrow-coarse-sheet-open', {
  viewport: NARROW,
  pointer: 'coarse',
  surface: 'sheet',
  args: {presentation: 'adaptive-bottom-sheet'},
  state: 'sheet-open',
});
addPair('forced-colors-focus-input', {
  state: 'focus-input',
  forcedColors: true,
});

/** Accessible name each story gives its field. */
const LABEL: Record<Story, string | null> = {
  default: 'Date',
  'with-value': 'Event date',
  disabled: 'Locked date',
  'disabled-with-message': 'Event date',
  'with-error-status': 'Event date',
  'with-warning-status': 'Meeting date',
  'with-success-status': 'Appointment date',
  clearable: 'Event date',
  'open-calendar-audit': 'Appointment date',
  'styling-parts': null,
};

// Default mode, so a failing case does not skip the rest of the matrix.
test.describe.configure({retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyId(item: AuditCase) {
  return `core-dateinput--${item.story}`;
}

function storyUrl(item: AuditCase) {
  const args = Object.entries(item.args)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
  return `${server.origin}/iframe.html?id=${storyId(item)}&viewMode=story${
    args ? `&args=${args}` : ''
  }&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
}

function isBusyCase(item: AuditCase) {
  return item.args.isLoading === '!true';
}

function isDisabledCase(item: AuditCase) {
  return item.story === 'disabled' || item.story === 'disabled-with-message';
}

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(40);
}

/** The element that carries the field's name and value on this surface. */
function fieldControl(page: Page, item: AuditCase): Locator {
  return item.surface === 'native'
    ? page.locator('#storybook-root input[type="date"]').first()
    : page.locator('#storybook-root [role="combobox"]').first();
}

test.beforeAll(async () => {
  // Never wipe: Playwright restarts the worker after a failing case and
  // reruns this hook, which would delete frames already banked.
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
      colorScheme: item.mode,
      reducedMotion: 'reduce',
      hasTouch: item.pointer === 'coarse',
      forcedColors: item.forcedColors ? 'active' : 'none',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page.locator('#storybook-root').waitFor();
    await expect(
      page.locator('#storybook-root .astryx-date-input').first(),
    ).toBeVisible();

    const wrapper = page.locator('#storybook-root .astryx-date-input').first();
    const control = fieldControl(page, item);
    const label = LABEL[item.story];
    if (item.surface !== 'mixed') {
      await expect(control).toBeVisible();
      if (label != null) {
        await expect(control).toHaveAccessibleName(label);
      }
    }
    await settle(page);

    // The calendar toggle is the field's first button; its name follows the
    // open state.
    const toggle = wrapper.locator('button').first();
    if (item.state === 'hover') {
      await wrapper.hover();
    } else if (item.state === 'focus-toggle') {
      await page.locator('body').focus();
      await page.keyboard.press('Tab');
      if (item.story === 'disabled-with-message') {
        // The reason tooltip opens after its show delay.
        await page.waitForTimeout(800);
      }
    } else if (item.state === 'focus-input') {
      await control.focus();
      // Keyboard modality: a key press after programmatic focus.
      await page.keyboard.press('Shift');
    } else if (item.state === 'typed-invalid') {
      await control.focus();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('not a date');
    } else if (item.state === 'clear-hover') {
      await wrapper.getByRole('button', {name: 'Clear Event date'}).hover();
      await page.waitForTimeout(800);
    } else if (item.state === 'open') {
      await expect(control).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('dialog').first()).toBeVisible();
    } else if (item.state === 'sheet-open') {
      await control.tap();
      await expect(page.getByRole('dialog').first()).toBeVisible();
      await page.waitForTimeout(120);
    }
    await page.evaluate(async () => document.fonts.ready);
    await page.waitForTimeout(40);

    const observed = await page.evaluate(() => ({
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      direction: getComputedStyle(
        document.querySelector('.astryx-date-input') as HTMLElement,
      ).direction,
      viewport: {width: innerWidth, height: innerHeight},
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      hoverCapable: matchMedia('(hover: hover)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      fonts: document.fonts.status,
      activeElement: (() => {
        const active = document.activeElement as HTMLElement | null;
        if (active == null || active === document.body) {
          return null;
        }
        return {
          tag: active.tagName.toLowerCase(),
          type: active.getAttribute('type'),
          role: active.getAttribute('role'),
          label: active.getAttribute('aria-label'),
          focusVisible: active.matches(':focus-visible'),
          outlineStyle: getComputedStyle(active).outlineStyle,
          outlineColor: getComputedStyle(active).outlineColor,
        };
      })(),
      // Top-layer popovers have no offsetParent, and BottomSheet is a native
      // <dialog> without an explicit role, so read rendered visibility and
      // both dialog forms.
      tooltips: Array.from(document.querySelectorAll('[role="tooltip"]'))
        .filter(node => node.checkVisibility())
        .map(node => node.textContent?.replace(/\s+/g, ' ').trim()),
      dialogs: Array.from(
        new Set(document.querySelectorAll('[role="dialog"], dialog[open]')),
      )
        .filter(node => node.checkVisibility())
        .map(
          node =>
            node.getAttribute('aria-label') ??
            document
              .getElementById(node.getAttribute('aria-labelledby') ?? '')
              ?.textContent?.trim() ??
            null,
        ),
    }));
    const paint = await wrapper.evaluate(element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        hovered: element.matches(':hover'),
        opacity: style.opacity,
        boxShadow: style.boxShadow,
        borderColor: style.borderTopColor,
        backgroundColor: style.backgroundColor,
        cursor: style.cursor,
        themeSize: element.getAttribute('data-size'),
        themeStatus: element.getAttribute('data-status'),
        themeDisabled: element.getAttribute('data-disabled'),
        spinners: element.querySelectorAll('[class*="astryx-spinner"]').length,
        geometry: {x: box.x, y: box.y, width: box.width, height: box.height},
      };
    });
    const semantics =
      item.surface === 'mixed'
        ? null
        : await control.evaluate(element => ({
            tag: element.tagName.toLowerCase(),
            type: element.getAttribute('type'),
            role: element.getAttribute('role'),
            disabledAttribute: element.hasAttribute('disabled'),
            ariaDisabled: element.getAttribute('aria-disabled'),
            ariaBusy: element.getAttribute('aria-busy'),
            ariaInvalid: element.getAttribute('aria-invalid'),
            ariaExpanded: element.getAttribute('aria-expanded'),
            readOnly: (element as HTMLInputElement).readOnly,
            focused: element === document.activeElement,
            value: (element as HTMLInputElement).value,
            alertText:
              element
                .closest('.astryx-date-input')
                ?.querySelector('[role="alert"]')
                ?.textContent?.trim() ?? null,
          }));
    const toggleState =
      item.surface === 'popover'
        ? await toggle.evaluate(element => ({
            disabledAttribute: element.hasAttribute('disabled'),
            ariaDisabled: element.getAttribute('aria-disabled'),
            tabIndex: (element as HTMLButtonElement).tabIndex,
          }))
        : null;

    const busy = isBusyCase(item);
    const disabled = isDisabledCase(item);
    let semanticsPass = true;
    if (semantics != null) {
      semanticsPass =
        semantics.disabledAttribute === false &&
        (busy ? semantics.ariaBusy === 'true' : semantics.ariaBusy === null) &&
        (busy || disabled
          ? semantics.ariaDisabled === 'true'
          : semantics.ariaDisabled === null) &&
        (item.surface === 'native'
          ? semantics.tag === 'input' && semantics.type === 'date'
          : semantics.role === 'combobox') &&
        (toggleState == null || toggleState.disabledAttribute === false);
    }

    // Expectations authored from current authority before observation:
    // spec:AST-085 FR1 (focusable, no native disabled), FR6 (disabled paint
    // belongs to the disabled state; busy keeps its pending treatment; no
    // hover affordance while disabled; keyboard focus indicator remains), and
    // family:buttons FR4 (disabled and pending styling stay distinct).
    let statePass = true;
    if (busy) {
      statePass = statePass && paint.opacity === '1' && paint.spinners >= 1;
    }
    if (disabled) {
      statePass =
        statePass &&
        paint.opacity !== '1' &&
        paint.themeDisabled === 'disabled';
    }
    if (item.state === 'hover') {
      statePass = statePass && paint.hovered;
      if (disabled || busy) {
        statePass = statePass && paint.boxShadow === 'none';
      }
    } else if (item.state === 'focus-input') {
      // Forced colors replaces box shadows; the receipt still records the
      // forced border and outline colors for review.
      statePass =
        statePass &&
        semantics?.focused === true &&
        (item.forcedColors || paint.boxShadow !== 'none');
    } else if (item.state === 'focus-toggle') {
      statePass =
        statePass &&
        observed.activeElement?.tag === 'button' &&
        observed.activeElement.focusVisible &&
        observed.activeElement.outlineStyle !== 'none';
      if (item.story === 'disabled-with-message') {
        statePass =
          statePass &&
          observed.tooltips.includes('You need the Editor role to change this');
      }
    } else if (item.state === 'typed-invalid') {
      statePass =
        statePass &&
        semantics?.value === 'not a date' &&
        semantics.ariaInvalid === 'true' &&
        (semantics.alertText ?? '').length > 0;
    } else if (item.state === 'open') {
      statePass =
        statePass &&
        semantics?.ariaExpanded === 'true' &&
        observed.dialogs.length === 1;
    } else if (item.state === 'sheet-open') {
      statePass =
        statePass &&
        semantics?.ariaExpanded === 'true' &&
        observed.dialogs.length >= 1;
    }

    const png = await page.screenshot({animations: 'disabled', fullPage: true});
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 2,
      expected: {
        build: checkoutSha,
        storyId: storyId(item),
        args: item.args,
        surface: item.surface,
        mode: item.mode,
        direction: item.direction,
        theme: item.theme,
        state: item.state,
        pointer: item.pointer,
        forcedColors: item.forcedColors,
        viewport: item.viewport,
        label,
        busy,
        disabled,
      },
      observed: {
        build: storybookSha,
        ...observed,
        paint,
        semantics,
        toggleState,
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      checks: {semanticsPass, statePass},
      passed:
        storybookSha === checkoutSha &&
        pageErrors.length === 0 &&
        observed.theme === item.theme &&
        observed.mode === item.mode &&
        observed.direction === item.direction &&
        observed.viewport.width === item.viewport.width &&
        observed.viewport.height === item.viewport.height &&
        observed.reducedMotion &&
        observed.coarsePointer === (item.pointer === 'coarse') &&
        observed.forcedColors === item.forcedColors &&
        !observed.horizontalOverflow &&
        observed.fonts === 'loaded' &&
        semanticsPass &&
        statePass,
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
  const manifest = {
    schemaVersion: 2,
    component: 'core/DateInput',
    build: checkoutSha,
    frames: cases.map(item => ({
      key: item.key,
      image: `${item.key}.png`,
      receipt: `${item.key}.sensors.json`,
    })),
  };
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  expect(receiptFiles).toHaveLength(cases.length);
  expect(
    receipts
      .filter(receipt => !receipt.passed)
      .map(receipt => receipt.expected),
  ).toEqual([]);
});
