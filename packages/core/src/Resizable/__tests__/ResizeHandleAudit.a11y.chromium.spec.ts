// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit ResizeHandle

/**
 * @file ResizeHandleAudit.a11y.chromium.spec.ts
 * @input Exact-head Resizable stories driven through the Handle: rest, pill
 *   placement, keyboard and pointer resizing, a hidden pill, disabled,
 *   collapse, both axes and directions, forced colors, a second theme, and a
 *   narrow viewport
 * @output Screenshots and fail-closed sensor receipts for the ResizeHandle
 *   whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for
 *   a ResizeHandle audit pull request
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

const EVIDENCE = path.resolve('test-results/resize-handle-audit-evidence');
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
  mode: Mode;
  direction: Direction;
  theme: Theme;
  viewport: Viewport;
  forcedColors?: boolean;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 1000, height: 700};
const NARROW = {width: 320, height: 700};

/** WCAG 2.2 SC 1.4.11 non-text contrast. */
const MIN_GRAPHIC_CONTRAST = 3;

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
    forcedColors: matchMedia('(forced-colors: active)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    storybookError:
      document.querySelector('.sb-show-errordisplay') != null ||
      document.body.classList.contains('sb-show-errordisplay'),
  }));
}

async function axe(page: Page, scope = '#storybook-root') {
  const results = await new AxeBuilder({page})
    .include(scope)
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
 * The first Handle on the page: its role, name, ARIA values, target state,
 * box, paint and focus outline; the Grab zone's box; and the Grip pill's box,
 * opacity, paint and contrast against the backdrop.
 */
async function readHandle(page: Page) {
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
    const backdropOf = (node0: Element | null) => {
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
    const ratio = (fgValue: string, bg: number[]) => {
      const fg = rgba(fgValue);
      const mixed = bg.map((c, i) => fg[i] * fg[3] + c * (1 - fg[3]));
      const [hi, lo] = [luminance(mixed), luminance(bg)].sort((x, y) => y - x);
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    };
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
    const handle = document.querySelector<HTMLElement>(
      '#storybook-root [role="separator"].astryx-resize-handle',
    );
    const pill = handle?.querySelector<HTMLElement>(
      '.astryx-resize-handle-pill',
    );
    const zone = handle?.firstElementChild ?? null;
    const style = handle ? getComputedStyle(handle) : null;
    const pillStyle = pill ? getComputedStyle(pill) : null;
    const backdrop = backdropOf(handle?.parentElement ?? null);
    return {
      found: handle != null,
      name: handle?.getAttribute('aria-label') ?? null,
      orientation: handle?.getAttribute('aria-orientation') ?? null,
      valueNow: handle?.getAttribute('aria-valuenow') ?? null,
      valueMin: handle?.getAttribute('aria-valuemin') ?? null,
      valueMax: handle?.getAttribute('aria-valuemax') ?? null,
      valueText: handle?.getAttribute('aria-valuetext') ?? null,
      disabled: handle?.getAttribute('aria-disabled') ?? null,
      tabIndex: handle?.tabIndex ?? null,
      dataDirection: handle?.getAttribute('data-direction') ?? null,
      focused: handle != null && handle === document.activeElement,
      focusVisible: handle?.matches(':focus-visible') ?? false,
      outline: style
        ? `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`
        : null,
      handleBox: box(handle),
      handleBackground: style?.backgroundColor ?? null,
      handleCursor: style?.cursor ?? null,
      zoneBox: box(zone),
      zoneCursor: zone ? getComputedStyle(zone).cursor : null,
      pillBox: box(pill),
      pillOpacity: pillStyle ? Number(pillStyle.opacity) : null,
      pillBackground: pillStyle?.backgroundColor ?? null,
      pillContrast:
        pillStyle != null ? ratio(pillStyle.backgroundColor, backdrop) : null,
      dividerContrast:
        style != null &&
        Math.min(box(handle)?.width ?? 0, box(handle)?.height ?? 0) > 0
          ? ratio(style.backgroundColor, backdrop)
          : null,
      scroll: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
    };
  });
}
type Handle = Awaited<ReturnType<typeof readHandle>>;

