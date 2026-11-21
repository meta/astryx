// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file brightness.ts
 * @input Screencast frames (`startScreencast`) and a CSS-px point on screen
 * @output `trackBrightness`: one colour channel's mean in a square, per frame,
 *   as a tracked value on `box.x`
 * @position Busy-window proofs of a fade or a dim read it, and judge the
 *   series with `busyWindowProof` or `pooledBusyProof` on `axis: 'x'`.
 */

import type {Page} from '@playwright/test';

import type {CastFrame, TrackedFrame} from './frames';

/**
 * One colour channel's mean at a CSS-px point in each cast frame: a square of
 * `size` bitmap px, red by default. It shows what a fade or a dim paints
 * there. The value is a scalar on `box.x`: judge it with `axis: 'x'`. The
 * proof reads its step from the series' own changes. Put the square on a flat
 * part of the element, because JPEG noise on an edge reads as change. The
 * frames are decoded in a scratch page, as `trackMarker` does.
 */
export async function trackBrightness(
  page: Page,
  castFrames: readonly CastFrame[],
  {
    x,
    y,
    size = 16,
    channel = 'r',
  }: {x: number; y: number; size?: number; channel?: 'r' | 'g' | 'b'},
): Promise<TrackedFrame[]> {
  const offset = {r: 0, g: 1, b: 2}[channel];
  const scratch = await page.context().newPage();
  try {
    const values: number[] = [];
    for (let i = 0; i < castFrames.length; i += 12) {
      const batch = castFrames.slice(i, i + 12);
      values.push(
        ...(await scratch.evaluate(
          async ({items, px, py, side, at}) => {
            const out: number[] = [];
            for (const item of items) {
              const blob = await (
                await fetch(`data:image/${item.format};base64,${item.data}`)
              ).blob();
              const bitmap = await createImageBitmap(blob);
              const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
              const context = canvas.getContext('2d');
              if (context == null) {
                throw new Error('no 2d context');
              }
              context.drawImage(bitmap, 0, 0);
              const scale = bitmap.width / item.viewportWidth;
              const {data} = context.getImageData(
                Math.round(px * scale),
                Math.round(py * scale),
                side,
                side,
              );
              let sum = 0;
              for (let o = at; o < data.length; o += 4) {
                sum += data[o];
              }
              out.push(sum / (data.length / 4));
            }
            return out;
          },
          {
            items: batch.map(f => ({
              data: f.data,
              format: f.format,
              viewportWidth: f.viewportWidth,
            })),
            px: x,
            py: y,
            side: size,
            at: offset,
          },
        )),
      );
    }
    return castFrames.map((f, i) => ({
      t: f.t,
      box: {x: values[i], y: 0, width: 1, height: 1},
      pixels: 1,
    }));
  } finally {
    await scratch.close();
  }
}
