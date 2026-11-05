// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyboard.ts
 * @input None
 * @output `keyboard`: how the software keyboard moves on Android, in Chrome
 *   with Gboard, as the page sees it. It holds the slides' durations and
 *   curves, and when they start against Chrome's report and a blur.
 * @position The keyboard domain of the Android constants table, read by
 *   keyboard/keyboardModel.ts. The UIKit table holds iOS's keyboard.
 *
 * SYNC: When modified, update /packages/core/src/keyboard/README.md
 */

// Chrome reports the keyboard once per slide, through the visual viewport,
// just after the slide starts, never per frame. Content that rides the
// keyboard plays these curves from the slide's start, so it moves in step
// with Gboard. They are Gboard's own motion, with no motion role. The system
// moves the keyboard on them whatever the page does, so any other curve
// would leave the content out of step.
//
// The values come from the Android 15 emulator with Chromium 158 and Gboard.
// A screen recording at 540 × 1200 gives Gboard's top in every frame, beside
// a marker the page paints on each report. Every leaf carries one or more
// `@source`, and android.test.ts enforces it.
export const keyboard = {
  /**
   * How long Gboard takes to slide up, in ms: from its first moved frame to
   * its resting top.
   *
   * @source measured: Chromium 158 with Gboard on Android 15 (API 35
   *   emulator); 20 shows recorded frame by frame: 250 to 282 ms, 18 of
   *   them 264 to 268 ms, Oct 25 2026
   */
  showMs: 267,
  /**
   * The curve of Gboard's slide up, cubic-bézier control points: fast out,
   * a long settle.
   *
   * @source measured: Chromium 158 with Gboard on Android 15 (API 35
   *   emulator); the same 20 shows fit this curve over `showMs` within
   *   2.4 px rms, Oct 25 2026
   */
  showCurve: [0.1, 0, 0, 1],
  /**
   * How long after Gboard starts to slide up Chrome's report of it fires, in
   * ms. A show rides from the report dated back by this, joining the slide
   * where it is.
   *
   * @source measured: Chromium 158 with Gboard on Android 15 (API 35
   *   emulator); twelve shows: the first frame the page painted after the
   *   visual viewport's resize came 14 to 35 ms (median 33) after Gboard's
   *   first moved frame, less the 8 ms an event takes on average to reach
   *   the screen, Oct 25 2026
   */
  showReportLagMs: 25,
  /**
   * How long Gboard takes to slide down out of the page, in ms.
   *
   * @source measured: Chromium 158 with Gboard on Android 15 (API 35
   *   emulator); 21 hides recorded frame by frame, from Gboard's first
   *   moved frame until it leaves the screen: 148 to 153 ms in 20 of them;
   *   this length with `hideCurve` fits them within 7.7 px rms,
   *   Oct 25 2026
   */
  hideMs: 167,
  /**
   * The curve of Gboard's slide down, cubic-bézier control points: a slow
   * first frame, then fast.
   *
   * @source measured: Chromium 158 with Gboard on Android 15 (API 35
   *   emulator); the same 21 hides, a free fit over `hideMs`, Oct 25 2026
   */
  hideCurve: [0.3, 0.1, 0.2, 0.9],
  /**
   * How long after the focused field blurs (to nothing that brings up a
   * keyboard) Gboard starts to slide down, in ms.
   *
   * @source measured: Chromium 158 with Gboard on Android 15 (API 35
   *   emulator); five scripted blurs with a marker the page paints on the
   *   blur: Gboard's first moved frame came from a frame before the marker
   *   to 33 ms after it (median 16), Oct 25 2026
   */
  hideAfterBlurMs: 16,
  /**
   * How long after Gboard starts to slide down Chrome's report of the hide
   * fires, in ms, measured on blurs. A hide nothing predicts, such as Back,
   * reuses it, though Chrome can report Back later in the slide.
   *
   * @source measured: Chromium 158 with Gboard on Android 15 (API 35
   *   emulator); twelve scripted blurs: the visual viewport's resize came
   *   42 to 52 ms after the blur (median 49), less `hideAfterBlurMs`,
   *   Oct 25 2026
   */
  hideReportLagMs: 33,
} as const;
