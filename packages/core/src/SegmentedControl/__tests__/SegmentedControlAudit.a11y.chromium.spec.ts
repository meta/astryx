// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit SegmentedControl

/**
 * @file SegmentedControlAudit.a11y.chromium.spec.ts
 * @input Exact-head SegmentedControl stories: rest, keyboard entry with the
 *   hint, arrow selection, hover, sizes, disabled with a reason, narrow
 *   containers, motion on and forced colors, in light and dark and both
 *   directions
 * @output Screenshots and fail-closed sensor receipts for the SegmentedControl
 *   whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for
 *   a SegmentedControl audit pull request
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

const EVIDENCE = path.resolve('test-results/segmented-control-audit-evidence');
const DEFAULT_STORY = 'core-segmentedcontrol--default';
const SIZES_STORY = 'core-segmentedcontrol--size-variants';
const DISABLED_STORY = 'core-segmentedcontrol--disabled-with-message';
const TRUNCATED_STORY = 'core-segmentedcontrol--truncated-labels';
const NARROW_STORY = 'core-segmentedcontrol--in-narrow-card';

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  story: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  motion?: 'reduce' | 'no-preference';
  forcedColors?: boolean;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 700};
const PHONE = {width: 390, height: 700};

test.describe.configure({retries: 0});

let OUTPUT = EVIDENCE;
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;
let holdsMotion = true;

/** The part of Storybook's preview this spec reads: the story render's phase. */
interface StorybookPreviewWindow extends Window {
  __STORYBOOK_PREVIEW__?: {currentRender?: {phase?: string}};
}

async function settle(page: Page) {
  if (holdsMotion) {
    await holdMotionStill(page);
  }
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function pageSensors(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('#storybook-root [role="radiogroup"]');
    return {
      mode: document.documentElement.getAttribute('data-theme'),
      direction: root == null ? null : getComputedStyle(root).direction,
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      fonts: document.fonts.status,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      storybookError: document.body.classList.contains('sb-show-errordisplay'),
    };
  });
}

async function checkAxe(page: Page, check: Check) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = results.violations.flatMap(violation =>
    violation.nodes.map(
      node =>
        `${violation.id} ${node.target.join(' ')}: ${node.failureSummary}`,
    ),
  );
  check(violations.length === 0, `axe: ${violations.join(' | ')}`);
  check(results.passes.length > 0, 'axe checked nothing');
  return {violations, passes: results.passes.length};
}

/** Every radiogroup and segment state on the page, plus the open layers. */
async function readControls(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
      };
    };
    const controls = [
      ...document.querySelectorAll<HTMLElement>(
        '#storybook-root [role="radiogroup"]',
      ),
    ].map(group => {
      const parent = group.parentElement as HTMLElement;
      return {
        name: group.getAttribute('aria-label'),
        target: group.classList.contains('astryx-segmented-control'),
        size: group.getAttribute('data-size'),
        disabled: group.getAttribute('aria-disabled'),
        describedBy: group.getAttribute('aria-describedby'),
        opacity: getComputedStyle(group).opacity,
        box: box(group),
        container: box(parent),
        segments: [
          ...group.querySelectorAll<HTMLElement>('[role="radio"]'),
        ].map(segment => {
          const style = getComputedStyle(segment);
          return {
            value: segment.dataset.value,
            checked: segment.getAttribute('aria-checked'),
            tabIndex: segment.tabIndex,
            focused: document.activeElement === segment,
            outline: `${style.outlineStyle} ${style.outlineWidth}`,
            outlineWidth: parseFloat(style.outlineWidth),
            outlineStyle: style.outlineStyle,
            background: style.backgroundColor,
            box: box(segment),
          };
        }),
      };
    });
    const layers = [
      ...document.querySelectorAll<HTMLElement>('[popover]:popover-open'),
    ].map(layer => ({id: layer.id, text: layer.textContent?.trim() ?? ''}));
    return {
      controls,
      layers,
      scroll: {
        width: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      },
    };
  });
}

