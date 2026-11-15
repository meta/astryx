// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The icon definitions the bundled templates use (AST-084 FR15), and
 * the ones an icon set leaves unmapped.
 *
 * A bundled page or block template names, in its descriptor's `icons`, the
 * icon definition each icon it imports draws. A copied template renders a
 * placeholder for a definition the project's sets do not map, so an icon-set
 * author needs to know which definitions templates use beyond the built-in
 * ones. Each definition counts the templates that use it, once per template.
 * Only Astryx's own definitions count: a name that is not one is a template
 * error, which other checks report.
 *
 * @input The bundled templates, through template discovery
 * @output Each definition templates use, with its template count, most used
 *   first; and the ones a set's `map` leaves out. The one-line summary is in
 *   foundation/text/template-meanings-line.mjs
 * @position packages/cli/foundation/discovery — read by the icon authoring
 *   receipts, `experimental icon --definitions`, and `integration check`
 */

import {discoverCoreTemplates} from './template-adapter.mjs';
import {astryxDefinitionsByName} from './icon-definition-discovery.mjs';

/**
 * One icon definition templates use.
 * @typedef {object} TemplateMeaning
 * @property {string} definition the definition's name
 * @property {number} templates how many bundled templates use it
 */

/** @type {Promise<TemplateMeaning[]> | null} */
let cached = null;

/**
 * Count the definitions some templates declare in `icons`, most used first,
 * then by name.
 * @param {Array<{icons?: Record<string, unknown>}>} templates
 * @param {Set<string> | Map<string, unknown>} known the definitions that count
 * @returns {TemplateMeaning[]}
 */
export function countTemplateMeanings(templates, known) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const template of templates) {
    const icons = template.icons;
    if (icons == null || typeof icons !== 'object') continue;
    const used = new Set(
      Object.values(icons).filter(
        /** @returns {value is string} */
        value => typeof value === 'string' && known.has(value),
      ),
    );
    for (const definition of used) {
      counts.set(definition, (counts.get(definition) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([definition, templates]) => ({definition, templates}))
    .sort(
      (a, b) =>
        b.templates - a.templates ||
        (a.definition < b.definition
          ? -1
          : a.definition > b.definition
            ? 1
            : 0),
    );
}

/**
 * Every Astryx icon definition the bundled templates use, with how many
 * templates use it, most used first. Read once per process.
 * @returns {Promise<TemplateMeaning[]>}
 */
export function templateIconMeanings() {
  cached ??= discoverCoreTemplates().then(templates =>
    countTemplateMeanings(templates, astryxDefinitionsByName()),
  );
  return cached;
}

/**
 * The template meanings a set's `map` does not name, most used first.
 * @param {TemplateMeaning[]} meanings
 * @param {Record<string, string> | undefined} map
 * @returns {TemplateMeaning[]}
 */
export function unmappedTemplateMeanings(meanings, map) {
  const mapped = map ?? {};
  return meanings.filter(
    each => !Object.prototype.hasOwnProperty.call(mapped, each.definition),
  );
}
