// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {pixel as tablePixel} from '../Table/utils';
import {percent as barrelPercent} from './index';
import {percent, pixel} from './utils';
import type {ResizablePercentSize, ResizableSize} from './utils';

describe('Resizable structured sizing helpers', () => {
  it('creates a percentage with a pixel floor', () => {
    expect(percent(40, {min: pixel(333)})).toEqual({
      type: 'percent',
      value: 40,
      min: {type: 'pixel', value: 333},
    });
  });

  it('creates a percentage with a pixel ceiling', () => {
    expect(percent(10, {max: pixel(400)})).toEqual({
      type: 'percent',
      value: 10,
      max: {type: 'pixel', value: 400},
    });
  });

  it('keeps compatible atomic values and structured helpers in the union', () => {
    const values = [
      333,
      '333px',
      '40%',
      pixel(333),
      percent(40, {min: pixel(333)}),
      percent(10, {max: pixel(400)}),
    ] satisfies ResizableSize[];
    expect(values).toHaveLength(6);
  });

  it('re-exports Table pixel and percent without a root collision', async () => {
    const [module, root] = await Promise.all([
      import('@astryxdesign/core/Resizable/utils'),
      import('@astryxdesign/core'),
    ]);
    const source = readFileSync(
      join(process.cwd(), 'packages/core/src/Resizable/utils.ts'),
      'utf8',
    );

    expect(pixel).toBe(tablePixel);
    expect(module.pixel).toBe(tablePixel);
    expect(module.percent).toBe(percent);
    expect(root.pixel).toBe(tablePixel);
    expect(root.percent).toBe(percent);
    expect(barrelPercent).toBe(percent);
    expect(source).not.toContain("'use client'");
    expect(source).toContain("export {pixel} from '../Table/utils'");
  });

  it('requires exactly one pixel helper bound at compile time', () => {
    // @ts-expect-error an unbounded percentage already uses the canonical 'N%' spelling
    const missing: ResizablePercentSize = {type: 'percent', value: 40};
    // @ts-expect-error a descriptor carries a floor XOR a ceiling, never both
    const both: ResizablePercentSize = {
      type: 'percent',
      value: 40,
      min: pixel(100),
      max: pixel(500),
    };
    // @ts-expect-error the options argument is required
    const duplicate = percent(40);
    expect([missing, both, duplicate]).toHaveLength(3);
  });
});
