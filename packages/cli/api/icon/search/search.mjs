// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon.search` leaf (AST-084 FR6): find icons by meaning across every
 * installed set, ranked, with each match's import line in the project's look.
 *
 * @input a query, an optional set selector, and a limit
 * @output the `icon.search` envelope
 * @position api/icon/search — dispatched by ../icon.mjs
 */

import {
  astryxIconDefinitions,
  iconLookExport,
  iconSetKey,
  importLine,
  loadIconSets,
  missingIconLook,
  noIconSetNext,
} from '../_adapter.mjs';
import {
  answeringMatches,
  oneNamedSet,
  rankIcons,
  setsNamed,
  unusableSet,
} from '../_records.mjs';

/**
 * Every icon of one set, by id: `--set <name> --all-icons`, so an author can read
 * a whole library's ids, words, and the definitions each icon draws.
 * @param {{cwd: string, set: string}} options
 * @returns {Promise<import('../icon.type.mjs').IconSetIconsResponse>}
 */
export async function iconSetIcons({cwd, set}) {
  const {sets, withdrawn} = await loadIconSets(cwd);
  const only = oneNamedSet(sets, withdrawn, set);
  /** @type {Map<string, string[]>} */
  const drawn = new Map();
  for (const [definition, id] of Object.entries(only.data.map ?? {})) {
    drawn.set(id, [...(drawn.get(id) ?? []), definition]);
  }
  return {
    type: 'icon.setIcons',
    data: {
      set: only.name,
      package: only.package,
      iconCount: only.data.icons.length,
      icons: [...only.data.icons]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map(icon => ({
          id: icon.id,
          export: icon.export,
          words: icon.words,
          definitions: (drawn.get(icon.id) ?? []).sort(),
        })),
    },
  };
}

/**
 * Rank every installed icon against a query.
 * @param {string} query
 * @param {{cwd: string, set?: string, limit: number}} options
 * @returns {Promise<import('../icon.type.mjs').IconSearchResponse>}
 */
export async function iconSearch(query, {cwd, set, limit}) {
  const {sets, withdrawn, choice} = await loadIconSets(cwd);
  return rankIconSets(sets, withdrawn, query, {
    set,
    limit,
    looks: projectLooks(choice),
  });
}

/**
 * The look each set in the project's list draws, by `<package>/<set>`: the
 * look the project picks (`experimental.iconVariant`). Empty when it picks
 * none. A set outside the list draws no project look.
 * @param {import('../../../foundation/discovery/icon-set-discovery.mjs').IconSetChoice} choice
 * @returns {Record<string, string>}
 */
export function projectLooks(choice) {
  const variant = choice.variant;
  if (!variant) return {};
  return Object.fromEntries(
    (choice.order ?? []).map(set => [iconSetKey(set), variant]),
  );
}

/**
 * Rank the icons of `sets` against a query: the one ranking behind both
 * `icon()` and `rankIconIndex()`. Each match's import draws the look `looks`
 * names for its set when its icon has that look. With no set installed, not
 * even a withdrawn one, the answer names the Astryx icon definitions that
 * match, built-in ones first, and how to get a set.
 * @param {Parameters<typeof rankIcons>[0]} sets in tie order
 * @param {Array<{name: string, package: string, reason: string}>} withdrawn
 * @param {string} query
 * @param {{set?: string, limit: number, looks?: Record<string, string>}} options
 *   `looks`: the look each set draws, by `<package>/<set>`
 * @returns {import('../icon.type.mjs').IconSearchResponse}
 */
