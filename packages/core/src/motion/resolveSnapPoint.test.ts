// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import * as core from '../index';
import {resolveSnapPoint} from './resolveSnapPoint';

const here = path.dirname(fileURLToPath(import.meta.url));

const SHEET = {
  flickThreshold: 1008,
  tolerance: 1,
  projection: {seconds: 0.1, minSpeed: 250},
} as const;

describe('resolveSnapPoint', () => {
  it('lands a slow release on the snap point nearest where it was let go', () => {
    expect(
      resolveSnapPoint({
        points: [0, 300, 640],
        position: 140,
        velocity: 0,
        flickThreshold: 48,
      }),
    ).toEqual({index: 0, projected: 140});
    expect(
      resolveSnapPoint({
        points: [0, 300, 640],
        position: 160,
        velocity: 20,
        flickThreshold: 48,
      }).index,
    ).toBe(1);
  });

  it('projects nothing below the projection speed, and judges a faster slow release where it coasts to', () => {
    // 240 px/s is below 250: judged at 140, nearer 0.
    expect(
      resolveSnapPoint({
        ...SHEET,
        points: [0, 300, 640],
        position: 140,
        velocity: 240,
      }),
    ).toEqual({index: 0, projected: 140});
    // 600 px/s projects 0.1 s ahead: 140 + 60 = 200, nearer 300.
    const projected = resolveSnapPoint({
      ...SHEET,
      points: [0, 300, 640],
      position: 140,
      velocity: 600,
    });
    expect(projected.index).toBe(1);
    expect(projected.projected).toBeCloseTo(200, 6);
  });

  it('takes a flick at least to the next snap point beyond, or to its projection if that is farther', () => {
    // At 300 moving 1200 px/s: projected 420 (nearer 300), but a flick goes on.
    const flick = resolveSnapPoint({
      ...SHEET,
      points: [0, 300, 640],
      position: 300,
      velocity: 1200,
    });
    expect(flick.index).toBe(2);
    expect(flick.projected).toBeCloseTo(420, 6);
    // Without projection, from just past the first snap point.
    expect(
      resolveSnapPoint({
        points: [0, 300],
        position: 2,
        velocity: 60,
        flickThreshold: 48,
      }).index,
    ).toBe(1);
    // Moving down the axis, to the next snap point below.
    expect(
      resolveSnapPoint({
        ...SHEET,
        points: [0, 300, 640],
        position: 620,
        velocity: -1100,
      }).index,
    ).toBe(1);
  });

  it('counts a snap point within the tolerance as reached, so a flick goes on to the one after it', () => {
    expect(
      resolveSnapPoint({
        points: [0, 300, 640],
        position: 300.5,
        velocity: 2000,
        flickThreshold: 1008,
        tolerance: 1,
      }).index,
    ).toBe(2);
    // Past the last snap point there is nothing beyond: the nearest stays.
    expect(
      resolveSnapPoint({
        points: [0, 300],
        position: 310,
        velocity: 2000,
        flickThreshold: 1008,
        tolerance: 1,
      }).index,
    ).toBe(1);
  });

  it('cancels a release moving back toward where the drag began, whatever its travel or speed', () => {
    // Dragged from 0 to 280, released slowly moving back up: back to 0.
    expect(
      resolveSnapPoint({
        ...SHEET,
        points: [0, 300, 640],
        position: 280,
        velocity: -10,
        start: 0,
      }).index,
    ).toBe(0);
    // A flick back toward the start cancels too.
    expect(
      resolveSnapPoint({
        ...SHEET,
        points: [0, 300, 640],
        position: 500,
        velocity: -1500,
        start: 300,
      }).index,
    ).toBe(1);
    // Moving away from the start does not cancel.
    expect(
      resolveSnapPoint({
        ...SHEET,
        points: [0, 300, 640],
        position: 280,
        velocity: 10,
        start: 0,
      }).index,
    ).toBe(1);
  });

  it('sends a tie the way a projected release moves, and otherwise to the earlier snap point', () => {
    const at = (velocity: number, projection?: typeof SHEET.projection) =>
      resolveSnapPoint({
        points: [0, 300],
        // Released where its projection lands on the midpoint.
        position: 150 - velocity * 0.1 * (projection == null ? 0 : 1),
        velocity,
        flickThreshold: 1008,
        projection,
      }).index;
    expect(at(0)).toBe(0);
    expect(at(10)).toBe(0);
    expect(at(-10)).toBe(0);
    expect(at(400, SHEET.projection)).toBe(1);
    expect(at(-400, SHEET.projection)).toBe(0);
  });

  it('needs at least one snap point', () => {
    expect(() =>
      resolveSnapPoint({
        points: [],
        position: 0,
        velocity: 0,
        flickThreshold: 1,
      }),
    ).toThrow(RangeError);
  });

  it('stays internal: not exported from the package or any barrel', () => {
    expect(core).not.toHaveProperty('resolveSnapPoint');
    const pkg = JSON.parse(
      fs.readFileSync(path.join(here, '../../package.json'), 'utf8'),
    ) as {exports: Record<string, unknown>};
    expect(
      Object.keys(pkg.exports).filter(key => key.includes('motion')),
    ).toEqual([]);
    const barrels = fs
      .readdirSync(here)
      .filter(name => /^index\.(ts|tsx|js|mjs)$/.test(name));
    for (const barrel of barrels) {
      expect(fs.readFileSync(path.join(here, barrel), 'utf8')).not.toMatch(
        /resolveSnapPoint/,
      );
    }
  });
});
