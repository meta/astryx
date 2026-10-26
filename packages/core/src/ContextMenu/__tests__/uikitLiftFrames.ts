// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file uikitLiftFrames.ts
 * @input UIKit's context-menu presentation measured on iOS 26.2 (iPhone 17
 *   Pro simulator, 60 Hz): a 200 × 120 pt card in the middle of the screen
 *   (x 101, y 377), held 0.9 s, a 3-action menu
 * @output UIKIT_LIFT_FRAMES and UIKIT_LIFT_STARTS: per-frame presentation
 *   values from willDisplay, and when each one starts moving
 * @position Fixture for the lift's parity tests
 *   (packages/core/src/ContextMenu/contextMenuLiftGeometry.test.ts)
 *
 * Columns: ms after willDisplay; the backdrop's alpha; the preview's width
 * (pt; the press had grown it to 212.36); the menu content's opacity; its
 * blur (pt). The frame at +27 ms, which still reads the model values, is
 * left out, as is the preview's width at +45 ms (not yet presented).
 */

export const UIKIT_LIFT_FRAMES: ReadonlyArray<
  readonly [
    ms: number,
    backdrop: number,
    previewWidth: number | null,
    menuOpacity: number,
    menuBlur: number,
  ]
> = [
  [45.4, 0.0449, null, 0.138, 3.447],
  [62, 0.1504, 215.16, 0.297, 2.812],
  [78.7, 0.2832, 217.19, 0.453, 2.188],
  [95.4, 0.421, 219.19, 0.593, 1.63],
  [112, 0.5505, 220.96, 0.71, 1.159],
  [128.7, 0.6644, 222.42, 0.804, 0.783],
  [145.4, 0.7596, 223.57, 0.876, 0.496],
  [162, 0.8358, 224.45, 0.929, 0.285],
  [178.7, 0.8945, 225.09, 0.965, 0.139],
  [195.4, 0.9381, 225.53, 0.99, 0.042],
  [212, 0.9689, 225.83, 1.004, -0.017],
  [228.7, 0.9898, 226.01, 1.012, -0.05],
  [245.4, 1.003, 226.11, 1.016, -0.063],
  [262, 1.0106, 226.16, 1.016, -0.066],
  [278.7, 1.0142, 226.39, 1.015, -0.061],
  [295.4, 1.0152, 226.37, 1.013, -0.052],
  [312, 1.0145, 226.33, 1.011, -0.043],
  [328.7, 1.0129, 226.27, 1.008, -0.033],
  [345.4, 1.0109, 226.21, 1.006, -0.025],
  [362, 1.0088, 226.16, 1.004, -0.018],
  [378.7, 1.0068, 226.12, 1.003, -0.012],
  [395.4, 1.0051, 226.08, 1.002, -0.008],
  [412, 1.0036, 226.05, 1.001, -0.004],
  [428.7, 1.0025, 226.03, 1.001, -0.002],
  [445.4, 1.0016, 226.02, 1, -0.001],
  [462, 1.0009, 226.01, 1, 0],
  [478.7, 1.0005, 226, 1, 0],
];

/** The preview's width when the menu shows: the press's 1.0618 × 200 pt. */
export const UIKIT_LIFT_PREVIEW_FROM = 212.36;

/**
 * When each value starts moving, ms after willDisplay (UIKit commits the
 * animations a frame or two after the delegate call): least-squares starts
 * for the springs the lift uses.
 */
export const UIKIT_LIFT_STARTS = {
  backdrop: 28.5,
  previewWidth: 18.5,
  menuOpacity: 12.5,
  menuBlur: 12.5,
} as const;
