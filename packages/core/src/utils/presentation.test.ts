// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentation.test.ts
 * @input Uses vitest, React Testing Library, react-dom/server and a
 *   query-aware matchMedia and CSS.supports stub
 * @output A caller's explicit presentation wins: `'popover'` pins the fine
 *   surface and input modes on an iPhone; an omitted value follows the
 *   component's default (`'popover'` or `'touch'`), distinguishable from an
 *   explicit `'popover'`; `'adaptive'` and `'bottom-sheet'` keep their sheet
 *   meaning with touch modes under a finger; the idiom and motion follow the
 *   touch modes only; the surface equals useAdaptivePresentation's for every
 *   value on every device; live pointer changes; the server default and
 *   hints; the one-moment read
 * @position Unit tests of packages/core/src/utils/presentation.ts
 */

import {act, renderHook} from '@testing-library/react';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  useAdaptivePresentation,
  type AdaptivePresentation,
} from '../hooks/useAdaptivePresentation';
import {
  readPresentation,
  usePresentation,
  type PresentationDefault,
} from './presentation';
import {IOS_SUPPORTS_QUERY} from './touchPresentation';

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

const IPHONE = {coarse: true, width: 393, height: 852, iosWebKit: true};
const IPAD = {coarse: true, width: 820, height: 1180, iosWebKit: true};
const ANDROID = {coarse: true, width: 412, height: 915, iosWebKit: false};
const DESKTOP = {coarse: false, width: 1280, height: 800, iosWebKit: false};
const MAC_SAFARI = {coarse: false, width: 1440, height: 900, iosWebKit: false};

beforeEach(() => {
  setDevice(DESKTOP);
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

const resolve = (
  presentation: AdaptivePresentation | undefined,
  whenOmitted?: PresentationDefault,
) =>
  renderHook(() => usePresentation(presentation, {whenOmitted})).result.current;

describe('presentation: a caller choice wins over touch defaults', () => {
  it('pins the fine surface and input modes with an explicit popover, even on an iPhone', () => {
    setDevice(IPHONE);
    for (const whenOmitted of ['popover', 'touch'] as const) {
      expect(resolve('popover', whenOmitted)).toEqual({
        surface: 'popover',
        touchModes: false,
        idiom: 'default',
        motion: 'theme',
      });
    }
  });

  it("tells an omitted value from an explicit popover: the component's touch default applies only when omitted", () => {
    setDevice(IPHONE);
    expect(resolve(undefined, 'touch')).toEqual({
      surface: 'popover',
      touchModes: true,
      idiom: 'ios',
      motion: 'uikit',
    });
    // Today's components: omitted is popover.
    expect(resolve(undefined)).toEqual(resolve('popover'));
    expect(resolve(undefined, 'popover')).toEqual(resolve('popover'));
  });

  it('turns touch modes on under a finger only, and the UIKit idiom on iOS only', () => {
    setDevice(ANDROID);
    expect(resolve(undefined, 'touch')).toEqual({
      surface: 'popover',
      touchModes: true,
      idiom: 'default',
      motion: 'theme',
    });
    for (const desk of [DESKTOP, MAC_SAFARI]) {
      setDevice(desk);
      expect(resolve(undefined, 'touch')).toMatchObject({
        touchModes: false,
        idiom: 'default',
      });
    }
  });

  it('keeps the sheet meaning of adaptive and bottom-sheet, with touch modes under a finger', () => {
    setDevice(IPHONE);
    expect(resolve('adaptive')).toEqual({
      surface: 'bottom-sheet',
      touchModes: true,
      idiom: 'ios',
      motion: 'uikit',
    });
    setDevice(IPAD);
    expect(resolve('adaptive')).toMatchObject({
      surface: 'popover',
      touchModes: true,
    });
    setDevice(DESKTOP);
    expect(resolve('adaptive')).toMatchObject({
      surface: 'popover',
      touchModes: false,
    });
    expect(resolve('bottom-sheet')).toMatchObject({
      surface: 'bottom-sheet',
      touchModes: false,
    });
  });

  it("renders useAdaptivePresentation's surface for every value on every device", () => {
    for (const next of [IPHONE, IPAD, ANDROID, DESKTOP, MAC_SAFARI]) {
      setDevice(next);
      for (const value of ['popover', 'bottom-sheet', 'adaptive'] as const) {
        const {result} = renderHook(() => ({
          surface: usePresentation(value).surface,
          adaptive: useAdaptivePresentation(value),
        }));
        expect(result.current.surface).toBe(result.current.adaptive);
      }
    }
  });

  it('follows the pointer when it changes (an iPad docking a trackpad)', () => {
    setDevice(IPAD);
    const {result} = renderHook(() =>
      usePresentation(undefined, {whenOmitted: 'touch'}),
    );
    expect(result.current.touchModes).toBe(true);
    act(() => setDevice({coarse: false}));
    expect(result.current).toMatchObject({touchModes: false, idiom: 'default'});
    act(() => setDevice({coarse: true}));
    expect(result.current).toMatchObject({touchModes: true, idiom: 'ios'});
  });

  it('renders the server default until hydrated, and honours a server hint', () => {
    function Probe({
      presentation,
      hint,
    }: {
      presentation?: AdaptivePresentation;
      hint?: boolean;
    }) {
      const resolved = usePresentation(presentation, {
        whenOmitted: 'touch',
        serverDefault: hint === true ? {idiom: 'ios', isCompact: true} : {},
      });
      return `${resolved.surface}/${String(resolved.touchModes)}/${resolved.idiom}`;
    }
    expect(renderToString(createElement(Probe))).toContain(
      'popover/false/default',
    );
    expect(renderToString(createElement(Probe, {hint: true}))).toContain(
      'popover/true/ios',
    );
    expect(
      renderToString(
        createElement(Probe, {presentation: 'adaptive', hint: true}),
      ),
    ).toContain('bottom-sheet/true/ios');
    expect(
      renderToString(
        createElement(Probe, {presentation: 'popover', hint: true}),
      ),
    ).toContain('popover/false/default');
  });

  it('answers at one moment as the hook does, and as the server would with no window', () => {
    setDevice(IPHONE);
    expect(readPresentation(undefined, {whenOmitted: 'touch'})).toEqual(
      resolve(undefined, 'touch'),
    );
    expect(readPresentation('popover', {whenOmitted: 'touch'})).toEqual(
      resolve('popover', 'touch'),
    );
    expect(readPresentation('adaptive')).toEqual(resolve('adaptive'));
    expect(
      readPresentation(undefined, {whenOmitted: 'touch', view: null}),
    ).toEqual({
      surface: 'popover',
      touchModes: false,
      idiom: 'default',
      motion: 'theme',
    });
  });
});
