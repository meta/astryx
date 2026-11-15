// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit MultiSelector

/**
 * @file MultiSelectorAudit.a11y.chromium.spec.ts
 * @input Exact-head MultiSelector stories across modes, direction, sizes, variants, states, and presentations
 * @output Screenshots and fail-closed sensor receipts for the MultiSelector whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a MultiSelector audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('multi-selector-audit-evidence');

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
const PHONE = {width: 390, height: 844};
const NARROW = {width: 320, height: 700};

/** WCAG 2.2 SC 2.5.8 minimum target, SC 1.4.3 text, and SC 1.4.11 non-text contrast. */
const MIN_TARGET_PX = 24;
const MIN_TEXT_CONTRAST = 4.5;
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
 * The combobox: ARIA, the element `aria-controls` names, its box, the theme
 * root's state, the cursor, and the contrast of its text against the backdrop
 * it paints on. Colors are normalized through a canvas so any CSS color
 * syntax reads as sRGB, and translucent backdrops are composited.
 */
async function readCombobox(combobox: Locator) {
  return combobox.evaluate(el => {
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
    const ratio = (fg: number[], bg: number[]) => {
      const composite = bg.map((c, i) => fg[i] * fg[3] + c * (1 - fg[3]));
      const [hi, lo] = [luminance(composite), luminance(bg)].sort(
        (a, b) => b - a,
      );
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    };
    const controls = el.getAttribute('aria-controls');
    const controlled = controls ? document.getElementById(controls) : null;
    const root = el.closest('.astryx-multi-selector');
    // A press anywhere on the control box opens the list, so the box is the
    // target; the trigger button inside it is only the text row.
    const rect = (root ?? el).getBoundingClientRect();
    const textNode = Array.from(el.querySelectorAll('span, div')).find(
      node =>
        node.children.length === 0 && (node.textContent ?? '').trim() !== '',
    );
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      haspopup: el.getAttribute('aria-haspopup'),
      expanded: el.getAttribute('aria-expanded'),
      readonly: el.getAttribute('aria-readonly'),
      busy: el.getAttribute('aria-busy'),
      invalid: el.getAttribute('aria-invalid'),
      describedby: el.getAttribute('aria-describedby'),
      disabled: (el as HTMLButtonElement).disabled === true,
      ariaDisabled: el.getAttribute('aria-disabled'),
      tabIndex: (el as HTMLElement).tabIndex,
      controls,
      controlledRole: controlled?.getAttribute('role') ?? null,
      rootDisabled: root?.getAttribute('data-disabled') ?? null,
      rootSize: root?.getAttribute('data-size') ?? null,
      rootVariant: root?.getAttribute('data-variant') ?? null,
      cursor: getComputedStyle(el).cursor,
      text: textNode?.textContent?.trim() ?? null,
      textContrast:
        textNode == null
          ? null
          : ratio(rgba(getComputedStyle(textNode).color), backdrop(textNode)),
      box: {
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        top: Math.round(rect.top * 10) / 10,
        bottom: Math.round(rect.bottom * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      },
    };
  });
}
type Combobox = Awaited<ReturnType<typeof readCombobox>>;

/**
 * The open panel: the popup box and target, the listbox, its options, the
 * active option, and the active option's fill against the listbox.
 */
