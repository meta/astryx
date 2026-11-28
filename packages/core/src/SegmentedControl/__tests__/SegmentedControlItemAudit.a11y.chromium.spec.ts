// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit SegmentedControlItem

/**
 * @file SegmentedControlItemAudit.a11y.chromium.spec.ts
 * @input Exact-head SegmentedControl stories read per segment: rest and
 *   selected paint, keyboard focus, hover, icons, icon-only, sizes, a
 *   disabled segment, narrow containers and forced colors, in light and dark
 *   and both directions
 * @output Screenshots and fail-closed sensor receipts for the
 *   SegmentedControlItem whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for
 *   a SegmentedControlItem audit pull request
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

const EVIDENCE = path.resolve(
  'test-results/segmented-control-item-audit-evidence',
);
const DEFAULT_STORY = 'core-segmentedcontrol--default';
const ICONS_STORY = 'core-segmentedcontrol--with-icons';
const ICON_ONLY_STORY = 'core-segmentedcontrol--icon-only';
const SIZES_STORY = 'core-segmentedcontrol--size-variants';
const DISABLED_ITEM_STORY = 'core-segmentedcontrol--disabled-item';
const TRUNCATED_STORY = 'core-segmentedcontrol--truncated-labels';
const NARROW_STORY = 'core-segmentedcontrol--in-narrow-card';

type Mode = 'light' | 'dark';
/** `none` renders base tokens only; `neutral` is the Storybook default. */
type Theme = 'none' | 'neutral';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  story: string;
  mode: Mode;
  theme: Theme;
  direction: Direction;
  viewport: Viewport;
  motion?: 'reduce' | 'no-preference';
  forcedColors?: boolean;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 700};
const NARROW = {width: 320, height: 700};
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
      mode:
        document.documentElement.getAttribute('data-theme') ??
        document.documentElement.style.getPropertyValue('color-scheme'),
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

/** Every segment's semantics, paint and geometry, plus the group's lens. */
async function readSegments(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const groups = [
      ...document.querySelectorAll<HTMLElement>(
        '#storybook-root [role="radiogroup"]',
      ),
    ].map(group => {
      const lens = getComputedStyle(group, '::before');
      return {
        name: group.getAttribute('aria-label'),
        size: group.getAttribute('data-size'),
        lens: {
          visibility: lens.visibility,
          background: lens.backgroundColor,
          shadow: lens.boxShadow,
        },
        segments: [
          ...group.querySelectorAll<HTMLElement>('[role="radio"]'),
        ].map(segment => {
          const style = getComputedStyle(segment);
          const glyph = segment.querySelector('svg');
          const iconBox = glyph?.closest('button > span') ?? null;
          const label = segment.querySelector<HTMLElement>(
            ':scope > span:last-child',
          );
          const visibleLabel =
            label != null && label.querySelector('svg') == null ? label : null;
          return {
            value: segment.dataset.value,
            label: segment.getAttribute('aria-label'),
            text: visibleLabel?.textContent ?? null,
            checked: segment.getAttribute('aria-checked'),
            disabled: segment.getAttribute('aria-disabled'),
            target: segment.classList.contains('astryx-segmented-control-item'),
            dataSelected: segment.hasAttribute('data-selected'),
            dataDisabled: segment.hasAttribute('data-disabled'),
            type: segment.getAttribute('type'),
            tabIndex: segment.tabIndex,
            focused: document.activeElement === segment,
            outlineStyle: style.outlineStyle,
            outlineWidth: parseFloat(style.outlineWidth),
            background: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            shadow: style.boxShadow,
            color: style.color,
            fontWeight: style.fontWeight,
            fontSize: parseFloat(style.fontSize),
            cursor: style.cursor,
            box: box(segment),
            icon: iconBox == null ? null : box(iconBox),
            glyph: glyph == null ? null : box(glyph),
            labelBox: visibleLabel == null ? null : box(visibleLabel),
            labelCut:
              visibleLabel == null
                ? false
                : visibleLabel.scrollWidth > visibleLabel.clientWidth + 0.5,
          };
        }),
      };
    });
    return {
      groups,
      scroll: {
        width: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      },
    };
  });
}

