// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {scroll} from '../motion/uikit/scroll';
import {
  DELAYS_CONTENT_TOUCHES_MS,
  MENU_PRESS_HANDOFF_PX,
  MENU_PRESS_HOLD_OPEN_SLOP_PX,
} from './menuPressValues';

describe('menuPressValues', () => {
  it('copies the UIKit tables exactly', () => {
    expect(MENU_PRESS_HOLD_OPEN_SLOP_PX).toBe(
      UIKIT_GESTURES.menuPress.holdOpenSlop.value,
    );
    expect(MENU_PRESS_HANDOFF_PX).toBe(UIKIT_GESTURES.menuPress.handoff.value);
    expect(DELAYS_CONTENT_TOUCHES_MS).toBe(scroll.delaysContentTouchesMs);
  });
});