async function readPanel(combobox: Locator) {
  return combobox.evaluate(el => {
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
    const id = el.getAttribute('aria-controls');
    const listbox = id ? document.getElementById(id) : null;
    const popup = listbox?.closest('.astryx-multi-selector-popup') ?? null;
    const options = listbox
      ? Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]'))
      : [];
    const activeId =
      (document.activeElement?.getAttribute('aria-activedescendant') ||
        el.getAttribute('aria-activedescendant')) ??
      null;
    const active = activeId ? document.getElementById(activeId) : null;
    const popupRect = popup?.getBoundingClientRect();
    const triggerRect = (
      el.closest('.astryx-multi-selector') ?? el
    ).getBoundingClientRect();
    const activeStyle = active ? getComputedStyle(active) : null;
    return {
      expanded: el.getAttribute('aria-expanded'),
      listboxRole: listbox?.getAttribute('role') ?? null,
      multiselectable: listbox?.getAttribute('aria-multiselectable') ?? null,
      popupVisible:
        popupRect != null && popupRect.width > 0 && popupRect.height > 0,
      options: options.map(option => ({
        name: option.textContent?.trim() ?? '',
        selected: option.getAttribute('aria-selected'),
        disabled: option.getAttribute('aria-disabled'),
        target: option.classList.contains('astryx-multi-selector-option'),
      })),
      active: active
        ? {
            name: active.textContent?.trim() ?? '',
            outline:
              activeStyle == null
                ? null
                : `${activeStyle.outlineStyle} ${activeStyle.outlineWidth}`,
            fillVsListbox:
              listbox == null
                ? null
                : pair(backdrop(active), backdrop(listbox)),
          }
        : null,
      focusInPanel: popup != null && popup.contains(document.activeElement),
      trigger: {
        left: triggerRect.left,
        right: triggerRect.right,
        bottom: triggerRect.bottom,
      },
      popup: popupRect
        ? {left: popupRect.left, right: popupRect.right, top: popupRect.top}
        : null,
    };
  });
}

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
  check(result.passes.length > 0, 'axe checked nothing');
}

/** The combobox contract every built-in trigger holds at rest. */
function checkRest(check: Check, name: string, c: Combobox) {
  check(c.tag === 'button', `${name}: trigger is a ${c.tag}`);
  check(c.role === 'combobox', `${name}: role ${c.role}`);
  check(c.haspopup === 'listbox', `${name}: aria-haspopup ${c.haspopup}`);
  check(c.expanded === 'false', `${name}: aria-expanded ${c.expanded}`);
  check(!c.disabled, `${name}: native disabled`);
  check(
    c.box.height >= MIN_TARGET_PX && c.box.width >= MIN_TARGET_PX,
    `${name}: target ${c.box.width}x${c.box.height}`,
  );
  if (c.textContrast != null) {
    check(
      c.textContrast >= MIN_TEXT_CONTRAST,
      `${name}: trigger text contrast ${c.textContrast}`,
    );
  }
}