/** The standing Handle contract for one axis. */
function checkHandle(
  check: Check,
  handle: Handle,
  expected: {name: string; axis: 'horizontal' | 'vertical'},
) {
  check(handle.found, 'no separator with the resize-handle target');
  check(handle.name === expected.name, `name "${handle.name}"`);
  // The separator's orientation is the divider's: a horizontal resize has a
  // vertical divider.
  const orientation =
    expected.axis === 'horizontal' ? 'vertical' : 'horizontal';
  check(
    handle.orientation === orientation,
    `aria-orientation ${handle.orientation}`,
  );
  check(handle.tabIndex === 0, `tabIndex ${handle.tabIndex}`);
  check(
    handle.dataDirection === expected.axis,
    `resize-handle data-direction ${handle.dataDirection}`,
  );
  const zone = handle.zoneBox;
  const line = handle.handleBox;
  if (zone != null && line != null) {
    const [zoneCenter, lineCenter] =
      expected.axis === 'horizontal'
        ? [(zone.left + zone.right) / 2, (line.left + line.right) / 2]
        : [(zone.top + zone.bottom) / 2, (line.top + line.bottom) / 2];
    check(
      Math.abs(zoneCenter - lineCenter) <= 1,
      `grab zone centered at ${zoneCenter}, divider at ${lineCenter}`,
    );
    const across = expected.axis === 'horizontal' ? zone.width : zone.height;
    check(across >= 16, `grab zone ${across}px across the divider`);
  } else {
    check(
      false,
      `zone ${JSON.stringify(zone)}, divider ${JSON.stringify(line)}`,
    );
  }
}

/** Focus the page start so the next Tab enters the story from outside. */
async function focusPageStart(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.tabIndex = -1;
    document.body.focus();
  });
}

