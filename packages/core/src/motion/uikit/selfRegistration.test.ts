// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selfRegistration.test.ts
 * @input vitest (jsdom); each touch table imported in a fresh module graph,
 *   with no call to its register function
 * @output Checks that each spring role row, and the navigation, paging and
 *   picker tables, register at import, so a role plays at the theme's tempo
 * @position Testing; validates uikit/springs.ts, navigation.ts, paging.ts and
 *   picker.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const TEMPO_PROPERTY = '--_astryx-motion-tempo';
/** The tempo the stubbed theme writes; empty where no theme sets one. */
let tempo = '';

beforeEach(() => {
  vi.resetModules();
  tempo = '';
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) =>
          name === TEMPO_PROPERTY ? tempo : '',
      }) as unknown as CSSStyleDeclaration,
  );
});

afterEach(() => {
  vi.doUnmock('../roles');
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function element(): HTMLElement {
  const child = document.createElement('div');
  document.body.append(child);
  return child;
}

describe('the touch tables register at import', () => {
  it('a page that imports only the settle row plays it at the tempo', async () => {
    const {SETTLE_SPRING} = await import('./springs');
    const {resolveMotion} = await import('../resolveMotion');
    const {solveSpring, toSpring} = await import('../spring');
    const target = element();
    const base = solveSpring(toSpring(SETTLE_SPRING), {from: 0, to: 1});
    for (const scale of [0.75, 1.5]) {
      tempo = String(scale);
      const played = solveSpring(
        toSpring(resolveMotion(target, SETTLE_SPRING)),
        {from: 0, to: 1},
      );
      expect(played.settleTime(0.001)).toBeCloseTo(
        base.settleTime(0.001) * scale,
        6,
      );
    }
  });

  it('a page that imports only the picker plays its tap spin at the tempo', async () => {
    const {picker} = await import('./picker');
    const {resolveMotion} = await import('../resolveMotion');
    tempo = '1.5';
    expect(resolveMotion(element(), picker.tapSpin, 'durationMs')).toBe(
      picker.tapSpin.durationMs * 1.5,
    );
  });

  it('each role row and table registers itself, at import', async () => {
    const registered: string[] = [];
    vi.doMock('../roles', async importOriginal => {
      const actual = await importOriginal<typeof import('../roles')>();
      return {
        ...actual,
        registerMotionTable: (
          ...args: Parameters<typeof actual.registerMotionTable>
        ) => {
          registered.push(args[0]);
          actual.registerMotionTable(...args);
        },
      };
    });
    const {SETTLE_SPRING, KEYBOARD_SPRING} = await import('./springs');
    await import('./navigation');
    await import('./paging');
    await import('./picker');
    const {motionRoleOf} = await import('../roles');
    expect(motionRoleOf(SETTLE_SPRING)?.id).toBe('springs.settle');
    // The keyboard's spring is a measured constant, not a role.
    expect(motionRoleOf(KEYBOARD_SPRING)).toBeUndefined();
    expect(registered).toEqual(['navigation', 'paging', 'picker']);
  });
});
