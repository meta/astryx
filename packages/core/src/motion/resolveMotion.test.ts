// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolveMotion.test.ts
 * @input resolveMotion.ts, the shared UIKit tables, a stubbed computed style
 * @output Proof that a role takes its theme scope's value, falls back to the
 *   table's value when the variable is empty, malformed or unreadable, reads
 *   each scope once until a theme attribute changes, and leaves values that
 *   are not roles alone; and that the animator plays the resolved spring
 * @position Testing for /packages/core/src/motion/resolveMotion.ts (the
 *   browser proof reads real theme CSS: animator.interaction.browser.spec.ts)
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createAnimator} from './animator';
import {resolveMotion} from './resolveMotion';
import {solveSpring, toSpring} from './spring';
import {navigation, springs, timing} from './uikit';

/** Theme variables by scope element, as the stubbed computed style reports. */
let variables: Map<Element, Record<string, string>>;
let reads: number;

beforeEach(() => {
  variables = new Map();
  reads = 0;
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element: Element) =>
      ({
        getPropertyValue: (name: string) => {
          reads += 1;
          return variables.get(element)?.[name] ?? '';
        },
      }) as CSSStyleDeclaration,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function themed(name: string, values: Record<string, string>) {
  const scope = document.createElement('div');
  scope.setAttribute('data-astryx-theme', name);
  const child = document.createElement('div');
  scope.append(child);
  document.body.append(scope);
  variables.set(scope, values);
  return {scope, child};
}

describe('resolveMotion', () => {
  it("takes the theme scope's value for a spring, a curve and a duration", () => {
    const {child} = themed('soft', {
      '--motion-springs-sheet-present': '0.8s 0.3',
      '--motion-timing-curves-ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      '--motion-navigation-transition-ms': '300ms',
    });
    expect(resolveMotion(child, springs.sheetPresent)).toEqual({
      duration: 0.8,
      bounce: 0.3,
    });
    expect(resolveMotion(child, timing.curves.easeInOut)).toEqual([
      0.4, 0, 0.2, 1,
    ]);
    expect(resolveMotion(child, navigation, 'transitionMs')).toBe(300);
  });

  it("falls back to the table's value when the variable is empty, malformed or unreadable", () => {
    const {child} = themed('plain', {
      '--motion-springs-navigation-push': 'bouncy',
    });
    expect(resolveMotion(child, springs.sheetPresent)).toBe(
      springs.sheetPresent,
    );
    expect(resolveMotion(child, springs.navigationPush)).toBe(
      springs.navigationPush,
    );
    expect(resolveMotion(null, springs.sheetPresent)).toBe(
      springs.sheetPresent,
    );
    const detached = document.createElement('div');
    expect(resolveMotion(detached, navigation, 'transitionMs')).toBe(
      navigation.transitionMs,
    );
  });

  it('leaves values that are not roles alone, without reading style', () => {
    const {child} = themed('soft', {});
    const inline = {response: 0.4, dampingRatio: 0.9};
    expect(resolveMotion(child, inline)).toBe(inline);
    expect(resolveMotion(child, timing.press, 'scrollBrakeMs')).toBe(
      timing.press.scrollBrakeMs,
    );
    expect(reads).toBe(0);
  });

  it('reads each scope once, until its theme attribute changes', async () => {
    const {scope, child} = themed('soft', {
      '--motion-springs-sheet-present': '0.8s 0.3',
    });
    resolveMotion(child, springs.sheetPresent);
    resolveMotion(scope, springs.sheetPresent);
    expect(reads).toBe(1);

    variables.set(scope, {'--motion-springs-sheet-present': '0.4s 0'});
    scope.setAttribute('data-astryx-theme', 'brisk');
    await Promise.resolve();
    expect(resolveMotion(child, springs.sheetPresent)).toEqual({
      duration: 0.4,
      bounce: 0,
    });
    expect(reads).toBe(2);
  });
});

describe('the animator under a theme', () => {
  it('plays the spring its theme sets for a table spring', () => {
    const {child} = themed('soft', {
      '--motion-springs-sheet-present': '0.8s 0.3',
    });
    const animator = createAnimator(child, {now: () => 0});
    animator.set({y: 300});
    animator.animate({y: 0}, {spring: springs.sheetPresent}, {at: 0});
    const expected = solveSpring(toSpring({duration: 0.8, bounce: 0.3}), {
      from: 300,
      to: 0,
    });
    const table = solveSpring(toSpring(springs.sheetPresent), {
      from: 300,
      to: 0,
    });
    for (const ms of [50, 150, 400]) {
      expect(animator.get('y', ms)).toBeCloseTo(expected.value(ms / 1000), 3);
    }
    // And not the table's spring.
    expect(
      Math.abs(animator.get('y', 150) - table.value(0.15)),
    ).toBeGreaterThan(20);
    animator.dispose();
  });
});
