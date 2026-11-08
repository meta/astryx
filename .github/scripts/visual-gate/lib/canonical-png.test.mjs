// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {PNG} from 'pngjs';

import {CANONICAL_PNG_OPTIONS, canonicalizePng} from './canonical-png.mjs';

function image(red, green = 0, blue = 0) {
  const value = new PNG({width: 2, height: 2});
  for (let offset = 0; offset < value.data.length; offset += 4) {
    value.data[offset] = red;
    value.data[offset + 1] = green;
    value.data[offset + 2] = blue;
    value.data[offset + 3] = 255;
  }
  return value;
}

describe('canonical PNG encoding', () => {
  it('pins every encoder option that affects durable bytes', () => {
    expect(CANONICAL_PNG_OPTIONS).toEqual({
      bitDepth: 8,
      colorType: 6,
      deflateChunkSize: 32 * 1024,
      deflateLevel: 9,
      deflateStrategy: 3,
      filterType: -1,
      inputColorType: 6,
      inputHasAlpha: true,
    });
  });

  it('normalizes compression and metadata without changing pixels', () => {
    const plain = PNG.sync.write(image(0, 0, 255));
    const withMetadata = image(0, 0, 255);
    withMetadata.gamma = 0.45455;
    const alternate = PNG.sync.write(withMetadata, {
      deflateLevel: 0,
      deflateStrategy: 0,
      filterType: 0,
    });

    expect(alternate).not.toEqual(plain);
    expect(PNG.sync.read(alternate).data).toEqual(PNG.sync.read(plain).data);
    expect(canonicalizePng(alternate).bytes).toEqual(
      canonicalizePng(plain).bytes,
    );
  });

  it('keeps changed pixels distinct and rejects corrupt bytes', () => {
    expect(canonicalizePng(PNG.sync.write(image(255))).bytes).not.toEqual(
      canonicalizePng(PNG.sync.write(image(0, 255))).bytes,
    );
    expect(() => canonicalizePng(Buffer.from('not a PNG'))).toThrow();
  });
});
