// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Each experimental theme command and its API function describe the
 * same behavior: their descriptions open with the same sentence, so a
 * change to one that is not made to the other shows here.
 */

import {describe, expect, it} from 'vitest';

const PAIRS = /** @type {const} */ ([
  ['themeEditNew', 'experimental-theme-editor-new'],
  ['themeEditSet', 'experimental-theme-editor-set'],
  ['themeEditUndo', 'experimental-theme-editor-undo'],
  ['themeEditShow', 'experimental-theme-editor-show'],
  ['themeEditHow', 'experimental-theme-editor-how'],
  ['themeEditPreviewAdd', 'experimental-theme-preview-add'],
  ['themeEditPreviewApp', 'experimental-theme-preview-app'],
  ['themeEditPreviewList', 'experimental-theme-preview-list'],
  ['themeEditPreviewRemove', 'experimental-theme-preview-remove'],
]);

/**
 * The first sentence of a description, with option spellings made alike
 * (`dir`, <dir> and --dir all read dir).
 * @param {string} text
 */
const opening = text =>
  text
    .split(/(?<=\.)\s/)[0]
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<([^>]*)>/g, '$1')
    .replace(/(^|\s)--?([a-z])/g, '$1$2');

describe('experimental theme command and API docs', () => {
  for (const [api, cli] of PAIRS)
    it(`${cli} and ${api} open the same way`, async () => {
      const a = (await import(`./${api}.doc.mjs`)).doc;
      const c = (await import(`../../clients/cli/commands/${cli}.doc.mjs`)).doc;
      expect(opening(c.description)).toBe(opening(a.description));
    });
});
