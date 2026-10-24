// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file storyboard.ts
 * @input Uses a Playwright `Page`, a clip (`Locator` or box), ./curves to seek
 *   animations, ./touch to play scripted touches, and ./output to write
 * @output `Storyboard` (collect frames, write a PNG contact sheet + JSON trace),
 *   `animationStoryboard` (seek every held animation to t = 0, 16.7, 33.3 … ms
 *   and photograph each), `touchStoryboard` (photograph the page after every
 *   scripted touch event).
 * @position Deterministic filmstrips: frames come from seeking paused
 *   animations or from stepping scripted input, never from wall-clock capture,
 *   so the same code produces the same sheet. The JSON trace carries the
 *   measured value of every frame and is what the spec asserts; the sheet is
 *   the human evidence attached to the report (and linked from a pull
 *   request, never committed).
 *
 * The contact sheet is composed in a scratch page of the same browser (a
 * canvas grid with a label per cell), so the harness needs no image library.
 *
 * SYNC: Keep the README's storyboard section and `pnpm storyboards` in step.
 */

import type {Locator, Page, TestInfo} from '@playwright/test';
import {holdAnimations, seekAnimations, type HeldAnimation} from './curves';
import {timeline} from './math';
import {writeEvidence} from './output';
import type {TouchScript} from './scripts';
import type {TouchDriver} from './touch';

export interface ClipBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StoryboardFrame {
  readonly label: string;
  /** Milliseconds on the storyboard's own timeline. */
  readonly t: number;
  /** Measurements taken at this frame; the spec asserts these. */
  readonly data: Readonly<Record<string, unknown>>;
  readonly png: Buffer;
}

export interface StoryboardOptions {
  readonly name: string;
  /** What to photograph: an element, a box, or the whole viewport (default). */
  readonly clip?: Locator | ClipBox;
  /** Grid columns in the sheet (default: up to 8). */
  readonly columns?: number;
  /** Cell scale relative to CSS px (default 0.5). */
  readonly cellScale?: number;
}

export class Storyboard {
  readonly frames: StoryboardFrame[] = [];
  private clipBox: ClipBox | undefined;

  constructor(
    private readonly page: Page,
    readonly options: StoryboardOptions,
  ) {}

  /** Photographs the clip now and records `data` with it. */
  async capture(
    label: string,
    t: number,
    data: Readonly<Record<string, unknown>> = {},
  ): Promise<void> {
    const clip = await this.resolveClip();
    const png = await this.page.screenshot({
      clip,
      scale: 'css',
      animations: 'allow',
      caret: 'hide',
    });
    this.frames.push({label, t, data, png});
  }

  private async resolveClip(): Promise<ClipBox | undefined> {
    if (this.clipBox != null) {
      return this.clipBox;
    }
    const {clip} = this.options;
    if (clip == null) {
      return undefined;
    }
    if ('boundingBox' in clip) {
      // A locator is measured once, at the first frame, so every cell shows the same region.
      const box = await clip.boundingBox();
      if (box == null) {
        throw new Error(
          `storyboard ${this.options.name}: clip element is not visible`,
        );
      }
      const viewport = this.page.viewportSize();
      const x = Math.max(0, Math.floor(box.x));
      const y = Math.max(0, Math.floor(box.y));
      const right = Math.min(
        viewport?.width ?? Infinity,
        Math.ceil(box.x + box.width),
      );
      const bottom = Math.min(
        viewport?.height ?? Infinity,
        Math.ceil(box.y + box.height),
      );
      this.clipBox = {x, y, width: right - x, height: bottom - y};
    } else {
      this.clipBox = clip;
    }
    return this.clipBox;
  }

  /** The JSON trace: every frame's label, time and data. */
  trace(
    extra: Readonly<Record<string, unknown>> = {},
  ): Record<string, unknown> {
    return {
      name: this.options.name,
      browser: this.page.context().browser()?.browserType().name() ?? null,
      viewport: this.page.viewportSize(),
      clip: this.clipBox ?? null,
      ...extra,
      frames: this.frames.map(({label, t, data}) => ({label, t, data})),
    };
  }

  /** Composes the sheet, writes `sheet.png` + `trace.json`, attaches both. */
  async write(
    testInfo?: TestInfo,
    extra: Readonly<Record<string, unknown>> = {},
  ): Promise<Record<string, string>> {
    if (this.frames.length === 0) {
      throw new Error(`storyboard ${this.options.name}: no frames`);
    }
    const sheet = await composeSheet(this.page, this.frames, this.options);
    const browser =
      this.page.context().browser()?.browserType().name() ?? 'browser';
    return writeEvidence(
      `storyboards/${this.options.name}.${browser}`,
      {
        'sheet.png': sheet,
        'trace.json': JSON.stringify(this.trace(extra), null, 2),
      },
      testInfo,
    );
  }
}

