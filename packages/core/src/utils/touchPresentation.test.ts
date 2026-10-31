// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchPresentation.test.ts
 * @input Uses vitest, React Testing Library, react-dom/server and a
 *   query-aware matchMedia stub
 * @output The touch presentation's answers: touch from the primary pointer,
 *   compact from the width, both for presentations, the same answer on every
 *   engine; the server default and hints; live updates; the one-moment read;
 *   core's compact-touch media keys and iOS style-gate keys spelled and nested
 *   as the shared queries; the adaptive presentation reading them
 * @position Unit tests of packages/core/src/utils/touchPresentation.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {act, renderHook} from '@testing-library/react';
import {createElement, type ComponentProps, type ReactNode} from 'react';
import {renderToString} from 'react-dom/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  COMPACT_TOUCH_PRESENTATION_QUERY,
  useAdaptivePresentation,
} from '../hooks/useAdaptivePresentation';
import {reducedMotionKeys} from '../motion/reducedMotion.stylex';
import {DEFAULT_COMPACT_DEFINITION} from '../theme/themeAdaptations';
import {Theme, defineTheme} from '../theme';
import {
  COMPACT_QUERY,
  COMPACT_TOUCH_QUERY,
  IOS_SUPPORTS_QUERY,
  IOS_TOUCH_STYLE_KEYS,
  TOUCH_QUERY,
  readTouchPresentation,
  useTouchPresentation,
} from './touchPresentation';
import {touchKeys} from './touchPresentation.stylex';

/**
 * A device: what its primary pointer is, how big its viewport is, and
 * whether its engine is iOS WebKit (implements -webkit-touch-callout).
 */
const device = {coarse: false, width: 1280, height: 800, iosWebKit: false};
const listeners = new Set<() => void>();

/** Answers a media query list: `,` is or, `and` is and. */
function answer(query: string): boolean {
  return query.split(', ').some(alternative =>
    alternative.split(' and ').every(part => {
      if (part === '(pointer: coarse)') {
        return device.coarse;
      }
      const range = /^\((width|height) < (\d+)px\)$/.exec(part);
      if (range != null) {
        return device[range[1] as 'width' | 'height'] < Number(range[2]);
      }
      throw new Error(`unexpected query ${query}`);
    }),
  );
}

function setDevice(next: Partial<typeof device>): void {
  Object.assign(device, next);
  for (const listener of [...listeners]) {
    listener();
  }
}

beforeEach(() => {
  setDevice({coarse: false, width: 1280, height: 800, iosWebKit: false});
  vi.stubGlobal('CSS', {
    supports: (condition: string) =>
      condition === IOS_SUPPORTS_QUERY && device.iosWebKit,
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return answer(query);
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        listeners.delete(listener),
    })),
  );
});

afterEach(() => {
  listeners.clear();
  vi.unstubAllGlobals();
});

/**
 * The Levenshtein distance between two strings, or more than `limit` as soon
 * as it must exceed it: how many characters a spelling is off another.
 */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) {
    return limit + 1;
  }
  let previous = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    if (Math.min(...current) > limit) {
      return limit + 1;
    }
    previous = current;
  }
  return previous[b.length];
}

