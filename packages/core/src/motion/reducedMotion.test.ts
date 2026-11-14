// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotion.test.ts
 * @input reducedMotion.ts, reducedMotion.stylex.ts, the timing table, and
 *   every StyleX source file in core
 * @output Proof of the Reduced Motion policy beside the animator. Its fade is
 *   200 ms at most on a coarse pointer or touch release, else at once. Its dip
 *   lands a change on its own timeline. Its CSS constants match the table, and
 *   every StyleX key splitting Reduce Motion by pointer spells the two queries.
 * @position Testing for /packages/core/src/motion/reducedMotion.ts
 */

import {readdirSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {fakeAnimate} from './__tests__/fakeWebAnimation';
import {
  REDUCED_MOTION_FADE_QUERY,
  REDUCED_MOTION_INSTANT_QUERY,
  playReducedMotionDip,
  reducedMotionFade,
} from './reducedMotion';
import {
  reducedMotionFadeConsts,
  reducedMotionKeys,
} from './reducedMotion.stylex';
import {timing} from './uikit/timing';

/** The person's settings, through `matchMedia`: no option overrides them. */
function settings(reduced: boolean, coarse: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion')
      ? reduced
      : query.includes('pointer: coarse')
        ? coarse
        : false,
    media: query,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * A theme mark's twin key, as a component writes it; Prettier may wrap a long
 * one across lines.
 */
const TWIN =
  /stylex\.when\.ancestor\(\s*'\[data-astryx-reduced-motion\]',\s*reducedMotionScope,?\s*\)/g;

/**
 * The key nested in each kind of arm's twin. It keeps the arm's pointer split
 * (DR2, DR3) and puts the twin, like the arm, above the element's default and
 * pseudo-class styles and below its hover-guarded ones: a bare twin would sit
 * below them all.
 */
const TWIN_KEYS: Record<string, string> = {
  '@media (prefers-reduced-motion: reduce)': "'@media all'",
  [reducedMotionKeys.fade]: "'@media (pointer: coarse)'",
  [reducedMotionKeys.instant]: "'@media (not (pointer: coarse))'",
};

/**
 * Files whose Reduce Motion styles do not key their twins on the mark yet.
 * Each family's pull request takes its own off; a listed file whose arms all
 * have their twins fails, so the list only shrinks.
 */
const PENDING_TWINS = new Set<string>([
  'Banner/Banner.tsx',
  'BottomSheet/BottomSheet.tsx',
  'BottomSheet/BottomSheetPanel.tsx',
  'Button/Button.tsx',
  'Calendar/styles.ts',
  'Carousel/Carousel.tsx',
  'Chat/ChatDictationButton.tsx',
  'Chat/ChatLayoutScrollButton.tsx',
  'Chat/ChatMessageMetadata.tsx',
  'Chat/ChatToolCalls.tsx',
  'ClickableCard/ClickableCard.tsx',
  'CodeBlock/CodeBlock.tsx',
  'ComplexSelector/ComplexSelector.tsx',
  'DateInput/TouchDateField.tsx',
  'DateInput/Wheel.tsx',
  'Dialog/Dialog.tsx',
  'Drawer/Drawer.tsx',
  'Field/PanelSearchInput.tsx',
  'Field/inputStyles.stylex.ts',
  'FileInput/FileInput.tsx',
  'Indicator/CheckboxIndicator.tsx',
  'Indicator/RadioIndicator.tsx',
  'Layer/layerAnimations.stylex.ts',
  'Markdown/Markdown.tsx',
  'MobileNav/MobileNav.tsx',
  'Overlay/OverlayScrim.tsx',
  'ProgressBar/ProgressBar.tsx',
  'SelectableCard/SelectableCard.tsx',
  'Selector/Selector.tsx',
  'SideNav/SideNavCollapseButton.tsx',
  'SideNav/SideNavItem.tsx',
  'Skeleton/Skeleton.tsx',
  'Slider/Slider.tsx',
  'Spinner/spinnerRotor.ts',
  'StatusDot/StatusDot.tsx',
  'Stepper/Step.tsx',
  'Switch/Switch.tsx',
  'TabList/TabList.tsx',
  'Thumbnail/Thumbnail.tsx',
  'Toast/Toast.tsx',
  'Toast/ToastViewport.tsx',
  'TopNav/TopNavMegaMenu.tsx',
  'hooks/containerReveal.stylex.ts',
  'hooks/useEntryAnimation.ts',
  'privateAttributes/press.stylex.ts',
  'utils/interactionOverlay.stylex.ts',
]);

/**
 * Files that honour the mark through its custom property instead, in the
 * arm's own default value, where a selector cannot carry the value.
 */
const KEYED_BY_PROPERTY: Record<string, string> = {};

/**
 * Files that read the Reduce Motion setting from `matchMedia` and a theme's
 * mark beside it: the shared readers, and code that reads the mark's custom
 * property.
 */
const SETTING_READERS_WITH_MARK = new Set<string>([
  'hooks/useReducesMotion.ts',
  'motion/animator.ts',
]);

/**
 * Files whose script reads of the setting do not read the mark yet. Each pairs
 * with its component's Reduce Motion styles, so it converts in the same
 * family's pull request as their twins; a listed file that no longer reads the
 * setting raw fails, so the list only shrinks.
 */
const PENDING_SETTING_READERS = new Set<string>([
  'BottomSheet/BottomSheetPanel.tsx',
  'BottomSheet/useMobileKeyboard.ts',
  'BottomSheet/useSheetGestures.ts',
  'Carousel/Carousel.tsx',
  'keyboard/useMobileKeyboard.ts',
  'utils/pressFeedback.ts',
]);

/** A read of the setting written out as the query. */
const RAW_SETTING_READ =
  /(matchMedia|useMediaQuery)\(\s*'\(prefers-reduced-motion: reduce\)'/;

/**
 * A script read of the setting, straight from the media query: written out, or
 * through a constant the file holds the query in.
 */
function readsSettingRaw(source: string): boolean {
  if (RAW_SETTING_READ.test(source)) {
    return true;
  }
  return [
    ...source.matchAll(/const (\w+) =\s*'\(prefers-reduced-motion: reduce\)/g),
  ].some(([, name]) =>
    new RegExp(`(matchMedia|useMediaQuery)\\(\\s*${name}\\b`).test(source),
  );
}

/** A read of a theme's mark, direct or through the shared readers. */
const MARK_READ =
  /themeReducesMotion|--_astryx-reduced-motion|reducesMotion\(|useReducesMotion/;

/** Every core source file outside tests and stories, by its path under src/. */
function coreSources(): {file: string; source: string}[] {
  const root = resolve(__dirname, '..');
  const sources: {file: string; source: string}[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '__tests__') {
          walk(path);
        }
      } else if (
        /\.tsx?$/.test(entry.name) &&
        !/\.(test|spec|stories)\.tsx?$/.test(entry.name)
      ) {
        sources.push({
          file: path.slice(root.length + 1).replace(/\\/g, '/'),
          source: readFileSync(path, 'utf8'),
        });
      }
    }
  };
  walk(root);
  return sources;
}

/** `source` with string contents and comments blanked, offsets kept. */
function blankStringsAndComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && (next === '/' || next === '*')) {
      const close = next === '/' ? '\n' : '*/';
      const found = source.indexOf(close, i + 2);
      const stop =
        found === -1 ? source.length : found + (next === '*' ? 2 : 0);
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) {
        j += source[j] === '\\' ? 2 : 1;
      }
      out +=
        c +
        source.slice(i + 1, j).replace(/[^\n]/g, ' ') +
        (j < source.length ? c : '');
      i = j + 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** The object literal's span around `index`, in blanked source. */
function enclosingObject(blanked: string, index: number): [number, number] {
  let depth = 0;
  let start = 0;
  for (let i = index; i >= 0; i--) {
    if (blanked[i] === '}') {
      depth++;
    } else if (blanked[i] === '{' && depth-- === 0) {
      start = i;
      break;
    }
  }
  return [start, closingBrace(blanked, start)];
}

function closingBrace(blanked: string, open: number): number {
  let depth = 0;
  for (let i = open; i < blanked.length; i++) {
    if (blanked[i] === '{') {
      depth++;
    } else if (blanked[i] === '}' && --depth === 0) {
      return i;
    }
  }
  return blanked.length - 1;
}

/** Each Reduce Motion arm in `source` lacking its twin, by line. */
function armsWithoutTwins(source: string): string[] {
  const blanked = blankStringsAndComments(source);
  const kinds = new Map<number, string>();
  for (const m of source.matchAll(
    /'(@media \(prefers-reduced-motion: reduce\)[^']*)'\s*:/g,
  )) {
    // An arm in a comment is an example, not a style.
    if (blanked[m.index] === "'") {
      kinds.set(m.index, m[1]);
    }
  }
  for (const def of source.matchAll(
    /const (\w+) =\s*'(@media \(prefers-reduced-motion: reduce\)[^']*)'/g,
  )) {
    for (const m of source.matchAll(new RegExp(`\\[${def[1]}\\]\\s*:`, 'g'))) {
      if (blanked[m.index] === '[') {
        kinds.set(m.index, def[2]);
      }
    }
  }
  const missing: string[] = [];
  for (const [index, arm] of kinds) {
    const line = source.slice(0, index).split('\n').length;
    const want = TWIN_KEYS[arm];
    if (want === undefined) {
      missing.push(`line ${line}: an arm no twin is defined for (${arm})`);
      continue;
    }
    const [start, end] = enclosingObject(blanked, index);
    TWIN.lastIndex = start;
    const twinKey = TWIN.exec(source);
    if (twinKey === null || twinKey.index > end) {
      missing.push(`line ${line}: no twin beside ${arm}`);
      continue;
    }
    const open = blanked.indexOf('{', twinKey.index + twinKey[0].length);
    const twin = source.slice(open, closingBrace(blanked, open) + 1);
    if (open === -1 || open > end || !twin.includes(want)) {
      missing.push(`line ${line}: the twin beside ${arm} lacks ${want}`);
    }
  }
  return missing;
}

