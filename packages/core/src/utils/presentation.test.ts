// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentation.test.ts
 * @input Uses vitest, React Testing Library, react-dom/server and a
 *   query-aware matchMedia and CSS.supports stub
 * @output A caller's explicit presentation wins: `'popover'` pins the fine
 *   surface and input modes on an iPhone; an omitted value follows the
 *   component's default (`'popover'` or `'touch'`), distinguishable from an
 *   explicit `'popover'`; `'adaptive'` and `'bottom-sheet'` keep their sheet
 *   meaning with touch modes under a finger, the same on every touch device;
 *   the surface equals useAdaptivePresentation's for every
 *   value on every device; live pointer changes; the server and hydrating
 *   render, which no hint can put into touch modes; the one-moment read
 * @position Unit tests of packages/core/src/utils/presentation.ts
 */

import {act, renderHook} from '@testing-library/react';
import {createElement, type ComponentProps, type ReactNode} from 'react';
import {hydrateRoot, type Root} from 'react-dom/client';
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
  type UsePresentationOptions,
} from './presentation';
import {Theme, defineTheme} from '../theme';
import {IOS_SUPPORTS_QUERY} from './touchPresentation';
import {
  compactDefinition,
  DEFAULT_COMPACT_DEFINITION,
} from '../theme/themeAdaptations';

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
/** A narrow window under a fine pointer: compact by size, never by touch. */
const FINE_NARROW = {coarse: false, width: 600, height: 800, iosWebKit: false};
/** A phone in landscape: compact by its height alone. */
const PHONE_LANDSCAPE = {
  coarse: true,
  width: 852,
  height: 393,
  iosWebKit: true,
};
/** The compact edges at the default md point (768 wide, 500 high). */
const COMPACT_EDGES = [
  {coarse: true, width: 767, height: 800, iosWebKit: false},
  {coarse: true, width: 768, height: 800, iosWebKit: false},
  {coarse: true, width: 1024, height: 499, iosWebKit: false},
  {coarse: true, width: 1024, height: 500, iosWebKit: false},
];

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

/** A component whose omitted presentation is the touch default. */
const TOUCH_WHEN_OMITTED: UsePresentationOptions = {whenOmitted: 'touch'};