async function composeSheet(
  page: Page,
  frames: readonly StoryboardFrame[],
  options: StoryboardOptions,
): Promise<Buffer> {
  const scratch = await page.context().newPage();
  try {
    const dataUrl = await scratch.evaluate(
      async ({cells, columns, scale, title}) => {
        const images = await Promise.all(
          cells.map(async cell =>
            createImageBitmap(
              await (await fetch(`data:image/png;base64,${cell.png}`)).blob(),
            ),
          ),
        );
        const cellW = Math.ceil(images[0].width * scale);
        const cellH = Math.ceil(images[0].height * scale);
        const labelH = 30;
        const pad = 8;
        const cols = Math.min(columns, cells.length);
        const rows = Math.ceil(cells.length / cols);
        const canvas = document.createElement('canvas');
        canvas.width = pad + cols * (cellW + pad);
        canvas.height = 28 + pad + rows * (cellH + labelH + pad);
        const context = canvas.getContext('2d');
        if (context == null) {
          throw new Error('no 2d context');
        }
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#111111';
        context.font = '600 14px sans-serif';
        context.fillText(title, pad, 19);
        cells.forEach((cell, i) => {
          const x = pad + (i % cols) * (cellW + pad);
          const y = 28 + pad + Math.floor(i / cols) * (cellH + labelH + pad);
          context.drawImage(images[i], x, y, cellW, cellH);
          context.strokeStyle = '#999999';
          context.lineWidth = 1;
          context.strokeRect(x - 0.5, y - 0.5, cellW + 1, cellH + 1);
          context.fillStyle = '#111111';
          context.font = '600 11px sans-serif';
          context.fillText(cell.label, x, y + cellH + 13, cellW);
          context.fillStyle = '#555555';
          context.font = '10px monospace';
          context.fillText(cell.caption, x, y + cellH + 26, cellW);
        });
        return canvas.toDataURL('image/png');
      },
      {
        cells: frames.map(f => ({
          png: f.png.toString('base64'),
          label: f.label,
          caption: Object.entries(f.data)
            .filter(
              ([, v]) =>
                typeof v === 'number' ||
                typeof v === 'string' ||
                typeof v === 'boolean',
            )
            .map(
              ([k, v]) =>
                `${k}=${typeof v === 'number' ? +v.toFixed(1) : String(v)}`,
            )
            .join(' '),
        })),
        columns: options.columns ?? 8,
        scale: options.cellScale ?? 0.5,
        title: options.name,
      },
    );
    return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  } finally {
    await scratch.close();
  }
}

export interface AnimationStoryboardOptions extends StoryboardOptions {
  /**
   * Frame times, ms (default every 16.7 ms to the end of the longest held
   * animation's curve; a held end value is not filmed).
   */
  readonly times?: readonly number[];
  /** Restrict to animations inside this element. */
  readonly scope?: Locator;
  /** Measurements per frame (runs after the seek). */
  readonly measure?: () => Promise<Readonly<Record<string, unknown>>>;
}

/**
 * Holds every running animation, then seeks them together to each time and
 * photographs the clip. Call it right after starting the animation under test.
 */
export async function animationStoryboard(
  page: Page,
  options: AnimationStoryboardOptions,
): Promise<{storyboard: Storyboard; held: HeldAnimation[]}> {
  const held = await holdAnimations(page, options.scope);
  if (held.length === 0) {
    throw new Error(`storyboard ${options.name}: no running animation to hold`);
  }
  const longest = Math.max(...held.map(a => a.curveEndMs));
  const times = options.times ?? timeline(longest);
  const storyboard = new Storyboard(page, options);
  for (const t of times) {
    await seekAnimations(page, t);
    const data = (await options.measure?.()) ?? {};
    await storyboard.capture(`t=${+t.toFixed(1)} ms`, t, data);
  }
  return {storyboard, held};
}

export interface TouchStoryboardOptions extends StoryboardOptions {
  readonly measure?: () => Promise<Readonly<Record<string, unknown>>>;
}

/**
 * Plays a touch script without wall-clock pacing and photographs the page
 * after every event. In Chromium the page still sees the scripted timestamps,
 * so velocity-dependent behavior is unchanged; in WebKit the page sees the
 * real (slower) dispatch times.
 */
export async function touchStoryboard(
  page: Page,
  driver: TouchDriver,
  script: TouchScript,
  options: TouchStoryboardOptions,
): Promise<Storyboard> {
  const storyboard = new Storyboard(page, options);
  await storyboard.capture('before', 0, (await options.measure?.()) ?? {});
  await driver.play(script, {
    realtime: false,
    onEvent: async step => {
      // Let the page run its handlers and present the frame before the photo.
      await page.evaluate(
        () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const data = (await options.measure?.()) ?? {};
      const where = step.changed
        .map(f => `${Math.round(f.x)},${Math.round(f.y)}`)
        .join(' ');
      await storyboard.capture(
        `${step.type} t=${+step.t.toFixed(1)} @${where}`,
        step.t,
        data,
      );
    },
  });
  return storyboard;
}

/**
 * A filmstrip of screencast frames (real presented frames, e.g. the frames of
 * a busy-main-thread window), labelled with their time relative to `zero`.
 * Evidence for what the compositor presented, not a deterministic storyboard.
 */
export async function castStoryboard(
  page: Page,
  frames: readonly {
    readonly t: number;
    readonly data: string;
    readonly format: 'png' | 'jpeg';
  }[],
  options: StoryboardOptions & {
    readonly zero: number;
    readonly from?: number;
    readonly to?: number;
    readonly data?: (t: number) => Readonly<Record<string, unknown>>;
  },
): Promise<Storyboard> {
  const storyboard = new Storyboard(page, options);
  for (const frame of frames) {
    if (options.from != null && frame.t < options.from) {
      continue;
    }
    if (options.to != null && frame.t > options.to) {
      continue;
    }
    const png =
      frame.format === 'png'
        ? Buffer.from(frame.data, 'base64')
        : await toPng(page, frame.data);
    const t = frame.t - options.zero;
    storyboard.frames.push({
      label: `t=${t.toFixed(1)} ms`,
      t,
      data: options.data?.(frame.t) ?? {},
      png,
    });
  }
  return storyboard;
}

async function toPng(page: Page, jpegBase64: string): Promise<Buffer> {
  const scratch = await page.context().newPage();
  try {
    const url = await scratch.evaluate(async data => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/jpeg;base64,${data}`)).blob(),
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      return canvas.toDataURL('image/png');
    }, jpegBase64);
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  } finally {
    await scratch.close();
  }
}