describe('reducedMotionFade', () => {
  it('is null when motion is not reduced', () => {
    settings(false, true);
    expect(reducedMotionFade(null)).toBeNull();
  });

  it('fades 200 ms at most on easeInOut on a coarse pointer', () => {
    settings(true, true);
    const fade = reducedMotionFade(null);
    expect(fade).toEqual({
      duration: timing.reducedMotionCrossFadeMs,
      easing: 'cubic-bezier(0.42, 0, 0.58, 1)',
    });
    expect(fade?.duration).toBeGreaterThan(0);
    expect(fade?.duration).toBeLessThanOrEqual(200);
  });

  it('completes at once on any other pointer, unless a touch release started it', () => {
    settings(true, false);
    expect(reducedMotionFade(null)).toEqual({duration: 0, easing: 'linear'});
    expect(reducedMotionFade(null, {touchRelease: true})?.duration).toBe(
      timing.reducedMotionCrossFadeMs,
    );
  });
});

describe('playReducedMotionDip', () => {
  const fade = {duration: 200, easing: 'cubic-bezier(0.42, 0, 0.58, 1)'};

  function startDip(from?: number) {
    const element = document.createElement('div');
    const {animate, animations} = fakeAnimate();
    element.animate = animate;
    const land = vi.fn();
    const dip = playReducedMotionDip(element, fade, land, from);
    return {animations, land, dip};
  }

  it('fades out over half the fade, and holds at 0 until the change lands', () => {
    const {animations} = startDip();
    expect(animations).toHaveLength(1);
    const [fadeOut] = animations;
    expect(fadeOut.keyframes.map(frame => frame.opacity)).toEqual([1, 0]);
    expect(fadeOut.keyframes[0].easing).toBe(fade.easing);
    expect(fadeOut.options).toMatchObject({duration: 100, fill: 'forwards'});
  });

  it('lands the change when the fade-out ends, however late, and never on a timer', async () => {
    vi.useFakeTimers();
    try {
      const {animations, land} = startDip();
      // A main thread held far past the middle: no timer lands the change.
      vi.advanceTimersByTime(10_000);
      expect(land).not.toHaveBeenCalled();
      animations[0].finish();
      await Promise.resolve();
      expect(land).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fades back in only after the change, from 0, over the other half', async () => {
    const {animations, land} = startDip();
    land.mockImplementation(() => {
      // The fade-in has not started while the change lands.
      expect(animations).toHaveLength(1);
    });
    animations[0].finish();
    await Promise.resolve();
    expect(land).toHaveBeenCalledOnce();
    expect(animations).toHaveLength(2);
    const fadeIn = animations[1];
    expect(fadeIn.keyframes.map(frame => frame.opacity)).toEqual([0, 1]);
    expect(fadeIn.keyframes[0].easing).toBe(fade.easing);
    expect(fadeIn.options).toMatchObject({duration: 100});
    // The fade-in holds the opacity now, so the held 0 goes.
    expect(animations[0].cancel).toHaveBeenCalled();
  });

  /** A dip whose fade-out started at 1000 ms, and the clock its landing reads. */
  async function landAt(clockAfterLanding: number) {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1100);
    const element = document.createElement('div');
    const {animate, animations} = fakeAnimate();
    element.animate = animate;
    // The landing's own work moves the clock.
    playReducedMotionDip(element, fade, () => {
      clock.mockReturnValue(clockAfterLanding);
    });
    animations[0].animation.startTime = 1000;
    animations[0].finish();
    await Promise.resolve();
    clock.mockRestore();
    return animations;
  }

  it('starts the fade-in where the fade-out ended, counting the landing', async () => {
    // Due at 1100 ms; the landing ran until 1140 ms. The fade-in is 40 ms in.
    const animations = await landAt(1140);
    expect(animations[1].animation.startTime).toBe(1100);
  });

  it('starts an on-time fade-in on time, and after a long stall still plays half of it', async () => {
    expect((await landAt(1100))[1].animation.startTime).toBe(1100);
    const stalled = await landAt(1500);
    expect(stalled[1].animation.startTime).toBe(1450);
    // That start is after the frame that runs the landing: until then, the
    // fade-in holds 0, so the change does not show.
    expect(stalled[1].options).toMatchObject({fill: 'backwards'});
  });

  it('leaves a fade-in to start on its own when the fade-out has no start time', async () => {
    const {animations} = startDip();
    animations[0].finish();
    await Promise.resolve();
    expect(animations[1].animation.startTime).toBeNull();
  });

  it('starts the fade-out where the element is (DR2)', () => {
    const {animations} = startDip(0.5);
    expect(animations[0].keyframes.map(frame => frame.opacity)).toEqual([
      0.5, 0,
    ]);
  });

  it('lands nothing once cancelled, and stops both fades', async () => {
    const {animations, land, dip} = startDip();
    dip.cancel();
    expect(animations[0].cancel).toHaveBeenCalled();
    animations[0].finish();
    await Promise.resolve();
    expect(land).not.toHaveBeenCalled();
    expect(animations).toHaveLength(1);
  });
});