describe('presentation: a caller choice wins over touch defaults', () => {
  it('pins the fine surface and input modes with an explicit popover, even on an iPhone', () => {
    setDevice(IPHONE);
    for (const whenOmitted of ['popover', 'touch'] as const) {
      expect(resolve('popover', whenOmitted)).toEqual({
        surface: 'popover',
        touchModes: false,
      });
    }
  });

  it("tells an omitted value from an explicit popover: the component's touch default applies only when omitted", () => {
    setDevice(IPHONE);
    expect(resolve(undefined, 'touch')).toEqual({
      surface: 'popover',
      touchModes: true,
    });
    // Today's components: omitted is popover.
    expect(resolve(undefined)).toEqual(resolve('popover'));
    expect(resolve(undefined, 'popover')).toEqual(resolve('popover'));
  });

  it('turns touch modes on under a finger only, the same on every touch device', () => {
    setDevice(ANDROID);
    expect(resolve(undefined, 'touch')).toEqual({
      surface: 'popover',
      touchModes: true,
    });
    for (const desk of [DESKTOP, MAC_SAFARI]) {
      setDevice(desk);
      expect(resolve(undefined, 'touch')).toMatchObject({
        touchModes: false,
      });
    }
  });

  it('keeps the sheet meaning of adaptive and bottom-sheet, with touch modes under a finger', () => {
    setDevice(IPHONE);
    expect(resolve('adaptive')).toEqual({
      surface: 'bottom-sheet',
      touchModes: true,
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
    for (const next of [
      IPHONE,
      IPAD,
      ANDROID,
      DESKTOP,
      MAC_SAFARI,
      FINE_NARROW,
      PHONE_LANDSCAPE,
      ...COMPACT_EDGES,
    ]) {
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

  it("answers 'adaptive' with the sheet only on a compact touch screen: a fine narrow window, a phone in landscape and each compact edge (spec:AST-094 FR13, spec:AST-012 FR9)", () => {
    for (const [next, surface] of [
      [FINE_NARROW, 'popover'],
      [PHONE_LANDSCAPE, 'bottom-sheet'],
      [COMPACT_EDGES[0], 'bottom-sheet'],
      [COMPACT_EDGES[1], 'popover'],
      [COMPACT_EDGES[2], 'bottom-sheet'],
      [COMPACT_EDGES[3], 'popover'],
    ] as const) {
      setDevice(next);
      expect({...next, surface: resolve('adaptive').surface}).toEqual({
        ...next,
        surface,
      });
    }
  });

  it("follows the active theme's md point for 'adaptive' (spec:AST-012 FR9)", () => {
    const wideMd = defineTheme({
      name: 'wide-md-presentation',
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
    const plain = renderHook(() => usePresentation('adaptive'));
    expect(plain.result.current.surface).toBe('popover');
    plain.unmount();
    // Under a theme whose md is 1000, the same screen is compact.
    const themed = renderHook(() => usePresentation('adaptive'), {wrapper});
    expect(themed.result.current).toEqual({
      surface: 'bottom-sheet',
      touchModes: true,
    });
  });

  it('follows the pointer when it changes (an iPad docking a trackpad)', () => {
    setDevice(IPAD);
    const {result} = renderHook(() =>
      usePresentation(undefined, {whenOmitted: 'touch'}),
    );
    expect(result.current.touchModes).toBe(true);
    act(() => setDevice({coarse: false}));
    // A fine pointer in this context, checked before the claim.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    expect(result.current).toMatchObject({touchModes: false});
    act(() => setDevice({coarse: true}));
    expect(result.current).toMatchObject({touchModes: true});
  });

  it('renders no touch surface or input mode on the server or while hydrating, and takes no hint that would (spec:AST-094 FR13)', () => {
    // On a phone, where a live read would answer touch modes.
    setDevice(IPHONE);
    function Probe({
      presentation,
      options = TOUCH_WHEN_OMITTED,
    }: {
      presentation?: AdaptivePresentation;
      options?: UsePresentationOptions;
    }) {
      const resolved = usePresentation(presentation, options);
      return `${resolved.surface}/${String(resolved.touchModes)}`;
    }
    expect(renderToString(createElement(Probe))).toContain('popover/false');
    expect(
      renderToString(createElement(Probe, {presentation: 'adaptive'})),
    ).toContain('popover/false');
    expect(
      renderToString(createElement(Probe, {presentation: 'bottom-sheet'})),
    ).toContain('bottom-sheet/false');
    // A server hint would put touch modes into the server render, which
    // hydration then contradicts: usePresentation takes none.
    const hinted = {
      whenOmitted: 'touch',
      // @ts-expect-error usePresentation takes no serverDefault.
      serverDefault: {isTouch: true, isCompact: true},
    } satisfies UsePresentationOptions;
    expect(
      renderToString(
        createElement(Probe, {presentation: 'adaptive', options: hinted}),
      ),
    ).toContain('popover/false');
  });

  it('hydrates on a phone from the server render, then follows the device (spec:AST-094 FR13)', async () => {
    setDevice(IPHONE);
    const renders: string[] = [];
    function Probe({presentation}: {presentation: AdaptivePresentation}) {
      const resolved = usePresentation(presentation, TOUCH_WHEN_OMITTED);
      const text = `${resolved.surface}/${String(resolved.touchModes)}`;
      renders.push(text);
      return text;
    }
    const html = renderToString(
      createElement(Probe, {presentation: 'adaptive'}),
    );
    expect(html).toContain('popover/false');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    renders.length = 0;
    const recoverable = vi.fn();
    let root: Root | null = null;
    await act(async () => {
      root = hydrateRoot(
        container,
        createElement(Probe, {presentation: 'adaptive'}),
        {onRecoverableError: recoverable},
      );
    });
    // The hydrating render is the server's; the phone's answer follows it.
    expect(renders[0]).toBe('popover/false');
    expect(renders.at(-1)).toBe('bottom-sheet/true');
    expect(recoverable).not.toHaveBeenCalled();
    act(() => root?.unmount());
    container.remove();
  });

  it('subscribes only to the queries a request reads (architecture:react-component-runtime INV5)', () => {
    setDevice(IPHONE);
    for (const [presentation, whenOmitted, subscriptions] of [
      ['popover', 'touch', 0],
      [undefined, 'popover', 0],
      ['bottom-sheet', 'popover', 1],
      [undefined, 'touch', 1],
      ['adaptive', 'popover', 2],
    ] as const) {
      listeners.clear();
      const {unmount} = renderHook(() =>
        usePresentation(presentation, {whenOmitted}),
      );
      expect({
        presentation,
        whenOmitted,
        subscriptions: listeners.size,
      }).toEqual({presentation, whenOmitted, subscriptions});
      unmount();
      expect(listeners.size).toBe(0);
    }
  });

  it('answers at one moment as the hook does, and as the server would with no window', () => {
    setDevice(IPHONE);
    const compact = DEFAULT_COMPACT_DEFINITION;
    expect(
      readPresentation(undefined, {whenOmitted: 'touch', compact}),
    ).toEqual(resolve(undefined, 'touch'));
    expect(
      readPresentation('popover', {whenOmitted: 'touch', compact}),
    ).toEqual(resolve('popover', 'touch'));
    expect(readPresentation('adaptive', {compact})).toEqual(
      resolve('adaptive'),
    );
    expect(
      readPresentation(undefined, {whenOmitted: 'touch', view: null, compact}),
    ).toEqual({
      surface: 'popover',
      touchModes: false,
    });
  });

  it('reads the compact definition it is given, so a theme that moves md moves the sheet (spec:AST-012 FR9)', () => {
    setDevice({...IPHONE, width: 900, height: 1024});
    expect(
      readPresentation('adaptive', {compact: DEFAULT_COMPACT_DEFINITION})
        .surface,
    ).toBe('popover');
    expect(
      readPresentation('adaptive', {compact: compactDefinition({md: 1000})})
        .surface,
    ).toBe('bottom-sheet');
  });
});
