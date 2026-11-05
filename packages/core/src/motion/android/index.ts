// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input The domain files of the Android constants table
 * @output Re-exports `keyboard`
 * @position Entry of the Android constants table (motion/android). It is
 *   internal to core, not exported from the package entry point.
 *
 * Where a touch presentation follows something Android draws itself, such as
 * the software keyboard, its numbers come from here with their sources. The
 * UIKit table does the same for iOS.
 *
 * SYNC: When you add a domain file, re-export it here and list it in
 * /packages/core/src/motion/README.md.
 */

export {keyboard} from './keyboard';
