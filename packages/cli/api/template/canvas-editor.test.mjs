// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Phone contract tests for the canvas-editor page template
 * @input Reads the shipped single-file template
 * @output Guards that the artboard and the open tab's close fit a phone
 * @position CLI template regression coverage; runs in the node test project
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(dirname, '../../assets/templates/pages/canvas-editor/page.tsx'),
  'utf8',
);

describe('canvas editor template on a phone', () => {
  it('opens on the largest zoom step that fits when 40% is too wide for the canvas', () => {
    // 40% of the 1080px artboard is wider than a phone's canvas, so a fixed
    // first zoom makes the canvas scroll sideways.
    expect(source).toMatch(
      /const attachCanvas = useCallback\([\s\S]*?ZOOM_OPTIONS\.filter\([\s\S]*?FRAME\.width \* Number\(option\.value\) <= room/,
    );
    expect(source).toContain('ref={attachCanvas}');
  });

  it('keeps the tab strip at least one tab wide', () => {
    // A strip narrower than one tab scrolls the open tab's close under the
    // controls after it.
    expect(source).toContain(
      'maxWidth={`max(${TAB_MIN_WIDTH + TAB_STRIP_PADDING}px, calc(100cqw - ${TAB_STRIP_RESERVE}px))`}',
    );
  });

  it('folds the save note where the strip floor needs its room', () => {
    expect(source).toContain(
      'const FOLD_SAVE_NOTE = `@container editor-header (max-width: ${TAB_MIN_WIDTH + TAB_STRIP_PADDING + TAB_STRIP_RESERVE - 0.02}px)`;',
    );
    expect(source).toMatch(
      /xstyle=\{styles\.foldsAtSaveNote\}>\s*Saved · 2 min ago/,
    );
    // Hidden from sight only: a screen reader still reads the note.
    expect(source).toContain(
      "clip: {default: null, [FOLD_SAVE_NOTE]: 'rect(0, 0, 0, 0)'}",
    );
    expect(source).not.toContain("[FOLD_SAVE_NOTE]: 'none'");
  });
});
