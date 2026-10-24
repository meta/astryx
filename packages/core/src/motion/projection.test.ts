// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file projection.test.ts
 * @input vitest, the projection functions
 * @output Checks WWDC18's projection verbatim and the release-target rules
 *   (nearest projected rest, step limits, paging)
 * @position Testing; validates projection.ts without a browser
 */

import {describe, expect, it} from 'vitest';
import {
  project,
  projectDistance,
  selectPage,
  selectSnapPoint,
} from './projection';
import {scroll} from './uikit/scroll';

describe('projectDistance', () => {
  it('is WWDC18\u2019s (v ÷ 1000)·r ÷ (1 − r)', () => {
    for (const velocity of [-2500, -1, 0, 640, 3000]) {
      for (const rate of [0.998, 0.99]) {
        expect(projectDistance(velocity, rate)).toBeCloseTo(
          ((velocity / 1000) * rate) / (1 - rate),
          9,
        );
      }
    }
  });

  it('projects 499 ms of the release speed at the normal rate (the sheet\u2019s prior art)', () => {
    expect(projectDistance(1000)).toBeCloseTo(499, 9);
    expect(projectDistance(1000, scroll.decelerationRate.fast)).toBeCloseTo(
      99,
      9,
    );
  });

  it('a release at rest projects onto itself', () => {
    expect(project(321, 0)).toBe(321);
  });

  it('rejects a rate outside (0, 1)', () => {
    expect(() => projectDistance(10, 1)).toThrow(RangeError);
  });
});

describe('selectSnapPoint', () => {
  const detents = [0, 300, 600];

  it('goes to the point nearest the projected rest, not the release point', () => {
    // Released nearer 300, but thrown toward 600.
    expect(selectSnapPoint(detents, {position: 320, velocity: 900}).value).toBe(
      600,
    );
    // A slow release places.
    expect(selectSnapPoint(detents, {position: 320, velocity: 20}).value).toBe(
      300,
    );
    // Thrown the other way.
    expect(
      selectSnapPoint(detents, {position: 320, velocity: -900}).value,
    ).toBe(0);
  });

  it('a projection past the ends lands on the end', () => {
    expect(
      selectSnapPoint(detents, {position: 580, velocity: 6000}).value,
    ).toBe(600);
    expect(
      selectSnapPoint(detents, {position: 10, velocity: -6000}).index,
    ).toBe(0);
  });

  it('reports the projection it chose from', () => {
    const choice = selectSnapPoint(detents, {position: 100, velocity: 400});
    expect(choice.projected).toBeCloseTo(100 + 0.4 * 499, 9);
  });

  it('limits the travel to maxSteps points from fromIndex', () => {
    const pages = [0, 100, 200, 300, 400];
    expect(selectSnapPoint(pages, {position: 110, velocity: 5000}).value).toBe(
      400,
    );
    expect(
      selectSnapPoint(pages, {
        position: 110,
        velocity: 5000,
        fromIndex: 1,
        maxSteps: 1,
      }).value,
    ).toBe(200);
  });

  it('breaks an exact tie toward the direction of travel', () => {
    expect(
      selectSnapPoint([0, 100], {position: 50, velocity: 0.0001, rate: 0.5})
        .value,
    ).toBe(100);
    expect(
      selectSnapPoint([0, 100], {position: 50, velocity: -0.0001, rate: 0.5})
        .value,
    ).toBe(0);
  });

  it('needs at least one point', () => {
    expect(() => selectSnapPoint([], {position: 0, velocity: 0})).toThrow(
      RangeError,
    );
  });
});

describe('selectPage', () => {
  it('lands on a real page when the current page is past the end', () => {
    const result = selectPage({
      position: 400,
      velocity: 0,
      pageSize: 100,
      pageCount: 3,
      currentPage: 4,
    });
    expect(result.value).toBeDefined();
    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.index).toBeLessThanOrEqual(2);
  });

  it('moves at most one page per release', () => {
    const page = (position: number, velocity: number, currentPage: number) =>
      selectPage({position, velocity, pageSize: 390, pageCount: 6, currentPage})
        .index;
    expect(page(390, 0, 1)).toBe(1);
    expect(page(430, 8000, 1)).toBe(2);
    expect(page(350, -8000, 1)).toBe(0);
    // A slow drag past half a page settles on the next page.
    expect(page(600, 0, 1)).toBe(2);
    expect(page(1950, 9000, 5)).toBe(5);
  });
});
