// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit NumberInput

/**
 * @file NumberInputAudit.a11y.chromium.spec.ts
 * @input Exact-head NumberInput stories across themes, modes, direction, widths, and states
 * @output Screenshots and fail-closed sensor receipts for the NumberInput whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a NumberInput audit pull request
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

const OUTPUT = path.resolve('number-input-audit-evidence');

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
  /** How many spinbuttons the story renders. */
  count: number;
  run?: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 1180, height: 800};
const NARROW = {width: 320, height: 640};

const SPINBUTTON = '#storybook-root [role="spinbutton"]';
/** WCAG 2.2 SC 1.4.3 text contrast. */
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
    storybookError:
      document.querySelector('.sb-show-errordisplay') != null ||
      document.body.classList.contains('sb-show-errordisplay'),
  }));
}

/**
 * Every spinbutton: its ARIA, its control box, the paint of the box, the
 * contrast of its value, placeholder, and units text against the box, and the
 * boxes of its stepper and clear buttons. Colors are normalized through a
 * canvas so any CSS color syntax reads as sRGB.
 */
async function fields(page: Page) {
  return page.evaluate(sel => {
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
    const box = (el: Element | null) => {
      if (el == null) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left * 10) / 10,
        y: Math.round(r.top * 10) / 10,
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
      };
    };
    return Array.from(document.querySelectorAll(sel)).map(el => {
      const input = el as HTMLInputElement;
      const control = input.closest('.astryx-number-input');
      const bg = control != null ? backdrop(control) : [255, 255, 255];
      const labelledBy = input.getAttribute('aria-labelledby');
      const labelText = labelledBy
        ? labelledBy
            .split(' ')
            .map(id => document.getElementById(id)?.textContent ?? '')
            .join(' ')
            .trim()
        : (input.labels?.[0]?.textContent?.trim() ?? '');
      const units =
        control == null
          ? null
          : (Array.from(control.querySelectorAll('span')).find(
              span =>
                span.children.length === 0 &&
                span.textContent?.trim() !== '' &&
                !span.closest('button'),
            ) ?? null);
      const buttons = control
        ? Array.from(control.querySelectorAll('button')).map(button => ({
            name: button.getAttribute('aria-label') ?? button.textContent,
            disabled: button.getAttribute('aria-disabled'),
            tabIndex: button.tabIndex,
            box: box(button),
          }))
        : [];
      return {
        tag: input.tagName,
        type: input.type,
        name: labelText,
        value: input.value,
        valuenow: input.getAttribute('aria-valuenow'),
        valuemin: input.getAttribute('aria-valuemin'),
        valuemax: input.getAttribute('aria-valuemax'),
        invalid: input.getAttribute('aria-invalid'),
        ariaDisabled: input.getAttribute('aria-disabled'),
        readOnly: input.readOnly,
        tabIndex: input.tabIndex,
        inputMode: input.inputMode,
        control: box(control),
        controlOpacity: control ? getComputedStyle(control).opacity : null,
        size: control?.getAttribute('data-size') ?? null,
        status: control?.getAttribute('data-status') ?? null,
        backdrop: `rgb(${bg.map(Math.round).join(', ')})`,
        valueContrast: input.value
          ? ratio(getComputedStyle(input).color, bg)
          : null,
        placeholderContrast:
          !input.value && input.placeholder
            ? ratio(getComputedStyle(input, '::placeholder').color, bg)
            : null,
        units: units?.textContent?.trim() ?? null,
        unitsContrast:
          units != null ? ratio(getComputedStyle(units).color, bg) : null,
        buttons,
      };
    });
  }, SPINBUTTON);
}

async function axeRoot(page: Page) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.flatMap(violation =>
    violation.nodes.map(node => `${violation.id}: ${node.target.join(' ')}`),
  );
}

type Field = Awaited<ReturnType<typeof fields>>[number];

/** Checks one field's role, values, name, paint, and text contrast. */
function checkField(check: Check, field: Field, label: string) {
  check(field.tag === 'INPUT', `${label} is a ${field.tag}`);
  check(field.type === 'text', `${label} type ${field.type}`);
  check(field.name !== '', `${label} has no label`);
  check(field.control != null, `${label} has no number-input control box`);
  check(field.tabIndex === 0, `${label} tabindex ${field.tabIndex}`);
  if (field.ariaDisabled !== 'true' && field.valueContrast != null) {
    check(
      field.valueContrast >= MIN_TEXT_CONTRAST,
      `${label} value contrast ${field.valueContrast}`,
    );
  }
  if (field.placeholderContrast != null) {
    check(
      field.placeholderContrast >= MIN_TEXT_CONTRAST,
      `${label} placeholder contrast ${field.placeholderContrast}`,
    );
  }
  if (field.unitsContrast != null) {
    check(
      field.unitsContrast >= MIN_TEXT_CONTRAST,
      `${label} units contrast ${field.unitsContrast}`,
    );
  }
  for (const button of field.buttons) {
    check(
      button.box != null && button.box.width > 0 && button.box.height > 0,
      `${label} button ${button.name} renders no box: ${JSON.stringify(button.box)}`,
    );
  }
}