type Segments = Awaited<ReturnType<typeof readSegments>>;
type Segment = Segments['groups'][number]['segments'][number];

function find(state: Segments, value: string) {
  for (const group of state.groups) {
    const segment = group.segments.find(item => item.value === value);
    if (segment != null) {
      return segment;
    }
  }
  return undefined;
}

function alphaOf(color: string) {
  const match = /rgba?\(([^)]+)\)/.exec(color);
  if (match == null) {
    return color === 'transparent' ? 0 : 1;
  }
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length > 3 ? Number(parts[3]) : 1;
}

/**
 * The selected segment paints an opaque surface, on itself or on the group's
 * lens. With base tokens it also casts the low shadow; the Neutral theme
 * removes that shadow and keeps the surface flat on the track.
 */
function raised(
  group: Segments['groups'][number],
  segment: Segment,
  theme: Theme,
) {
  const wantsShadow = theme === 'none';
  const own =
    alphaOf(segment.background) === 1 &&
    (!wantsShadow || segment.shadow !== 'none');
  const lens =
    group.lens.visibility === 'visible' &&
    alphaOf(group.lens.background) === 1 &&
    (!wantsShadow || group.lens.shadow !== 'none');
  return own || lens;
}

function semantics(check: Check, state: Segments) {
  check(state.groups.length > 0, 'no radiogroup on the page');
  for (const group of state.groups) {
    check(
      group.segments.length >= 2,
      `${group.name}: ${group.segments.length} segments`,
    );
    const checked = group.segments.filter(s => s.checked === 'true');
    check(checked.length <= 1, `${group.name}: ${checked.length} checked`);
    for (const segment of group.segments) {
      check(
        segment.target && segment.type === 'button',
        `${segment.value}: target ${segment.target} type ${segment.type}`,
      );
      check(
        (segment.text ?? segment.label ?? '').trim().length > 0,
        `${segment.value}: no name`,
      );
      check(
        segment.dataSelected === (segment.checked === 'true'),
        `${segment.value}: data-selected ${segment.dataSelected} aria-checked ${segment.checked}`,
      );
      check(
        segment.dataDisabled === (segment.disabled === 'true'),
        `${segment.value}: data-disabled ${segment.dataDisabled} aria-disabled ${segment.disabled}`,
      );
      check(
        segment.tabIndex === (segment.checked === 'true' ? 0 : -1),
        `${segment.value}: tabIndex ${segment.tabIndex}`,
      );
    }
  }
}

/**
 * WCAG 2.5.8 (AA): an enabled segment holds a 24 by 24 CSS px square, or
 * passes the spacing exception: a 24 px circle on its center meets no other
 * target and no other undersized target's circle. A disabled segment is not
 * a target, so it is neither checked nor counted as a neighbor.
 */
function targetSizeFailures(state: Segments) {
  const targets = state.groups.flatMap(group =>
    group.segments
      .filter(segment => segment.disabled !== 'true')
      .map(segment => ({group: group.name, segment})),
  );
  const undersized = (box: Segment['box']) =>
    box.width < 24 - 0.5 || box.height < 24 - 0.5;
  const center = (box: Segment['box']) => ({
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2,
  });
  const failures: string[] = [];
  for (const {group, segment} of targets) {
    if (!undersized(segment.box)) {
      continue;
    }
    const own = center(segment.box);
    const clear = targets.every(other => {
      if (other.segment === segment) {
        return true;
      }
      const box = other.segment.box;
      const dx = Math.max(box.left - own.x, 0, own.x - box.right);
      const dy = Math.max(box.top - own.y, 0, own.y - box.bottom);
      if (Math.hypot(dx, dy) < 12 - 0.01) {
        return false;
      }
      if (undersized(box)) {
        const theirs = center(box);
        return Math.hypot(theirs.x - own.x, theirs.y - own.y) >= 24 - 0.01;
      }
      return true;
    });
    if (!clear) {
      failures.push(
        `${group} ${segment.value}: target ${segment.box.width.toFixed(1)}x${segment.box.height.toFixed(1)} fails WCAG 2.5.8 and its spacing exception`,
      );
    }
  }
  return failures;
}

function targetSize(check: Check, state: Segments) {
  for (const failure of targetSizeFailures(state)) {
    check(false, failure);
  }
}

