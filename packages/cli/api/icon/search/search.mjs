// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon.search` leaf (AST-084 FR6): find icons by meaning across every
 * installed set, ranked, with each match's import line in the project's look
 * and, when a definition names the icon, the import that names its meaning.
 *
 * @input a query, an optional set selector, and a limit
 * @output the `icon.search` envelope
 * @position api/icon/search — dispatched by ../icon.mjs
 */

import {
  astryxIconDefinitions,
  discoverListsIconSet,
  definitionRelatives,
  iconExportName,
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
 * The old names of a set's own definitions: a live set's `definitionAliases`,
 * or a stored set's `replacedDefinitions`.
 * @typedef {Pick<Parameters<typeof rankIcons>[0][number], 'definitionAliases'> & {replacedDefinitions?: Array<{name: string, definition: string}>}} Replacements
 */

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
  const noSet = sets.length === 0 && withdrawn.length === 0;
  return rankIconSets(sets, withdrawn, query, {
    set,
    limit,
    looks: projectLooks(choice),
    discoverListsPacks: noSet && (await discoverListsIconSet(cwd)),
  });
}

/**
 * Matches that name their meaning import: the match's export imported under
 * the name of a definition that its set's `map` names it for, named as an
 * icon set names its exports (`import {TrashIcon as DeleteIcon} from '…'`).
 * App code that uses this name keeps it when another set draws the meaning.
 * When the set maps the icon for several definitions, the one that the query
 * ranks first gives the name, else a built-in one, else the first by name. A
 * match that no definition names keeps its fields.
 * @param {import('../icon.type.mjs').IconMatchEntry[]} matches
 * @param {string} query
 * @param {Parameters<typeof rankIcons>[0]} sets the searched sets, whose own
 *   definitions rank with Astryx's
 * @returns {import('../icon.type.mjs').IconMatchEntry[]}
 */
function withMeaningImports(matches, query, sets) {
  if (!matches.some(match => match.definitions.length > 0)) return matches;
  /** @type {Map<unknown, (name: string) => number>} */
  const ranks = new Map();
  /** @param {import('../icon.type.mjs').IconMatchEntry} match */
  const rankFor = match => {
    const set = sets.find(
      each => each.package === match.package && each.name === match.set,
    );
    const own = set?.definitions ?? [];
    // Sets with no definitions of their own share one order.
    const key = own.length > 0 ? set : null;
    let rank = ranks.get(key);
    if (!rank) {
      rank = meaningRank(query, set);
      ranks.set(key, rank);
    }
    return rank;
  };
  return matches.map(match => {
    if (match.definitions.length === 0) return match;
    const rank = rankFor(match);
    const [meaning] = [...match.definitions].sort(
      (a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0),
    );
    return {
      ...match,
      meaningImport: importLine(
        match.export,
        match.module,
        iconExportName(meaning),
      ),
    };
  });
}

/**
 * The order of definition names for a query: the definitions that the
 * query matches, best first, then the built-in ones, then the rest. A set's
 * own definitions rank with Astryx's, by their names, the names they
 * replaced, and their words; on a shared name, Astryx's counts, as in the
 * icon ranking.
 * @param {string} query
 * @param {Parameters<typeof rankIcons>[0][number] | undefined} set the
 *   match's set
 * @returns {(name: string) => number}
 */
function meaningRank(query, set) {
  const own = set?.definitions ?? [];
  const astryx = astryxIconDefinitions().definitions.map(each => each.doc);
  const names = new Set(astryx.map(doc => doc.name));
  const docs = [
    ...astryx,
    ...own.map(each => each.doc).filter(doc => !names.has(doc.name)),
  ];
  const matched = definitionMatches(query, docs, set).map(
    match => match.doc.name,
  );
  const place = new Map(matched.map((name, index) => [name, index]));
  const builtIn = new Set(
    astryx.filter(doc => doc.builtIn).map(doc => doc.name),
  );
  return name =>
    place.get(name) ?? matched.length + (builtIn.has(name) ? 0 : 1);
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
 * names for its set when its icon has that look, and a match that a
 * definition names also has its meaning import. With no set installed, not
 * even a withdrawn one, the answer names the Astryx icon definitions that
 * match, built-in ones first, and how to get a set.
 * @param {Parameters<typeof rankIcons>[0]} sets in tie order
 * @param {Array<{name: string, package: string, reason: string}>} withdrawn
 * @param {string} query
 * @param {{set?: string, limit: number, looks?: Record<string, string>, discoverListsPacks?: boolean}} options
 *   `looks`: the look each set draws, by `<package>/<set>`;
 *   `discoverListsPacks`: discover lists an icon set the project could add
 * @returns {import('../icon.type.mjs').IconSearchResponse}
 */
export function rankIconSets(
  sets,
  withdrawn,
  query,
  {set, limit, looks = {}, discoverListsPacks = false},
) {
  let searched = sets;
  if (set != null) {
    searched = setsNamed(sets, set);
    if (searched.length === 0) throw unusableSet(sets, withdrawn, set);
  }
  // A withdrawn set is installed: `--list` says why it cannot be used.
  if (sets.length === 0 && withdrawn.length === 0) {
    return noIconSet(query, limit, discoverListsPacks);
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
      matches: withMeaningImports(
        matches
          .slice(0, limit)
          .map(match =>
            withRelatives(inLook(match, searched, looks), searched),
          ),
        query,
        searched,
      ),
    },
  };
}

