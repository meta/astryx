// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every icon a bundled template or block imports is declared in its
 * descriptor's `icons` with the icon definition it draws, so a project's icon
 * set replaces it (AST-084 FR9). The CLI knows no icon library; only this
 * test names the libraries the bundled templates happen to import, to find
 * their icon imports.
 */

import * as fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {discoverCoreTemplates} from '../foundation/discovery/template-adapter.mjs';
import {astryxDefinitionsByName} from '../foundation/discovery/icon-definition-discovery.mjs';

/** The icon libraries the bundled templates import. */
const ICON_MODULE_RE =
  /^(?:@heroicons\/react\/(?:16|20|24)\/(?:outline|solid)|lucide-react)$/u;

/**
 * Icons no Astryx icon definition fits yet. A template keeps these as it
 * wrote them. The list only shrinks: add a definition, declare the icon, and
 * remove it here.
 */
const NO_DEFINITION_YET = new Set([
  'Aperture',
  'ArrowDownToLine',
  'ArrowUpToLine',
  'ArrowsRightLeftIcon',
  'Bars3BottomLeftIcon',
  'Baseline',
  'CaseLower',
  'CaseUpper',
  'CloudIcon',
  'Contrast',
  'DeviceTabletIcon',
  'FingerPrintIcon',
  'FireIcon',
  'FoldVertical',
  'Frame',
  'GiftIcon',
  'Group',
  'PaintBrushIcon',
  'PanelBottom',
  'PanelLeftRightDashed',
  'PanelTopBottomDashed',
  'PuzzlePieceIcon',
  'RectangleStackIcon',
  'RotateCcw',
  'Scan',
  'ScissorsIcon',
  'SquareRoundCorner',
  'SquareSquare',
  'TextAlignJustify',
  'TriangleRight',
  'Type',
  'UserMinusIcon',
]);

/** @param {string} source @returns {string[]} imported icon names */
function iconImports(source) {
  /** @type {string[]} */
  const names = [];
  for (const match of source.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*'([^']+)'/gu,
  )) {
    if (!ICON_MODULE_RE.test(match[2])) continue;
    for (const part of match[1].replace(/\/\/[^\n]*/gu, '').split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/u)[0]
        .trim();
      if (name && !name.startsWith('type ')) names.push(name);
    }
  }
  return names;
}

describe('bundled template icon declarations', () => {
  it('declare every imported icon with an Astryx icon definition, and nothing else', async () => {
    const definitions = astryxDefinitionsByName();
    /** @type {string[]} */
    const undeclared = [];
    /** @type {string[]} */
    const problems = [];
    const seenNoDefinition = new Set();
    for (const template of await discoverCoreTemplates()) {
      const imported = iconImports(fs.readFileSync(template.filePath, 'utf-8'));
      const declared = template.icons ?? {};
      for (const name of imported) {
        if (Object.hasOwn(declared, name)) continue;
        if (NO_DEFINITION_YET.has(name)) {
          seenNoDefinition.add(name);
          continue;
        }
        undeclared.push(`${template.type}/${template.dirName}: ${name}`);
      }
      for (const [name, definition] of Object.entries(declared)) {
        if (!imported.includes(name)) {
          problems.push(
            `${template.type}/${template.dirName} declares ${name}, which it does not import`,
          );
        }
        if (!definitions.has(definition)) {
          problems.push(
            `${template.type}/${template.dirName}: ${name} names "${definition}", which is not an Astryx icon definition`,
          );
        }
      }
    }
    expect(undeclared).toEqual([]);
    expect(problems).toEqual([]);
    // A name no template imports any more leaves the list.
    expect(
      [...NO_DEFINITION_YET].filter(name => !seenNoDefinition.has(name)),
    ).toEqual([]);
  }, 60_000);
});
