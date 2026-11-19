// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression coverage for the canvas-editor page's corner radius icons.
 * @input The shipped canvas-editor page template source and its descriptor.
 * @output Assertions that each radius control draws the picture its meaning
 *   shows and declares that meaning.
 * @position Template contract test for the inspector's Radius row.
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

  it('draws one rounded corner on the field and declares it cornerRadius', () => {
    expect(field).toBe('SquareRoundCorner');
    expect(doc.icons?.[/** @type {string} */ (field)]).toBe('cornerRadius');
  });

  it('draws the four-corner frame on the per-corner button and declares it radiusPerCorner', () => {
    expect(perCorner).toBe('Scan');
    expect(doc.icons?.[/** @type {string} */ (perCorner)]).toBe(
      'radiusPerCorner',
    );
  });
});