export function rankIconSets(sets, withdrawn, query, {set, limit, looks = {}}) {
  let searched = sets;
  if (set != null) {
    searched = setsNamed(sets, set);
    if (searched.length === 0) throw unusableSet(sets, withdrawn, set);
  }
  // A withdrawn set is installed: `--list` says why it cannot be used.
  if (sets.length === 0 && withdrawn.length === 0) {
    return noIconSet(query, limit);
  }
  const ranked = rankIcons(searched, query, {words: true});
  // A word start (`start` for `star`) answers only when nothing matches a
  // whole word, and a partial match (`pin` inside `shopping`) only when
  // nothing matches a whole word or a word start.
  const matches = answeringMatches(ranked);
  return {
    type: 'icon.search',
    data: {
      query: query.trim(),
      matchCount: matches.length,
      matches: matches
        .slice(0, limit)
        .map(match => inLook(match, searched, looks)),
    },
  };
}

/**
 * A match drawn in its set's look: its export and import name the icon's
 * variant of that look, or keep its own export with `look` saying which
 * look it draws instead. A match whose set draws no look stays as it is.
 * @param {import('../icon.type.mjs').IconMatchEntry} match
 * @param {Parameters<typeof rankIcons>[0]} sets
 * @param {Record<string, string>} looks
 * @returns {import('../icon.type.mjs').IconMatchEntry}
 */
function inLook(match, sets, looks) {
  const variant = looks[`${match.package}/${match.set}`];
  if (!variant) return match;
  const set = sets.find(
    each => each.package === match.package && each.name === match.set,
  );
  const icon = set?.data.icons.find(each => each.id === match.id);
  if (!set || !icon) return match;
  const drawn = iconLookExport(icon, set, variant);
  const look = missingIconLook(icon, set, variant);
  return {
    ...match,
    module: drawn.module,
    export: drawn.export,
    import: importLine(drawn.export, drawn.module),
    ...(look ? {look} : {}),
  };
}
/**
 * The answer when no icon set is installed: no icon matches, so it names
 * the Astryx icon definitions that do, built-in ones first (Core draws those
 * by name with no set), and how to get a set.
 * @param {string} query
 * @param {number} limit
 * @returns {import('../icon.type.mjs').IconSearchResponse}
 */
function noIconSet(query, limit) {
  const docs = astryxIconDefinitions().definitions.map(each => each.doc);
  const byId = new Map(docs.map(doc => [definitionId(doc.name), doc]));
  const found = answeringMatches(
    rankIcons([definitionSet(docs)], query, {words: true}),
  ).map(match => /** @type {(typeof docs)[number]} */ (byId.get(match.id)));
  const ordered = [
    ...found.filter(doc => doc.builtIn),
    ...found.filter(doc => !doc.builtIn),
  ];
  return {
    type: 'icon.search',
    data: {
      query: query.trim(),
      matchCount: 0,
      matches: [],
      reason: 'No icon set is installed.',
      definitions: ordered.slice(0, limit).map(doc => ({
        name: doc.name,
        builtIn: doc.builtIn === true,
        description: doc.description,
      })),
      next: noIconSetNext(),
    },
  };
}

/**
 * A definition's name as an icon id: `chevronDown` is `chevron-down`.
 * @param {string} name
 */
const definitionId = name =>
  name.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').toLowerCase();

/**
 * Astryx's icon definitions read as one set whose `map` names one icon for
 * each definition, so the icon ranking finds a definition by its name, its
 * name as words, and its own words, exactly as it finds a set's icon.
 * @param {import('../../../authoring/doctypes/icon-definition/type').IconDefinitionDoc[]} docs
 * @returns {import('../../../foundation/discovery/icon-set-discovery.mjs').DiscoveredIconSet}
 */
function definitionSet(docs) {
  return /** @type {any} */ ({
    name: 'definitions',
    package: '@astryxdesign/cli',
    definitions: [],
    data: {
      schemaVersion: 1,
      module: '@astryxdesign/cli',
      map: Object.fromEntries(
        docs.map(doc => [doc.name, definitionId(doc.name)]),
      ),
      icons: docs.map(doc => ({
        id: definitionId(doc.name),
        export: doc.name,
        words: [],
      })),
    },
  });
}