describe('touch presentation', () => {
  it('keys touch on the primary pointer and compact on the width', () => {
    const {result} = renderHook(() => useTouchPresentation());
    expect(result.current).toEqual({
      isTouch: false,
      isCompact: false,
    });
    // A tablet: a finger at any width.
    act(() => setDevice({coarse: true, width: 1024, height: 1366}));
    expect(result.current).toEqual({
      isTouch: true,
      isCompact: false,
    });
    // A narrowed desktop window: compact, still a mouse.
    act(() => setDevice({coarse: false, width: 600, height: 900}));
    expect(result.current).toEqual({
      isTouch: false,
      isCompact: true,
    });
    // A phone: both.
    act(() => setDevice({coarse: true, width: 390, height: 844}));
    expect(result.current).toEqual({
      isTouch: true,
      isCompact: true,
    });
  });

  it('answers the same on every engine: iOS WebKit and Android alike', () => {
    const {result} = renderHook(() => useTouchPresentation());
    // An Android phone: a finger, no -webkit-touch-callout.
    act(() => setDevice({coarse: true, width: 412, height: 915}));
    const android = result.current;
    // The same phone size in iOS WebKit gets the same answer.
    act(() => setDevice({iosWebKit: true}));
    expect(result.current).toEqual(android);
    expect(result.current).toEqual({isTouch: true, isCompact: true});
  });

  it('keeps one answer object while nothing changes', () => {
    const {result, rerender} = renderHook(() => useTouchPresentation());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('answers the server default, or the server hint, before hydration', () => {
    const Probe = (props: {hint?: boolean}) => {
      const presentation = useTouchPresentation(
        props.hint === true ? {isTouch: true, isCompact: true} : {},
      );
      return createElement(
        'span',
        null,
        `${presentation.isTouch}/${presentation.isCompact}`,
      );
    };
    setDevice({iosWebKit: true, coarse: true, width: 390, height: 844});
    expect(renderToString(createElement(Probe))).toContain('false/false');
    expect(renderToString(createElement(Probe, {hint: true}))).toContain(
      'true/true',
    );
  });

  it('is the theme compact definition: width below md or height below 500 (spec:AST-012 FR9)', () => {
    const {result} = renderHook(() => useTouchPresentation());
    // At the md point and taller than 500: not compact.
    act(() => setDevice({coarse: true, width: 768, height: 1024}));
    expect(result.current.isCompact).toBe(false);
    // One pixel narrower: compact.
    act(() => setDevice({coarse: true, width: 767, height: 1024}));
    expect(result.current.isCompact).toBe(true);
    // A phone in landscape: wide, but shorter than 500.
    act(() => setDevice({coarse: true, width: 852, height: 393}));
    expect(result.current.isCompact).toBe(true);
    // A wide, short window at exactly 500 tall: not compact.
    act(() => setDevice({coarse: true, width: 1024, height: 500}));
    expect(result.current.isCompact).toBe(false);
  });

  it('reads the conditions at one moment, and without a window', () => {
    setDevice({coarse: true, width: 390, height: 844});
    expect(readTouchPresentation(window, DEFAULT_COMPACT_DEFINITION)).toEqual({
      isTouch: true,
      isCompact: true,
    });
    expect(readTouchPresentation(null, DEFAULT_COMPACT_DEFINITION)).toEqual({
      isTouch: false,
      isCompact: false,
    });
  });

  it('holds the same keys the resolver defines', () => {
    expect(touchKeys.touch).toBe(`@media ${TOUCH_QUERY}`);
    expect(touchKeys.compact).toBe(`@media ${COMPACT_QUERY}`);
    expect(touchKeys.compactTouch).toBe(`@media ${COMPACT_TOUCH_QUERY}`);
    expect(touchKeys.iosSupports).toBe(`@supports ${IOS_SUPPORTS_QUERY}`);
    expect(IOS_TOUCH_STYLE_KEYS).toEqual([
      touchKeys.touch,
      touchKeys.iosSupports,
    ]);
  });

  it('keeps every touch and Reduce Motion key literal in core: no computed StyleX key', () => {
    // An imported defineConsts at-rule key compiles to a different StyleX
    // priority than the same literal (6000 vs 3200), which reorders the
    // cascade; core spells the keys and matches them to the constants.
    const root = path.resolve(__dirname, '..');
    const computed: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
            walk(full);
          }
        } else if (
          /\.(ts|tsx)$/.test(entry.name) &&
          !/\.test\.|\.spec\./.test(entry.name)
        ) {
          fs.readFileSync(full, 'utf8')
            .split('\n')
            .forEach((line, index) => {
              if (
                !/^\s*(\*|\/\/)/.test(line) &&
                /\[(touchKeys|reducedMotionKeys)\.[a-zA-Z]+\]\s*:/.test(line)
              ) {
                computed.push(`${path.relative(root, full)}:${index + 1}`);
              }
            });
        }
      }
    };
    walk(root);
    expect(computed).toEqual([]);
  });

  it('keeps every quoted at-rule key in core that names the pointer, the touch callout or a compact size, or that is a few characters off a reference spelling, one of the reference spellings', () => {
    // Every quoted string that starts with `@` is read, whatever its at-rule
    // is spelled. Two rules, so no drift depends on which character moved:
    // - one that names the pointer or the touch callout (any word of either
    //   query, any case), or a compact size with its breakpoint, is one of
    //   the resolver's own spellings or a query the presentation does not
    //   decide (a second pointer, a fine pointer, Reduce Motion split by
    //   pointer);
    // - one within three characters of any of those spellings, case aside,
    //   is that spelling exactly: a capital, a digit or a typo anywhere, in
    //   the at-rule, a feature or a value, fails.
    const pointerKeys = new Set<string>([
      touchKeys.touch,
      touchKeys.compactTouch,
      touchKeys.iosSupports,
      '@media (any-pointer: coarse)',
      '@media (pointer: fine)',
      reducedMotionKeys.fade,
      reducedMotionKeys.instant,
    ]);
    const references = new Set<string>([...pointerKeys, touchKeys.compact]);
    const lowered = [...references].map(reference => reference.toLowerCase());
    const root = path.resolve(__dirname, '..');
    const drifted: string[] = [];
    let pointerLiterals = 0;
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
            walk(full);
          }
        } else if (
          /\.(ts|tsx)$/.test(entry.name) &&
          !/\.(test|spec|stories)\./.test(entry.name)
        ) {
          const source = fs.readFileSync(full, 'utf8');
          for (const match of source.matchAll(/'(@[^'\n]*)'/g)) {
            const key = match[1];
            if (references.has(key)) {
              if (pointerKeys.has(key)) {
                pointerLiterals++;
              }
              continue;
            }
            const names =
              /pointer|coarse|fine|touch|callout/i.test(key) ||
              (/\b(width|height)\b/i.test(key) && /\b(768|500)px\b/.test(key));
            const lower = key.toLowerCase();
            const isNear = lowered.some(
              reference => editDistance(lower, reference, 3) <= 3,
            );
            if (names || isNear) {
              drifted.push(`${path.relative(root, full)}: ${key}`);
            }
          }
        }
      }
    };
    walk(root);
    expect(drifted).toEqual([]);
    // Core writes the touch key as a literal in many places.
    expect(pointerLiterals).toBeGreaterThan(50);
  });

  it('keeps every iOS gate in core spelled and nested as the resolver', () => {
    // The gate is the media query outside and the supports query inside; a
    // single supports query that names the pointer never matches anywhere.
    expect(IOS_TOUCH_STYLE_KEYS).toEqual([
      '@media (pointer: coarse)',
      '@supports (-webkit-touch-callout: none)',
    ]);
    const root = path.resolve(__dirname, '..');
    const problems: string[] = [];
    let gates = 0;
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
            walk(full);
          }
        } else if (
          /\.(ts|tsx)$/.test(entry.name) &&
          !/\.test\.|\.spec\./.test(entry.name) &&
          entry.name !== 'touchPresentation.ts' &&
          entry.name !== 'touchPresentation.stylex.ts'
        ) {
          const lines = fs.readFileSync(full, 'utf8').split('\n');
          lines.forEach((line, index) => {
            for (const match of line.matchAll(/'@supports ([^']*)'/g)) {
              const where = `${path.relative(root, full)}:${index + 1}`;
              if (match[1].includes('pointer')) {
                problems.push(`${where}: @supports ${match[1]} never matches`);
              }
              if (!match[1].includes('touch-callout')) {
                continue;
              }
              gates++;
              if (`@supports ${match[1]}` !== IOS_TOUCH_STYLE_KEYS[1]) {
                problems.push(`${where}: @supports ${match[1]}`);
              }
              const outer = lines
                .slice(0, index)
                .reverse()
                .find(previous => /'@(media|supports) /.test(previous));
              if (
                outer == null ||
                !outer.includes(`'${IOS_TOUCH_STYLE_KEYS[0]}'`)
              ) {
                problems.push(
                  `${where}: not inside ${IOS_TOUCH_STYLE_KEYS[0]}`,
                );
              }
            }
          });
        }
      }
    };
    walk(root);
    expect(problems).toEqual([]);
    // Core already gates its 16px input floor this way.
    expect(gates).toBeGreaterThan(0);
  });

  it('keeps every compact-touch media key in core spelled as the resolver', () => {
    // A style key that joins a coarse pointer with a width or height is a
    // presentation decision: it must be the shared query, not its own.
    const root = path.resolve(__dirname, '..');
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
            walk(full);
          }
        } else if (
          /\.(ts|tsx)$/.test(entry.name) &&
          !/\.test\.|\.spec\./.test(entry.name)
        ) {
          const source = fs.readFileSync(full, 'utf8');
          for (const match of source.matchAll(/'@media ([^']*)'/g)) {
            const query = match[1];
            if (
              query.includes('pointer: coarse') &&
              /\b(width|height)\b/.test(query)
            ) {
              found.push(`${path.relative(root, full)}: ${query}`);
            }
          }
        }
      }
    };
    walk(root);
    for (const entry of found) {
      expect(entry.slice(entry.indexOf(': ') + 2), entry).toBe(
        COMPACT_TOUCH_QUERY,
      );
    }
    expect(TOUCH_QUERY).toBe('(pointer: coarse)');
    expect(COMPACT_QUERY).toBe(DEFAULT_COMPACT_DEFINITION.query);
    expect(COMPACT_TOUCH_QUERY).toBe(
      DEFAULT_COMPACT_DEFINITION.coarsePointerQuery,
    );
  });

  it("follows the active theme's md point (spec:AST-012 FR9)", () => {
    const wideMd = defineTheme({
      name: 'wide-md-touch',
      adaptations: {widthBreakpoints: {md: 1000, lg: 1100}},
    });
    const wrapper = ({children}: {children: ReactNode}) =>
      createElement(
        Theme,
        {theme: wideMd} as ComponentProps<typeof Theme>,
        children,
      );
    setDevice({coarse: true, width: 900, height: 1024});
    // Under the default md point (768) this screen is not compact.
    const plain = renderHook(() => useAdaptivePresentation('adaptive'));
    expect(plain.result.current).toBe('popover');
    plain.unmount();
    // Under a theme whose md is 1000, the same screen is compact.
    const themed = renderHook(() => useAdaptivePresentation('adaptive'), {
      wrapper,
    });
    expect(themed.result.current).toBe('bottom-sheet');
    const touch = renderHook(() => useTouchPresentation(), {wrapper});
    expect(touch.result.current.isCompact).toBe(true);
  });

  it('is the query the adaptive popover-or-sheet presentation reads', () => {
    expect(COMPACT_TOUCH_PRESENTATION_QUERY).toBe(COMPACT_TOUCH_QUERY);
    const {result} = renderHook(() => useAdaptivePresentation('adaptive'));
    expect(result.current).toBe('popover');
    act(() => setDevice({coarse: true, width: 390, height: 844}));
    expect(result.current).toBe('bottom-sheet');
    // A phone in landscape too.
    act(() => setDevice({coarse: true, width: 852, height: 393}));
    expect(result.current).toBe('bottom-sheet');
    // A tablet at the md point keeps the anchored popover.
    act(() => setDevice({coarse: true, width: 768, height: 1024}));
    expect(result.current).toBe('popover');
  });
});
