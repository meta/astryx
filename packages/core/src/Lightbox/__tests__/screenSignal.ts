// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file screenSignal.ts
 * @input A screencast's frames (the interaction harness's startScreencast)
 * @output Exports `cadenceOutside`, the pace a recording keeps while the main
 *   thread is free, to judge a blocked main thread against. `regionSignal`
 *   is a region's mean brightness in every frame, for a change with no
 *   marker, such as a fade. `signalFrames` gives that signal as the frames
 *   `busyWindowProof` reads. `presentedFramesExpected` gives the frames a busy
 *   proof's window can show at no more than 60 a second
 * @position Test helper for Lightbox's busy-main-thread proofs
 *   (__tests__/*.interaction.browser.spec.ts)
 */

import type {Page} from '@playwright/test';
import type {CastFrame, TrackedFrame} from '@astryxdesign/interaction-harness';

/**
 * The recording's own median frame interval outside the block (ms): the
 * pace the screen keeps while the main thread is free. Linux WebKit
 * composites in software on the CPU the blocked main thread spins on. So on
 * a loaded machine it presents more slowly during a block than outside it,
 * and a proof judges the block against this pace.
 */
export function cadenceOutside(
  frames: ReadonlyArray<{t: number}>,
  block: {from: number; to: number},
): number {
  const times = frames
    .map(f => f.t)
    .filter(t => t < block.from || t > block.to)
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    if (!(times[i - 1] < block.from && times[i] > block.to)) {
      gaps.push(times[i] - times[i - 1]);
    }
  }
  gaps.sort((a, b) => a - b);
  return gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 1000 / 60;
}

/**
 * The mean brightness of `rect` (page CSS px) in each screencast frame. A
 * fade, or a photo leaving with the backdrop fading behind it, changes those
 * pixels every frame it runs, even where nothing carries a marker. Decoding
 * runs in a scratch page, as the harness's marker tracking does.
 */
export async function regionSignal(
  page: Page,
  cast: ReadonlyArray<CastFrame>,
  rect: {x: number; y: number; width: number; height: number},
): Promise<{t: number; value: number}[]> {
  const scratch = await page.context().newPage();
  try {
    const out: {t: number; value: number}[] = [];
    for (let i = 0; i < cast.length; i += 12) {
      const batch = cast.slice(i, i + 12);
      const values = await scratch.evaluate(
        async ({items, box}) => {
          const results: number[] = [];
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
            const k = bitmap.width / item.viewportWidth;
            const {data} = context.getImageData(
              Math.round(box.x * k),
              Math.round(box.y * k),
              Math.max(1, Math.round(box.width * k)),
              Math.max(1, Math.round(box.height * k)),
            );
            let sum = 0;
            for (let o = 0; o < data.length; o += 4) {
              sum += data[o] + data[o + 1] + data[o + 2];
            }
            results.push(sum / (data.length / 4) / 3);
          }
          return results;
        },
        {
          items: batch.map(c => ({
            data: c.data,
            format: c.format,
            viewportWidth: c.viewportWidth,
          })),
          box: rect,
        },
      );
      values.forEach((value, k) => out.push({t: batch[k].t, value}));
    }
    return out;
  } finally {
    await scratch.close();
  }
}

/**
 * Whole frame intervals in a busy proof's judged part, counted at no less
 * than one 60 Hz frame. WebKit's container screencast can alternate about
 * 11.3 and 17.1 ms intervals, so the median a proof counts in can be 11.3 ms.
 * It then promises more frames than a 60 Hz display presents. It also reads
 * every 17 ms interval as a dropped frame, though the animation moved in each
 * frame shown.
 */
export function presentedFramesExpected(proof: {
  readonly judged: {readonly from: number; readonly to: number};
  readonly cadenceMs: number;
  readonly compositorFrameMs: number | null;
}): number {
  const frameMs = Math.max(
    proof.compositorFrameMs ?? proof.cadenceMs,
    1000 / 60,
  );
  return Math.floor((proof.judged.to - proof.judged.from) / frameMs);
}

/**
 * A region signal as the frames `busyWindowProof` reads. Each value, times
 * `scale`, is the frame's `y`, so judge it with `axis: 'y'`. The proof counts
 * a frame as moved when that changes by more than 0.25. So a scale of 5
 * counts a change of the mean brightness by more than 0.05 of 255.
 */
export function signalFrames(
  signal: ReadonlyArray<{t: number; value: number}>,
  scale: number,
): TrackedFrame[] {
  return signal.map(({t, value}) => ({
    t,
    box: {x: 0, y: value * scale, width: 0, height: 0},
    pixels: 1,
  }));
}