async function input(page: Page, index = 0) {
  return page.locator(SPINBUTTON).nth(index);
}

async function controlPaint(page: Page, index = 0) {
  return page.evaluate(
    ([sel, i]) => {
      const all = document.querySelectorAll(sel as string);
      const el = all[i as number]?.closest('.astryx-number-input');
      if (el == null) {
        return null;
      }
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        boxShadow: s.boxShadow,
        outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
        border: `${s.borderTopColor} ${s.borderTopWidth}`,
      };
    },
    [SPINBUTTON, index],
  );
}

const cases: AuditCase[] = [];

const restStories: {story: string; count: number}[] = [
  {story: 'core-numberinput--default', count: 1},
  {story: 'core-numberinput--with-value', count: 1},
  {story: 'core-numberinput--with-units', count: 1},
  {story: 'core-numberinput--with-number-steppers', count: 1},
  {story: 'core-numberinput--clearable', count: 1},
  {story: 'core-numberinput--size-variants', count: 3},
  {story: 'core-numberinput--read-only', count: 1},
  {story: 'core-numberinput--disabled-with-message', count: 1},
  {story: 'core-numberinput--error-status', count: 1},
];

for (const {story, count} of restStories) {
  for (const mode of ['light', 'dark'] as const) {
    for (const direction of ['ltr', 'rtl'] as const) {
      cases.push({
        key: `${story.replace('core-numberinput--', '')}-neutral-${mode}-${direction}`,
        group: 'rest',
        story,
        theme: 'neutral',
        mode,
        direction,
        viewport: DESKTOP,
        count,
      });
    }
  }
  for (const mode of ['light', 'dark'] as const) {
    cases.push({
      key: `${story.replace('core-numberinput--', '')}-matcha-${mode}-ltr`,
      group: 'themed',
      story,
      theme: 'matcha',
      mode,
      direction: 'ltr',
      viewport: DESKTOP,
      count,
    });
  }
}

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `steppers-narrow-light-${direction}`,
    group: 'narrow',
    story: 'core-numberinput--with-number-steppers',
    theme: 'neutral',
    mode: 'light',
    direction,
    viewport: NARROW,
    count: 1,
    run: async (page, check, frame) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      check(overflow <= 0, `page scrolls sideways by ${overflow}px`);
      await frame('narrow', {overflow});
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `interaction-steppers-${mode}-${direction}`,
      group: 'interaction-steppers',
      story: 'core-numberinput--with-number-steppers',
      theme: 'neutral',
      mode,
      direction,
      viewport: DESKTOP,
      count: 1,
      run: async (page, check, frame) => {
        const field = await input(page);
        const rest = await controlPaint(page);
        const box = await field.boundingBox();
        if (box != null) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        }
        await settle(page);
        const hover = await controlPaint(page);
        check(
          JSON.stringify(hover) !== JSON.stringify(rest),
          `hover paints the same as rest: ${JSON.stringify(rest)}`,
        );
        await frame('hover', {rest, hover});
        await page.mouse.move(0, 0);
        await page.keyboard.press('Tab');
        await settle(page);
        const focused = await field.evaluate(
          el => document.activeElement === el,
        );
        check(focused, 'Tab did not reach the input');
        const focus = await controlPaint(page);
        check(
          JSON.stringify(focus) !== JSON.stringify(rest),
          `keyboard focus paints the same as rest: ${JSON.stringify(rest)}`,
        );
        await frame('focus-visible', {focus});
        await page.keyboard.press('ArrowUp');
        await settle(page);
        check(
          (await field.getAttribute('aria-valuenow')) === '3',
          `ArrowUp gives ${await field.getAttribute('aria-valuenow')}`,
        );
        await page.keyboard.press('Tab');
        await settle(page);
        const onStepper = await page.evaluate(
          () => document.activeElement?.tagName === 'BUTTON',
        );
        check(!onStepper, 'Tab stopped on a stepper');
        const increment = page.locator('#storybook-root button').filter({
          has: page.locator('svg'),
        });
        const names = await increment.evaluateAll(buttons =>
          buttons.map(b => b.getAttribute('aria-label')),
        );
        check(
          names.includes('Increment Quantity') &&
            names.includes('Decrement Quantity'),
          `stepper names ${JSON.stringify(names)}`,
        );
        const up = page.locator(
          '#storybook-root button[aria-label="Increment Quantity"]',
        );
        for (let i = 0; i < 7; i++) {
          await up.click();
        }
        await settle(page);
        check(
          (await field.getAttribute('aria-valuenow')) === '10',
          `steppers stop at ${await field.getAttribute('aria-valuenow')}`,
        );
        check(
          (await up.getAttribute('aria-disabled')) === 'true',
          'increment is not aria-disabled at max',
        );
        await frame('at-max', {names});
      },
    });
    cases.push({
      key: `interaction-rejection-${mode}-${direction}`,
      group: 'interaction-rejection',
      story: 'core-numberinput--default',
      theme: 'neutral',
      mode,
      direction,
      viewport: DESKTOP,
      count: 1,
      run: async (page, check, frame) => {
        const field = await input(page);
        await field.click();
        await page.keyboard.type('1a');
        await settle(page);
        check(
          (await field.getAttribute('aria-invalid')) !== 'true',
          'marked invalid while typing',
        );
        await frame('typing', {});
        await page.keyboard.press('Enter');
        await settle(page);
        const after = await page.evaluate(sel => {
          const el = document.querySelector(sel) as HTMLInputElement;
          const described = (el.getAttribute('aria-describedby') ?? '')
            .split(' ')
            .map(id => document.getElementById(id)?.textContent ?? '')
            .join(' ');
          return {
            invalid: el.getAttribute('aria-invalid'),
            value: el.value,
            described,
          };
        }, SPINBUTTON);
        check(after.invalid === 'true', `aria-invalid ${after.invalid}`);
        check(after.value === '1a', `the draft became "${after.value}"`);
        check(after.described.trim() !== '', 'no message describes the field');
        const list = await fields(page);
        if (list[0] != null) {
          checkField(check, list[0], 'rejected field');
        }
        const axe = await axeRoot(page);
        check(axe.length === 0, `axe: ${axe.join(' | ')}`);
        await frame('rejected', {after, axe});
      },
    });
    cases.push({
      key: `interaction-clear-${mode}-${direction}`,
      group: 'interaction-clear',
      story: 'core-numberinput--clearable',
      theme: 'neutral',
      mode,
      direction,
      viewport: DESKTOP,
      count: 1,
      run: async (page, check, frame) => {
        const clear = page.locator(
          '#storybook-root .astryx-number-input button',
        );
        check((await clear.count()) === 1, 'no clear button');
        await clear.first().click();
        await settle(page);
        const after = await page.evaluate(sel => {
          const el = document.querySelector(sel) as HTMLInputElement;
          return {value: el.value, focused: document.activeElement === el};
        }, SPINBUTTON);
        check(after.value === '', `clear left "${after.value}"`);
        check(after.focused, 'clear did not focus the input');
        await frame('cleared', after);
      },
    });
    cases.push({
      key: `interaction-disabled-${mode}-${direction}`,
      group: 'interaction-disabled',
      story: 'core-numberinput--disabled-with-message',
      theme: 'neutral',
      mode,
      direction,
      viewport: DESKTOP,
      count: 1,
      run: async (page, check, frame) => {
        const field = await input(page);
        await page.keyboard.press('Tab');
        await settle(page);
        const focused = await field.evaluate(
          el => document.activeElement === el,
        );
        check(focused, 'Tab skipped the disabled input');
        check(
          (await field.getAttribute('aria-disabled')) === 'true',
          'aria-disabled not set',
        );
        await page.keyboard.press('ArrowUp');
        await settle(page);
        check(
          (await field.getAttribute('aria-valuenow')) === '100',
          'a disabled field stepped',
        );
        const tooltipShown = await page
          .getByRole('tooltip')
          .filter({hasText: 'Editing is locked'})
          .first()
          .waitFor({state: 'visible', timeout: 5000})
          .then(
            () => true,
            () => false,
          );
        check(tooltipShown, 'the reason tooltip did not open');
        const tooltip = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[role="tooltip"]')).map(
            t => t.textContent?.trim() ?? '',
          ),
        );
        check(
          tooltip.some(t => t.includes('Editing is locked')),
          `reason tooltip ${JSON.stringify(tooltip)}`,
        );
        await frame('disabled-focus', {tooltip});
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
  await page.locator(SPINBUTTON).first().waitFor();
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
      `${list.length} spinbuttons, expected ${item.count}`,
    );
    list.forEach((field, index) => checkField(check, field, `field ${index}`));
    if (item.story === 'core-numberinput--default') {
      check(
        list[0]?.placeholderContrast != null,
        'the placeholder contrast was not measured',
      );
    }
    if (item.story === 'core-numberinput--with-units') {
      check(
        list[0]?.units === '%' && list[0]?.unitsContrast != null,
        `the units text was not measured: ${list[0]?.units}`,
      );
    }
    if (item.story === 'core-numberinput--with-value') {
      check(
        list[0]?.valueContrast != null,
        'the value contrast was not measured',
      );
    }
    const axe = await axeRoot(page);
    check(axe.length === 0, `axe: ${axe.join(' | ')}`);
    await frame('rest', {list, axe});
    if (item.run != null) {
      await item.run(page, check, frame);
    }
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'NumberInput',
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
