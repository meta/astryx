// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit CommandPaletteItem

/**
 * @file CommandPaletteItemAudit.a11y.chromium.spec.ts
 * @input Exact-head CommandPaletteItem stories, plus the inline grouped palette in
 *   the CommandPalette audit matrix, across states, themes, direction, pointers,
 *   and viewport sizes
 * @output Screenshots and fail-closed sensor receipts for the CommandPaletteItem whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a CommandPaletteItem audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('command-palette-item-audit-evidence');
const WIDE = {width: 1024, height: 768};
const NARROW = {width: 320, height: 720};

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter';
type Pointer = 'fine' | 'coarse';
type Story = 'states' | 'combined-and-long' | 'palette';
type State =
  | 'rest'
  | 'hover'
  | 'pressed'
  | 'pressed-highlighted'
  | 'disabled-hover'
  | 'touch-press'
  | 'keyboard-highlight'
  | 'keyboard-selected-highlight';

type AuditCase = {
  key: string;
  story: Story;
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
      story: options.story ?? 'states',
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

addPair('states-rest');
addPair('states-hover', {state: 'hover'});
addPair('states-pressed', {state: 'pressed'});
addPair('states-pressed-highlighted', {state: 'pressed-highlighted'});
addPair('states-disabled-hover', {state: 'disabled-hover'});
addPair('states-custom-theme', {theme: 'butter'});
addPair('states-rtl', {direction: 'rtl'});
addPair('states-narrow', {viewport: NARROW});
addPair('states-coarse', {viewport: NARROW, pointer: 'coarse'});
addPair('states-touch-press', {
  viewport: NARROW,
  pointer: 'coarse',
  state: 'touch-press',
});
addPair('states-forced-colors', {forcedColors: true});
addPair('combined-rest', {story: 'combined-and-long'});
addPair('combined-custom-theme', {
  story: 'combined-and-long',
  theme: 'butter',
});
addPair('combined-narrow', {
  story: 'combined-and-long',
  viewport: NARROW,
});
addPair('palette-keyboard-highlight', {
  story: 'palette',
  state: 'keyboard-highlight',
});
addPair('palette-keyboard-selected-highlight', {
  story: 'palette',
  state: 'keyboard-selected-highlight',
});
addPair('palette-keyboard-selected-highlight-custom-theme', {
  story: 'palette',
  state: 'keyboard-selected-highlight',
  theme: 'butter',
});

addPair('palette-keyboard-highlight-forced-colors', {
  story: 'palette',
  state: 'keyboard-highlight',
  forcedColors: true,
});
addPair('palette-keyboard-selected-highlight-forced-colors', {
  story: 'palette',
  state: 'keyboard-selected-highlight',
  forcedColors: true,
});

/** Option each pointer state acts on, by its accessible text. */
const POINTER_TARGET: Partial<Record<State, string>> = {
  hover: 'Open file',
  pressed: 'Open file',
  'pressed-highlighted': 'Search files',
  'disabled-hover': 'Archived command',
  'touch-press': 'Open file',
};

/** Option the palette keyboard states move the active descendant to. */
const KEYBOARD_TARGET: Partial<Record<State, string>> = {
  'keyboard-highlight': 'Home',
  'keyboard-selected-highlight': 'Settings',
};

test.describe.configure({mode: 'serial', retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyId(item: AuditCase) {
  return item.story === 'palette'
    ? 'core-commandpalette--audit-matrix'
    : `core-commandpaletteitem--${item.story}`;
}

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=${storyId(item)}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
}

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(40);
}

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('target option has no rendered bounds');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

async function highlightedName(input: Locator) {
  return input.evaluate(element => {
    const id = element.getAttribute('aria-activedescendant');
    const option = id ? document.getElementById(id) : null;
    return option?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  });
}

/** PageUp moves the palette to its first result; ArrowDown walks forward. */
async function highlightFromKeyboard(
  page: Page,
  input: Locator,
  target: string,
) {
  await input.focus();
  await page.keyboard.press('PageUp');
  for (let step = 0; step < 4; step++) {
    if ((await highlightedName(input)) === target) {
      return;
    }
    await page.keyboard.press('ArrowDown');
  }
}