/** Tab until the Handle has focus, at most ten presses. */
async function tabToHandle(page: Page) {
  await focusPageStart(page);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const onHandle = await page.evaluate(
      () =>
        document.activeElement?.matches(
          '[role="separator"].astryx-resize-handle',
        ) ?? false,
    );
    if (onHandle) {
      return true;
    }
  }
  return false;
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `horizontal-${mode}-${direction}`,
      group: 'horizontal',
      story: 'core-resizable--horizontal-split',
      mode,
      direction,
      theme: 'neutral',
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const rest = await readHandle(page);
        checkHandle(check, rest, {name: 'Resize sidebar', axis: 'horizontal'});
        check(
          rest.valueNow === '250' &&
            rest.valueMin === '150' &&
            rest.valueMax === '500',
          `values ${rest.valueNow} ${rest.valueMin}-${rest.valueMax}`,
        );
        check(
          rest.handleBox?.width === 1,
          `divider ${rest.handleBox?.width}px wide`,
        );
        // The pill sits beside the divider. Its side is recorded in both
        // directions and is not failed on: the receipt shows where it lands.
        const pill = rest.pillBox;
        const line = rest.handleBox;
        check(
          pill != null &&
            line != null &&
            (pill.right <= line.left || pill.left >= line.right),
          `pill ${pill?.left}-${pill?.right} overlaps divider ${line?.left}-${line?.right}`,
        );
        const pillSide =
          pill != null && line != null && pill.right <= line.left
            ? 'left'
            : 'right';
        check(rest.pillOpacity === 1, `pill opacity ${rest.pillOpacity}`);
        check(
          rest.handleCursor === 'col-resize' &&
            rest.zoneCursor === 'col-resize',
          `cursor ${rest.handleCursor} / ${rest.zoneCursor}`,
        );
        const result = await axe(page);
        checkAxe(check, result);
        await frame('rest', {rest, pillSide, axe: result});

        // Keyboard: the arrow that points away from the panel grows it.
        check(await tabToHandle(page), 'Tab never reached the Handle');
        await settle(page);
        const focused = await readHandle(page);
        check(
          focused.focusVisible && focused.outline?.startsWith('solid') === true,
          `focus-visible ${focused.focusVisible}, outline ${focused.outline}`,
        );
        await frame('focus', {focused});
        const grow = direction === 'ltr' ? 'ArrowRight' : 'ArrowLeft';
        await page.keyboard.press(grow);
        await settle(page);
        const grown = await readHandle(page);
        check(
          Number(grown.valueNow) > 250,
          `${grow} left the size at ${grown.valueNow}`,
        );
        await page.keyboard.press('Home');
        await settle(page);
        const home = await readHandle(page);
        check(home.valueNow === '150', `Home size ${home.valueNow}`);
        await page.keyboard.press('End');
        await settle(page);
        const end = await readHandle(page);
        check(end.valueNow === '500', `End size ${end.valueNow}`);
        await frame('end', {end});

        // Pointer: a drag on the grab zone toward the content grows the panel.
        await page.keyboard.press('Home');
        await settle(page);
        const before = await readHandle(page);
        const zone = before.zoneBox;
        if (zone != null) {
          const x = (zone.left + zone.right) / 2;
          const y = (zone.top + zone.bottom) / 2;
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + (direction === 'ltr' ? 40 : -40), y, {
            steps: 4,
          });
          await page.mouse.up();
          await settle(page);
        }
        const dragged = await readHandle(page);
        check(
          Number(dragged.valueNow) >= 185 && Number(dragged.valueNow) <= 195,
          `a 40px drag moved the size from ${before.valueNow} to ${dragged.valueNow}`,
        );
        await frame('dragged', {before: before.valueNow, dragged});
      },
    });
  }

  cases.push({
    key: `vertical-${mode}-ltr`,
    group: 'vertical',
    story: 'core-resizable--vertical-split',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readHandle(page);
      checkHandle(check, rest, {name: 'Resize editor', axis: 'vertical'});
      check(
        rest.handleBox?.height === 1,
        `divider ${rest.handleBox?.height}px tall`,
      );
      check(rest.handleCursor === 'row-resize', `cursor ${rest.handleCursor}`);
      const result = await axe(page);
      checkAxe(check, result);
      await frame('rest', {rest, axe: result});
      check(await tabToHandle(page), 'Tab never reached the Handle');
      await page.keyboard.press('ArrowDown');
      await settle(page);
      const grown = await readHandle(page);
      check(
        Number(grown.valueNow) > Number(rest.valueNow),
        `ArrowDown moved the size from ${rest.valueNow} to ${grown.valueNow}`,
      );
      await frame('arrow-down', {grown});
    },
  });

  cases.push({
    key: `hidden-pill-${mode}-ltr`,
    group: 'states',
    story: 'core-resizable--hidden-pill',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readHandle(page);
      checkHandle(check, rest, {name: 'Resize sidebar', axis: 'horizontal'});
      check(rest.pillOpacity === 0, `pill opacity at rest ${rest.pillOpacity}`);
      await frame('rest', {rest});
      // Keyboard focus reveals the pill.
      check(await tabToHandle(page), 'Tab never reached the Handle');
      await settle(page);
      const focused = await readHandle(page);
      check(
        focused.pillOpacity === 1,
        `pill opacity on keyboard focus ${focused.pillOpacity}`,
      );
      const result = await axe(page);
      checkAxe(check, result);
      await frame('focus', {focused, axe: result});
      await focusPageStart(page);
      // Hovering the grab zone reveals it too.
      const zone = focused.zoneBox;
      if (zone != null) {
        await page.mouse.move(
          (zone.left + zone.right) / 2,
          (zone.top + zone.bottom) / 2,
        );
        await settle(page);
      }
      const hovered = await readHandle(page);
      check(
        hovered.pillOpacity === 1,
        `pill opacity on hover ${hovered.pillOpacity}`,
      );
      await frame('hover', {hovered});
      await page.mouse.move(0, 0);
    },
  });

  cases.push({
    key: `disabled-${mode}-ltr`,
    group: 'states',
    story: 'core-resizable--disabled',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readHandle(page);
      checkHandle(check, rest, {name: 'Locked', axis: 'horizontal'});
      check(rest.disabled === 'true', `aria-disabled ${rest.disabled}`);
      const result = await axe(page);
      checkAxe(check, result);
      await frame('rest', {rest, axe: result});
      // A disabled Handle keeps its tab stop and ignores the keyboard.
      check(await tabToHandle(page), 'Tab never reached the disabled Handle');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('End');
      await settle(page);
      const keyed = await readHandle(page);
      check(
        keyed.valueNow === rest.valueNow,
        `keys moved a disabled Handle from ${rest.valueNow} to ${keyed.valueNow}`,
      );
      await frame('focus', {keyed});
      // And the pointer.
      const zone = rest.zoneBox;
      if (zone != null) {
        const x = (zone.left + zone.right) / 2;
        const y = (zone.top + zone.bottom) / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 60, y, {steps: 4});
        await page.mouse.up();
        await settle(page);
      }
      const dragged = await readHandle(page);
      check(
        dragged.valueNow === rest.valueNow,
        `a drag moved a disabled Handle from ${rest.valueNow} to ${dragged.valueNow}`,
      );
    },
  });

  cases.push({
    key: `collapsible-${mode}-ltr`,
    group: 'states',
    story: 'core-resizable--collapsible',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readHandle(page);
      checkHandle(check, rest, {name: 'Resize sidebar', axis: 'horizontal'});
      check(rest.valueText == null, `value text at rest ${rest.valueText}`);
      check(await tabToHandle(page), 'Tab never reached the Handle');
      await page.keyboard.press('Enter');
      await settle(page);
      const collapsed = await readHandle(page);
      check(
        collapsed.valueText === 'Collapsed' &&
          collapsed.valueNow === collapsed.valueMin,
        `collapsed: value text ${collapsed.valueText}, now ${collapsed.valueNow}, min ${collapsed.valueMin}`,
      );
      check(collapsed.focused, 'focus left the Handle on collapse');
      const result = await axe(page);
      checkAxe(check, result);
      await frame('collapsed', {collapsed, axe: result});
      await page.keyboard.press('Enter');
      await settle(page);
      const reopened = await readHandle(page);
      check(
        reopened.valueNow === rest.valueNow && reopened.valueText == null,
        `Enter reopened at ${reopened.valueNow} (${reopened.valueText})`,
      );
      // A double-click collapses it too.
      const zone = reopened.zoneBox;
      if (zone != null) {
        await page.mouse.dblclick(
          (zone.left + zone.right) / 2,
          (zone.top + zone.bottom) / 2,
        );
        await settle(page);
      }
      const doubled = await readHandle(page);
      check(
        doubled.valueText === 'Collapsed',
        `double-click left value text ${doubled.valueText}`,
      );
      await frame('double-click', {doubled});
    },
  });
}