/**
 * A match with `relatives`: the other definitions in the groups of the
 * definitions it draws, from Astryx's and its set's own, so a reader sees
 * the related meanings and picks the one that fits. Absent when there are
 * none. It never changes the ranking.
 * @param {import('../icon.type.mjs').IconMatchEntry} match
 * @param {Parameters<typeof rankIcons>[0]} sets
 * @returns {import('../icon.type.mjs').IconMatchEntry}
 */
function withRelatives(match, sets) {
  if (match.definitions.length === 0) return match;
  const set = sets.find(
    each => each.package === match.package && each.name === match.set,
  );
  const relatives = definitionRelatives(match.definitions, [
    ...astryxIconDefinitions().definitions.map(each => each.doc),
    ...(set?.definitions ?? []).map(
      each =>
        /** @type {{name: string, description: string, group?: string}} */ (
          each.doc
        ),
    ),
  ]);
  return relatives.length > 0 ? {...match, relatives} : match;
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
 * @param {boolean} discoverListsPacks
 * @returns {import('../icon.type.mjs').IconSearchResponse}
 */
function noIconSet(query, limit, discoverListsPacks) {
  const docs = astryxIconDefinitions().definitions.map(each => each.doc);
  const found = definitionMatches(query).map(match => match.doc);
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
      definitions: ordered.slice(0, limit).map(doc => {
        const relatives = definitionRelatives([doc.name], docs);
        return {
          name: doc.name,
          builtIn: doc.builtIn === true,
          description: doc.description,
          ...(doc.group ? {group: doc.group} : {}),
          ...(relatives.length > 0 ? {relatives} : {}),
        };
      }),
      next: noIconSetNext(discoverListsPacks),
    },
  };
}

/**
 * The icon definitions that answer a query, each with its score, ranked as
 * the search ranks a set's icons (FR6): Astryx's, or the `docs` given.
 * @param {string} query
 * @param {import('../../../authoring/doctypes/icon-definition/type').IconDefinitionDoc[]} [docs]
 * @param {Replacements} [replacements] the old names of a set's own
 *   definitions among `docs`, so that a name they replaced answers too
 * @returns {Array<{doc: import('../../../authoring/doctypes/icon-definition/type').IconDefinitionDoc, score: number}>}
 */
export function definitionMatches(
  query,
  docs = astryxIconDefinitions().definitions.map(each => each.doc),
  replacements = {},
) {
  const byId = new Map(docs.map(doc => [definitionId(doc.name), doc]));
  return answeringMatches(
    rankIcons([definitionSet(docs, replacements)], query, {words: true}),
  ).map(match => ({
    doc: /** @type {(typeof docs)[number]} */ (byId.get(match.id)),
    score: match.score,
  }));
}

/**
 * A definition's name as an icon id: `chevronDown` is `chevron-down`.
 * @param {string} name
 */
const definitionId = name =>
  name.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').toLowerCase();

/**
 * Icon definitions read as one set whose `map` names one icon for each
 * definition, so the icon ranking finds a definition by its name, its name
 * as words, and its own words, exactly as it finds a set's icon. The docs
 * are the set's own definitions too, so a set's definition answers to its
 * words as Astryx's do. The set's old definition names come along, so a
 * name that one of its definitions replaced answers as Astryx's old names
 * do.
 * @param {import('../../../authoring/doctypes/icon-definition/type').IconDefinitionDoc[]} docs
 * @param {Replacements} replacements
 * @returns {import('../../../foundation/discovery/icon-set-discovery.mjs').DiscoveredIconSet}
 */
function definitionSet(docs, {definitionAliases, replacedDefinitions}) {
  return /** @type {any} */ ({
    name: 'definitions',
    package: '@astryxdesign/cli',
    definitions: docs.map(doc => ({doc})),
    ...(definitionAliases ? {definitionAliases} : {}),
    ...(replacedDefinitions ? {replacedDefinitions} : {}),
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