test.beforeAll(async () => {
  fs.rmSync(OUTPUT, {recursive: true, force: true});
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

    const isPalette = item.story === 'palette';
    const subject = isPalette
      ? page.getByRole('region', {name: 'Grouped command palette'})
      : page.locator('#storybook-root');
    const list = isPalette
      ? subject.getByRole('listbox')
      : subject.getByRole('listbox', {
          name:
            item.story === 'states'
              ? 'Command item states'
              : 'Combined and long command item states',
        });
    const options = list.getByRole('option');
    const expectedCount = item.story === 'combined-and-long' ? 2 : 4;
    const expectedDisabled = item.story === 'states' ? 1 : 0;
    await expect(list).toBeVisible();
    await expect(options).toHaveCount(expectedCount);
    await expect(
      list.locator('[role="option"][aria-selected="true"]'),
    ).toHaveCount(1);
    await expect(
      list.locator('[role="option"][aria-disabled="true"]'),
    ).toHaveCount(expectedDisabled);
    await expect(
      list.locator('[role="option"] :is(button, a, [tabindex])'),
    ).toHaveCount(0);

    const pointerTarget = POINTER_TARGET[item.state];
    const keyboardTarget = KEYBOARD_TARGET[item.state];
    const target = pointerTarget ?? keyboardTarget ?? null;
    const targetOption =
      target == null ? null : options.filter({hasText: target}).first();
    let cdp: CDPSession | null = null;

    await settle(page);
    if (item.state === 'hover' || item.state === 'disabled-hover') {
      await targetOption?.hover();
    } else if (
      item.state === 'pressed' ||
      item.state === 'pressed-highlighted'
    ) {
      if (targetOption == null) {
        throw new Error(`${item.key}: no press target`);
      }
      await targetOption.hover();
      await page.mouse.down();
    } else if (item.state === 'touch-press') {
      if (targetOption == null) {
        throw new Error(`${item.key}: no touch target`);
      }
      const point = await centerOf(targetOption);
      cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{x: point.x, y: point.y, id: 1}],
      });
      // The touch press controller believes a stationary press after its
      // onset delay; hold past it before reading the painted state.
      await page.waitForTimeout(320);
    } else if (keyboardTarget != null) {
      await highlightFromKeyboard(
        page,
        subject.getByRole('combobox'),
        keyboardTarget,
      );
    }
    await page.evaluate(async () => document.fonts.ready);
    await page.waitForTimeout(40);

    const observed = await page.evaluate(() => ({
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      direction: getComputedStyle(
        document.querySelector('.astryx-command-palette-item') as HTMLElement,
      ).direction,
      viewport: {width: innerWidth, height: innerHeight},
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      fonts: document.fonts.status,
    }));
    const listBackdrop = await list.evaluate(element => {
      let node: Element | null = element;
      while (node) {
        const color = getComputedStyle(node).backgroundColor;
        if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
          return color;
        }
        node = node.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    });
    const optionStates = await options.evaluateAll(nodes =>
      nodes.map(node => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return {
          name: node.textContent?.replace(/\s+/g, ' ').trim(),
          id: node.id || null,
          selected: node.getAttribute('aria-selected'),
          disabled: node.getAttribute('aria-disabled'),
          themeSelected: node.getAttribute('data-selected'),
          themeDisabled: node.getAttribute('data-disabled'),
          active: node.matches(':active'),
          hovered: node.matches(':hover'),
          press: node.getAttribute('data-astryx-press'),
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          color: style.color,
          opacity: style.opacity,
          cursor: style.cursor,
          geometry: {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          },
        };
      }),
    );
    const combobox = isPalette
      ? await subject.getByRole('combobox').evaluate(element => ({
          focused: element === document.activeElement,
          activeDescendant: element.getAttribute('aria-activedescendant'),
        }))
      : null;

    const targetState =
      target == null
        ? null
        : (optionStates.find(option => option.name?.startsWith(target)) ??
          null);
    const semanticsPass =
      optionStates.length === expectedCount &&
      optionStates.filter(option => option.selected === 'true').length === 1 &&
      optionStates.filter(option => option.disabled === 'true').length ===
        expectedDisabled &&
      optionStates.every(
        option => option.geometry.width > 0 && option.geometry.height > 0,
      );
    let statePass = true;
    if (item.state === 'hover') {
      statePass = targetState?.hovered === true;
    } else if (item.state === 'disabled-hover') {
      statePass =
        targetState?.hovered === true &&
        targetState.disabled === 'true' &&
        targetState.backgroundColor === 'rgba(0, 0, 0, 0)' &&
        targetState.cursor === 'default';
    } else if (
      item.state === 'pressed' ||
      item.state === 'pressed-highlighted'
    ) {
      statePass = targetState?.active === true;
    } else if (item.state === 'touch-press') {
      statePass = targetState?.press === 'on';
    } else if (keyboardTarget != null) {
      statePass =
        combobox?.focused === true &&
        targetState?.id != null &&
        combobox.activeDescendant === targetState.id &&
        (item.state === 'keyboard-selected-highlight'
          ? targetState.selected === 'true'
          : targetState.selected === 'false');
    }

    const png = isPalette
      ? await subject.screenshot({animations: 'disabled'})
      : await page.screenshot({animations: 'disabled', fullPage: true});
    if (item.state === 'pressed' || item.state === 'pressed-highlighted') {
      await page.mouse.up();
    }
    if (cdp != null) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    }

    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 2,
      expected: {
        build: checkoutSha,
        storyId: storyId(item),
        mode: item.mode,
        direction: item.direction,
        theme: item.theme,
        state: item.state,
        target,
        pointer: item.pointer,
        forcedColors: item.forcedColors,
        viewport: item.viewport,
        optionCount: expectedCount,
        disabledCount: expectedDisabled,
        selectedCount: 1,
      },
      observed: {
        build: storybookSha,
        ...observed,
        listRole: await list.getAttribute('role'),
        listName: await list.getAttribute('aria-label'),
        listBackdrop,
        combobox,
        optionStates,
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
    component: 'core/CommandPaletteItem',
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
