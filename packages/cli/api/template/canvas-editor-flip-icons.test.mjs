// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression coverage for the canvas-editor page's flip icons.
 * @input The shipped canvas-editor page template source and its descriptor.
 * @output Assertions that each flip button imports the placeholder for its
 *   meaning and that the placeholder draws the mirror axis its action uses.
 * @position Template contract test for the inspector's flip buttons.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {placeholderSource} from '../../foundation/discovery/template-placeholders.mjs';

const source = fs.readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../assets/templates/pages/canvas-editor/page.tsx',
  ),
  'utf8',
);

/** @param {string} label */
function buttonIcon(label) {
  return source.match(
    new RegExp(`label="${label}"[\\s\\S]*?<Icon\\s+icon=\\{(\\w+)\\}`),
  )?.[1];
}

describe('canvas-editor flip icons', () => {
  it('draws a vertical mirror axis on Flip horizontally, as the flipHorizontal placeholder', () => {
    expect(buttonIcon('Flip horizontally')).toBe('FlipHorizontalIcon');
    expect(placeholderSource('flipHorizontal', 'lucide')?.export).toBe(
      'TrianglesCenterlineDashedVertical',
    );
  });

  it('draws a horizontal mirror axis on Flip vertically, as the flipVertical placeholder', () => {
    expect(buttonIcon('Flip vertically')).toBe('FlipVerticalIcon');
    expect(placeholderSource('flipVertical', 'lucide')?.export).toBe(
      'TrianglesCenterlineDashedHorizontal',
    );
  });
});