async function focusByTab(page: Page, target: Locator, check: Check) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  let focused = false;
  for (let i = 0; i < 20 && !focused; i++) {
    await page.keyboard.press('Tab');
    focused = await target.evaluate(el => el === document.activeElement);
  }
  check(focused, 'Tab never reaches the trigger');
  return focused;
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `default-${mode}-${direction}`,
      group: 'default',
      story: 'core-multiselector--default',
      ready: '#storybook-root button[role="combobox"]',
      mode,
      direction,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const combobox = page.getByRole('combobox', {name: 'Columns'});
        const rest = await readCombobox(combobox);
        checkRest(check, 'Columns', rest);
        check(rest.text === '2 selected', `trigger text ${rest.text}`);
        const result = await axe(page);
        checkAxe(check, result);
        await frame('rest', {rest, axe: result});

        const control = page.locator('.astryx-multi-selector', {
          has: combobox,
        });
        await page.mouse.move(0, 0);
        await settle(page);
        const restShot = await control.screenshot({animations: 'disabled'});
        await combobox.hover();
        await settle(page);
        const hoverShot = await control.screenshot({animations: 'disabled'});
        check(!hoverShot.equals(restShot), 'hover paints like rest');
        await frame('hover', {});

        await focusByTab(page, combobox, check);
        await settle(page);
        const focusVisible = await combobox.evaluate(el =>
          el.matches(':focus-visible'),
        );
        check(focusVisible, 'trigger is not :focus-visible after Tab');
        await frame('focus-visible', {focusVisible});

        await page.keyboard.press('ArrowDown');
        await expect(combobox).toHaveAttribute('aria-expanded', 'true');
        await settle(page);
        const open = await readPanel(combobox);
        check(open.popupVisible, 'popup not visible');
        check(open.listboxRole === 'listbox', `list role ${open.listboxRole}`);
        check(
          open.multiselectable === 'true',
          `aria-multiselectable ${open.multiselectable}`,
        );
        check(open.options.length === 5, `${open.options.length} options`);
        check(
          open.options.every(option => option.target),
          'an option lacks the multi-selector-option target',
        );
        check(
          open.options
            .slice(0, 2)
            .every(option => option.selected === 'true') &&
            open.options[0]?.name === 'Role',
          `selected options first: ${JSON.stringify(open.options)}`,
        );
        check(
          open.active?.name === 'Role',
          `ArrowDown highlights ${open.active?.name}`,
        );
        if (open.popup != null) {
          check(
            open.popup.top >= open.trigger.bottom - EDGE_TOLERANCE_PX,
            `popup top ${open.popup.top} above trigger bottom ${open.trigger.bottom}`,
          );
          const startEdge =
            direction === 'ltr'
              ? Math.abs(open.popup.left - open.trigger.left)
              : Math.abs(open.popup.right - open.trigger.right);
          check(
            startEdge <= EDGE_TOLERANCE_PX,
            `popup start edge is ${startEdge}px from the trigger's`,
          );
        }
        const openAxe = await axe(page);
        checkAxe(check, openAxe);
        // Recorded, not checked: the component record lists the active
        // option's perception as a current-state gap.
        await frame('open-keyboard', {open, axe: openAxe});

        await page.keyboard.press('Enter');
        await settle(page);
        const toggled = await readPanel(combobox);
        check(
          toggled.options.find(option => option.name === 'Role')?.selected ===
            'false',
          'Enter did not deselect Role',
        );
        check(toggled.expanded === 'true', 'Enter closed the list');
        await frame('toggled', {toggled});

        await page.keyboard.press('Escape');
        await expect(combobox).toHaveAttribute('aria-expanded', 'false');
        await settle(page);
        const returned = await combobox.evaluate(
          el => el === document.activeElement,
        );
        check(returned, 'focus did not return to the trigger');
        const closed = await readCombobox(combobox);
        check(closed.text === '1 selected', `trigger text ${closed.text}`);
        await frame('closed', {returned, closed});
      },
    });
  }

  cases.push({
    key: `sizes-${mode}-ltr`,
    group: 'statics',
    story: 'core-multiselector--sizes',
    ready: '#storybook-root button[role="combobox"]',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const heights: Record<string, number> = {};
      for (const [name, size] of [
        ['Small', 'sm'],
        ['Medium', 'md'],
        ['Large', 'lg'],
      ] as const) {
        const c = await readCombobox(
          page.getByRole('combobox', {name, exact: true}),
        );
        checkRest(check, name, c);
        check(c.rootSize === size, `${name}: data-size ${c.rootSize}`);
        heights[size] = c.box.height;
      }
      check(
        heights.sm < heights.md && heights.md < heights.lg,
        `heights ${JSON.stringify(heights)}`,
      );
      const result = await axe(page);
      checkAxe(check, result);
      await frame('rest', {heights, axe: result});
    },
  });

  for (const [story, names, variant] of [
    ['ghost-variant', [], 'ghost'],
    ['secondary-variant', [], 'secondary'],
    ['trigger-modes', ['Count (default)', 'Labels', 'Badges'], 'input'],
  ] as const) {
    cases.push({
      key: `${story}-${mode}-ltr`,
      group: 'statics',
      story: `core-multiselector--${story}`,
      ready: '#storybook-root button[role="combobox"]',
      mode,
      direction: 'ltr',
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const all = page.getByRole('combobox');
        const count = await all.count();
        check(count > 0, 'no combobox');
        const observed: Combobox[] = [];
        for (let i = 0; i < count; i++) {
          const c = await readCombobox(all.nth(i));
          checkRest(check, `#${i}`, c);
          observed.push(c);
        }
        if (variant !== 'input') {
          check(
            observed.some(c => c.rootVariant === variant),
            `no ${variant} trigger: ${observed.map(c => c.rootVariant).join(',')}`,
          );
        }
        for (const name of names) {
          check(
            (await page.getByRole('combobox', {name, exact: true}).count()) ===
              1,
            `no "${name}" trigger`,
          );
        }
        const result = await axe(page);
        checkAxe(check, result);
        await frame('rest', {observed, axe: result});
      },
    });
  }

  cases.push({
    key: `status-${mode}-ltr`,
    group: 'statics',
    story: 'core-multiselector--status',
    ready: '#storybook-root button[role="combobox"]',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const observed: Record<string, Combobox> = {};
      for (const name of ['Error', 'Warning', 'Success']) {
        const c = await readCombobox(
          page.getByRole('combobox', {name: new RegExp(`^${name}`)}),
        );
        checkRest(check, name, c);
        observed[name] = c;
      }
      check(
        observed.Error.invalid === 'true',
        `error aria-invalid ${observed.Error.invalid}`,
      );
      check(
        observed.Warning.invalid !== 'true',
        `warning aria-invalid ${observed.Warning.invalid}`,
      );
      // Status pairs color with an icon (never color alone).
      const icons = await page
        .locator('#storybook-root .astryx-multi-selector svg')
        .count();
      check(icons >= 3, `${icons} status or indicator icons`);
      const result = await axe(page);
      checkAxe(check, result);
      await frame('rest', {observed, icons, axe: result});
    },
  });

  cases.push({
    key: `read-only-${mode}-ltr`,
    group: 'statics',
    story: 'core-multiselector--read-only',
    ready: '#storybook-root button[role="combobox"]',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const combobox = page.getByRole('combobox', {name: /Assigned teams/});
      const c = await readCombobox(combobox);
      check(c.readonly === 'true', `aria-readonly ${c.readonly}`);
      check(c.expanded === 'false', `aria-expanded ${c.expanded}`);
      check(c.controls == null, `aria-controls ${c.controls}`);
      check(c.tabIndex === 0, `tabIndex ${c.tabIndex}`);
      check(c.rootDisabled == null, `data-disabled ${c.rootDisabled}`);
      const clear = await page
        .getByRole('button', {name: /clear/i, includeHidden: true})
        .count();
      check(clear === 0, `${clear} clear buttons`);
      const hidden = await page
        .locator('#storybook-root input[type="hidden"][name="teams"]')
        .evaluateAll(inputs => inputs.map(i => (i as HTMLInputElement).value));
      check(
        hidden.join(',') === 'Design,Engineering',
        `submitted ${hidden.join(',')}`,
      );
      await combobox.click();
      await settle(page);
      const after = await readCombobox(combobox);
      check(after.expanded === 'false', 'a press opened a read-only field');
      const result = await axe(page);
      checkAxe(check, result);
      await frame('rest', {c, hidden, after, axe: result});
    },
  });

  cases.push({
    key: `disabled-${mode}-ltr`,
    group: 'statics',
    story: 'core-multiselector--disabled-with-message',
    ready: '#storybook-root button[role="combobox"]',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const combobox = page.getByRole('combobox', {name: /Columns/});
      const c = await readCombobox(combobox);
      check(!c.disabled && c.ariaDisabled === 'true', 'disabled exposure');
      check(c.tabIndex === 0, `tabIndex ${c.tabIndex}`);
      check(c.rootDisabled === 'disabled', `data-disabled ${c.rootDisabled}`);
      check(c.cursor === 'default', `cursor ${c.cursor}`);
      const control = page.locator('.astryx-multi-selector', {
        has: combobox,
      });
      await page.mouse.move(0, 0);
      await settle(page);
      const restShot = await control.screenshot({animations: 'disabled'});
      await combobox.hover({force: true});
      await settle(page);
      const hoverShot = await control.screenshot({animations: 'disabled'});
      // The tooltip opens beside the trigger, outside this element shot.
      check(hoverShot.equals(restShot), 'disabled trigger paints a hover');
      await combobox.click({force: true});
      await settle(page);
      check(
        (await combobox.getAttribute('aria-expanded')) === 'false',
        'a press opened a disabled field',
      );
      await focusByTab(page, combobox, check);
      const tooltip = page.locator('[role="tooltip"]', {
        hasText: 'Select a table before choosing columns',
      });
      const shown = await tooltip
        .first()
        .waitFor({state: 'visible', timeout: 3000})
        .then(() => true)
        .catch(() => false);
      check(shown, 'focus shows no disabled reason');
      const describedBy = await combobox.getAttribute('aria-describedby');
      const linked = await page.evaluate(
        ids =>
          (ids ?? '')
            .split(' ')
            .map(id => document.getElementById(id)?.textContent ?? '')
            .join(' '),
        describedBy,
      );
      check(
        linked.includes('Select a table before choosing columns'),
        `aria-describedby reads "${linked}"`,
      );
      await page.keyboard.press('ArrowDown');
      await settle(page);
      check(
        (await combobox.getAttribute('aria-expanded')) === 'false',
        'ArrowDown opened a disabled field',
      );
      await frame('focus', {c, shown, linked});
    },
  });

  cases.push({
    key: `empty-loading-${mode}-ltr`,
    group: 'statics',
    story: 'core-multiselector--empty-states',
    ready: '#storybook-root button[role="combobox"]',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const loading = page.getByRole('combobox', {name: /Loading/});
      const c = await readCombobox(loading);
      check(c.busy === 'true', `loading aria-busy ${c.busy}`);
      check(c.ariaDisabled == null, `loading aria-disabled ${c.ariaDisabled}`);
      check(c.rootDisabled == null, `loading data-disabled ${c.rootDisabled}`);
      check(c.tabIndex === 0, `loading tabIndex ${c.tabIndex}`);
      const result = await axe(page);
      checkAxe(check, result);
      await frame('rest', {loading: c, axe: result});

      const none = page.getByRole('combobox', {name: /No options \(custom\)/});
      await none.click();
      await expect(none).toHaveAttribute('aria-expanded', 'true');
      await settle(page);
      const empty = page.locator('.astryx-multi-selector-empty-state', {
        hasText: 'No countries loaded yet',
      });
      check(
        await empty
          .first()
          .isVisible()
          .catch(() => false),
        'custom empty text not shown',
      );
      await frame('empty-open', {});
      await page.keyboard.press('Escape');
      await settle(page);
    },
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `search-light-${direction}`,
    group: 'search',
    story: 'core-multiselector--searchable',
    ready: '#storybook-root button[aria-haspopup]',
    mode: 'light',
    direction,
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      // With search, the search input is the combobox and the trigger is a
      // plain button that opens it.
      const trigger = page.getByRole('button', {name: /Countries/});
      const haspopup = await trigger.getAttribute('aria-haspopup');
      check(haspopup != null, 'trigger advertises no popup');
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await settle(page);
      const search = page.locator(
        '.astryx-multi-selector-search [role="combobox"]',
      );
      check((await search.count()) === 1, 'no search combobox in the row');
      const focused = await search
        .evaluate(el => el === document.activeElement)
        .catch(() => false);
      check(focused, 'search input does not take focus on open');
      const all = await readPanel(search);
      check(
        all.listboxRole === 'listbox' && all.options.length === 11,
        `list ${all.listboxRole} with ${all.options.length} rows`,
      );
      await page.keyboard.type('an');
      await settle(page);
      const filtered = await readPanel(search);
      const matches = filtered.options.filter(
        o => !o.name.startsWith('Select all'),
      );
      check(
        matches.length > 0 &&
          matches.every(o => o.name.toLowerCase().includes('an')),
        `matches for "an": ${matches.map(o => o.name).join(', ')}`,
      );
      await frame('query', {all: all.options.length, filtered});
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.type('zzzz');
      await settle(page);
      const emptyShown = await page
        .locator('.astryx-multi-selector-empty-state')
        .first()
        .isVisible()
        .catch(() => false);
      check(emptyShown, 'no empty-search state');
      const result = await axe(page);
      // The empty-panel message is presentational by record, so the list
      // holds no option here and axe flags the empty listbox. That one rule
      // is expected in this state; any other violation fails.
      const expected = result.violations.filter(v =>
        v.startsWith('aria-required-children:'),
      );
      checkAxe(check, {
        ...result,
        violations: result.violations.filter(v => !expected.includes(v)),
      });
      await frame('no-results', {emptyShown, axe: result, expected});
      await page.keyboard.press('Escape');
      await settle(page);
      const escapes =
        (await trigger.getAttribute('aria-expanded')) === 'false' ? 1 : 2;
      if (escapes === 2) {
        await page.keyboard.press('Escape');
      }
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await settle(page);
      const returned = await trigger.evaluate(
        el => el === document.activeElement,
      );
      check(returned, 'focus did not return to the trigger');
      await frame('closed', {escapes, returned});
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `sheet-${mode}-ltr`,
    group: 'sheet',
    story: 'core-multiselector--bottom-sheet-presentation',
    ready: '#storybook-root button[role="combobox"]',
    mode,
    direction: 'ltr',
    viewport: PHONE,
    run: async (page, check, frame) => {
      const combobox = page.getByRole('combobox', {name: /Teams/});
      const haspopup = await combobox.getAttribute('aria-haspopup');
      check(haspopup === 'dialog', `aria-haspopup ${haspopup}`);
      await combobox.click();
      await expect(combobox).toHaveAttribute('aria-expanded', 'true');
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({state: 'visible'});
      await settle(page);
      const listbox = dialog.getByRole('listbox');
      check((await listbox.count()) === 1, 'sheet has no listbox');
      const options = dialog.getByRole('option');
      const optionCount = await options.count();
      check(optionCount === 5, `${optionCount} rows (select-all and 4 teams)`);
      await frame('open', {optionCount});
      await dialog.getByRole('option', {name: 'Design'}).click();
      await settle(page);
      check(await dialog.isVisible(), 'the sheet closed on a toggle');
      check(
        (await dialog
          .getByRole('option', {name: 'Design'})
          .getAttribute('aria-selected')) === 'true',
        'Design not selected',
      );
      const result = await axe(page);
      checkAxe(check, result);
      await frame('toggled', {axe: result});
      await page.keyboard.press('Escape');
      await expect(combobox).toHaveAttribute('aria-expanded', 'false');
      await settle(page);
      const returned = await combobox.evaluate(
        el => el === document.activeElement,
      );
      check(returned, 'focus did not return to the trigger');
      await frame('closed', {returned});
    },
  });
}

