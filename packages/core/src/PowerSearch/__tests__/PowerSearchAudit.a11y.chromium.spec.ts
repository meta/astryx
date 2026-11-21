// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit PowerSearch

/**
 * @file PowerSearchAudit.a11y.chromium.spec.ts
 * @input Exact-head PowerSearch stories across themes, modes, direction, widths, and states
 * @output Screenshots and fail-closed sensor receipts for the PowerSearch whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a PowerSearch audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('power-search-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  story: string;
  theme: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  /** The field's control: the combobox input, or the sheet trigger. */
  control: 'combobox' | 'trigger';
  /** How many PowerSearch fields the story renders. */
  count: number;
  run?: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 1180, height: 800};
const NARROW = {width: 320, height: 640};
const PHONE = {width: 390, height: 844};

const ROOT = '#storybook-root';
const FIELD = `${ROOT} .astryx-power-search`;
const COMBOBOX = `${FIELD} [role="combobox"]`;
/** Every filter token, interactive or display-only. */
const ANY_TOKEN = `${FIELD} .astryx-token`;
/** A token that opens its editor: the button inside an editable token. */
const TOKEN = `${ANY_TOKEN} button[aria-haspopup="dialog"]`;
const TRIGGER = `${FIELD} button[aria-haspopup="dialog"]`;
/** WCAG 2.2 SC 1.4.3 text contrast. */
const MIN_TEXT_CONTRAST = 4.5;
/** The editor popover's readable floor, before the viewport cap. */
const EDITOR_FLOOR = 400;

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
  await page.waitForTimeout(60);
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
 * Every PowerSearch field: its control's role and name, its tokens' names and
 * remove controls, and the contrast of every painted text run (tokens,
 * placeholder, result count, trigger text) against its composited backdrop.
 * Colors are normalized through a canvas so any CSS color syntax reads as
 * sRGB.
 */