function oneTabStop(
  check: Check,
  control: Awaited<ReturnType<typeof readControls>>['controls'][number],
) {
  const stops = control.segments.filter(segment => segment.tabIndex === 0);
  const checked = control.segments.find(segment => segment.checked === 'true');
  check(
    stops.length === 1 && stops[0].value === checked?.value,
    `${control.name}: tab stops ${stops.map(stop => stop.value).join(',')} checked ${checked?.value}`,
  );
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `default__${mode}__${direction}`,
      group: 'keyboard',
      story: DEFAULT_STORY,
      mode,
      direction,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const rest = await readControls(page);
        const [control] = rest.controls;
        check(
          control.target &&
            control.size === 'md' &&
            control.name === 'View mode',
          `radiogroup ${JSON.stringify({target: control.target, size: control.size, name: control.name})}`,
        );
        oneTabStop(check, control);
        const restAxe = await checkAxe(page, check);
        await frame('rest', {control, axe: restAxe});

        await page.keyboard.press('Tab');
        await settle(page);
        const entered = await readControls(page);
        const focused = entered.controls[0].segments.find(s => s.focused);
        check(
          focused?.value === 'grid',
          `Tab focused ${focused?.value ?? 'nothing'}`,
        );
        check(
          focused != null &&
            focused.outlineStyle !== 'none' &&
            focused.outlineWidth >= 2,
          `focus ring ${focused?.outline}`,
        );
        check(
          entered.controls[0].segments.find(s => s.checked === 'true')
            ?.value === 'grid',
          'Tab entry changed the value',
        );
        check(
          entered.layers.some(layer => layer.text.includes('navigate')),
          `keyboard hint ${JSON.stringify(entered.layers)}`,
        );
        const enteredAxe = await checkAxe(page, check);
        await frame('keyboard-entry', {focused, entered, axe: enteredAxe});

        // The next segment sits at the inline end: ArrowRight in LTR,
        // ArrowLeft in RTL.
        await page.keyboard.press(
          direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight',
        );
        await settle(page);
        const moved = await readControls(page);
        const checked = moved.controls[0].segments.find(
          s => s.checked === 'true',
        );
        check(checked?.value === 'list', `arrow selected ${checked?.value}`);
        check(checked?.focused === true, 'focus did not follow the selection');
        check(
          !moved.layers.some(layer => layer.text.includes('navigate')),
          'the hint stayed after an arrow press',
        );
        oneTabStop(check, moved.controls[0]);
        const movedAxe = await checkAxe(page, check);
        await frame('arrow-selected', {moved, axe: movedAxe});
      },
    });
  }
  cases.push({
    key: `sizes__${mode}__ltr`,
    group: 'sizes',
    story: SIZES_STORY,
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const {controls} = await readControls(page);
      const sizes = controls.map(control => control.size);
      const heights = controls.map(control => control.segments[0].box.height);
      check(sizes.join(' ') === 'sm md lg', `sizes ${sizes.join(' ')}`);
      check(
        heights[0] < heights[1] && heights[1] < heights[2],
        `segment heights ${heights.join(' ')}`,
      );
      const axe = await checkAxe(page, check);
      await frame('rest', {sizes, heights, axe});
    },
  });
  cases.push({
    key: `disabled__${mode}__ltr`,
    group: 'disabled with a reason',
    story: DISABLED_STORY,
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readControls(page);
      const [control] = rest.controls;
      check(control.disabled === 'true', `aria-disabled ${control.disabled}`);
      check(control.opacity === '0.5', `opacity ${control.opacity}`);
      oneTabStop(check, control);
      const restAxe = await checkAxe(page, check);
      await frame('rest', {control, axe: restAxe});

      await page.keyboard.press('Tab');
      await settle(page);
      const focused = await readControls(page);
      const segment = focused.controls[0].segments.find(s => s.focused);
      check(segment != null, 'Tab did not reach the disabled control');
      const reason = focused.layers.find(layer =>
        layer.text.includes('Choose a project'),
      );
      check(reason != null, `reason tooltip ${JSON.stringify(focused.layers)}`);
      check(
        reason != null &&
          (focused.controls[0].describedBy ?? '')
            .split(' ')
            .includes(reason.id),
        `reason not in aria-describedby: ${focused.controls[0].describedBy}`,
      );
      await page.keyboard.press('ArrowRight');
      await settle(page);
      const after = await readControls(page);
      check(
        after.controls[0].segments.find(s => s.checked === 'true')?.value ===
          control.segments.find(s => s.checked === 'true')?.value,
        'an arrow changed the value while disabled',
      );
      const focusedAxe = await checkAxe(page, check);
      await frame('keyboard-focus', {focused, axe: focusedAxe});
    },
  });
}

