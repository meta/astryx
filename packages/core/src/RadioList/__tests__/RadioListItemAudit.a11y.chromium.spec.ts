// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit RadioListItem

/**
 * @file RadioListItemAudit.a11y.chromium.spec.ts
 * @input Exact-head RadioList stories driven per option row: rest, hover,
 *   keyboard focus, selection, item disabled, start, end and rich content,
 *   sizes, forced colors, a second theme, and a narrow viewport
 * @output Screenshots and fail-closed sensor receipts for the RadioListItem
 *   whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for
 *   a RadioListItem audit pull request
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
import {resetAuditEvidence} from '@astryxdesign/a11y-spec/evidence';

const EVIDENCE = path.resolve('test-results/radio-list-item-audit-evidence');
let OUTPUT = EVIDENCE;

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
  args?: string;
  mode: Mode;
  direction: Direction;
  theme: Theme;
  viewport: Viewport;
  forcedColors?: boolean;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 700};
const NARROW = {width: 320, height: 700};

/** WCAG 2.2 SC 1.4.3 normal text contrast. */
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
 * Every option row of the first radio group: the row's target, state data,
 * box and paint; its radio's name, description, state and box; the radio
 * indicator's box, paint and inline focus ring; the selected dot; and the
 * inline order of the indicator, start content, label and end content.
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
    const textRatio = (node: Element) => {
      const fg = rgba(getComputedStyle(node).color);
      const bg = backdrop(node);
      const mixed = bg.map((c, i) => fg[i] * fg[3] + c * (1 - fg[3]));
      const [hi, lo] = [luminance(mixed), luminance(bg)].sort((x, y) => y - x);
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    };
    const textOf = (ids: string | null) =>
      (ids ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map(id => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' | ');
    const box = (node: Element | null | undefined) => {
      if (node == null) {
        return null;
      }
      const r = node.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    const group = document.querySelector('#storybook-root [role="radiogroup"]');
    const rows = group
      ? Array.from(
          group.querySelectorAll<HTMLElement>('.astryx-radio-list-item'),
        )
      : [];
    return rows.map(row => {
      const radio = row.querySelector<HTMLInputElement>('input[type="radio"]');
      const indicator = row.querySelector<HTMLElement>(
        '.astryx-radio-indicator',
      );
      const dot = row.querySelector<HTMLElement>('.astryx-radio-indicator-dot');
      const labelId = radio?.getAttribute('aria-labelledby');
      const label = labelId ? document.getElementById(labelId) : null;
      const start = row.querySelector('[data-audit-part="start"]');
      const rowStyle = getComputedStyle(row);
      const indicatorStyle = indicator ? getComputedStyle(indicator) : null;
      const endTexts = Array.from(
        row.querySelectorAll<HTMLElement>('[data-audit-part="end"]'),
      );
      return {
        label: label?.textContent?.trim() ?? row.textContent?.trim() ?? '',
        name: radio?.getAttribute('aria-label') ?? textOf(labelId ?? null),
        description: textOf(radio?.getAttribute('aria-describedby') ?? null),
        value: radio?.value ?? null,
        checked: radio?.checked ?? false,
        nativeDisabled: radio?.disabled ?? false,
        ariaDisabled: radio?.getAttribute('aria-disabled') ?? null,
        focused: radio != null && radio === document.activeElement,
        focusVisible: radio?.matches(':focus-visible') ?? false,
        dataSize: row.getAttribute('data-size'),
        dataSelected: row.getAttribute('data-selected'),
        dataDisabled: row.getAttribute('data-disabled'),
        itemTarget: row.classList.contains('astryx-item'),
        row: box(row),
        rowBackground: rowStyle.backgroundColor,
        rowPadding: [
          rowStyle.paddingBlockStart,
          rowStyle.paddingInlineStart,
        ].join(' '),
        rowOutline: `${rowStyle.outlineStyle} ${rowStyle.outlineWidth} ${rowStyle.outlineColor}`,
        radioBox: box(radio),
        indicatorBox: box(indicator),
        indicatorBorder: indicatorStyle?.borderColor ?? null,
        indicatorBackground: indicatorStyle?.backgroundColor ?? null,
        indicatorOutline: indicatorStyle
          ? `${indicatorStyle.outlineStyle} ${indicatorStyle.outlineWidth} ${indicatorStyle.outlineColor}`
          : null,
        dotBox: box(dot),
        dotBackground: dot ? getComputedStyle(dot).backgroundColor : null,
        labelBox: box(label),
        labelContrast: label ? textRatio(label) : null,
        startBox: box(start),
        ends: endTexts.map(end => ({
          text: end.textContent?.trim() ?? '',
          contrast: textRatio(end),
          box: box(end),
        })),
      };
    });
  });
}
type Row = Awaited<ReturnType<typeof readRows>>[number];

