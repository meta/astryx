// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for cross-platform palette-receipt comparison.
 * @input Receipts with exact, near-equal, and materially different diagnostics.
 * @output Proof that only insignificant diagnostic float drift is tolerated.
 * @position Regression coverage for palette-receipt-test-utils.mjs.
 */

import {describe, expect, it} from 'vitest';
import {assertPaletteReceiptsMatch} from './palette-receipt-test-utils.mjs';

const receipt = {
  request: {recipe: 'astryx-oklch-v1'},
  paletteSha256: 'palette',
  requestSha256: 'request',
  diagnostics: {
    families: {
      blue: {
        light: {
          monotonic: true,
          maximumHueDrift: 12.345678901234,
          anchors: [{stop: 50, deltaE: 0.000000000001}],
        },
      },
    },
  },
};

describe('palette receipt comparison', () => {
  it('accepts insignificant floating-point drift in diagnostics', () => {
    const generated = structuredClone(receipt);
    generated.diagnostics.families.blue.light.maximumHueDrift += 1e-13;
    generated.diagnostics.families.blue.light.anchors[0].deltaE += 1e-15;

    expect(() => assertPaletteReceiptsMatch(generated, receipt)).not.toThrow();
  });

  it('rejects stable-field differences', () => {
    const generated = structuredClone(receipt);
    generated.paletteSha256 = 'different';

    expect(() => assertPaletteReceiptsMatch(generated, receipt)).toThrow();
  });

  it('rejects material diagnostic differences', () => {
    const generated = structuredClone(receipt);
    generated.diagnostics.families.blue.light.maximumHueDrift += 0.01;

    expect(() => assertPaletteReceiptsMatch(generated, receipt)).toThrow();
  });
});
