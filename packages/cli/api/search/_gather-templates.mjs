// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's template and theme candidates. Imported only by the adapter.
 */

import fs from 'node:fs';
import {CORE_PACKAGE} from '../../foundation/discovery/component-discovery.mjs';
import {discoverTemplates} from '../template/template.mjs';
import {listAvailableThemes} from '../theme/_adapter.mjs';
import {
  componentNameBound,
  componentsInSource,
  templateLookupIds,
} from '../../foundation/discovery/template-adapter.mjs';
import {sameWord, wordsOf} from './_words.mjs';

/**
 * The source file each template candidate's `weakKeywords` are read from,
 * when it could be read, and the names if this run already read them: a
 * gather kept between runs stores the names it has and the file for the rest
 * (api/search/_adapter.mjs), so storing costs no parse.
 * @type {WeakMap<object, {file: string, derivedSoFar: () => string[] | undefined}>}
 */
export const derivedFromSource = new WeakMap();
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
    /** @type {() => string[]} */
    let derive = () => [];
    /** @type {string[] | null} */
    let weakKeywordBound = null;
    /** @type {string | null} */
    let readSource = null;
    /** @type {(() => string[] | undefined) | undefined} */
    let derivedNow;
    if (t.type === 'page') {
      if (t.filePath) {
        try {
          const source = fs.readFileSync(t.filePath, 'utf-8');
          readSource = t.filePath;
          // Parsing the source costs more than the rest of the page's gather.
          // It waits until a term could match a name the source can yield.
          /** @type {string[] | undefined} */
          let derived;
          derivedNow = () => derived;
          derive = () => {
            if (derived === undefined) {
              try {
                derived = componentsInSource(source);
              } catch {
                derived = [];
              }
            }
            return derived;
          };
          weakKeywordBound = componentNameBound(source);
        } catch {
          // Best-effort: skip keyword enrichment if the source can't be read.
        }
      }
      if (t.category)
        keywords.push(...t.category.split(/[^A-Za-z0-9]+/).filter(Boolean));
    }
    const candidate = {
      domain: /** @type {const} */ ('template'),
      name: commandName,
      keywords,
      get weakKeywords() {
        return derive();
      },
      ...(weakKeywordBound ? {weakKeywordBound} : {}),
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
    if (readSource)
      derivedFromSource.set(candidate, {
        file: readSource,
        derivedSoFar: () => derivedNow?.(),
      });
    return candidate;
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