const cases: AuditCase[] = [];

const THEMED: [Theme, Direction][] = [
  ['neutral', 'ltr'],
  ['neutral', 'rtl'],
  ['none', 'ltr'],
];

for (const mode of ['light', 'dark'] as const) {
  for (const [theme, direction] of THEMED) {
    // Base tokens paint no page background, so they run in light mode only:
    // in dark mode the translucent track would sit on a white page.
    if (theme === 'none' && mode === 'dark') {
      continue;
    }
    cases.push({
      key: `default__${theme}__${mode}__${direction}`,
      group: 'rest and keyboard',
      story: DEFAULT_STORY,
      mode,
      theme,
      direction,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const rest = await readSegments(page);
        semantics(check, rest);
        const [group] = rest.groups;
        const grid = find(rest, 'grid');
        const list = find(rest, 'list');
        check(
          grid?.checked === 'true' && list?.checked === 'false',
          'grid is not the selected segment',
        );
        if (grid != null && list != null) {
          check(
            raised(group, grid, theme),
            `selected surface ${JSON.stringify({own: [grid.background, grid.shadow], lens: group.lens})}`,
          );
          check(
            alphaOf(list.background) === 0,
            `unselected segment paints ${list.background}`,
          );
          check(
            Number(grid.fontWeight) > Number(list.fontWeight),
            `font weight selected ${grid.fontWeight} unselected ${list.fontWeight}`,
          );
          check(
            grid.color !== list.color,
            `text color selected ${grid.color} unselected ${list.color}`,
          );
          check(
            grid.cursor === 'pointer' && list.cursor === 'pointer',
            `cursor ${grid.cursor} ${list.cursor}`,
          );
        }
        const restAxe = await checkAxe(page, check);
        await frame('rest', {rest, axe: restAxe});

        await page.keyboard.press('Tab');
        await settle(page);
        const focused = await readSegments(page);
        const segment = focused.groups[0].segments.find(s => s.focused);
        check(segment?.value === 'grid', `Tab focused ${segment?.value}`);
        check(
          segment != null &&
            segment.outlineStyle !== 'none' &&
            segment.outlineWidth >= 2,
          `focus ring ${segment?.outlineStyle} ${segment?.outlineWidth}`,
        );
        const focusAxe = await checkAxe(page, check);
        await frame('keyboard-focus', {segment, axe: focusAxe});
      },
    });
  }

  cases.push({
    key: `default__${mode}__ltr__hover`,
    group: 'hover',
    story: DEFAULT_STORY,
    mode,
    theme: 'neutral',
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readSegments(page);
      await page.getByRole('radio', {name: 'List'}).hover();
      await settle(page);
      const hovered = await readSegments(page);
      const before = find(rest, 'list');
      const over = find(hovered, 'list');
      check(over?.checked === 'false', 'hover selected the segment');
      check(
        over != null &&
          alphaOf(over.background) > 0 &&
          alphaOf(over.background) < 1,
        `hover tint is not a translucent overlay: ${over?.background}`,
      );
      await frame('hover-unselected', {before, over});

      await page.getByRole('radio', {name: 'Grid'}).hover();
      await settle(page);
      const selectedHover = await readSegments(page);
      const selectedRest = find(rest, 'grid');
      const selectedOver = find(selectedHover, 'grid');
      check(
        selectedOver?.background === selectedRest?.background &&
          selectedOver?.shadow === selectedRest?.shadow,
        `the selected segment changed paint on hover: ${selectedRest?.background} -> ${selectedOver?.background}`,
      );
      await frame('hover-selected', {selectedRest, selectedOver});
    },
  });

  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `with-icons__${mode}__${direction}`,
      group: 'icons',
      story: ICONS_STORY,
      mode,
      theme: 'neutral',
      direction,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const state = await readSegments(page);
        semantics(check, state);
        for (const segment of state.groups[0].segments) {
          const icon = segment.icon;
          const label = segment.labelBox;
          check(
            icon != null && label != null,
            `${segment.value}: icon ${icon != null} label ${label != null}`,
          );
          if (icon != null && label != null) {
            check(
              direction === 'ltr'
                ? icon.right <= label.left + 0.5
                : icon.left >= label.right - 0.5,
              `${segment.value}: icon is not at the label's inline start (${direction})`,
            );
            check(
              Math.abs(icon.width - 16) < 0.5 &&
                Math.abs(icon.height - 16) < 0.5,
              `${segment.value}: md icon box ${icon.width}x${icon.height}`,
            );
          }
        }
        const axe = await checkAxe(page, check);
        await frame('rest', {state, axe});
      },
    });
  }

  cases.push({
    key: `icon-only__${mode}__ltr`,
    group: 'icon-only',
    story: ICON_ONLY_STORY,
    mode,
    theme: 'neutral',
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const state = await readSegments(page);
      semantics(check, state);
      for (const segment of state.groups[0].segments) {
        check(
          segment.text == null && (segment.label ?? '').length > 0,
          `${segment.value}: visible text ${segment.text} aria-label ${segment.label}`,
        );
        check(
          segment.icon != null && Math.abs(segment.icon.width - 14) < 0.5,
          `${segment.value}: sm icon box ${segment.icon?.width}`,
        );
      }
      targetSize(check, state);
      const axe = await checkAxe(page, check);
      await frame('rest', {state, axe});
    },
  });

  for (const theme of ['none', 'neutral'] as const) {
    if (theme === 'none' && mode === 'dark') {
      continue;
    }
    cases.push({
      key: `sizes__${theme}__${mode}__ltr`,
      group: 'sizes',
      story: SIZES_STORY,
      mode,
      theme,
      direction: 'ltr',
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const state = await readSegments(page);
        semantics(check, state);
        const heights = state.groups.map(g => g.segments[0].box.height);
        const fonts = state.groups.map(g => g.segments[0].fontSize);
        check(
          state.groups.map(g => g.size).join(' ') === 'sm md lg',
          `sizes ${state.groups.map(g => g.size).join(' ')}`,
        );
        // Base tokens: the element height minus 4 px. The Neutral theme
        // takes 8 px for a roomier track inset.
        const expected = theme === 'none' ? '24 28 32' : '20 24 28';
        check(
          heights.map(h => Math.round(h)).join(' ') === expected,
          `segment heights ${heights.join(' ')}, expected ${expected}`,
        );
        check(fonts[0] < fonts[1], `sm font ${fonts[0]} md font ${fonts[1]}`);
        targetSize(check, state);
        const axe = await checkAxe(page, check);
        await frame('rest', {heights, fonts, state, axe});
      },
    });
  }

  cases.push({
    key: `disabled-item__${mode}__ltr`,
    group: 'disabled segment',
    story: DISABLED_ITEM_STORY,
    mode,
    theme: 'neutral',
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readSegments(page);
      semantics(check, rest);
      const weekly = find(rest, 'weekly');
      const daily = find(rest, 'daily');
      check(weekly?.disabled === 'true', `aria-disabled ${weekly?.disabled}`);
      check(
        weekly != null && daily != null && weekly.color !== daily.color,
        `disabled text color ${weekly?.color} equals enabled ${daily?.color}`,
      );
      check(weekly?.cursor === 'default', `disabled cursor ${weekly?.cursor}`);
      const axe = await checkAxe(page, check);
      await frame('rest', {weekly, daily, axe});

      const segment = page.getByRole('radio', {name: 'Weekly'});
      await segment.hover();
      await settle(page);
      const hovered = await readSegments(page);
      const over = find(hovered, 'weekly');
      check(
        over?.background === weekly?.background &&
          over?.backgroundImage === weekly?.backgroundImage,
        `disabled segment painted on hover: ${weekly?.background} -> ${over?.background}`,
      );
      await segment.click({force: true});
      await settle(page);
      const clicked = await readSegments(page);
      check(
        find(clicked, 'weekly')?.checked === 'false' &&
          find(clicked, 'hourly')?.checked === 'true',
        'a click selected the disabled segment',
      );
      await frame('hover-and-click', {over, clicked});
    },
  });
}

