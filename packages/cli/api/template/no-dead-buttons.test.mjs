// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guards shipped templates and blocks against new warnings from
 *   `doctor`'s button check.
 * @input Every page template and block folder under assets/templates.
 * @output Assertions that `doctor`'s button check reads each folder, warns
 *   about no button in a block, and in page templates warns only about the
 *   named calls to action that keep a placeholder `#` link; the folders it
 *   does not judge are named too.
 * @position Template contract test. A copied block or page template then gives
 *   `doctor` nothing new to warn about. The check stays silent on a button it
 *   cannot judge, so this test proves only what the check proves.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {findButtonsWithoutAction} from '../doctor/_adapter.mjs';

const templatesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/templates',
);

/** The note `doctor` gives a button whose only action is a `#` link. */
const PLACEHOLDER_HASH_LINK = /^placeholder link: replace `#`/;

/**
 * The page-template calls to action that keep a placeholder `#` link, which
 * `doctor` names as a link the builder replaces with a real one. This test
 * keeps the list as it ships; a new one fails it.
 */
const PLACEHOLDER_CALLS_TO_ACTION = [
  'pages/centered-hero/page.tsx "Get started"',
  'pages/centered-hero/page.tsx "Learn more"',
  'pages/documentation/page.tsx "Get started"',
  'pages/gallery-hero/page.tsx "Get started"',
  'pages/gallery-hero/page.tsx "Learn more"',
  'pages/product-gallery/page.tsx "Get started"',
  'pages/side-gallery/page.tsx "Explore"',
];

/**
 * The folders whose own code listens for a press through the DOM, so the
 * check judges none of their buttons: kanban-board drags its cards with
 * window pointer listeners.
 */
const NOT_JUDGED = ['pages/kanban-board'];

/** @param {string} dir */
function folders(dir) {
  return fs
    .readdirSync(dir, {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(dir, entry.name));
}

/**
 * Each button the check reports in these folders, as `folder/file:line label
 * (note)`; the buttons whose only action is a `#` link, as `folder/file
 * label`; the folders it could not read in full; and the folders it judged
 * no button in because their code may act on a press through the DOM.
 * @param {string[]} dirs
 */
function report(dirs) {
  /** @type {string[]} */
  const buttons = [];
  /** @type {string[]} */
  const placeholders = [];
  /** @type {string[]} */
  const incomplete = [];
  /** @type {string[]} */
  const notJudged = [];
  for (const dir of dirs) {
    const folder = path.relative(templatesRoot, dir);
    const {found, incomplete: cut, domListener} = findButtonsWithoutAction(dir);
    if (cut) incomplete.push(folder);
    if (domListener) notJudged.push(folder);
    for (const button of found) {
      const label =
        button.label == null ? button.component : `"${button.label}"`;
      if (button.note && PLACEHOLDER_HASH_LINK.test(button.note)) {
        placeholders.push(`${folder}/${button.file} ${label}`);
        continue;
      }
      buttons.push(
        `${folder}/${button.file}:${button.line} ${label}${button.note ? ` (${button.note})` : ''}`,
      );
    }
  }
  return {buttons, placeholders: placeholders.sort(), incomplete, notJudged};
}

describe('templates and blocks', () => {
  const pages = folders(path.join(templatesRoot, 'pages'));
  // Every block folder, in each group under blocks/.
  const blocks = folders(path.join(templatesRoot, 'blocks')).flatMap(folders);

  it('finds the page template and block folders', () => {
    expect(pages.length).toBeGreaterThan(20);
    expect(blocks.length).toBeGreaterThan(100);
  });

  it("a block gives doctor's button check nothing to warn about", () => {
    expect(report(blocks)).toEqual({
      buttons: [],
      placeholders: [],
      incomplete: [],
      notJudged: [],
    });
  }, 120_000);

  it("a page template gives doctor's button check only its named placeholder links to warn about", () => {
    expect(report(pages)).toEqual({
      buttons: [],
      placeholders: [...PLACEHOLDER_CALLS_TO_ACTION].sort(),
      incomplete: [],
      notJudged: NOT_JUDGED,
    });
  }, 120_000);
});
