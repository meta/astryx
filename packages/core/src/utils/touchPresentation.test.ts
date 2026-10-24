// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchPresentation.test.ts
 * @input Uses vitest, React Testing Library, react-dom/server and a
 *   query-aware matchMedia stub
 * @output The touch presentation's answers: touch from the primary pointer,
 *   compact from the width, both for presentations; the server default and
 *   hints; live updates; the one-moment read; the motion choice; core's
 *   compact-touch media keys spelled as the shared query; the adaptive
 *   presentation reading it
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
  TOUCH_QUERY,
  readTouchPresentation,
  useMotionPresentation,
  useTouchPresentation,
} from './touchPresentation';

/** A device: what its primary pointer is and how big its viewport is. */
const device = {coarse: false, width: 1280, height: 800};
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
  setDevice({coarse: false, width: 1280, height: 800});
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
    });
    // A tablet: a finger at any width.
    act(() => setDevice({coarse: true, width: 1024, height: 1366}));
    expect(result.current).toEqual({
      isTouch: true,
      isCompact: false,
      isCompactTouch: false,
    });
    // A narrowed desktop window: compact, still a mouse.
    act(() => setDevice({coarse: false, width: 600, height: 900}));
    expect(result.current).toEqual({
      isTouch: false,
      isCompact: true,
      isCompactTouch: false,
    });
    // A phone: both.
    act(() => setDevice({coarse: true, width: 390, height: 844}));
    expect(result.current).toEqual({
      isTouch: true,
      isCompact: true,
      isCompactTouch: true,
    });
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
        `${presentation.isTouch}/${presentation.isCompactTouch}/${useMotionPresentation(props.hint)}`,
      );
    };
    setDevice({coarse: true, width: 390, height: 844});
    expect(renderToString(createElement(Probe))).toContain('false/false/theme');
    expect(renderToString(createElement(Probe, {hint: true}))).toContain(
      'true/true/uikit',
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
    });
    expect(readTouchPresentation(null)).toEqual({
      isTouch: false,
      isCompact: false,
      isCompactTouch: false,
    });
  });

  it('chooses UIKit motion under a finger and the theme under a mouse', () => {
    const {result} = renderHook(() => useMotionPresentation());
    expect(result.current).toBe('theme');
    act(() => setDevice({coarse: true}));
    expect(result.current).toBe('uikit');
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
