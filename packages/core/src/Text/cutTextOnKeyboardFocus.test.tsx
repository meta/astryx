// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file cutTextOnKeyboardFocus.test.tsx
 * @input A truncating Table, whose header cells use the hook, while the test
 *   holds the browser's animation frames
 * @output Proof that the hook's module loads only after an animation frame
 *   and then a task, and not in the commit that mounts the table
 * @position Unit evidence for cutTextOnKeyboardFocus.tsx; the real-browser
 *   proof is Table/__tests__/TableCutHeadingAfterPaint.interaction.browser.spec.ts
 */

import {act, render, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Table} from '../Table/Table';
import type {TableColumn} from '../Table/types';

const imports = vi.hoisted(() => ({count: 0}));

vi.mock('./cutText', async importOriginal => {
  imports.count += 1;
  return importOriginal();
});

interface Row extends Record<string, unknown> {
  payout: string;
}

const rows: Row[] = [{payout: '$1,200'}];
const columns: TableColumn<Row>[] = [
  {key: 'payout', header: 'Pending payout this quarter'},
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCutTextOnKeyboardFocus', () => {
  it('loads its module after an animation frame and then a task, not in the commit that mounts a table', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    render(<Table textOverflow="truncate" data={rows} columns={columns} />);
    // Tasks run, but no frame does: the module does not load.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(imports.count).toBe(0);
    // The frame runs. The load waits for the task after it.
    act(() => {
      for (const frame of frames.splice(0)) {
        frame(performance.now());
      }
    });
    expect(imports.count).toBe(0);
    await waitFor(() => {
      expect(imports.count).toBe(1);
    });
  });
});
