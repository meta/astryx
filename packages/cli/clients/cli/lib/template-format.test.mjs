// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {placementLine, slotsText} from './template-format.mjs';

const SLOTS = [
  {name: 'kpis', kind: 'metrics', description: 'Metric cards under the chart.'},
  {name: 'body', kind: 'main'},
];

describe('slotsText', () => {
  it('prints each slot as its name and kind, and with describe what goes there', () => {
    expect(slotsText(SLOTS)).toBe('kpis (metrics), body (main)');
    expect(slotsText(SLOTS, {describe: true})).toBe(
      'kpis (metrics): Metric cards under the chart; body (main)',
    );
  });
});

describe('placementLine', () => {
  it("prints a page's slots or a block's fits, and nothing when there are neither", () => {
    expect(placementLine(SLOTS, undefined)).toBe('slots: kpis (metrics), body (main)');
    expect(placementLine(undefined, ['toolbar', 'header'])).toBe('fits: toolbar, header');
    expect(placementLine(undefined, [])).toMatch(/^fits: none \(it goes in no slot/);
    expect(placementLine(undefined, undefined)).toBeNull();
  });
});
