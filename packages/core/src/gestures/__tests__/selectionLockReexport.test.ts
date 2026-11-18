// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectionLockReexport.test.ts
 * @input The selection lock's old gestures path and its utils module
 * @output The transition re-export at gestures/selectionLock.ts hands out the
 *   same functions as utils/selectionLock.ts
 * @position Unit test of packages/core/src/gestures/selectionLock.ts
 */

import {describe, expect, it} from 'vitest';
import * as atUtils from '../../utils/selectionLock';
import * as atGestures from '../selectionLock';

describe('gestures/selectionLock, a transition re-export', () => {
  it('hands out the lock from utils, so a caller importing the old path keeps working', () => {
    expect(atGestures.lockSelection).toBe(atUtils.lockSelection);
    expect(atGestures.locksSelectionFor).toBe(atUtils.locksSelectionFor);
  });
});
