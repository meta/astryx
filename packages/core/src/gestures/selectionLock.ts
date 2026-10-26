// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectionLock.ts
 * @input The selection lock in utils/selectionLock.ts
 * @output Re-exports lockSelection and locksSelectionFor
 * @position A transition re-export: the selection lock moved to utils with
 *   the shared input stream (utils/inputStream.ts), and stacks based below
 *   that move still import it from here. Remove it once they have moved up.
 */

export {lockSelection, locksSelectionFor} from '../utils/selectionLock';