/**
 * The standing row contract: the radio is named by its label, the row carries
 * the theme target with the size, and the indicator leads the label in the
 * inline direction.
 */
function checkRows(
  check: Check,
  rows: Row[],
  expected: {size: string; direction: Direction; names: string[]},
) {
  check(
    rows.length === expected.names.length,
    `${rows.length} rows, expected ${expected.names.length}`,
  );
  rows.forEach((row, i) => {
    const where = `${row.label}`;
    check(
      row.name === expected.names[i],
      `${where}: radio name "${row.name}", expected "${expected.names[i]}"`,
    );
    check(row.itemTarget, `${where}: row has no astryx-item target`);
    check(
      row.dataSize === expected.size,
      `${where}: data-size ${row.dataSize}`,
    );
    check(
      (row.dataSelected === 'selected') === row.checked,
      `${where}: data-selected ${row.dataSelected}, checked ${row.checked}`,
    );
    const indicator = row.indicatorBox;
    const label = row.labelBox;
    check(
      indicator != null && label != null,
      `${where}: indicator ${JSON.stringify(indicator)}, label ${JSON.stringify(label)}`,
    );
    if (indicator != null && label != null) {
      check(
        expected.direction === 'ltr'
          ? indicator.right <= label.left
          : indicator.left >= label.right,
        `${where}: indicator ${indicator.left}-${indicator.right}, label ${label.left}-${label.right} in ${expected.direction}`,
      );
    }
    const radio = row.radioBox;
    if (radio != null && indicator != null) {
      const [rx, ix] = [
        (radio.left + radio.right) / 2,
        (indicator.left + indicator.right) / 2,
      ];
      check(
        Math.abs(rx - ix) <= 1,
        `${where}: radio centered at ${rx}, indicator at ${ix}`,
      );
    }
    if (!row.nativeDisabled && row.ariaDisabled !== 'true') {
      check(
        row.labelContrast != null && row.labelContrast >= MIN_TEXT_CONTRAST,
        `${where}: label contrast ${row.labelContrast}`,
      );
    }
  });
}

/** Focus the page start so the next Tab enters the story from outside. */
async function focusPageStart(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.tabIndex = -1;
    document.body.focus();
  });
}

/** Mark caller content so the reader can find it without class names. */
async function markParts(page: Page) {
  await page.evaluate(() => {
    for (const row of Array.from(
      document.querySelectorAll('#storybook-root .astryx-radio-list-item'),
    )) {
      const end = row.querySelector('[data-testid="radio-end-content"]');
      end?.setAttribute('data-audit-part', 'end');
    }
  });
}