cases.push({
  key: 'forced-colors-light-ltr',
  group: 'forced-colors',
  story: 'core-resizable--horizontal-split',
  mode: 'light',
  direction: 'ltr',
  theme: 'neutral',
  viewport: DESKTOP,
  forcedColors: true,
  run: async (page, check, frame) => {
    const rest = await readHandle(page);
    checkHandle(check, rest, {name: 'Resize sidebar', axis: 'horizontal'});
    // The receipt records whether the divider and the pill keep a visible
    // paint under forced colors.
    await frame('rest', {
      handleBackground: rest.handleBackground,
      dividerContrast: rest.dividerContrast,
      pillBackground: rest.pillBackground,
      pillContrast: rest.pillContrast,
    });
  },
});

cases.push({
  key: 'contrast-matcha-light-ltr',
  group: 'themes',
  story: 'core-resizable--horizontal-split',
  mode: 'light',
  direction: 'ltr',
  theme: 'matcha',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    const rest = await readHandle(page);
    checkHandle(check, rest, {name: 'Resize sidebar', axis: 'horizontal'});
    // The story's own text follows the theme's tokens. The Handle is what
    // this audit fails on; the whole-story result is recorded beside it.
    const handleResult = await axe(
      page,
      '#storybook-root [role="separator"].astryx-resize-handle',
    );
    checkAxe(check, handleResult);
    const storyResult = await axe(page);
    await frame('rest', {rest, axe: handleResult, storyAxe: storyResult});
  },
});

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `contrast-neutral-${mode}-ltr`,
    group: 'themes',
    story: 'core-resizable--horizontal-split',
    mode,
    direction: 'ltr',
    theme: 'neutral',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readHandle(page);
      checkHandle(check, rest, {name: 'Resize sidebar', axis: 'horizontal'});
      // The pill is the visible resize affordance. The receipt records its
      // contrast against the backdrop beside the 3:1 bar.
      await frame('rest', {
        pillContrast: rest.pillContrast,
        dividerContrast: rest.dividerContrast,
        meetsGraphicBar:
          rest.pillContrast != null &&
          rest.pillContrast >= MIN_GRAPHIC_CONTRAST,
      });
    },
  });
}

cases.push({
  key: 'narrow-light-ltr',
  group: 'narrow',
  story: 'core-resizable--horizontal-split',
  mode: 'light',
  direction: 'ltr',
  theme: 'neutral',
  viewport: NARROW,
  run: async (page, check, frame) => {
    const rest = await readHandle(page);
    checkHandle(check, rest, {name: 'Resize sidebar', axis: 'horizontal'});
    const zone = rest.zoneBox;
    check(
      zone != null && zone.left >= 0 && zone.right <= NARROW.width,
      `grab zone ${zone?.left}-${zone?.right} at 320px`,
    );
    check(await tabToHandle(page), 'Tab never reached the Handle at 320px');
    await page.keyboard.press('Home');
    await settle(page);
    const home = await readHandle(page);
    check(home.valueNow === '150', `Home size ${home.valueNow} at 320px`);
    await frame('rest', {rest, home});
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
    await page.locator('#storybook-root [role="separator"]').first().waitFor();
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
    component: 'ResizeHandle',
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
