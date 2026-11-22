// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit RadioList

/**
 * @file RadioListAudit.a11y.chromium.spec.ts
 * @input Exact-head RadioList stories across modes, direction, orientation,
 *   sizes, status, disabled states, a second theme, and a narrow viewport
 * @output Screenshots and fail-closed sensor receipts for the RadioList
 *   whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for
 *   a RadioList audit pull request
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

const OUTPUT = path.resolve('radio-list-audit-evidence');

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
  mode: Mode;
  direction: Direction;
  theme: Theme;
  viewport: Viewport;
  forcedColors?: boolean;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 700};
const NARROW = {width: 320, height: 700};

/** WCAG 2.2 SC 2.5.8 target, SC 1.4.3 text, and SC 1.4.11 non-text contrast. */
const MIN_TARGET_PX = 24;
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
 * The first radio group on the page: its role, name, description, state,
 * target and data attributes, its box, and every radio's name, value, state,
 * box and indicator size, plus the group label's text contrast.
 */
async function readGroup(page: Page) {
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
    const group = document.querySelector<HTMLElement>(
      '#storybook-root [role="radiogroup"]',
    );
    const labelId = group?.getAttribute('aria-labelledby')?.split(/\s+/)[0];
    const label = labelId ? document.getElementById(labelId) : null;
    const radios = group
      ? Array.from(
          group.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
        )
      : [];
    const box = group?.getBoundingClientRect();
    return {
      role: group?.getAttribute('role') ?? null,
      name: textOf(group?.getAttribute('aria-labelledby') ?? null),
      description: textOf(group?.getAttribute('aria-describedby') ?? null),
      target: group?.classList.contains('astryx-radio-list') ?? false,
      orientation: group?.getAttribute('data-orientation') ?? null,
      size: group?.getAttribute('data-size') ?? null,
      disabled: group?.getAttribute('aria-disabled') ?? null,
      invalid: group?.getAttribute('aria-invalid') ?? null,
      required: group?.getAttribute('aria-required') ?? null,
      width: box ? Math.round(box.width) : null,
      labelContrast: label ? textRatio(label) : null,
      focusInGroup: group?.contains(document.activeElement) ?? false,
      radios: radios.map(radio => {
        const row = radio.closest('.astryx-radio-list-item');
        const rect = (row ?? radio).getBoundingClientRect();
        const indicator = row
          ?.querySelector('.astryx-radio-indicator')
          ?.getBoundingClientRect();
        return {
          label: row?.textContent?.trim() ?? '',
          value: radio.value,
          name: radio.name,
          checked: radio.checked,
          nativeDisabled: radio.disabled,
          ariaDisabled: radio.getAttribute('aria-disabled'),
          required: radio.required,
          focused: radio === document.activeElement,
          description: textOf(radio.getAttribute('aria-describedby')),
          itemSize: row?.getAttribute('data-size') ?? null,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          indicator: indicator ? Math.round(indicator.width) : null,
        };
      }),
    };
  });
}
type Group = Awaited<ReturnType<typeof readGroup>>;

/** The standing group contract: role, name, target, shared radio name. */
function checkGroup(
  check: Check,
  group: Group,
  expected: {name: string; orientation: string; size: string},
) {
  check(group.role === 'radiogroup', `role ${group.role}`);
  check(group.name.startsWith(expected.name), `group name "${group.name}"`);
  check(group.target, 'no astryx-radio-list target on the radiogroup');
  check(
    group.orientation === expected.orientation,
    `data-orientation ${group.orientation}`,
  );
  check(group.size === expected.size, `data-size ${group.size}`);
  check(group.radios.length >= 2, `${group.radios.length} radios`);
  const names = new Set(group.radios.map(radio => radio.name));
  check(
    names.size === 1 && !names.has(''),
    `radio names ${JSON.stringify([...names])}`,
  );
  check(
    group.radios.filter(radio => radio.checked).length <= 1,
    'more than one radio checked',
  );
  for (const radio of group.radios) {
    check(
      radio.itemSize === expected.size,
      `${radio.label}: item data-size ${radio.itemSize}`,
    );
  }
  // WCAG 2.5.8: a row under 24 px passes when a 24 px circle on its center
  // clears its neighbours, so the centers of adjacent rows must be 24 px apart.
  group.radios.forEach((radio, i) => {
    const height = radio.bottom - radio.top;
    const width = radio.right - radio.left;
    if (height >= MIN_TARGET_PX && width >= MIN_TARGET_PX) {
      return;
    }
    const center = (r: typeof radio) => [
      (r.left + r.right) / 2,
      (r.top + r.bottom) / 2,
    ];
    const [x, y] = center(radio);
    for (const other of [group.radios[i - 1], group.radios[i + 1]]) {
      if (other == null) {
        continue;
      }
      const [ox, oy] = center(other);
      check(
        Math.hypot(ox - x, oy - y) >= MIN_TARGET_PX,
        `${radio.label}: ${width}x${height} row, ${Math.round(Math.hypot(ox - x, oy - y))} px from ${other.label}`,
      );
    }
  });
  // A disabled group's dimmed label belongs to an inactive control, which
  // WCAG 1.4.3 exempts. The receipt still records the ratio.
  if (group.disabled !== 'true') {
    check(
      group.labelContrast != null && group.labelContrast >= MIN_TEXT_CONTRAST,
      `group label contrast ${group.labelContrast}`,
    );
  }
}

