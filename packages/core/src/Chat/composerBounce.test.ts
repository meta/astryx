// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file composerBounce.test.ts
 * @input vitest, jsdom, a recorded `animate` and bounceComposer
 * @output Tests the bounce's keyframes: one dip down and back to rest on the
 *   keyboard's spring. The dip is never faster than the finger and no deeper
 *   than its bound. Nothing moves under Reduce Motion, the person's setting or
 *   a theme's mark.
 * @position Unit tests for Chat/composerBounce.ts
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {reducedMotionMarkProps} from '../privateAttributes/reducedMotion.stylex';
import {bounceComposer} from './composerBounce';

interface Played {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

let played: Played[];
let dock: HTMLElement;

// The keyframes as [ms, px] pairs.
function curveOf({keyframes, options}: Played): [number, number][] {
  const duration = Number(options.duration);
  return keyframes.map(keyframe => {
    const [, y = '0'] = String(keyframe.translate).split(' ');
    return [Number(keyframe.offset) * duration, Number.parseFloat(y)];
  });
}

describe('bounceComposer', () => {
  beforeEach(() => {
    played = [];
    dock = document.createElement('div');
    document.body.append(dock);
    Object.defineProperty(dock, 'animate', {
      configurable: true,
      value: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
        played.push({keyframes, options});
        return {} as Animation;
      },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('dips once, down and back to rest, in linear keyframes', () => {
    bounceComposer(dock, 500, 12);
    expect(played).toHaveLength(1);
    expect(played[0].options.easing).toBe('linear');
    const curve = curveOf(played[0]);
    expect(curve[0]).toEqual([0, 0]);
    expect(curve.at(-1)?.[1]).toBe(0);
    const depths = curve.map(([, y]) => y);
    const turn = depths.indexOf(Math.max(...depths));
    expect(depths.slice(0, turn + 1)).toEqual(
      [...depths.slice(0, turn + 1)].sort((a, b) => a - b),
    );
    expect(depths.slice(turn)).toEqual(
      [...depths.slice(turn)].sort((a, b) => b - a),
    );
  });

  it('never moves faster than the finger', () => {
    for (const fingerSpeed of [100, 500, 2000]) {
      played = [];
      bounceComposer(dock, fingerSpeed, 12);
      const curve = curveOf(played[0]);
      for (let i = 1; i < curve.length; i++) {
        const [t0, y0] = curve[i - 1];
        const [t1, y1] = curve[i];
        expect(Math.abs(y1 - y0) / ((t1 - t0) / 1000)).toBeLessThanOrEqual(
          fingerSpeed,
        );
      }
    }
  });

  it('goes as deep as a slow finger takes it, and a fast one no deeper than its bound', () => {
    bounceComposer(dock, 100, 12);
    const slow = Math.max(...curveOf(played[0]).map(([, y]) => y));
    expect(slow).toBeGreaterThan(0);
    expect(slow).toBeLessThan(12);
    played = [];
    bounceComposer(dock, 5000, 12);
    const fast = Math.max(...curveOf(played[0]).map(([, y]) => y));
    expect(fast).toBeLessThanOrEqual(12);
    expect(fast).toBeGreaterThan(11);
  });

  it('plays nothing for a finger at rest, with no depth to go, or under Reduce Motion', () => {
    bounceComposer(dock, 0, 12);
    bounceComposer(dock, 500, 0);
    const matchMedia = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({
        matches: /prefers-reduced-motion:\s*reduce/.test(query),
        media: query,
      }) as MediaQueryList;
    try {
      bounceComposer(dock, 500, 12);
    } finally {
      window.matchMedia = matchMedia;
    }
    expect(played).toEqual([]);
  });

  it('plays nothing inside a theme that reduces motion for everyone', () => {
    const theme = document.createElement('div');
    for (const [name, value] of Object.entries(reducedMotionMarkProps(true))) {
      theme.setAttribute(name, value);
    }
    theme.append(dock);
    document.body.append(theme);
    bounceComposer(dock, 500, 12);
    expect(played).toEqual([]);
  });
});