const DEFAULT_NAMES = ['Email', 'SMS', 'Push notification'];

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `interaction-${mode}-${direction}`,
      group: 'interaction',
      story: 'core-radiolist--default',
      mode,
      direction,
      theme: 'neutral',
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const rest = await readRows(page);
        checkRows(check, rest, {size: 'md', direction, names: DEFAULT_NAMES});
        for (const row of rest) {
          check(
            row.rowPadding === '0px 0px',
            `${row.label}: row padding ${row.rowPadding}`,
          );
          check(
            row.radioBox?.width === 24 && row.radioBox?.height === 24,
            `${row.label}: radio box ${JSON.stringify(row.radioBox)}`,
          );
        }
        const result = await axe(page);
        checkAxe(check, result);
        await frame('rest', {rest, axe: result});

        // Hover tints the indicator; the row keeps its bare background.
        const target = page
          .locator('#storybook-root .astryx-radio-list-item')
          .nth(1);
        await target.getByText('SMS', {exact: true}).hover();
        await settle(page);
        const hovered = (await readRows(page))[1];
        check(
          hovered.indicatorBorder !== rest[1].indicatorBorder ||
            hovered.indicatorBackground !== rest[1].indicatorBackground,
          `hover left the indicator at ${hovered.indicatorBorder} / ${hovered.indicatorBackground}`,
        );
        check(
          hovered.rowBackground === rest[1].rowBackground,
          `hover painted the row ${hovered.rowBackground}`,
        );
        await frame('hover', {rest: rest[1], hovered});
        await page.mouse.move(0, 0);

        // Keyboard focus rings the indicator. The row also paints an outline.
        // The receipt records it and does not fail on it.
        await focusPageStart(page);
        await page.keyboard.press('Tab');
        await settle(page);
        const focused = (await readRows(page)).find(row => row.focused);
        check(
          focused?.value === 'email' && focused.focusVisible,
          `Tab focused ${focused?.label}, focus-visible ${focused?.focusVisible}`,
        );
        check(
          focused?.indicatorOutline?.startsWith('solid') === true,
          `focused indicator outline ${focused?.indicatorOutline}`,
        );
        await frame('focus', {
          focused,
          indicatorOutline: focused?.indicatorOutline,
          rowOutline: focused?.rowOutline,
        });

        // Space selects; the dot shows and the row reflects the selection.
        await page.keyboard.press('Space');
        await settle(page);
        const selected = await readRows(page);
        checkRows(check, selected, {
          size: 'md',
          direction,
          names: DEFAULT_NAMES,
        });
        const first = selected[0];
        check(
          first.checked &&
            first.dataSelected === 'selected' &&
            (first.dotBox?.width ?? 0) > 0,
          `Space: checked ${first.checked}, data-selected ${first.dataSelected}, dot ${JSON.stringify(first.dotBox)}`,
        );
        await frame('selected', {selected: first});
        await page.keyboard.press('Tab');
        await settle(page);
        const blurred = (await readRows(page))[0];
        check(
          blurred.indicatorOutline?.startsWith('none') === true,
          `indicator outline after Tab out ${blurred.indicatorOutline}`,
        );
      },
    });
  }

  cases.push({
    key: `item-disabled-${mode}-ltr`,
    group: 'disabled',
    story: 'core-radiolist--disabled-item',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readRows(page);
      checkRows(check, rest, {
        size: 'md',
        direction: 'ltr',
        names: DEFAULT_NAMES,
      });
      const sms = rest[1];
      check(
        sms.dataDisabled === 'disabled',
        `SMS data-disabled ${sms.dataDisabled}`,
      );
      // An item-disabled radio is natively disabled, so it leaves the Tab
      // order. The receipt records that state and does not fail on it.
      const result = await axe(page);
      checkAxe(check, result);
      await frame('rest', {
        rest,
        nativeDisabled: sms.nativeDisabled,
        ariaDisabled: sms.ariaDisabled,
        axe: result,
      });
      const row = page
        .locator('#storybook-root .astryx-radio-list-item')
        .nth(1);
      await row.getByText('SMS', {exact: true}).hover({force: true});
      await settle(page);
      const hovered = (await readRows(page))[1];
      check(
        hovered.indicatorBorder === sms.indicatorBorder &&
          hovered.indicatorBackground === sms.indicatorBackground &&
          hovered.rowBackground === sms.rowBackground,
        `hover painted a disabled option: ${hovered.indicatorBorder} / ${hovered.indicatorBackground} / ${hovered.rowBackground}`,
      );
      await frame('hover', {hovered});
      await row.click({force: true});
      await settle(page);
      const after = await readRows(page);
      check(
        after.every(r => !r.checked),
        `a click on a disabled option checked ${after.find(r => r.checked)?.label}`,
      );
    },
  });

  cases.push({
    key: `end-content-${mode}-ltr`,
    group: 'content',
    story: 'core-radiolist--with-end-content',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      await page.evaluate(() => {
        for (const row of Array.from(
          document.querySelectorAll('#storybook-root .astryx-radio-list-item'),
        )) {
          const label = row.querySelector('input[type="radio"]');
          const labelId = label?.getAttribute('aria-labelledby');
          const end = Array.from(row.querySelectorAll('span')).find(
            span =>
              span.children.length === 0 &&
              span.id !== labelId &&
              span.closest(`[id="${labelId}"]`) == null &&
              /\$|Custom/.test(span.textContent ?? ''),
          );
          end?.setAttribute('data-audit-part', 'end');
        }
      });
      const rest = await readRows(page);
      checkRows(check, rest, {
        size: 'md',
        direction: 'ltr',
        names: ['Free', 'Pro', 'Enterprise'],
      });
      for (const row of rest) {
        check(row.ends.length === 1, `${row.label}: ${row.ends.length} ends`);
        for (const end of row.ends) {
          check(
            end.contrast >= MIN_TEXT_CONTRAST,
            `${row.label}: end content "${end.text}" contrast ${end.contrast}`,
          );
        }
        // End content follows the label in the inline direction.
        const end = row.ends[0]?.box;
        check(
          end != null && row.labelBox != null && row.labelBox.right <= end.left,
          `${row.label}: label ${JSON.stringify(row.labelBox)}, end ${JSON.stringify(end)}`,
        );
      }
      const result = await axe(page);
      checkAxe(check, result);
      await frame('rest', {rest, axe: result});
    },
  });

  cases.push({
    key: `rich-${mode}-ltr`,
    group: 'content',
    story: 'core-radiolist--rich-content',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      await markParts(page);
      const rest = await readRows(page);
      check(rest.length === 2, `${rest.length} rows`);
      check(
        rest[0]?.description.includes('Compare plans') === true,
        `Starter description "${rest[0]?.description}"`,
      );
      check(rest[1]?.checked === true, 'Pro is not selected at rest');
      const proEnd = rest[1]?.ends[0];
      check(
        proEnd?.text === '$12/mo' && proEnd.contrast >= MIN_TEXT_CONTRAST,
        `Pro end content "${proEnd?.text}" contrast ${proEnd?.contrast}`,
      );
      const result = await axe(page);
      checkAxe(check, result);
      await frame('rest', {rest, axe: result});
      // A link in a description keeps its own behavior and selects nothing.
      await page.getByRole('link', {name: 'Compare plans'}).click();
      await settle(page);
      const after = await readRows(page);
      check(
        after[1]?.checked === true && after[0]?.checked === false,
        `link click moved selection to ${after.find(r => r.checked)?.label}`,
      );
      // A click on the row surface delegates to the radio.
      await page
        .locator('#storybook-root .astryx-radio-list-item')
        .first()
        .getByText('Free forever.', {exact: false})
        .click({position: {x: 2, y: 2}});
      await settle(page);
      const picked = await readRows(page);
      check(
        picked[0]?.checked === true,
        `description click selected ${picked.find(r => r.checked)?.label}`,
      );
      await frame('description-click', {picked});
    },
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `start-content-light-${direction}`,
    group: 'content',
    story: 'core-radiolist--with-start-content',
    mode: 'light',
    direction,
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      await page.evaluate(() => {
        for (const row of Array.from(
          document.querySelectorAll('#storybook-root .astryx-radio-list-item'),
        )) {
          const radio = row.querySelector('input[type="radio"]');
          const labelId = radio?.getAttribute('aria-labelledby');
          const start = Array.from(row.querySelectorAll('span')).find(
            span =>
              span.children.length === 0 &&
              span.id !== labelId &&
              span.closest(`[id="${labelId}"]`) == null &&
              span.closest('.astryx-radio-indicator') == null &&
              /\p{Extended_Pictographic}/u.test(span.textContent ?? ''),
          );
          start?.setAttribute('data-audit-part', 'start');
        }
      });
      const rest = await readRows(page);
      checkRows(check, rest, {size: 'md', direction, names: DEFAULT_NAMES});
      for (const row of rest) {
        const [indicator, start, label] = [
          row.indicatorBox,
          row.startBox,
          row.labelBox,
        ];
        check(
          indicator != null && start != null && label != null,
          `${row.label}: indicator, start and label boxes`,
        );
        if (indicator != null && start != null && label != null) {
          // Start content follows the radio and leads the label.
          check(
            direction === 'ltr'
              ? indicator.right <= start.left && start.right <= label.left
              : indicator.left >= start.right && start.left >= label.right,
            `${row.label}: indicator ${indicator.left}-${indicator.right}, start ${start.left}-${start.right}, label ${label.left}-${label.right}`,
          );
        }
      }
      const result = await axe(page);
      checkAxe(check, result);
      await frame('rest', {rest, axe: result});
    },
  });
}