function focusedRadio(group: Group) {
  return group.radios.find(radio => radio.focused);
}

/** Focus the page start so the next Tab enters the story from outside. */
async function focusPageStart(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.tabIndex = -1;
    document.body.focus();
  });
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `vertical-${mode}-${direction}`,
      group: 'vertical',
      story: 'core-radiolist--with-description',
      mode,
      direction,
      theme: 'neutral',
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const rest = await readGroup(page);
        checkGroup(check, rest, {
          name: 'Notification preference',
          orientation: 'vertical',
          size: 'md',
        });
        check(
          rest.description.includes('Choose how you would like to be notified'),
          `group description "${rest.description}"`,
        );
        check(
          rest.radios.every(radio => !radio.checked),
          'a radio is checked with an empty value',
        );
        for (let i = 1; i < rest.radios.length; i++) {
          check(
            rest.radios[i].top >= rest.radios[i - 1].bottom,
            `${rest.radios[i].label} is not below ${rest.radios[i - 1].label}`,
          );
        }
        const result = await axe(page);
        checkAxe(check, result);
        await frame('rest', {rest, axe: result});

        // Keyboard: Tab enters on the first radio of an empty group, the
        // arrow key moves and selects, and Tab leaves the group.
        await focusPageStart(page);
        await page.keyboard.press('Tab');
        await settle(page);
        const entered = await readGroup(page);
        check(
          focusedRadio(entered)?.value === entered.radios[0]?.value,
          `Tab entered on ${focusedRadio(entered)?.label}`,
        );
        await frame('tab-entry', {focused: focusedRadio(entered)});
        await page.keyboard.press('ArrowDown');
        await settle(page);
        const moved = await readGroup(page);
        const second = focusedRadio(moved);
        check(
          second?.value === moved.radios[1]?.value && second?.checked === true,
          `ArrowDown reached ${second?.label}, checked ${second?.checked}`,
        );
        await frame('arrow-select', {focused: second});
        await page.keyboard.press('Tab');
        await settle(page);
        const left = await readGroup(page);
        check(!left.focusInGroup, 'Tab from a radio stayed in the group');
      },
    });

    cases.push({
      key: `horizontal-${mode}-${direction}`,
      group: 'horizontal',
      story: 'core-radiolist--horizontal',
      mode,
      direction,
      theme: 'neutral',
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const rest = await readGroup(page);
        checkGroup(check, rest, {
          name: 'Size',
          orientation: 'horizontal',
          size: 'md',
        });
        for (let i = 1; i < rest.radios.length; i++) {
          const [prev, next] = [rest.radios[i - 1], rest.radios[i]];
          check(
            next.top === prev.top,
            `${next.label} is not on the same row as ${prev.label}`,
          );
          check(
            direction === 'ltr'
              ? next.left >= prev.right
              : next.right <= prev.left,
            `${next.label} does not follow ${prev.label} in ${direction}`,
          );
        }
        const result = await axe(page);
        checkAxe(check, result);
        await frame('rest', {rest, axe: result});
      },
    });
  }

  cases.push({
    key: `sizes-${mode}-ltr`,
    group: 'sizes',
    story: 'core-radiolist--default',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const medium = await readGroup(page);
      checkGroup(check, medium, {
        name: 'Notification preference',
        orientation: 'vertical',
        size: 'md',
      });
      await frame('md', {medium});
      await page.goto(`${page.url()}&args=size:sm`);
      await page.locator('#storybook-root [role="radiogroup"]').waitFor();
      await settle(page);
      const small = await readGroup(page);
      checkGroup(check, small, {
        name: 'Notification preference',
        orientation: 'vertical',
        size: 'sm',
      });
      const [md, sm] = [
        medium.radios[0]?.indicator,
        small.radios[0]?.indicator,
      ];
      check(md === 24 && sm === 20, `indicator md ${md}px, sm ${sm}px`);
      const result = await axe(page);
      checkAxe(check, result);
      await frame('sm', {small, axe: result});
    },
  });

  cases.push({
    key: `error-${mode}-ltr`,
    group: 'status',
    story: 'core-radiolist--with-error-status',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readGroup(page);
      checkGroup(check, rest, {
        name: 'Notification preference',
        orientation: 'vertical',
        size: 'md',
      });
      check(rest.invalid === 'true', `aria-invalid ${rest.invalid}`);
      check(rest.required === 'true', `aria-required ${rest.required}`);
      check(
        rest.description.includes('Please select a notification method'),
        `group description "${rest.description}"`,
      );
      check(
        rest.radios.every(radio => radio.required),
        'a radio is not natively required',
      );
      const message = await page
        .locator('#storybook-root [id]:not([data-astryx-live-region])')
        .getByText('Please select a notification method', {exact: true})
        .first()
        .boundingBox();
      const last = rest.radios.at(-1);
      check(
        message != null && last != null && message.y >= last.bottom,
        `status message at ${message?.y}, last option ends ${last?.bottom}`,
      );
      const result = await axe(page);
      checkAxe(check, result);
      await frame('rest', {rest, axe: result});
    },
  });

  cases.push({
    key: `disabled-reason-${mode}-ltr`,
    group: 'disabled',
    story: 'core-radiolist--disabled-with-message',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readGroup(page);
      checkGroup(check, rest, {
        name: 'Notification preference',
        orientation: 'vertical',
        size: 'md',
      });
      check(rest.disabled === 'true', `group aria-disabled ${rest.disabled}`);
      for (const radio of rest.radios) {
        check(
          !radio.nativeDisabled && radio.ariaDisabled === 'true',
          `${radio.label}: disabled ${radio.nativeDisabled}, aria-disabled ${radio.ariaDisabled}`,
        );
      }
      await frame('rest', {rest});

      await focusPageStart(page);
      await page.keyboard.press('Tab');
      await page
        .getByRole('tooltip')
        .filter({hasText: 'Upgrade your account'})
        .waitFor();
      await settle(page);
      const focused = await readGroup(page);
      const radio = focusedRadio(focused);
      check(radio?.checked === true, `Tab entered on ${radio?.label}`);
      check(
        radio?.description.includes('Upgrade your account') === true,
        `focused radio description "${radio?.description}"`,
      );
      const result = await axe(page);
      checkAxe(check, result);
      await frame('focus-reason', {focused: radio, axe: result});

      await page
        .locator('#storybook-root .astryx-radio-list-item')
        .nth(1)
        .click({force: true});
      await settle(page);
      const after = await readGroup(page);
      check(
        after.radios.find(r => r.checked)?.value === 'email',
        `selection moved to ${after.radios.find(r => r.checked)?.value}`,
      );
    },
  });

  cases.push({
    key: `disabled-${mode}-ltr`,
    group: 'disabled',
    story: 'core-radiolist--disabled',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readGroup(page);
      checkGroup(check, rest, {
        name: 'Notification preference',
        orientation: 'vertical',
        size: 'md',
      });
      check(rest.disabled === 'true', `group aria-disabled ${rest.disabled}`);
      // Without a reason each radio is natively disabled, so it leaves the
      // Tab order. The receipt records that state and does not fail on it.
      await page
        .locator('#storybook-root .astryx-radio-list-item')
        .nth(1)
        .click({force: true});
      await settle(page);
      const after = await readGroup(page);
      check(
        after.radios.find(r => r.checked)?.value === 'email',
        `selection moved to ${after.radios.find(r => r.checked)?.value}`,
      );
      const result = await axe(page);
      checkAxe(check, result);
      await frame('rest', {
        rest,
        nativeDisabled: rest.radios.map(r => r.nativeDisabled),
        axe: result,
      });
    },
  });
}

cases.push({
  key: 'matcha-light',
  group: 'themes',
  story: 'core-radiolist--with-description',
  mode: 'light',
  direction: 'ltr',
  theme: 'matcha',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    const rest = await readGroup(page);
    checkGroup(check, rest, {
      name: 'Notification preference',
      orientation: 'vertical',
      size: 'md',
    });
    const result = await axe(page);
    checkAxe(check, result);
    await frame('rest', {rest, axe: result});
  },
});

for (const story of ['with-description', 'horizontal'] as const) {
  cases.push({
    key: `narrow-${story}`,
    group: 'themes',
    story: `core-radiolist--${story}`,
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
      const rest = await readGroup(page);
      for (const radio of rest.radios) {
        check(
          radio.right <= NARROW.width,
          `${radio.label} ends at ${radio.right}px`,
        );
      }
      await frame('rest', {scroll, rest});
    },
  });
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
  await page.emulateMedia({
    colorScheme: item.mode,
    reducedMotion: 'reduce',
    forcedColors: item.forcedColors ? 'active' : 'none',
  });
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
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
    await page.locator('#storybook-root [role="radiogroup"]').first().waitFor();
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
    component: 'RadioList',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
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