async function fields(page: Page) {
  return page.evaluate(
    ({field, token}) => {
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
        return [r, g, b, Math.round((a / 255) * 100) / 100];
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
        if (layers.length === 0 || layers[layers.length - 1][3] < 1) {
          layers.push(
            rgba(getComputedStyle(document.body).backgroundColor).map((c, i) =>
              i === 3 ? 1 : c,
            ),
          );
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
      const ratio = (color: string, bg: number[]) => {
        const fg = rgba(color);
        const composite = bg.map((c, i) => fg[i] * fg[3] + c * (1 - fg[3]));
        const [hi, lo] = [luminance(composite), luminance(bg)].sort(
          (a, b) => b - a,
        );
        return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      };
      const nameOf = (el: Element) => {
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
          return labelledBy
            .split(/\s+/)
            .map(id => document.getElementById(id)?.textContent ?? '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
        const label = el.getAttribute('aria-label');
        if (label) {
          return label.trim();
        }
        const labels = (el as HTMLInputElement).labels;
        if (labels && labels.length > 0) {
          return (labels[0].textContent ?? '').trim();
        }
        return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      };
      /** Every visible text run inside `root`, with its contrast. */
      const textRuns = (root: Element) => {
        const runs: {text: string; contrast: number}[] = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = (node.textContent ?? '').trim();
          const parent = node.parentElement;
          if (text === '' || parent == null) {
            continue;
          }
          const style = getComputedStyle(parent);
          const rect = parent.getBoundingClientRect();
          if (
            style.visibility === 'hidden' ||
            rect.width === 0 ||
            rect.height === 0 ||
            parent.closest('[aria-hidden="true"]') != null ||
            parent.closest('[data-astryx-live-region]') != null
          ) {
            continue;
          }
          // Clipped off-screen (visually hidden) text paints nothing.
          if (rect.width <= 1 && rect.height <= 1) {
            continue;
          }
          runs.push({text, contrast: ratio(style.color, backdrop(parent))});
        }
        return runs;
      };
      return Array.from(document.querySelectorAll(field)).map(root => {
        const combobox = root.querySelector('[role="combobox"]');
        const trigger = root.querySelector('button[aria-haspopup="dialog"]');
        const tokens = Array.from(root.querySelectorAll(token)).map(el => {
          const opener = el.querySelector('button[aria-haspopup="dialog"]');
          return {
            name: nameOf(opener ?? el),
            interactive: opener != null,
            expanded: opener?.getAttribute('aria-expanded') ?? null,
          };
        });
        const removes = Array.from(root.querySelectorAll('button'))
          .map(b => nameOf(b))
          .filter(name => name.startsWith('Remove '));
        const input = combobox as HTMLInputElement | null;
        // A placeholder color equal to the input's own text color means the
        // pseudo-element was not read, so the contrast is left unmeasured.
        const placeholderColor =
          input != null && !input.value && input.placeholder
            ? getComputedStyle(input, '::placeholder').color
            : null;
        const placeholderContrast =
          input != null &&
          placeholderColor != null &&
          placeholderColor !== getComputedStyle(input).color
            ? ratio(placeholderColor, backdrop(input))
            : null;
        const ariaDisabled =
          (combobox ?? trigger)?.getAttribute('aria-disabled') ?? null;
        return {
          combobox:
            combobox == null
              ? null
              : {
                  name: nameOf(combobox),
                  tabIndex: (combobox as HTMLElement).tabIndex,
                  expanded: combobox.getAttribute('aria-expanded'),
                  placeholder: input?.placeholder ?? '',
                },
          trigger:
            combobox == null && trigger != null
              ? {
                  name: nameOf(trigger),
                  expanded: trigger.getAttribute('aria-expanded'),
                  tabIndex: (trigger as HTMLElement).tabIndex,
                }
              : null,
          ariaDisabled,
          tokens,
          removes,
          placeholderContrast,
          text: ariaDisabled === 'true' ? [] : textRuns(root),
          box: (() => {
            const r = root.getBoundingClientRect();
            return {x: r.left, width: r.width};
          })(),
        };
      });
    },
    {field: FIELD, token: ANY_TOKEN},
  );
}

type Field = Awaited<ReturnType<typeof fields>>[number];

/**
 * axe over `include`. A disabled field's text is inactive-component text,
 * which WCAG 2.2 SC 1.4.3 exempts, so `isDisabled` skips the contrast rule.
 */
async function axe(page: Page, include = ROOT, isDisabled = false) {
  const builder = new AxeBuilder({page})
    .include(include)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  if (isDisabled) {
    builder.disableRules(['color-contrast']);
  }
  const results = await builder.analyze();
  return results.violations.flatMap(violation =>
    violation.nodes.map(node => `${violation.id}: ${node.target.join(' ')}`),
  );
}

/** Checks one field's control, names, and text contrast. */
function checkField(
  check: Check,
  field: Field,
  label: string,
  control: AuditCase['control'],
) {
  if (control === 'combobox') {
    check(field.combobox != null, `${label} has no combobox`);
    check(field.combobox?.name !== '', `${label} combobox has no name`);
    check(
      field.combobox?.tabIndex === 0,
      `${label} combobox tabindex ${field.combobox?.tabIndex}`,
    );
  } else {
    check(field.trigger != null, `${label} has no sheet trigger`);
    check(
      field.trigger?.expanded === 'false',
      `${label} trigger aria-expanded ${field.trigger?.expanded}`,
    );
    check(
      (field.trigger?.name ?? '').length > 0,
      `${label} trigger has no name`,
    );
  }
  for (const token of field.tokens) {
    check(token.name !== '', `${label} has an unnamed token`);
    if (token.interactive) {
      check(
        token.expanded === 'false',
        `${label} token ${token.name} aria-expanded ${token.expanded}`,
      );
    }
  }
  for (const run of field.text) {
    check(
      run.contrast >= MIN_TEXT_CONTRAST,
      `${label} text "${run.text}" contrast ${run.contrast}`,
    );
  }
  if (field.placeholderContrast != null) {
    check(
      field.placeholderContrast >= MIN_TEXT_CONTRAST,
      `${label} placeholder contrast ${field.placeholderContrast}`,
    );
  }
}

/** The paint of the field box around the combobox, for hover and focus. */
async function fieldPaint(page: Page) {
  return page.evaluate(sel => {
    const input = document.querySelector(sel);
    const out: string[] = [];
    let node = input?.parentElement ?? null;
    while (node != null && !node.matches('.astryx-power-search')) {
      const s = getComputedStyle(node);
      out.push(
        [
          s.backgroundColor,
          s.boxShadow,
          `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
          `${s.borderTopColor} ${s.borderTopWidth}`,
        ].join(' | '),
      );
      node = node.parentElement;
    }
    return out;
  }, COMBOBOX);
}

/** The open editor or sheet: role, name, and its box against the viewport. */
async function openDialog(page: Page) {
  return page.evaluate(() => {
    const dialogs = Array.from(
      document.querySelectorAll('[role="dialog"], dialog[open]'),
    ).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const el = dialogs[dialogs.length - 1];
    if (el == null) {
      return null;
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    const name = labelledBy
      ? labelledBy
          .split(/\s+/)
          .map(id => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      : (el.getAttribute('aria-label') ?? '').trim();
    const r = el.getBoundingClientRect();
    return {
      count: dialogs.length,
      tag: el.tagName,
      role:
        el.getAttribute('role') ?? (el.tagName === 'DIALOG' ? 'dialog' : ''),
      name,
      left: Math.round(r.left * 10) / 10,
      right: Math.round(r.right * 10) / 10,
      width: Math.round(r.width * 10) / 10,
      viewport: innerWidth,
      containsFocus: el.contains(document.activeElement),
    };
  });
}

/** The accessible name of the first element `selector` matches. */
async function accessibleName(page: Page, selector: string) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (el == null) {
      return null;
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      return labelledBy
        .split(/\s+/)
        .map(id => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return (el.getAttribute('aria-label') ?? el.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }, selector);
}

async function activeName(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el == null || el === document.body) {
      return null;
    }
    return {
      tag: el.tagName,
      role: el.getAttribute('role'),
      label: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
    };
  });
}

const cases: AuditCase[] = [];

const restStories: {
  story: string;
  count: number;
  control: AuditCase['control'];
  viewport?: Viewport;
}[] = [
  {story: 'core-powersearch--default', count: 1, control: 'combobox'},
  {
    story: 'core-powersearch--with-preset-filters',
    count: 1,
    control: 'combobox',
  },
  {story: 'core-powersearch--read-only', count: 1, control: 'combobox'},
  {story: 'core-powersearch--disabled', count: 1, control: 'combobox'},
  {
    story: 'core-powersearch--disabled-with-message',
    count: 1,
    control: 'combobox',
  },
  {story: 'core-powersearch--with-error', count: 1, control: 'combobox'},
  {story: 'core-powersearch--with-warning', count: 1, control: 'combobox'},
  {story: 'core-powersearch--size-variants', count: 3, control: 'combobox'},
  {story: 'core-powersearch--with-result-count', count: 1, control: 'combobox'},
  {
    story: 'core-powersearch--sheet-presentation',
    count: 1,
    control: 'trigger',
    viewport: PHONE,
  },
];

const short = (story: string) => story.replace('core-powersearch--', '');

for (const {story, count, control, viewport} of restStories) {
  for (const mode of ['light', 'dark'] as const) {
    for (const direction of ['ltr', 'rtl'] as const) {
      cases.push({
        key: `${short(story)}-neutral-${mode}-${direction}`,
        group: `rest-${short(story)}`,
        story,
        theme: 'neutral',
        mode,
        direction,
        viewport: viewport ?? DESKTOP,
        control,
        count,
      });
    }
    cases.push({
      key: `${short(story)}-matcha-${mode}-ltr`,
      group: `rest-${short(story)}`,
      story,
      theme: 'matcha',
      mode,
      direction: 'ltr',
      viewport: viewport ?? DESKTOP,
      control,
      count,
    });
  }
}

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `preset-narrow-light-${direction}`,
    group: 'narrow',
    story: 'core-powersearch--with-preset-filters',
    theme: 'neutral',
    mode: 'light',
    direction,
    viewport: NARROW,
    control: 'combobox',
    count: 1,
    run: async (page, check, frame) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      check(overflow <= 0, `page scrolls sideways by ${overflow}px`);
      await page.locator(TOKEN).first().click();
      await settle(page);
      const dialog = await openDialog(page);
      check(dialog != null, 'no editor opened from the token');
      if (dialog != null) {
        // Every editor control stays horizontally reachable.
        check(
          dialog.left >= 0 && dialog.right <= dialog.viewport,
          `editor ${dialog.left}..${dialog.right} leaves the ${dialog.viewport}px viewport`,
        );
      }
      await frame('narrow-editor', {overflow, dialog});
      await page.keyboard.press('Escape');
      await settle(page);
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `interaction-editor-${mode}-${direction}`,
      group: 'interaction-editor',
      story: 'core-powersearch--with-preset-filters',
      theme: 'neutral',
      mode,
      direction,
      viewport: DESKTOP,
      control: 'combobox',
      count: 1,
      run: async (page, check, frame) => {
        const combobox = page.locator(COMBOBOX).first();
        const rest = await fieldPaint(page);
        const box = await combobox.boundingBox();
        if (box != null) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        }
        await settle(page);
        const hover = await fieldPaint(page);
        check(
          JSON.stringify(hover) !== JSON.stringify(rest),
          'hover paints the field the same as rest',
        );
        await frame('hover', {rest, hover});
        await page.mouse.move(0, 0);
        await settle(page);

        // A token opens its editor, a dialog named by the token's visible
        // text; Escape closes it.
        const token = page.locator(TOKEN).first();
        const tokenName = await accessibleName(page, TOKEN);
        await token.focus();
        await page.keyboard.press('Enter');
        await settle(page);
        const dialog = await openDialog(page);
        check(dialog != null, 'Enter on a token opened no editor');
        check(
          (await token.getAttribute('aria-expanded')) === 'true',
          'the token is not aria-expanded while its editor is open',
        );
        if (dialog != null) {
          check(dialog.role === 'dialog', `editor role ${dialog.role}`);
          check(
            dialog.name !== '' &&
              tokenName != null &&
              dialog.name.replace(/\s+/g, '') === tokenName.replace(/\s+/g, ''),
            `editor name "${dialog.name}" is not the token text "${tokenName}"`,
          );
          check(dialog.containsFocus, 'focus did not move into the editor');
          // The editor prefers at least 400 px, capped by the viewport.
          check(
            dialog.width >= Math.min(EDITOR_FLOOR, dialog.viewport - 32) - 1,
            `editor width ${dialog.width}`,
          );
          check(
            dialog.left >= 0 && dialog.right <= dialog.viewport,
            `editor ${dialog.left}..${dialog.right} leaves the viewport`,
          );
        }
        const editorAxe = await axe(page, 'body');
        check(editorAxe.length === 0, `editor axe: ${editorAxe.join(' | ')}`);
        await frame('editor-open', {dialog, editorAxe, tokenName});
        await page.keyboard.press('Escape');
        await settle(page);
        check((await openDialog(page)) == null, 'Escape left the editor open');
        // Where Escape leaves focus is current behavior no record decides:
        // the check is that focus stays in the field (the token or the
        // combobox), and the receipt records which.
        const afterEscape = await activeName(page);
        const inField = await page.evaluate(
          sel => document.activeElement?.closest(sel) != null,
          FIELD,
        );
        check(
          inField,
          `Escape left focus outside the field: ${JSON.stringify(afterEscape)}`,
        );
        check(
          (await token.getAttribute('aria-expanded')) === 'false',
          'the token stays aria-expanded after Escape',
        );
        await frame('editor-closed', {afterEscape});

        // Keyboard focus on the combobox paints the field.
        await combobox.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await settle(page);
        const focused = await combobox.evaluate(
          el => document.activeElement === el,
        );
        check(focused, 'Tab did not reach the combobox');
        const focus = await fieldPaint(page);
        check(
          JSON.stringify(focus) !== JSON.stringify(rest),
          'keyboard focus paints the field the same as rest',
        );
        await frame('focus-visible', {focus});

        // The add path: a typed field name lists suggestions; Enter picks the
        // first and opens the value editor; a value and Enter add a filter.
        const before = await page.locator(TOKEN).count();
        await page.keyboard.type('Title');
        await settle(page);
        const listbox = await page.evaluate(() => {
          const lb = document.querySelector('[role="listbox"]');
          return lb == null
            ? null
            : Array.from(lb.querySelectorAll('[role="option"]')).map(o =>
                (o.textContent ?? '').replace(/\s+/g, ' ').trim(),
              );
        });
        check(
          listbox != null && listbox.length > 0,
          'typing a field name listed no options',
        );
        check(
          (await combobox.getAttribute('aria-expanded')) === 'true',
          'the combobox is not aria-expanded while its list shows',
        );
        await frame('suggestions', {listbox});
        await page.keyboard.press('Enter');
        await settle(page);
        // The add path's value editor: where focus lands, its name, and the
        // role of the layer around it (no record names that role).
        const valueStep = {
          dialog: await openDialog(page),
          active: await page.evaluate(() => {
            const el = document.activeElement as HTMLInputElement | null;
            const layer = el?.closest('[popover], [role="dialog"]');
            return {
              tag: el?.tagName ?? null,
              name:
                el?.getAttribute('aria-label') ??
                el?.labels?.[0]?.textContent?.trim() ??
                null,
              layerRole: layer?.getAttribute('role') ?? null,
            };
          }),
          axe: await axe(page, 'body'),
        };
        check(
          valueStep.axe.length === 0,
          `value step axe: ${valueStep.axe.join(' | ')}`,
        );
        await frame('value-step', valueStep);
        await page.keyboard.type('audit');
        await page.keyboard.press('Enter');
        await settle(page);
        if ((await openDialog(page)) != null) {
          await page.getByRole('button', {name: 'Apply'}).click();
          await settle(page);
        }
        const after = await page.locator(TOKEN).count();
        check(after === before + 1, `adding a filter left ${after} tokens`);
        const names = await page
          .locator(TOKEN)
          .evaluateAll(els =>
            els.map(e => e.getAttribute('aria-label') ?? e.textContent ?? ''),
          );
        check(
          names.includes('Title: contains audit'),
          `no token reads the added value: ${JSON.stringify(names)}`,
        );
        await frame('added', {before, after, names, valueStep});
      },
    });
    cases.push({
      key: `interaction-read-only-${mode}-${direction}`,
      group: 'interaction-read-only',
      story: 'core-powersearch--read-only',
      theme: 'neutral',
      mode,
      direction,
      viewport: DESKTOP,
      control: 'combobox',
      count: 1,
      run: async (page, check, frame) => {
        // A read-only field: no remove control, and Backspace removes
        // nothing.
        const list = await fields(page);
        check(
          list[0]?.removes.length === 0,
          `read-only remove controls ${JSON.stringify(list[0]?.removes)}`,
        );
        const before = await page.locator(ANY_TOKEN).count();
        check(before === 2, `the read-only story shows ${before} tokens`);
        await page.locator(COMBOBOX).first().focus();
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Backspace');
        await settle(page);
        const after = await page.locator(ANY_TOKEN).count();
        check(after === before, `Backspace removed a filter: ${after}`);
        await frame('backspace', {before, after});
      },
    });
    cases.push({
      key: `interaction-disabled-${mode}-${direction}`,
      group: 'interaction-disabled',
      story: 'core-powersearch--disabled-with-message',
      theme: 'neutral',
      mode,
      direction,
      viewport: DESKTOP,
      control: 'combobox',
      count: 1,
      run: async (page, check, frame) => {
        await page.keyboard.press('Tab');
        await settle(page);
        const active = await activeName(page);
        const combobox = page.locator(COMBOBOX).first();
        const onCombobox = await combobox.evaluate(
          el => document.activeElement === el,
        );
        check(onCombobox, `Tab reached ${JSON.stringify(active)}`);
        check(
          (await combobox.getAttribute('aria-disabled')) === 'true',
          'aria-disabled not set on the combobox',
        );
        await page.keyboard.type('Status');
        await settle(page);
        const value = await combobox.inputValue();
        check(value === '', `a disabled field took text "${value}"`);
        const tooltipShown = await page
          .getByRole('tooltip')
          .filter({hasText: 'You need edit access to search'})
          .first()
          .waitFor({state: 'visible', timeout: 5000})
          .then(
            () => true,
            () => false,
          );
        check(tooltipShown, 'the reason tooltip did not open');
        await frame('disabled-focus', {active, value});
      },
    });
    cases.push({
      key: `interaction-sheet-${mode}-${direction}`,
      group: 'interaction-sheet',
      story: 'core-powersearch--sheet-presentation',
      theme: 'neutral',
      mode,
      direction,
      viewport: PHONE,
      control: 'trigger',
      count: 1,
      run: async (page, check, frame) => {
        // The trigger opens the Filters sheet; Escape closes the flow and
        // focus returns to the trigger.
        const trigger = page.locator(TRIGGER).first();
        await trigger.focus();
        await page.keyboard.press('Enter');
        const shown = await page
          .getByRole('dialog', {name: 'Filters'})
          .waitFor({state: 'visible', timeout: 5000})
          .then(
            () => true,
            () => false,
          );
        await settle(page);
        check(shown, 'the trigger opened no Filters sheet');
        check(
          (await trigger.getAttribute('aria-expanded')) === 'true',
          'the trigger is not aria-expanded while the flow is open',
        );
        const sheet = await openDialog(page);
        check(sheet?.containsFocus === true, 'focus did not enter the sheet');
        const sheetAxe = await axe(page, 'body');
        check(sheetAxe.length === 0, `sheet axe: ${sheetAxe.join(' | ')}`);
        await frame('filters-sheet', {sheet, sheetAxe});
        await page.keyboard.press('Escape');
        const closed = await page
          .getByRole('dialog', {name: 'Filters'})
          .waitFor({state: 'hidden', timeout: 5000})
          .then(
            () => true,
            () => false,
          );
        await settle(page);
        check(closed, 'Escape left the Filters sheet open');
        const returned = await page
          .waitForFunction(
            sel => document.activeElement === document.querySelector(sel),
            TRIGGER,
            {timeout: 3000},
          )
          .then(
            () => true,
            () => false,
          );
        check(returned, 'focus did not return to the trigger');
        check(
          (await trigger.getAttribute('aria-expanded')) === 'false',
          'the trigger stays aria-expanded after the flow closes',
        );
        await frame('closed', {});
      },
    });
  }
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
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
  await page.mouse.move(0, 0);
  await page.goto(url, {waitUntil: 'load'});
  await page.locator(FIELD).first().waitFor();
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
  check(sensors.theme === item.theme, `theme ${sensors.theme}`);
  check(sensors.direction === item.direction, `direction ${sensors.direction}`);
  check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
  check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
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
    const list = await fields(page);
    check(
      list.length === item.count,
      `${list.length} fields, expected ${item.count}`,
    );
    list.forEach((field, index) =>
      checkField(check, field, `field ${index}`, item.control),
    );
    if (item.story === 'core-powersearch--default') {
      check(
        list[0]?.placeholderContrast != null,
        'the placeholder contrast was not measured',
      );
    }
    if (item.story === 'core-powersearch--with-preset-filters') {
      check(
        list[0]?.tokens.length === 2 &&
          list[0].tokens.every(t => t.interactive) &&
          list[0].text.length > 0,
        `the preset tokens were not measured: ${JSON.stringify(list[0]?.tokens)}`,
      );
      check(
        list[0]?.removes.length === 2,
        `the preset tokens show ${list[0]?.removes.length} remove controls`,
      );
    }
    const rootAxe = await axe(page, ROOT, item.story.includes('--disabled'));
    check(rootAxe.length === 0, `axe: ${rootAxe.join(' | ')}`);
    await frame('rest', {list, axe: rootAxe});
    if (item.run != null) {
      await item.run(page, check, frame);
    }
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'PowerSearch',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    theme: item.theme,
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

// One page for the whole file: every group runs on it in turn.
let sharedContext: BrowserContext;
let sharedPage: Page;

test.beforeAll(async ({browser}) => {
  sharedContext = await browser.newContext({deviceScaleFactor: 2});
  sharedPage = await sharedContext.newPage();
});

test.afterAll(async () => {
  await sharedContext?.close();
});

for (const group of [...new Set(cases.map(item => item.group))]) {
  test(group, async () => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    for (const item of cases.filter(c => c.group === group)) {
      failures.push(...(await runCase(sharedPage, item)));
    }
    expect(failures).toEqual([]);
  });
}
