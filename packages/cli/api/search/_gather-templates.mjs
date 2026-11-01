// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's template and theme candidates. Imported only by the adapter.
 */

import {CORE_PACKAGE} from '../../foundation/discovery/component-discovery.mjs';
import {discoverTemplates, extractComponents} from '../template/template.mjs';
import {listAvailableThemes} from '../theme/_adapter.mjs';
import {templateLookupIds} from '../../foundation/discovery/template-adapter.mjs';
import {sameWord, wordsOf} from './_words.mjs';

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * A template's authored display name as another name and title of it, when the
 * name stands for the template: two words or more that hold every word of the
 * component the block shows (`exampleFor`), as "Rich Text Editor" does for
 * RichTextEditor. A query that is the name then names the entry whole, and one
 * that holds it as a phrase ("rich text") reaches search's title tier, above
 * entries that match one of its words. A label of the variant alone ("Inside a
 * card" for a Comments block) does not name the block, so it stays out.
 * @param {{displayName?: string, exampleFor?: string}} t
 * @returns {{aliases?: string[], titles?: string[]}}
 */
function subjectName(t) {
  const name = String(t.displayName ?? '').trim();
  const words = wordsOf(name);
  const subject = wordsOf(String(t.exampleFor ?? ''));
  if (words.length < 2 || subject.length === 0) return {};
  return subject.every(s => words.some(w => sameWord(s, w)))
    ? {aliases: [name], titles: [name]}
    : {};
}

/**
 * Build template candidates (page + block) from the template discovery API.
 * @param {string} cwd
 * @returns {Promise<Candidate[]>}
 */
export async function gatherTemplates(cwd) {
  let templates;
  try {
    templates = await discoverTemplates(cwd);
  } catch {
    return [];
  }
  return templates.map(t => {
    // A replacement's target is its canonical unqualified lookup id. Keep the
    // integration-owned id as a keyword and response label, but score and print
    // commands against the id that `template()` resolves back to this entry.
    // This matters for replacement chains: one replacement's own id can be the
    // target of another, so using that shadowed id as the command would select
    // the other template.
    const commandName = t.replaces ?? t.dirName;
    // Blocks ship an authored componentsUsed; page templates don't, so derive
    // them from the source. Category words (e.g. "Dashboard - Analytics") are
    // strong intent signal for pages, which otherwise only index on name +
    // description.
    //
    // Authored signal and derived signal are kept apart: componentsUsed and
    // category words are a deliberate statement of what the template is for,
    // while scraped JSX tags only say what it happens to render. See the
    // scoring table at the top of this file for why the derived set is capped.
    const keywords = Array.isArray(t.componentsUsed)
      ? [...t.componentsUsed]
      : [];
    keywords.push(...templateLookupIds(t).filter(id => id !== commandName));
    /** @type {string[]} */
    let weakKeywords = [];
    if (t.type === 'page') {
      if (t.filePath) {
        try {
          weakKeywords = extractComponents(t.filePath);
        } catch {
          // Best-effort: skip keyword enrichment if the source can't be read.
        }
      }
      if (t.category)
        keywords.push(...t.category.split(/[^A-Za-z0-9]+/).filter(Boolean));
    }
    return {
      domain: 'template',
      name: commandName,
      keywords,
      weakKeywords,
      description: t.description || '',
      // A template's own keywords name the many ideas it serves, so they score
      // as its prose does, not as a name: one of them matching one word of a
      // short idea is not a direct match.
      prose: t.keywords ?? [],
      // A display name that names the block's subject is another name of it
      // and its title (subjectName).
      ...subjectName(t),
      _displayName: t.name,
      _package: t.package ?? CORE_PACKAGE,
      _kind: t.type, // 'page' | 'block'
      _resultName: t.dirName,
      _commandName: commandName,
    };
  });
}

/**
 * Build theme candidates from bundled and integration-provided themes. Without
 * this, an integration's themes are invisible to `search` even though
 * `theme list` and `discover` already resolve them.
 *
 * A theme's slug and display name are its names, and its description is prose
 * (`spec:AST-050/FR14`). A theme declares no keywords, so a word it shares with
 * the query only through its description is a description mention: read as a
 * keyword, every word of the description would outrank the components and docs
 * that declare that word.
 * @param {string} cwd
 * @returns {Promise<Candidate[]>}
 */
export async function gatherThemes(cwd) {
  let themes;
  try {
    themes = await listAvailableThemes(cwd);
  } catch {
    return [];
  }
  return themes.map(t => ({
    domain: 'theme',
    name: t.slug,
    aliases: t.displayName ? [t.displayName] : [],
    description: t.description || '',
    _displayName: t.displayName,
    _package: t.package,
  }));
}