cases.push({
  key: 'sizes-light-ltr',
  group: 'sizes',
  story: 'core-radiolist--default',
  args: 'size:sm;value:sms',
  mode: 'light',
  direction: 'ltr',
  theme: 'neutral',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    const rest = await readRows(page);
    checkRows(check, rest, {
      size: 'sm',
      direction: 'ltr',
      names: DEFAULT_NAMES,
    });
    for (const row of rest) {
      check(
        row.radioBox?.width === 20 &&
          row.radioBox?.height === 20 &&
          row.indicatorBox?.width === 20,
        `${row.label}: radio ${JSON.stringify(row.radioBox)}, indicator ${JSON.stringify(row.indicatorBox)}`,
      );
    }
    check(
      rest[1]?.checked === true && (rest[1]?.dotBox?.width ?? 0) > 0,
      `sm selected dot ${JSON.stringify(rest[1]?.dotBox)}`,
    );
    const result = await axe(page);
    checkAxe(check, result);
    await frame('sm', {rest, axe: result});
  },
});

cases.push({
  key: 'forced-colors-light-ltr',
  group: 'forced-colors',
  story: 'core-radiolist--default',
  args: 'value:sms',
  mode: 'light',
  direction: 'ltr',
  theme: 'neutral',
  viewport: DESKTOP,
  forcedColors: true,
  run: async (page, check, frame) => {
    const rest = await readRows(page);
    const selected = rest[1];
    check(selected?.checked === true, 'SMS is not selected');
    check(
      (selected?.dotBox?.width ?? 0) > 0 &&
        selected?.dotBackground != null &&
        selected.dotBackground !== selected.indicatorBackground &&
        selected.dotBackground !== 'rgba(0, 0, 0, 0)',
      `forced-colors dot ${selected?.dotBackground} on ${selected?.indicatorBackground}`,
    );
    await frame('selected', {selected});
  },
});

