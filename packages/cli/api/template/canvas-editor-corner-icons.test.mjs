// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression coverage for the canvas-editor page's corner radius icons.
 * @input The shipped canvas-editor page template source and its descriptor.
 * @output Assertions that each radius control imports the placeholder for its
 *   meaning and that the placeholder draws the picture that meaning shows.
 * @position Template contract test for the inspector's Radius row.
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
const row = source.match(
  /<InspectorRow label="Radius">([\s\S]*?)<\/InspectorRow>/,
)?.[1];
const field = row?.match(
  /<AxisInput\s+icon=\{(\w+)\}\s+label="Corner radius"/,
)?.[1];
const perCorner = row?.match(
  /label="Set radius per corner"[\s\S]*?<Icon icon=\{(\w+)\}/,
)?.[1];

describe('canvas-editor radius icons', () => {
  it('finds the corner radius field and the per-corner button', () => {
    expect(field).toBeDefined();
    expect(perCorner).toBeDefined();
  });

  it('draws one rounded corner on the field, as the cornerRadius placeholder', () => {
    expect(field).toBe('CornerRadiusIcon');
    expect(placeholderSource('cornerRadius', 'lucide')?.export).toBe(
      'SquareRoundCorner',
    );
  });

  it('draws the four-corner frame on the per-corner button, as the radiusPerCorner placeholder', () => {
    expect(perCorner).toBe('RadiusPerCornerIcon');
    expect(placeholderSource('radiusPerCorner', 'lucide')?.export).toBe('Scan');
  });
});
