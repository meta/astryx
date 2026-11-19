// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression coverage for the canvas-editor page's flip icons.
 * @input The shipped canvas-editor page template source and its descriptor.
 * @output Assertions that each flip button draws the mirror axis its action
 *   uses and declares that meaning.
 * @position Template contract test for the inspector's flip buttons.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {doc} from '../../assets/templates/pages/canvas-editor/template.doc.mjs';

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
  it('draws a vertical mirror axis on Flip horizontally and declares it flipHorizontal', () => {
    const icon = buttonIcon('Flip horizontally');
    expect(icon).toBe('TrianglesCenterlineDashedVertical');
    expect(doc.icons?.[/** @type {string} */ (icon)]).toBe('flipHorizontal');
  });

  it('draws a horizontal mirror axis on Flip vertically and declares it flipVertical', () => {
    const icon = buttonIcon('Flip vertically');
    expect(icon).toBe('TrianglesCenterlineDashedHorizontal');
    expect(doc.icons?.[/** @type {string} */ (icon)]).toBe('flipVertical');
  });
});