cases.push({
  key: 'default__light__ltr__hover',
  group: 'hover',
  story: DEFAULT_STORY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    const before = await readControls(page);
    await page.getByRole('radio', {name: 'Table'}).hover();
    await settle(page);
    const hovered = await readControls(page);
    const rest = before.controls[0].segments.find(s => s.value === 'table');
    const over = hovered.controls[0].segments.find(s => s.value === 'table');
    check(
      over?.checked === 'false',
      `hover selected the segment: ${over?.checked}`,
    );
    await frame('hover-unselected', {rest, over});
  },
});

for (const direction of ['ltr', 'rtl'] as const) {
  for (const story of [TRUNCATED_STORY, NARROW_STORY]) {
    cases.push({
      key: `${story.replace('core-segmentedcontrol--', '')}__light__${direction}__phone`,
      group: 'phone width',
      story,
      mode: 'light',
      direction,
      viewport: PHONE,
      run: async (page, check, frame) => {
        const state = await readControls(page);
        for (const control of state.controls) {
          check(
            control.box.left >= control.container.left - 0.5 &&
              control.box.right <= control.container.right + 0.5,
            `${control.name} overflows its container: ${JSON.stringify({box: control.box, container: control.container})}`,
          );
        }
        check(
          state.scroll.width <= state.scroll.client,
          `sideways page scroll ${JSON.stringify(state.scroll)}`,
        );
        const axe = await checkAxe(page, check);
        await frame('rest', {state, axe});
      },
    });
  }
}

cases.push({
  key: 'default__light__ltr__motion',
  group: 'motion on',
  story: DEFAULT_STORY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  motion: 'no-preference',
  run: async (page, check, frame) => {
    await page.getByRole('radio', {name: 'Table'}).click();
    await page.waitForTimeout(1000);
    await settle(page);
    const state = await readControls(page);
    check(
      state.controls[0].segments.find(s => s.checked === 'true')?.value ===
        'table',
      'a click did not select',
    );
    await frame('selected-after-slide', {state});
  },
});

cases.push({
  key: 'default__light__ltr__forced-colors',
  group: 'forced colors',
  story: DEFAULT_STORY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  forcedColors: true,
  run: async (page, check, frame) => {
    const state = await readControls(page);
    const [selected] = state.controls[0].segments.filter(
      s => s.checked === 'true',
    );
    const others = state.controls[0].segments.filter(s => s.checked !== 'true');
    check(
      selected != null &&
        others.every(other => other.background !== selected.background),
      `forced-colors selected paint ${JSON.stringify(state.controls[0].segments.map(s => s.background))}`,
    );
    await frame('rest', {state});
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
  holdsMotion = (item.motion ?? 'reduce') === 'reduce';
  await page.emulateMedia({
    colorScheme: item.mode,
    reducedMotion: item.motion ?? 'reduce',
    forcedColors: item.forcedColors ? 'active' : 'none',
  });
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
  const frames: {
    state: string;
    observed: unknown;
    file: string;
    sha256: string;
  }[] = [];
  const frame: FrameSink = async (state, observed) => {
    const screenshot = await page
      .locator('#storybook-root')
      .screenshot({animations: 'disabled'});
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
    // Play functions toggle, focus and scroll the viewports; read them only
    // after Storybook finishes the render, play included.
    await page.waitForFunction(
      () =>
        (window as StorybookPreviewWindow).__STORYBOOK_PREVIEW__?.currentRender
          ?.phase === 'finished',
    );
    await settle(page);
    sensors = await pageSensors(page);
    check(!sensors.storybookError, 'storybook error display');
    check(sensors.mode === item.mode, `mode ${sensors.mode}`);
    check(
      sensors.direction === item.direction,
      `direction ${sensors.direction}`,
    );
    check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
    check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
    check(
      sensors.reducedMotion === ((item.motion ?? 'reduce') === 'reduce'),
      `reduced motion ${sensors.reducedMotion}`,
    );
    check(
      sensors.forcedColors === (item.forcedColors ?? false),
      `forced colors ${sensors.forcedColors}`,
    );
    await item.run(page, check, frame);
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'SegmentedControl',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    mode: item.mode,
    theme: 'neutral',
    direction: item.direction,
    viewport: item.viewport,
    reducedMotion: item.motion ?? 'reduce',
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
