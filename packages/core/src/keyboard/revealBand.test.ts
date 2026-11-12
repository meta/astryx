// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file revealBand.test.ts
 * @input revealBand.ts
 * @output Tests for distanceIntoBand: both edges, a box that fits, a box
 *   taller than the band and an empty band
 * @position Keyboard module tests
 */

import {describe, expect, it} from 'vitest';
import {distanceIntoBand} from './revealBand';

describe('distanceIntoBand', () => {
  it('scrolls a box below the band up by how far its bottom overhangs', () => {
    expect(distanceIntoBand(500, 540, 0, 451)).toBe(89);
  });

  it('scrolls a box above the band down by how far its top overhangs', () => {
    expect(distanceIntoBand(-120, -80, 0, 451)).toBe(-120);
    expect(distanceIntoBand(40, 80, 64, 451)).toBe(-24);
  });

  it('leaves a box that fits', () => {
    expect(distanceIntoBand(100, 140, 0, 451)).toBe(0);
  });

  it('keeps a box taller than the band by its bottom edge', () => {
    expect(distanceIntoBand(-50, 600, 0, 451)).toBe(149);
  });

  it('moves nothing when the band is empty', () => {
    expect(distanceIntoBand(500, 540, 300, 300)).toBe(0);
    expect(distanceIntoBand(500, 540, 300, 200)).toBe(0);
  });
});