describe('the CSS side of the policy', () => {
  it('holds the same fade as the table', () => {
    expect(reducedMotionFadeConsts.duration).toBe(
      `${timing.reducedMotionCrossFadeMs}ms`,
    );
    expect(reducedMotionFadeConsts.easing).toBe(
      `cubic-bezier(${timing.curves.move.join(', ')})`,
    );
  });

  it('spells the two media keys from the queries', () => {
    expect(reducedMotionKeys.fade).toBe(`@media ${REDUCED_MOTION_FADE_QUERY}`);
    expect(reducedMotionKeys.instant).toBe(
      `@media ${REDUCED_MOTION_INSTANT_QUERY}`,
    );
  });

  it('every key that splits Reduce Motion by pointer is one of the two constants, spelled exactly', () => {
    const allowed = new Set<string>([
      reducedMotionKeys.fade,
      reducedMotionKeys.instant,
    ]);
    const root = resolve(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '__tests__') {
            walk(path);
          }
        } else if (
          /\.tsx?$/.test(entry.name) &&
          !/\.(test|spec|stories)\.tsx?$/.test(entry.name)
        ) {
          for (const match of readFileSync(path, 'utf8').matchAll(
            /'(@media[^']*prefers-reduced-motion: reduce[^']*pointer[^']*)'/g,
          )) {
            if (!allowed.has(match[1])) {
              offenders.push(`${path.slice(root.length)}: ${match[1]}`);
            }
          }
          // A constant as a computed key lands in a later priority layer.
          if (
            !/[/\\]motion[/\\]reducedMotion\.ts$/.test(path) &&
            /\[reducedMotionKeys\.(fade|instant)\]/.test(
              readFileSync(path, 'utf8'),
            )
          ) {
            offenders.push(
              `${path.slice(root.length)}: a computed reducedMotionKeys key`,
            );
          }
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
  it("every Reduce Motion arm has its twin on a theme's mark, at the arm's own pointer split", () => {
    const offenders: string[] = [];
    const twinned: string[] = [];
    for (const {file, source} of coreSources()) {
      const missing = armsWithoutTwins(source);
      if (file in KEYED_BY_PROPERTY) {
        if (!source.includes('--_astryx-reduced-motion')) {
          offenders.push(
            `${file}: listed as keyed by the property, but never reads it`,
          );
        }
      } else if (PENDING_TWINS.has(file)) {
        if (missing.length === 0) {
          twinned.push(file);
        }
      } else {
        offenders.push(...missing.map(miss => `${file} ${miss}`));
      }
    }
    expect(offenders).toEqual([]);
    // A file that has its twins comes off the pending list.
    expect(twinned).toEqual([]);
  });

  it("every script read of the Reduce Motion setting also reads a theme's mark", () => {
    const offenders: string[] = [];
    const converted: string[] = [];
    for (const {file, source} of coreSources()) {
      const readsSetting = readsSettingRaw(source);
      if (SETTING_READERS_WITH_MARK.has(file)) {
        if (!readsSetting || !MARK_READ.test(source)) {
          offenders.push(
            `${file}: listed as reading the setting and the mark, but does not`,
          );
        }
      } else if (PENDING_SETTING_READERS.has(file)) {
        if (!readsSetting) {
          converted.push(file);
        }
      } else if (readsSetting) {
        offenders.push(
          `${file}: reads the setting without the mark; read reducesMotion(element) or useReducesMotion()`,
        );
      }
    }
    expect(offenders).toEqual([]);
    // A file that reads the mark comes off the pending list.
    expect(converted).toEqual([]);
  });
});