cases.push({
  key: 'narrow-light-ltr',
  group: 'sheet',
  story: 'core-multiselector--default',
  ready: '#storybook-root button[role="combobox"]',
  mode: 'light',
  direction: 'ltr',
  viewport: NARROW,
  run: async (page, check, frame) => {
    // The story frame fixes a 300 px column inside Storybook's centered
    // padding, so the page scroll is the fixture's. The field must fill that
    // column without overflowing it, and its popup must match its box.
    const scroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const combobox = page.getByRole('combobox', {name: 'Columns'});
    const c = await readCombobox(combobox);
    checkRest(check, 'Columns', c);
    const column = await combobox.evaluate(el => {
      const field = el.closest('.astryx-field') ?? el;
      const parent = field.parentElement ?? field;
      return {
        field: field.getBoundingClientRect().width,
        parent: parent.getBoundingClientRect().width,
      };
    });
    check(
      column.field <= column.parent + EDGE_TOLERANCE_PX,
      `field ${column.field}px overflows its ${column.parent}px column`,
    );
    await combobox.click();
    await expect(combobox).toHaveAttribute('aria-expanded', 'true');
    await settle(page);
    const open = await readPanel(combobox);
    check(
      open.popup != null &&
        open.popup.right - open.popup.left <=
          open.trigger.right - open.trigger.left + EDGE_TOLERANCE_PX,
      `popup ${JSON.stringify(open.popup)} is wider than the control ${JSON.stringify(open.trigger)}`,
    );
    await frame('open', {scroll, column, c, open});
    await page.keyboard.press('Escape');
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
    component: 'MultiSelector',
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
