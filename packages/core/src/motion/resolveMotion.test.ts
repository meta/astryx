// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolveMotion.test.ts
 * @input resolveMotion.ts, the shared UIKit tables, a stubbed computed style
 * @output Proof that, with the per-role tables internal (spec:AST-094
 *   DEC-15), a role plays its table value whatever a scope's CSS variable
 *   says, reads no style, and leaves values that are not roles alone; and
 *   that the animator plays the table's spring
 * @position Testing for /packages/core/src/motion/resolveMotion.ts (the
 *   browser proof: animator.interaction.browser.spec.ts)
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createAnimator} from './animator';
import {coast} from './coast';
import {resolveMotion} from './resolveMotion';
import {solveSpring, toSpring} from './spring';
import {
  registerSpringsTable,
  registerTimingTable,
  scroll,
  springs,
  timing,
} from './uikit';

// Like a touch module: register the tables these motions resolve from.
registerSpringsTable();
registerTimingTable();

let reads: number;

beforeEach(() => {
  reads = 0;
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () =>
      ({
        getPropertyValue: () => {
          reads += 1;
          return '';
        },
      }) as unknown as CSSStyleDeclaration,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** A scope that sets role variables, as a page's own style could. */
function scoped(values: Record<string, string>) {
  const scope = document.createElement('div');
  scope.setAttribute('data-astryx-theme', 'soft');
  for (const [name, value] of Object.entries(values)) {
    scope.style.setProperty(name, value);
  }
  const child = document.createElement('div');
  scope.append(child);
  document.body.append(scope);
  return child;
}

describe('resolveMotion while the per-role tables stay internal (DEC-15)', () => {
  it('plays the table value for a spring, a curve and a duration, whatever a scope sets', () => {
    const child = scoped({
      '--motion-springs-settle': '0.8s 0.3',
      '--motion-timing-curves-move': 'cubic-bezier(0.4, 0, 0.2, 1)',
      '--motion-timing-state-change-ms': '300ms',
    });
    expect(resolveMotion(child, springs.settle)).toBe(springs.settle);
    expect(resolveMotion(child, timing.curves.move)).toBe(timing.curves.move);
    expect(resolveMotion(child, timing, 'stateChangeMs')).toBe(
      timing.stateChangeMs,
    );
    expect(resolveMotion(null, springs.settle)).toBe(springs.settle);
    // No style is read to resolve a role.
    expect(reads).toBe(0);
  });

  it('leaves values that are not roles alone', () => {
    const inline = {response: 0.4, dampingRatio: 0.9};
    expect(resolveMotion(document.body, inline)).toBe(inline);
    expect(resolveMotion(document.body, springs.sheetPresent)).toBe(
      springs.sheetPresent,
    );
    expect(resolveMotion(document.body, timing.press, 'scrollBrakeMs')).toBe(
      timing.press.scrollBrakeMs,
    );
  });
});

describe('the animator', () => {
  it("plays the table's spring even where a scope sets the role's variable", () => {
    const child = scoped({'--motion-springs-settle': '0.8s 0.3'});
    const animator = createAnimator(child, {now: () => 0});
    animator.set({y: 300});
    animator.animate({y: 0}, {spring: springs.settle}, {at: 0});
    const table = solveSpring(toSpring(springs.settle), {from: 300, to: 0});
    for (const ms of [50, 150, 400]) {
      expect(animator.get('y', ms)).toBeCloseTo(table.value(ms / 1000), 3);
    }
    animator.dispose();
  });
  it('a coast plays the table edge spring whatever a scope sets: scroll.bounce is no role', () => {
    const child = scoped({'--motion-scroll-bounce': '0.8s 0.3'});
    const animator = createAnimator(child, {now: () => 0});
    animator.set({x: 60});
    // Released past the edge: straight back on the edge spring.
    animator.decay(
      coast(animator, {x: 0}, {bounds: {x: {min: -500, max: 0}}, at: 0}),
      {at: 0},
    );
    const expected = solveSpring(toSpring(scroll.bounce), {
      from: 60,
      to: 0,
    });
    for (const ms of [50, 150, 400]) {
      expect(animator.get('x', ms)).toBeCloseTo(expected.value(ms / 1000), 3);
    }
    animator.dispose();
  });
});
