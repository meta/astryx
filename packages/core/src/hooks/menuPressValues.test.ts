// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {MENU_PRESS_HANDOFF_PX} from './menuPressValues';

describe('menuPressValues', () => {
  it('copies the UIKit table exactly', () => {
    expect(MENU_PRESS_HANDOFF_PX).toBe(UIKIT_GESTURES.menuPress.handoff.value);
  });
});
