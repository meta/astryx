// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit FileInput

/**
 * @file FileInputAudit.a11y.chromium.spec.ts
 * @input Exact-head FileInput audit matrix across themes, modes, direction, viewport, forced colors, focus, and drag-over
 * @output Screenshots and fail-closed sensor receipts for the FileInput whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a FileInput audit pull request
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

const OUTPUT = path.resolve('file-input-audit-evidence');
const STORY_ID = 'core-fileinput--audit-matrix';
const WIDE = {width: 1280, height: 1100};
const NARROW = {width: 320, height: 2600};
const STATUS_MESSAGE = 'File must be under 10MB';
const LONG_NAME =
  'quarterly-financial-report-final-revised-approved-2026-q3-v12.pdf';

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter';

type FrameCase = {
  key: string;
  mode: Mode;
  direction: Direction;
  theme: Theme;
  viewport: {width: number; height: number};
  forcedColors: boolean;
  interaction: boolean;
};

type Expectation = {
  mode: 'input' | 'dropzone';
  status?: 'attached' | 'detached' | 'tooltip';
  loading?: boolean;
  fileName?: string;
  uploadIcon: boolean;
  /** The loading dropzone shows only the decorative spinner. */
  noText?: boolean;
};

// Expected facts per case, authored from the component contract and the
// input-fields family contract before observing the page.
const EXPECTED: Record<string, Expectation> = {
  'input-empty': {mode: 'input', uploadIcon: true},
  'input-selected': {mode: 'input', fileName: 'resume.pdf', uploadIcon: true},
  'input-long-name': {mode: 'input', fileName: LONG_NAME, uploadIcon: true},
  'input-error-attached': {mode: 'input', status: 'attached', uploadIcon: true},
  'input-error-tooltip': {mode: 'input', status: 'tooltip', uploadIcon: true},
  'input-loading-error-tooltip': {
    mode: 'input',
    status: 'tooltip',
    loading: true,
    fileName: 'resume.pdf',
    uploadIcon: false,
  },
  'dropzone-empty': {mode: 'dropzone', uploadIcon: true},
  'dropzone-selected': {
    mode: 'dropzone',
    fileName: 'resume.pdf',
    uploadIcon: false,
  },
  'dropzone-long-name': {
    mode: 'dropzone',
    fileName: LONG_NAME,
    uploadIcon: false,
  },
  'dropzone-error-attached': {
    mode: 'dropzone',
    status: 'attached',
    uploadIcon: true,
  },
  'dropzone-error-detached': {
    mode: 'dropzone',
    status: 'detached',
    uploadIcon: true,
  },
  'dropzone-error-tooltip': {
    mode: 'dropzone',
    status: 'tooltip',
    uploadIcon: true,
  },
  'dropzone-selected-error-tooltip': {
    mode: 'dropzone',
    status: 'tooltip',
    fileName: 'resume.pdf',
    uploadIcon: false,
  },
  'dropzone-loading-error-tooltip': {
    mode: 'dropzone',
    status: 'tooltip',
    loading: true,
    uploadIcon: false,
    noText: true,
  },
  'dropzone-loading': {
    mode: 'dropzone',
    loading: true,
    uploadIcon: false,
    noText: true,
  },
};
const CASE_IDS = Object.keys(EXPECTED);

const frames: FrameCase[] = [];
function addPair(
  key: string,
  options: Partial<Omit<FrameCase, 'key' | 'mode'>> = {},
) {
  for (const mode of ['light', 'dark'] as const) {
    frames.push({
      key: `${key}-${mode}`,
      mode,
      direction: options.direction ?? 'ltr',
      theme: options.theme ?? 'neutral',
      viewport: options.viewport ?? WIDE,
      forcedColors: options.forcedColors ?? false,
      interaction: options.interaction ?? false,
    });
  }
}

