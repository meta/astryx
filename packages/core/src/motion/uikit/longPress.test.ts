// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file longPress.test.ts
 * @input Uses vitest, React Testing Library and node:fs over the core sources
 * @output The long-press numbers have one source: the constants table's
 *   entries, the long-press recognizer's defaults, useLongPress's hold and
 *   useMenuPress's trigger hold all read longPress.ts
 * @position Unit tests of packages/core/src/motion/uikit/longPress.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {act, renderHook} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {LongPressGestureRecognizer} from '../../gestures/LongPressGestureRecognizer';
import {useLongPress} from '../../hooks/useLongPress';
import {MENU_PRESS_LONG_PRESS_MS} from '../../hooks/useMenuPress';
import {UIKIT_GESTURES} from './gestures';
import {
  LONG_PRESS_ALLOWABLE_MOVEMENT_PX,
  LONG_PRESS_DURATION_MS,
} from './longPress';

const CORE = path.resolve(__dirname, '../..');

/** Every core module `entry` reaches through value imports. */
function reachable(entry: string): string[] {
  const statement =
    /^\s*(import|export)\s+(type\s+)?([^'";]*?\s+from\s+)?'([^']+)';/gms;
  const seen = new Set<string>();
  const queue = [path.join(CORE, entry)];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const match of fs.readFileSync(file, 'utf8').matchAll(statement)) {
      const [, , isTypeOnly, , specifier] = match;
      if (isTypeOnly != null || !specifier.startsWith('.')) {
        continue;
      }
      const base = path.resolve(path.dirname(file), specifier);
      const resolved = [
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
      ].find(candidate => fs.existsSync(candidate));
      if (resolved != null) {
        queue.push(resolved);
      }
    }
  }
  return [...seen].map(file => path.relative(CORE, file));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the long-press numbers', () => {
  it('have one source: the table, the recognizer, useLongPress and useMenuPress read it', () => {
    expect(UIKIT_GESTURES.longPress.minimumPressDuration.value).toBe(
      LONG_PRESS_DURATION_MS,
    );
    expect(UIKIT_GESTURES.longPress.allowableMovement.value).toBe(
      LONG_PRESS_ALLOWABLE_MOVEMENT_PX,
    );
    const recognizer = new LongPressGestureRecognizer();
    expect(recognizer.minimumPressDuration).toBe(LONG_PRESS_DURATION_MS);
    expect(recognizer.allowableMovement).toBe(LONG_PRESS_ALLOWABLE_MOVEMENT_PX);
    expect(MENU_PRESS_LONG_PRESS_MS).toBe(LONG_PRESS_DURATION_MS);

    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));
    act(() => {
      result.current.start({x: 0, y: 0});
      vi.advanceTimersByTime(LONG_PRESS_DURATION_MS - 1);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => {
      expect(
        result.current.moveTo({x: LONG_PRESS_ALLOWABLE_MOVEMENT_PX, y: 0}),
      ).toBe(true);
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('reach the hooks through longPress.ts alone', () => {
    expect(reachable('hooks/useLongPress.ts')).toContain(
      path.join('motion', 'uikit', 'longPress.ts'),
    );
  });
});
