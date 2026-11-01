// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SearchField.motion.test.tsx
 * @input vitest, Testing Library, SearchField, searchFieldModel and the
 *   motion foundation (its `useAnimator` wrapped to record what is played)
 * @output Proofs that the activation plays the search table's clock and
 *   curve, UIKit's 383 ms ease-in-ease-out, whatever motion variables a
 *   theme scope carries (touch motion has no theme surface); the activation
 *   from rest starts on the frame that presents the parts at rest
 *   (`start: 'presented'`), and a change of mind adds to the curves on screen
 *   (`additive`) on the whole clock; a mouse plays none (any finger, iOS or
 *   Android, plays it)
 * @position Testing; validates SearchField.tsx and searchFieldModel.ts with a
 *   stubbed computed style
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import type * as AnimatorHook from '../internal/useAnimator';
import {search} from '../internal/searchMotion';
import {SearchField} from './SearchField';
import {activationTiming} from './searchFieldModel';

const played = vi.hoisted(() => [] as Array<Record<string, number>>);
/** The options of each play, in order. */
const playedOptions = vi.hoisted(() => [] as Array<Record<string, unknown>>);

// Records the length of every curve the field plays; the animator still
// plays them.
vi.mock('../internal/useAnimator', async importOriginal => {
  const actual = await importOriginal<typeof AnimatorHook>();
  const wrapped = new WeakSet<object>();
  return {
    ...actual,
    useAnimator: (...args: Parameters<typeof actual.useAnimator>) => {
      const result = actual.useAnimator(...args);
      const {animator} = result;
      if (!wrapped.has(animator)) {
        wrapped.add(animator);
        const play = animator.play.bind(animator);
        animator.play = (curves, options) => {
          playedOptions.push({...options});
          played.push(
            Object.fromEntries(
              Object.entries(curves).map(([key, curve]) => [
                key,
                curve?.duration ?? 0,
              ]),
            ),
          );
          return play(curves, options);
        };
      }
      return result;
    },
  };
});

/** Theme variables by scope element, as the stubbed computed style reports. */
let variables: Map<Element, Record<string, string>>;

/** Frames the test delivers: the activation starts on a presented one. */
let frameCallbacks: Map<number, FrameRequestCallback>;
let frameTime = 0;
function deliverFrames(count: number) {
  for (let k = 0; k < count; k++) {
    frameTime += 16.7;
    const waiting = [...frameCallbacks.values()];
    frameCallbacks.clear();
    act(() => {
      for (const callback of waiting) {
        callback(frameTime);
      }
    });
  }
}

beforeEach(() => {
  played.length = 0;
  playedOptions.length = 0;
  variables = new Map();
  frameCallbacks = new Map();
  frameTime = performance.now();
  let nextFrame = 1;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    const id = nextFrame++;
    frameCallbacks.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
    frameCallbacks.delete(id);
  });
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element: Element) =>
      ({
        direction: 'ltr',
        getPropertyValue: (name: string) =>
          variables.get(element)?.[name] ?? '',
      }) as unknown as CSSStyleDeclaration,
  );
  // Under a finger (a coarse primary pointer), so the field plays UIKit's
  // activation.
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('pointer: coarse'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** A theme scope carrying the given CSS variables. */
function themed(values: Record<string, string>) {
  const scope = document.createElement('div');
  scope.setAttribute('data-astryx-theme', 'test');
  document.body.append(scope);
  variables.set(scope, values);
  return scope;
}

describe('SearchField motion', () => {
  it('plays the search table’s 383 ms ease-in-ease-out, which no theme retunes', () => {
    const timing = activationTiming();
    expect(timing.seconds).toBeCloseTo(search.activationMs / 1000, 6);
    // UIKit's ease-in-ease-out, slow at the start.
    expect(timing.ease(0.25)).toBeLessThan(0.2);
    // A theme scope that writes the variables a motion role would read
    // changes nothing: the search table's values are internal constants.
    const scope = themed({
      '--motion-search-activation-ms': '600ms',
      '--motion-search-activation-curve': 'cubic-bezier(0, 0, 1, 1)',
    });
    render(<SearchField label="Search" />, {container: scope});
    act(() => screen.getByRole('searchbox').focus());
    deliverFrames(2);
    expect(played.length).toBeGreaterThan(0);
    for (const curves of played) {
      for (const duration of Object.values(curves)) {
        expect(duration).toBeCloseTo(search.activationMs / 1000, 6);
      }
    }
  });

  it('starts from rest on the frame that presents the parts at rest, and adds a change of mind to the curves on screen, on the whole clock', () => {
    render(<SearchField label="Search" />);
    const input = screen.getByRole('searchbox');
    act(() => input.focus());
    expect(playedOptions.length).toBeGreaterThan(0);
    for (const options of playedOptions) {
      expect(options).toEqual({start: 'presented'});
    }
    const activation = playedOptions.length;
    deliverFrames(4);
    // A cancel while the activation still plays.
    fireEvent.click(
      document.querySelector('[data-search-field-close]') as HTMLElement,
    );
    const turn = playedOptions.slice(activation);
    expect(turn.length).toBeGreaterThan(0);
    for (const options of turn) {
      expect(options).toEqual({additive: true});
    }
    for (const curves of played.slice(activation)) {
      for (const duration of Object.values(curves)) {
        expect(duration).toBeCloseTo(search.activationMs / 1000, 6);
      }
    }
  });

  it('plays no activation under a mouse: the parts take their places at once', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    // A fine primary pointer, asserted in this test's own context.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    render(<SearchField label="Search" />);
    act(() => screen.getByRole('searchbox').focus());
    deliverFrames(3);
    expect(played).toEqual([]);
  });
});
