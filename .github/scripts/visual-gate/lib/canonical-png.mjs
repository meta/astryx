// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

export const CANONICAL_PNG_OPTIONS = Object.freeze({
  bitDepth: 8,
  colorType: 6,
  deflateChunkSize: 32 * 1024,
  deflateLevel: 9,
  deflateStrategy: 3,
  filterType: -1,
  inputColorType: 6,
  inputHasAlpha: true,
});

export function canonicalizePng(bytes) {
  const {PNG} = require('pngjs');
  const image = PNG.sync.read(bytes, {checkCRC: true});
  return {
    bytes: PNG.sync.write(
      {data: image.data, height: image.height, width: image.width},
      {...CANONICAL_PNG_OPTIONS},
    ),
    height: image.height,
    width: image.width,
  };
}