addPair('default');
addPair('custom-theme', {theme: 'butter'});
addPair('rtl', {direction: 'rtl'});
addPair('narrow', {viewport: NARROW});
addPair('forced-colors', {forcedColors: true});
addPair('interaction', {interaction: true});

test.describe.configure({mode: 'serial', retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: FrameCase) {
  return `${server.origin}/iframe.html?id=${STORY_ID}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
}

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

async function observe(page: Page) {
  return page.evaluate(
    ({caseIds, longName}: {caseIds: string[]; longName: string}) => {
      type Rgba = {r: number; g: number; b: number; a: number};
      function parseColor(color: string): Rgba | null {
        const match = color.match(/rgba?\(([^)]+)\)/);
        if (!match) {
          return null;
        }
        const [r, g, b, a = 1] = match[1]
          .split(/[\s,/]+/)
          .filter(Boolean)
          .map(Number);
        return {r, g, b, a};
      }
      function over(top: Rgba, bottom: Rgba): Rgba {
        return {
          r: top.r * top.a + bottom.r * (1 - top.a),
          g: top.g * top.a + bottom.g * (1 - top.a),
          b: top.b * top.a + bottom.b * (1 - top.a),
          a: 1,
        };
      }
      function backdrop(element: Element): Rgba {
        const layers: Rgba[] = [];
        for (
          let node: Element | null = element;
          node != null;
          node = node.parentElement
        ) {
          const color = parseColor(getComputedStyle(node).backgroundColor);
          if (color != null && color.a > 0) {
            layers.push(color);
            if (color.a >= 1) {
              break;
            }
          }
        }
        let result: Rgba = {r: 255, g: 255, b: 255, a: 1};
        for (const layer of layers.reverse()) {
          result = over(layer, result);
        }
        return result;
      }
      function luminance({r, g, b}: Rgba): number {
        const [lr, lg, lb] = [r, g, b].map(channel => {
          const c = channel / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      }
      function contrast(element: Element): number | null {
        const fg = parseColor(getComputedStyle(element).color);
        if (fg == null) {
          return null;
        }
        const bg = backdrop(element);
        const a = luminance(over(fg, bg));
        const b = luminance(bg);
        const [hi, lo] = a > b ? [a, b] : [b, a];
        return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      }
      function rect(element: Element) {
        const box = element.getBoundingClientRect();
        return {
          x: Math.round(box.x * 10) / 10,
          y: Math.round(box.y * 10) / 10,
          width: Math.round(box.width * 10) / 10,
          height: Math.round(box.height * 10) / 10,
        };
      }

      const cases = caseIds.map(id => {
        const root = document.querySelector<HTMLElement>(
          `[data-audit-case="${id}"]`,
        );
        if (root == null) {
          return {id, present: false as const};
        }
        const surface = root.querySelector<HTMLElement>('.astryx-file-input');
        const trigger = surface?.querySelector<HTMLButtonElement>(
          'button[type="button"][aria-label]',
        );
        const describedBy = (trigger?.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .filter(Boolean);
        const describedTargets = describedBy.map(ref => {
          const target = document.getElementById(ref);
          return {
            id: ref,
            exists: target != null,
            text: target?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
          };
        });
        const statusBox = root.querySelector<HTMLElement>(
          '.astryx-field-status',
        );
        const statusIcon = surface?.querySelector<HTMLElement>(
          '.astryx-input-status-icon',
        );
        const statusButton = statusIcon?.closest('button') ?? null;
        const spinner = surface?.querySelector<HTMLElement>('.astryx-spinner');
        const clearButton = surface?.querySelector<HTMLElement>(
          '.astryx-input-clear-button',
        );
        const nameElement =
          surface == null
            ? null
            : (Array.from(
                surface.querySelectorAll<HTMLElement>('div,span'),
              ).find(
                element =>
                  element.children.length === 0 &&
                  element.closest('[aria-hidden="true"],[hidden]') == null &&
                  (element.textContent ?? '').includes('.pdf'),
              ) ?? null);
        const placeholder =
          surface == null
            ? null
            : (Array.from(surface.querySelectorAll<HTMLElement>('span')).find(
                element =>
                  element.children.length === 0 &&
                  /^(Choose file|Choose files|Drop files here)$/.test(
                    (element.textContent ?? '').trim(),
                  ),
              ) ?? null);
        const textElement = nameElement ?? placeholder;
        // spec family:input-fields FR2: text and end controls own
        // non-overlapping space.
        const parts = [
          ['status', statusButton],
          ['spinner', spinner],
          ['text', textElement],
          ['clear', clearButton],
        ]
          .filter((part): part is [string, HTMLElement] => part[1] != null)
          .map(([name, element]) => {
            const box = element.getBoundingClientRect();
            return {
              name,
              left: box.left,
              right: box.right,
              top: box.top,
              bottom: box.bottom,
            };
          })
          .filter(part => part.right > part.left && part.bottom > part.top);
        const overlaps: string[] = [];
        for (let a = 0; a < parts.length; a++) {
          for (let b = a + 1; b < parts.length; b++) {
            const p = parts[a];
            const q = parts[b];
            if (
              p.left < q.right - 1 &&
              q.left < p.right - 1 &&
              p.top < q.bottom - 1 &&
              q.top < p.bottom - 1
            ) {
              overlaps.push(`${p.name}/${q.name}`);
            }
          }
        }
        const surfaceRect = surface?.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        const surfaceStyle = surface ? getComputedStyle(surface) : null;
        return {
          id,
          present: true as const,
          surfaceCount: root.querySelectorAll('.astryx-file-input').length,
          dataMode: surface?.getAttribute('data-mode') ?? null,
          dataStatus: surface?.getAttribute('data-status') ?? null,
          triggerLabel: trigger?.getAttribute('aria-label') ?? null,
          ariaInvalid: trigger?.getAttribute('aria-invalid') ?? null,
          ariaBusy: trigger?.getAttribute('aria-busy') ?? null,
          ariaDisabled: trigger?.getAttribute('aria-disabled') ?? null,
          triggerTabIndex: trigger?.tabIndex ?? null,
          describedTargets,
          statusBoxText:
            statusBox?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
          statusIconCount:
            surface?.querySelectorAll('.astryx-input-status-icon').length ?? 0,
          statusButtonLabel: statusButton?.getAttribute('aria-label') ?? null,
          statusButtonFocusable: statusButton
            ? statusButton.tabIndex >= 0
            : null,
          uploadIconCount:
            surface?.querySelectorAll('.astryx-file-input-icon').length ?? 0,
          spinnerCount:
            surface?.querySelectorAll('.astryx-spinner').length ?? 0,
          nameText: nameElement?.textContent ?? null,
          overlaps,
          nameTruncated: nameElement
            ? nameElement.scrollWidth > nameElement.clientWidth + 1
            : null,
          nameIsLong: nameElement
            ? (nameElement.textContent ?? '').includes(longName)
            : null,
          textContrast: textElement ? contrast(textElement) : null,
          textFontSize: textElement
            ? getComputedStyle(textElement).fontSize
            : null,
          surfaceEscapesCase:
            surfaceRect != null &&
            (surfaceRect.left < rootRect.left - 1 ||
              surfaceRect.right > rootRect.right + 1),
          surfaceInlineOverflow: surface
            ? surface.scrollWidth > surface.clientWidth + 1
            : null,
          borderColor: surfaceStyle?.borderTopColor ?? null,
          backgroundColor: surfaceStyle?.backgroundColor ?? null,
          borderStyle: surfaceStyle?.borderTopStyle ?? null,
          geometry: surface ? rect(surface) : null,
        };
      });
      const first = document.querySelector<HTMLElement>('.astryx-file-input');
      return {
        theme: document
          .querySelector('[data-astryx-theme]')
          ?.getAttribute('data-astryx-theme'),
        mode: document.documentElement.getAttribute('data-theme'),
        direction: first ? getComputedStyle(first).direction : null,
        viewport: {width: innerWidth, height: innerHeight},
        dpr: devicePixelRatio,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        forcedColors: matchMedia('(forced-colors: active)').matches,
        documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        fonts: document.fonts.status,
        runningAnimations: document
          .getAnimations()
          .filter(animation => animation.playState === 'running').length,
        storybookError: document.body.classList.contains(
          'sb-show-errordisplay',
        ),
        cases,
      };
    },
    {caseIds: CASE_IDS, longName: LONG_NAME},
  );
}

type Observed = Awaited<ReturnType<typeof observe>>;

function checkCases(
  observed: Observed,
  item: FrameCase,
  check: (condition: boolean, message: string) => void,
) {
  for (const entry of observed.cases) {
    const id = entry.id;
    const expected = EXPECTED[id];
    if (!entry.present) {
      check(false, `${id}: case not rendered`);
      continue;
    }
    check(entry.surfaceCount === 1, `${id}: ${entry.surfaceCount} surfaces`);
    check(
      entry.dataMode === expected.mode,
      `${id}: data-mode ${entry.dataMode}`,
    );
    check(entry.triggerLabel != null, `${id}: no named trigger`);
    check(entry.triggerTabIndex === 0, `${id}: trigger not in tab order`);
    check(
      entry.describedTargets.every(target => target.exists),
      `${id}: aria-describedby names a missing element (${entry.describedTargets
        .filter(target => !target.exists)
        .map(target => target.id)
        .join(',')})`,
    );
    check(
      entry.uploadIconCount === (expected.uploadIcon ? 1 : 0),
      `${id}: ${entry.uploadIconCount} upload glyphs`,
    );
    check(
      entry.spinnerCount === (expected.loading ? 1 : 0),
      `${id}: ${entry.spinnerCount} spinners`,
    );
    check(
      (entry.ariaBusy === 'true') === Boolean(expected.loading),
      `${id}: aria-busy ${entry.ariaBusy}`,
    );
    // Disabled states keep their own stories; no matrix case is disabled. A
    // busy field blocks a second selection, so its trigger is aria-disabled
    // while loading: it stays focusable, which keeps its tooltip status
    // reachable, and is announced as unavailable for a new file.
    check(
      entry.ariaDisabled === (expected.loading ? 'true' : null),
      `${id}: aria-disabled ${entry.ariaDisabled}`,
    );
    if (expected.fileName != null) {
      check(
        entry.nameText?.includes(expected.fileName) === true,
        `${id}: file name not rendered`,
      );
      check(
        entry.triggerLabel?.includes(expected.fileName) === true,
        `${id}: trigger name omits the file`,
      );
    }
    if (expected.status != null) {
      check(entry.ariaInvalid === 'true', `${id}: aria-invalid missing`);
      check(
        entry.dataStatus === 'error',
        `${id}: data-status ${entry.dataStatus}`,
      );
      if (expected.status === 'tooltip') {
        // spec family:input-fields FR8: every input offers the tooltip
        // placement, so the message must stay reachable from a focusable
        // status button and describe the trigger.
        check(entry.statusBoxText == null, `${id}: tooltip renders a box`);
        check(
          entry.statusIconCount === 1 && entry.statusButtonFocusable === true,
          `${id}: no focusable status button carries the message`,
        );
        check(
          entry.describedTargets.some(target =>
            target.text?.includes(STATUS_MESSAGE),
          ),
          `${id}: trigger is not described by the status message`,
        );
      } else {
        check(
          entry.statusBoxText === STATUS_MESSAGE,
          `${id}: status box ${entry.statusBoxText}`,
        );
        check(
          entry.describedTargets.some(target =>
            target.text?.includes(STATUS_MESSAGE),
          ),
          `${id}: trigger is not described by the status message`,
        );
      }
    } else {
      check(entry.ariaInvalid == null, `${id}: unexpected aria-invalid`);
      check(entry.statusBoxText == null, `${id}: unexpected status box`);
    }
    check(
      entry.overlaps.length === 0,
      `${id}: parts overlap (${entry.overlaps.join(', ')})`,
    );
    check(!entry.surfaceEscapesCase, `${id}: surface escapes its column`);
    check(!entry.surfaceInlineOverflow, `${id}: surface overflows inline`);
    check(
      expected.noText ? entry.textContrast == null : entry.textContrast != null,
      `${id}: placeholder or file name text ${expected.noText ? 'rendered' : 'missing'}`,
    );
    if (!expected.noText && !item.forcedColors) {
      // WCAG 2.2 SC 1.4.3 for the placeholder or file name text.
      check(
        entry.textContrast != null && entry.textContrast >= 4.5,
        `${id}: text contrast ${entry.textContrast}`,
      );
    }
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

for (const item of frames) {
  test(item.key, async ({browser}) => {
    const context = await browser.newContext({
      viewport: item.viewport,
      deviceScaleFactor: 1,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
      forcedColors: item.forcedColors ? 'active' : 'none',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page.locator('#storybook-root').waitFor();
    await expect(page.locator('[data-audit-case]')).toHaveCount(
      CASE_IDS.length,
    );

    const failures: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) {
        failures.push(message);
      }
    };

    await settle(page);
    const first = await observe(page);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page);
    const geometryStable =
      JSON.stringify(first.cases.map(entry => entry.geometry ?? null)) ===
      JSON.stringify(observed.cases.map(entry => entry.geometry ?? null));

    const interaction: Record<string, unknown> = {};
    if (item.interaction) {
      // Keyboard focus reaches the first trigger and paints the surface.
      const surface = page.locator(
        '[data-audit-case="input-empty"] .astryx-file-input',
      );
      const restBorder = await surface.evaluate(
        element => getComputedStyle(element).borderTopColor,
      );
      await page.locator('body').click({position: {x: 1, y: 1}});
      await page.keyboard.press('Tab');
      const focusedLabel = await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? null,
      );
      const focusBorder = await surface.evaluate(
        element => getComputedStyle(element).borderTopColor,
      );
      check(focusedLabel === 'Resume', `focus landed on ${focusedLabel}`);
      check(focusBorder !== restBorder, 'keyboard focus does not paint');
      // Dragging a file over the empty dropzone shows the drop hint.
      const dropzone = page.locator(
        '[data-audit-case="dropzone-empty"] .astryx-file-input',
      );
      const restBackground = await dropzone.evaluate(
        element => getComputedStyle(element).backgroundColor,
      );
      const restDropBorder = await dropzone.evaluate(
        element => getComputedStyle(element).borderTopColor,
      );
      const dataTransfer = await page.evaluateHandle(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['x'], 'drag.pdf'));
        return transfer;
      });
      await dropzone.dispatchEvent('dragenter', {dataTransfer});
      await settle(page);
      const dragText = await dropzone.innerText();
      const dragBackground = await dropzone.evaluate(
        element => getComputedStyle(element).backgroundColor,
      );
      const dragBorder = await dropzone.evaluate(
        element => getComputedStyle(element).borderTopColor,
      );
      check(dragText.includes('Drop files here'), 'drop hint not shown');
      // The drag state paints the accent border and the accent-muted fill; a
      // theme may resolve that fill to the surface color, so either cue counts.
      check(
        dragBackground !== restBackground || dragBorder !== restDropBorder,
        'drag-over does not paint',
      );
      await dropzone.dispatchEvent('dragleave', {dataTransfer});

      // The tooltip status button is the next Tab stop after its trigger,
      // opens its tooltip on focus, and never opens the file picker.
      const tooltipCase = page.locator(
        '[data-audit-case="dropzone-error-tooltip"]',
      );
      await tooltipCase
        .locator('button[type="button"][aria-label]')
        .first()
        .focus();
      await page.keyboard.press('Tab');
      const statusFocusLabel = await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? null,
      );
      await settle(page);
      const tooltipOpen = await page.evaluate(
        message =>
          Array.from(document.querySelectorAll('[role="tooltip"]')).some(
            element =>
              element.matches(':popover-open') &&
              (element.textContent ?? '').includes(message),
          ),
        STATUS_MESSAGE,
      );
      check(
        statusFocusLabel === 'Error details',
        `Tab after the trigger landed on ${statusFocusLabel}`,
      );
      check(tooltipOpen, 'status tooltip does not open on focus');
      // Positive control: a click on the empty dropzone surface does raise
      // the file chooser, so the negative check below can fail.
      const controlChooser = page
        .waitForEvent('filechooser', {timeout: 3000})
        .then(() => true)
        .catch(() => false);
      await page
        .locator('[data-audit-case="dropzone-empty"] .astryx-file-input')
        .click();
      const controlPickerOpened = await controlChooser;
      check(controlPickerOpened, 'surface click raises no file chooser');
      const chooser = page
        .waitForEvent('filechooser', {timeout: 750})
        .then(() => true)
        .catch(() => false);
      await tooltipCase.getByRole('button', {name: 'Error details'}).click();
      const pickerOpened = await chooser;
      check(!pickerOpened, 'clicking the status button opens the file picker');
      Object.assign(interaction, {
        focusedLabel,
        restBorder,
        focusBorder,
        dragText,
        restBackground,
        dragBackground,
        restDropBorder,
        dragBorder,
        statusFocusLabel,
        tooltipOpen,
        controlPickerOpened,
        pickerOpened,
      });
    }

    check(storybookSha === checkoutSha, 'storybook build mismatch');
    check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
    check(!observed.storybookError, 'storybook error display');
    check(observed.theme === item.theme, `theme ${observed.theme}`);
    check(observed.mode === item.mode, `mode ${observed.mode}`);
    check(
      observed.direction === item.direction,
      `direction ${observed.direction}`,
    );
    check(
      observed.viewport.width === item.viewport.width &&
        observed.viewport.height === item.viewport.height,
      'viewport mismatch',
    );
    check(observed.dpr === 1, `dpr ${observed.dpr}`);
    check(observed.reducedMotion, 'reduced motion not applied');
    check(
      observed.forcedColors === item.forcedColors,
      `forced colors ${observed.forcedColors}`,
    );
    check(observed.fonts === 'loaded', `fonts ${observed.fonts}`);
    check(geometryStable, 'geometry changed between samples');
    check(!observed.documentOverflow, 'document scrolls horizontally');
    checkCases(observed, item, check);

    const png = await page.screenshot({animations: 'disabled', fullPage: true});
    check(png.length > 1000, 'screenshot is empty');
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: STORY_ID,
        mode: item.mode,
        direction: item.direction,
        theme: item.theme,
        viewport: item.viewport,
        forcedColors: item.forcedColors,
        interaction: item.interaction,
        cases: EXPECTED,
      },
      observed: {
        build: storybookSha,
        ...observed,
        interaction,
        geometryStable,
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      failures,
      passed: failures.length === 0,
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
    file =>
      JSON.parse(fs.readFileSync(path.join(OUTPUT, file), 'utf8')) as {
        passed: boolean;
        expected: {mode: string; theme: string};
        failures: string[];
      },
  );
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        component: 'core/FileInput',
        build: checkoutSha,
        frames: frames.map(item => ({
          key: item.key,
          image: `${item.key}.png`,
          receipt: `${item.key}.sensors.json`,
        })),
      },
      null,
      2,
    )}\n`,
  );
  expect(receiptFiles).toHaveLength(frames.length);
  expect(
    receipts
      .filter(receipt => !receipt.passed)
      .map(receipt => ({frame: receipt.expected, failures: receipt.failures})),
  ).toEqual([]);
});