cases.push({
  key: 'matcha-light-ltr',
  group: 'themes',
  story: 'core-radiolist--default',
  args: 'value:sms',
  mode: 'light',
  direction: 'ltr',
  theme: 'matcha',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    const rest = await readRows(page);
    checkRows(check, rest, {
      size: 'md',
      direction: 'ltr',
      names: DEFAULT_NAMES,
    });
    const result = await axe(page);
    checkAxe(check, result);
    await frame('rest', {rest, axe: result});
  },
});

cases.push({
  key: 'narrow-light-ltr',
  group: 'narrow',
  story: 'core-radiolist--with-description',
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
    checkRows(check, rest, {
      size: 'md',
      direction: 'ltr',
      names: DEFAULT_NAMES,
    });
    for (const row of rest) {
      check(
        row.row != null && row.row.right <= NARROW.width,
        `${row.label} ends at ${row.row?.right}px`,
      );
    }
    await frame('rest', {scroll, rest});
  },
});

test.beforeAll(async () => {
  OUTPUT = resetAuditEvidence(EVIDENCE, test.info());
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
  const args = item.args ? `&args=${item.args}` : '';
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story${args}&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
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
    await page
      .locator('#storybook-root .astryx-radio-list-item')
      .first()
      .waitFor();
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
    component: 'RadioListItem',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    args: item.args ?? null,
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
