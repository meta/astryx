// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file composerBounce.test.ts
 * @input vitest, jsdom, the spring solver and composerBounce
 * @output Tests the bounce's spring and start speed: one dip down and back to
 *   rest on the keyboard's spring. The dip is never faster than the finger
 *   and no deeper than its bound. Nothing moves under Reduce Motion, the
 *   person's setting or a theme's mark.
 * @position Unit tests for Chat/composerBounce.ts
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {resolveMotion} from '../motion/resolveMotion';
import {solveSpring, toSpring} from '../motion/spring';
import {springs} from '../motion/uikit/springs';
import {reducedMotionMarkProps} from '../privateAttributes/reducedMotion.stylex';
import {composerBounce, type ComposerBounce} from './composerBounce';

let dock: HTMLElement;

// The bounce's offsets, px, every 1/120 s until it is back within 0.05 px.
function offsetsOf({spring, speed}: ComposerBounce): number[] {
  const curve = solveSpring(toSpring(spring), {
    from: 0,
    to: 0,
    velocity: speed,
  });
  const end = curve.settleTime(0.05);
  const offsets = [];
  for (let t = 0; t < end; t += 1 / 120) {
    offsets.push(curve.value(t));
  }
  offsets.push(curve.value(end));
  return offsets;
}

describe('composerBounce', () => {
  beforeEach(() => {
    dock = document.createElement('div');
    document.body.append(dock);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('dips once on the keyboard’s spring, down and back to rest', () => {
    const bounce = composerBounce(dock, 500, 12);
    expect(bounce?.spring).toEqual(resolveMotion(dock, springs.keyboard));
    const offsets = offsetsOf(bounce as ComposerBounce);
    expect(offsets[0]).toBe(0);
    const turn = offsets.indexOf(Math.max(...offsets));
    expect(offsets[turn]).toBeGreaterThan(0);
    expect(offsets.slice(0, turn + 1)).toEqual(
      [...offsets.slice(0, turn + 1)].sort((a, b) => a - b),
    );
    expect(Math.abs(offsets.at(-1) ?? 1)).toBeLessThan(0.05);
  });

  it('never starts faster than the finger', () => {
    for (const fingerSpeed of [100, 500, 2000]) {
      expect(composerBounce(dock, fingerSpeed, 12)?.speed).toBeLessThanOrEqual(
        fingerSpeed,
      );
    }
  });

  it('goes as deep as a slow finger takes it, and a fast one no deeper than its bound', () => {
    const slow = composerBounce(dock, 100, 12);
    expect(slow?.speed).toBe(100);
    const slowDepth = Math.max(...offsetsOf(slow as ComposerBounce));
    expect(slowDepth).toBeGreaterThan(0);
    expect(slowDepth).toBeLessThan(12);
    const fast = Math.max(
      ...offsetsOf(composerBounce(dock, 5000, 12) as ComposerBounce),
    );
    expect(fast).toBeLessThanOrEqual(12 + 1e-6);
    expect(fast).toBeGreaterThan(11);
  });

  it('plays nothing for a finger at rest, with no depth to go, or under Reduce Motion', () => {
    expect(composerBounce(dock, 0, 12)).toBeNull();
    expect(composerBounce(dock, 500, 0)).toBeNull();
    const matchMedia = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({
        matches: /prefers-reduced-motion:\s*reduce/.test(query),
        media: query,
      }) as MediaQueryList;
    try {
      expect(composerBounce(dock, 500, 12)).toBeNull();
    } finally {
      window.matchMedia = matchMedia;
    }
  });

  it('plays nothing inside a theme that reduces motion for everyone', () => {
    const theme = document.createElement('div');
    for (const [name, value] of Object.entries(reducedMotionMarkProps(true))) {
      theme.setAttribute(name, value);
    }
    theme.append(dock);
    document.body.append(theme);
    expect(composerBounce(dock, 500, 12)).toBeNull();
  });
});
