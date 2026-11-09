// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {afterEach, describe, expect, it} from 'vitest';
import {collectBlogImages, imageSize} from '../../scripts/lib/blog-images.mjs';

/** A minimal valid PNG of the given size (one grey pixel row per line). */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const raw = Buffer.alloc((width + 1) * height);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

describe('blog image facts', () => {
  it('reads a PNG natural size from its header and rejects other bytes', () => {
    expect(imageSize(png(780, 412))).toEqual({width: 780, height: 412});
    expect(imageSize(Buffer.from('not an image'))).toBeNull();
  });

  it('reads an extended WebP canvas size', () => {
    // RIFF header + VP8X chunk: flags, then canvas width-1 and height-1 as
    // 24-bit little-endian values.
    const header = Buffer.alloc(30);
    header.write('RIFF', 0, 'latin1');
    header.writeUInt32LE(22, 4);
    header.write('WEBP', 8, 'latin1');
    header.write('VP8X', 12, 'latin1');
    header.writeUInt32LE(10, 16);
    header.writeUIntLE(1278 - 1, 24, 3);
    header.writeUIntLE(570 - 1, 27, 3);
    expect(imageSize(header)).toEqual({width: 1278, height: 570});
    // The real asset agrees.
    const real = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../public/blog/astryx-v0-6-0/adaptive-inputs.webp',
      ),
    );
    expect(imageSize(real)?.width).toBeGreaterThan(0);
  });

  it('records the natural size of @2x images only, light and dark alike', () => {
    const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-2x-'));
    tmpDirs.push(publicDir);
    const post = path.join(publicDir, 'blog', 'release');
    fs.mkdirSync(post, {recursive: true});
    fs.writeFileSync(path.join(post, 'swipe@2x.png'), png(780, 300));
    fs.writeFileSync(path.join(post, 'swipe@2x.dark.png'), png(780, 300));
    fs.writeFileSync(path.join(post, 'cover.png'), png(1200, 600));
    fs.writeFileSync(path.join(post, 'cover.dark.png'), png(1200, 600));

    const {darkImages, imageSizes} = collectBlogImages(publicDir);
    expect(darkImages).toEqual([
      '/blog/release/cover.dark.png',
      '/blog/release/swipe@2x.dark.png',
    ]);
    expect(imageSizes).toEqual({
      '/blog/release/swipe@2x.dark.png': {width: 780, height: 300},
      '/blog/release/swipe@2x.png': {width: 780, height: 300},
    });
  });
});