// The narrow-card story lays out fixed 320, 390 and 480 px cards, so it runs
// at the phone width; the truncated-labels story runs at 320 px.
const NARROW_CASES = [
  [TRUNCATED_STORY, NARROW],
  [NARROW_STORY, PHONE],
] as const;

for (const direction of ['ltr', 'rtl'] as const) {
  for (const [story, viewport] of NARROW_CASES) {
    cases.push({
      key: `${story.replace('core-segmentedcontrol--', '')}__light__${direction}__${viewport.width}`,
      group: 'narrow',
      story,
      mode: 'light',
      theme: 'neutral',
      direction,
      viewport,
      run: async (page, check, frame) => {
        const state = await readSegments(page);
        semantics(check, state);
        targetSize(check, state);
        check(
          state.scroll.width <= state.scroll.client,
          `sideways page scroll ${JSON.stringify(state.scroll)}`,
        );
        const cut = state.groups.flatMap(g =>
          g.segments.filter(s => s.labelCut).map(s => s.value),
        );
        check(cut.length > 0, 'no label is cut at this width');
        const axe = await checkAxe(page, check);
        await frame('rest', {state, cut, axe});
      },
    });
  }
}

// A container narrower than the segments' labels: every size truncates. A
// labelled `sm` segment pads 8 px a side, so it can shrink under 24 px (the
// AR2 gap, recorded, not asserted); `md` and `lg` pad 12 px a side.
cases.push({
  key: 'sizes__neutral__light__ltr__squeezed',
  group: 'narrow',
  story: SIZES_STORY,
  mode: 'light',
  theme: 'neutral',
  direction: 'ltr',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    await page.evaluate(() => {
      for (const group of document.querySelectorAll<HTMLElement>(
        '#storybook-root [role="radiogroup"]',
      )) {
        (group.parentElement as HTMLElement).style.width = '60px';
      }
    });
    await settle(page);
    const state = await readSegments(page);
    semantics(check, state);
    const bySize = Object.fromEntries(
      state.groups.map(g => [g.size, g.segments.map(s => s.box.width)]),
    );
    for (const size of ['md', 'lg']) {
      const widths: number[] = bySize[size] ?? [];
      check(
        widths.length > 0 && widths.every(width => width >= 24 - 0.5),
        `${size} segment widths ${widths.join(' ')}`,
      );
    }
    const smallFailures = targetSizeFailures({
      ...state,
      groups: state.groups.filter(g => g.size === 'sm'),
    });
    await frame('squeezed', {bySize, smallFailures, state});
  },
});

