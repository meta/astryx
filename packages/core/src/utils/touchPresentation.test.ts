// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchPresentation.test.ts
 * @input Uses vitest, React Testing Library, react-dom/server and a
 *   query-aware matchMedia stub
 * @output The touch presentation's answers: touch from the primary pointer,
 *   compact from the width, both for presentations, the iOS idiom from the
 *   engine and the pointer; the server default and hints; live updates; the
 *   one-moment read; the motion choice; core's compact-touch media keys and
 *   iOS gate keys spelled and nested as the shared queries; the adaptive
 *   presentation reading them
 * @position Unit tests of packages/core/src/utils/touchPresentation.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {act, renderHook} from '@testing-library/react';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  COMPACT_TOUCH_PRESENTATION_QUERY,
  useAdaptivePresentation,
} from '../hooks/useAdaptivePresentation';
import {
  COMPACT_QUERY,
  COMPACT_TOUCH_QUERY,
  IOS_SUPPORTS_QUERY,
  IOS_TOUCH_STYLE_KEYS,
  TOUCH_QUERY,
  readTouchPresentation,
  useMotionPresentation,
  useTouchIdiom,
  useTouchPresentation,
} from './touchPresentation';

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

describe('touch presentation', () => {
  it('keys touch on the primary pointer and compact on the width', () => {
    const {result} = renderHook(() => useTouchPresentation());
    expect(result.current).toEqual({
      isTouch: false,
      isCompact: false,
      isCompactTouch: false,
      idiom: 'default',
    });
    // A tablet: a finger at any width.
    act(() => setDevice({coarse: true, width: 1024, height: 1366}));
    expect(result.current).toEqual({
      isTouch: true,
      isCompact: false,
      isCompactTouch: false,
      idiom: 'default',
    });
    // A narrowed desktop window: compact, still a mouse.
    act(() => setDevice({coarse: false, width: 600, height: 900}));
    expect(result.current).toEqual({
      isTouch: false,
      isCompact: true,
      isCompactTouch: false,
      idiom: 'default',
    });
    // A phone: both.
    act(() => setDevice({coarse: true, width: 390, height: 844}));
    expect(result.current).toEqual({
      isTouch: true,
      isCompact: true,
      isCompactTouch: true,
      idiom: 'default',
    });
  });

  it('is the iOS idiom only for iOS WebKit under a finger', () => {
    const {result} = renderHook(() => ({
      presentation: useTouchPresentation(),
      idiom: useTouchIdiom(),
      motion: useMotionPresentation(),
    }));
    // An Android phone: a finger, no -webkit-touch-callout.
    act(() => setDevice({coarse: true, width: 412, height: 915}));
    expect(result.current.presentation.idiom).toBe('default');
    expect(result.current.idiom).toBe('default');
    expect(result.current.motion).toBe('theme');
    // Desktop Safari: the engine is WebKit, but not iOS's, and a mouse.
    act(() => setDevice({coarse: false, width: 1440, height: 900}));
    expect(result.current.idiom).toBe('default');
  });

  it('follows the pointer live in iOS WebKit', () => {
    setDevice({iosWebKit: true, coarse: true, width: 390, height: 844});
    const {result} = renderHook(() => ({
      presentation: useTouchPresentation(),
      idiom: useTouchIdiom(),
      motion: useMotionPresentation(),
    }));
    expect(result.current.presentation.idiom).toBe('ios');
    expect(result.current.idiom).toBe('ios');
    expect(result.current.motion).toBe('uikit');
    // An iPad docks a trackpad: its primary pointer turns fine.
    act(() => setDevice({coarse: false, width: 1024, height: 1366}));
    expect(result.current.presentation.idiom).toBe('default');
    expect(result.current.idiom).toBe('default');
    expect(result.current.motion).toBe('theme');
    act(() => setDevice({coarse: true}));
    expect(result.current.idiom).toBe('ios');
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
        props.hint === true ? {isCompact: true, idiom: 'ios'} : {},
      );
      return createElement(
        'span',
        null,
        `${presentation.isTouch}/${presentation.isCompactTouch}/${presentation.idiom}/${useTouchIdiom(props.hint === true ? 'ios' : 'default')}/${useMotionPresentation(props.hint)}`,
      );
    };
    setDevice({iosWebKit: true, coarse: true, width: 390, height: 844});
    expect(renderToString(createElement(Probe))).toContain(
      'false/false/default/default/theme',
    );
    expect(renderToString(createElement(Probe, {hint: true}))).toContain(
      'true/true/ios/ios/uikit',
    );
  });

  it('approximates UIKit size classes with a width and a height', () => {
    const {result} = renderHook(() => useTouchPresentation());
    // iPad mini in portrait: regular in UIKit, not compact here.
    act(() => setDevice({coarse: true, width: 744, height: 1133}));
    expect(result.current.isCompact).toBe(false);
    // iPhone in landscape: compact in UIKit and here.
    act(() => setDevice({coarse: true, width: 852, height: 393}));
    expect(result.current.isCompact).toBe(true);
    // iPad in Slide Over: compact in UIKit and here.
    act(() => setDevice({coarse: true, width: 375, height: 1000}));
    expect(result.current.isCompact).toBe(true);
    // The known miss: a Max-size iPhone in landscape is regular in UIKit.
    act(() => setDevice({coarse: true, width: 932, height: 430}));
    expect(result.current.isCompact).toBe(true);
  });

  it('reads the conditions at one moment, and without a window', () => {
    setDevice({coarse: true, width: 390, height: 844});
    expect(readTouchPresentation()).toEqual({
      isTouch: true,
      isCompact: true,
      isCompactTouch: true,
      idiom: 'default',
    });
    setDevice({iosWebKit: true});
    expect(readTouchPresentation().idiom).toBe('ios');
    expect(readTouchPresentation(null)).toEqual({
      isTouch: false,
      isCompact: false,
      isCompactTouch: false,
      idiom: 'default',
    });
  });

  it('chooses UIKit motion in the iOS idiom and the theme everywhere else', () => {
    const {result} = renderHook(() => useMotionPresentation());
    expect(result.current).toBe('theme');
    // A finger outside iOS keeps the theme's motion.
    act(() => setDevice({coarse: true}));
    expect(result.current).toBe('theme');
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
          entry.name !== 'touchPresentation.ts'
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
    expect(COMPACT_QUERY).toBe('(width < 744px), (height < 500px)');
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
    // A tablet, even an iPad mini in portrait, keeps the anchored popover.
    act(() => setDevice({coarse: true, width: 744, height: 1133}));
    expect(result.current).toBe('popover');
  });
});