cases.push({
  key: 'default__light__ltr__forced-colors',
  group: 'forced colors',
  story: DEFAULT_STORY,
  mode: 'light',
  theme: 'neutral',
  direction: 'ltr',
  viewport: DESKTOP,
  forcedColors: true,
  run: async (page, check, frame) => {
    const state = await readSegments(page);
    const highlight = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'Highlight';
      probe.style.color = 'HighlightText';
      probe.style.forcedColorAdjust = 'none';
      document.body.append(probe);
      const style = getComputedStyle(probe);
      const colors = {background: style.backgroundColor, text: style.color};
      probe.remove();
      return colors;
    });
    const grid = find(state, 'grid');
    const others = state.groups[0].segments.filter(s => s.value !== 'grid');
    check(
      grid?.background === highlight.background &&
        grid?.color === highlight.text,
      `selected forced colors ${grid?.background}/${grid?.color} expected ${highlight.background}/${highlight.text}`,
    );
    check(
      others.every(other => other.background !== grid?.background),
      `an unselected segment paints the selected color`,
    );
    await frame('rest', {state, highlight});
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
    // An open popover layer renders outside the story root, so the frame
    // covers it too.
    const clip = await page.evaluate(() => {
      const boxes = [
        document.querySelector('#storybook-root'),
        ...document.querySelectorAll('[popover]:popover-open'),
      ]
        .filter(element => element != null)
        .map(element => element.getBoundingClientRect());
      const left = Math.max(0, Math.min(...boxes.map(box => box.left)));
      const top = Math.max(0, Math.min(...boxes.map(box => box.top)));
      const right = Math.max(...boxes.map(box => box.right));
      const bottom = Math.max(...boxes.map(box => box.bottom));
      return {x: left, y: top, width: right - left, height: bottom - top};
    });
    const screenshot = await page.screenshot({clip, animations: 'disabled'});
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
    component: 'SegmentedControlItem',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    mode: item.mode,
    theme: item.theme,
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
