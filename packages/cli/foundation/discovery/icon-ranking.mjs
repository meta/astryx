// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pure icon records and ranking (AST-084 FR6), shared by the `icon`
 * leaves and the icon-set checks' suggestions. No environment access.
 *
 * Ranking tiers, highest first:
 *   100  the query is an icon definition the set's `map` names the icon for
 *    90  an exact match in the reading the searched sets favor (below)
 *    80  an exact match in the other reading
 *    60  one of its words starts with the query
 *    40  a partial match: the id or a word contains the query (three
 *        letters or more), or every word of the query starts one of the
 *        icon's words or id parts
 *    20  a word match: nothing above answers a query of several words, and
 *        the icon carries one or more of its words (below)
 *
 * A word matches a whole word: a word's plural or singular (`stars` for
 * `star`) is an exact match, while a longer word that only starts with it
 * (`start`) is a word-start match, and {@link answeringMatches} keeps
 * word-start and partial matches only when nothing matches a whole word.
 * A query is scored as typed first. Only when nothing answers it with a
 * whole word are the words that only phrase it (`go`, `the`, `icon`) left
 * out of a query of several words, so `go home` asks for `home` while
 * `arrow up to line` still names `arrow-up-to-line`. At that step the
 * query is also read with each word written as an export name split into
 * its words, so `SearchIcon` asks for `search`; the reading whose best match
 * scores higher answers, and on a tie the word as typed does, so
 * `PaperClip` still finds a `paperclip` icon.
 *
 * Agents ask for a glyph in a phrase (`copy button clipboard`), and often no
 * icon carries every word. For the finder's own search answers and
 * search's icons block only, when
 * no reading answers a query of several words, each icon that carries one
 * or more of its words, as typed or split from an export name, is a word
 * match. An icon carries a word when the word, or its
 * plural or singular, is one of its id parts, a part of one of its words, or
 * a part of a word of a definition the set maps it for. A word weighs more
 * the fewer searched icons carry it, so the word that names the glyph
 * outweighs a common one, and a word no icon carries counts for nothing.
 * A word counts twice when, alone or with other query words, it spells out
 * the whole name of a definition the set maps the icon for: the map is the
 * set's own statement of what the icon means. Word matches share one
 * score, so they keep set order first, as every equal score does; within a
 * set they rank by the weight of the words they carry, then the icon whose
 * id holds fewer parts that no query word names, then id order.
 *
 * An exact match is a NAME match when the query is the icon's id, or one of
 * its words that is also a part of its id (`trash` for `trash-2`); it is a
 * MEANING match when the query is one of its other words, its tags. An id
 * names the artwork; the tags say what it is for. Lucide's `delete` draws the
 * Delete key, so `delete` names it, while `trash` is tagged `delete`: the
 * query asks for the meaning. Which reading leads is decided by the searched
 * sets themselves: when at least as many icons carry the query as a tag as
 * carry it as a name, meaning matches score 90 and name-only matches 80;
 * otherwise name matches score 90 and meaning-only matches 80 (`user` names
 * many icons, so the `user` icon stays ahead of `contact`, which is only
 * tagged `user`).
 *
 * Equal scores keep the set order first (the project's set, then load
 * order), so the project's set always leads at a score. Within one set, a
 * name match on the whole id (or its plural or singular) comes before one on
 * a part of it, and a meaning
 * match whose query sits earlier among the icon's tags comes first (sets list
 * an icon's most telling tags first). Remaining ties put first an icon whose
 * id the query names in full: each word of the id is a query word, or its
 * plural or singular. So for `plus add`, `plus` leads `folder-plus`. Then
 * they keep id order, so the same installation always answers the same way.
 *
 * Ranking reads every icon of every searched set in each pass, and one
 * search makes up to four passes. Each set's icons, with the words they
 * match by, are worked out once per search and shared by its passes.
 *
 * @position foundation/discovery — read by api/icon and icon-set-checks
 */

import {ICON_EXPORT_NAME_RE, definitionsByIcon} from './icon-set-discovery.mjs';
import {
  astryxDefinitionsByName,
  replacedNamesOf,
} from './icon-definition-discovery.mjs';
import {iconIdOf} from '../text/icon-id.mjs';

/** @typedef {import('./icon-set-discovery.mjs').DiscoveredIconSet} DiscoveredIconSet */
/** @typedef {import('../../authoring/doctypes/icon-set/type').IconSetIcon} IconSetIcon */
/** @typedef {import('../../api/icon/icon.type.mjs').IconRecord} IconRecord */
/** @typedef {import('../../api/icon/icon.type.mjs').IconMatchEntry} IconMatchEntry */

/**
 * The import line for one export, under `local` when that name differs from
 * the export's.
 * @param {string} exportName
 * @param {string} module
 * @param {string} [local]
 */
export function importLine(exportName, module, local = exportName) {
  const binding =
    local === exportName ? exportName : `${exportName} as ${local}`;
  return `import {${binding}} from '${module}';`;
}

/**
 * One icon as every icon read names it.
 * @param {DiscoveredIconSet} set
 * @param {IconSetIcon} icon
 * @param {string[]} [definitions] the definitions the set's `map` names it
 *   for; read from the set when not given
 * @returns {IconRecord}
 */
export function iconRecord(set, icon, definitions) {
  const module = icon.module ?? set.data.module;
  return {
    set: set.name,
    id: icon.id,
    package: set.package,
    module,
    export: icon.export,
    import: importLine(icon.export, module),
    words: [...icon.words],
    definitions: [
      ...(definitions ?? definitionsByIcon(set.data).get(icon.id) ?? []),
    ],
    variants: (icon.variants ?? []).map(variant => ({
      variant: variant.variant,
      module: variant.module ?? module,
      export: variant.export,
    })),
  };
}

/** @param {string} value */
const squash = value => value.toLowerCase().replace(/[\s_-]+/g, '');

/**
 * How one icon matches a query, before the searched sets decide which exact
 * reading leads: the tier, whether an exact match is a name or a meaning
 * match, and the keys that order matches within a tier.
 * @typedef {object} IconMatch
 * @property {'definition' | 'exact' | 'prefix' | 'partial'} tier
 * @property {boolean} name the query is the id, or a word that is an id part
 * @property {boolean} meaning the query is one of the icon's tags (never
 *   both: a tag is a word that is not the id or one of its parts)
 * @property {number} rank within-tier key, lower first: for a name match 0
 *   (whole id), 1 (the whole id's plural or singular), 2 (an id part), or 3
 *   (an id part's plural or singular); for a meaning match the tag's
 *   position
 * @property {string} reason
 */

/**
 * How one icon matches a query, or null when it does not.
 * @param {string} query lower-case, trimmed
 * @param {IconSetIcon} icon
 * @param {string[]} [definitions] the icon definitions the set maps it to
 * @returns {IconMatch | null}
 */
export function matchIcon(query, icon, definitions = []) {
  return matchReady(readyQuery(query), readyIcon(icon, definitions));
}

/**
 * The forms of a query that {@link matchIcon} compares, worked out once for
 * a ranking pass rather than once for each icon.
 * @typedef {object} ReadyQuery
 * @property {string} text the query, lower-case and trimmed
 * @property {string} joined the query without spaces, hyphens or underscores
 * @property {string} id the query with its spaces as hyphens
 * @property {boolean} spaced whether the query holds a space
 * @property {boolean} long whether the query holds three letters or more
 * @property {string[]} tokens the query's words
 */

/**
 * @param {string} query lower-case, trimmed
 * @returns {ReadyQuery}
 */
function readyQuery(query) {
  return {
    text: query,
    joined: squash(query),
    id: query.replace(/\s+/g, '-'),
    spaced: /\s/u.test(query),
    long: query.replace(/\s+/gu, '').length >= 3,
    tokens: query.split(/\s+/).filter(Boolean),
  };
}

/**
 * The forms of an icon that {@link matchIcon} compares, worked out once.
 * @typedef {object} ReadyIcon
 * @property {IconSetIcon} icon
 * @property {string[]} definitions the definitions the set maps it to
 * @property {string[]} lowerDefinitions those names in lower case
 * @property {Array<{name: string, definition: string, lower: string}>} replaced
 *   the old names of those definitions: each answers with this icon
 * @property {Set<string>} parts its id parts
 * @property {string[]} tags its words that are neither its id nor an id part
 * @property {boolean[]} spacedWords for each word, whether it holds a space
 * @property {string[]} [texts] its id, then its words, made when first needed
 * @property {string[]} [allParts] its id parts, then the parts of its words,
 *   made when first needed
 */

/**
 * @param {IconSetIcon} icon
 * @param {string[]} definitions
 * @param {Array<{name: string, definition: string}>} [replaced] the old
 *   names of those definitions
 * @returns {ReadyIcon}
 */
function readyIcon(icon, definitions, replaced = []) {
  const parts = new Set(icon.id.split('-'));
  return {
    icon,
    definitions,
    lowerDefinitions: definitions.map(name => name.toLowerCase()),
    replaced: replaced.map(each => ({...each, lower: each.name.toLowerCase()})),
    parts,
    tags: icon.words.filter(word => word !== icon.id && !parts.has(word)),
    spacedWords: icon.words.map(word => /\s/u.test(word)),
  };
}

/**
 * {@link matchIcon} on a ready query and a ready icon.
 * @param {ReadyQuery} q
 * @param {ReadyIcon} ready
 * @returns {IconMatch | null}
 */
function matchReady(q, ready) {
  const {icon, parts, tags} = ready;
  const query = q.text;
  const at = ready.lowerDefinitions.indexOf(q.joined);
  if (at >= 0) {
    return {
      tier: 'definition',
      name: false,
      meaning: false,
      rank: 0,
      reason: `definition "${ready.definitions[at]}"`,
    };
  }
  // The name of a definition another one replaced answers with the icon its
  // successor draws.
  const old = ready.replaced.find(each => each.lower === q.joined);
  if (old) {
    return {
      tier: 'definition',
      name: false,
      meaning: false,
      rank: 0,
      reason: `definition "${old.definition}" (replaced "${old.name}")`,
    };
  }
  const tagAt = tags.indexOf(query);
  const wholeId = icon.id === q.id;
  const partWord = !wholeId && parts.has(query) && icon.words.includes(query);
  if (wholeId || partWord || tagAt >= 0) {
    return {
      tier: 'exact',
      name: wholeId || partWord,
      meaning: !wholeId && !partWord,
      rank: wholeId ? 0 : partWord ? 2 : tagAt,
      reason: wholeId ? `id "${icon.id}"` : `word "${query}"`,
    };
  }
  const plural = q.spaced
    ? undefined
    : icon.words.find(
        (word, index) =>
          !ready.spacedWords[index] &&
          word !== query &&
          pluralPair(word, query),
      );
  if (plural) {
    const named = parts.has(plural);
    return {
      tier: 'exact',
      name: named,
      meaning: !named,
      // The whole id's plural or singular right after the whole id, then
      // after the word itself, wherever it sits.
      rank: named
        ? plural === icon.id
          ? 1
          : 3
        : tags.length + tags.indexOf(plural),
      reason: `word "${plural}"`,
    };
  }
  const prefix = icon.words.find(word => word.startsWith(query));
  if (prefix) {
    return {
      tier: 'prefix',
      name: false,
      meaning: false,
      rank: 0,
      reason: `word "${prefix}" starts with "${query}"`,
    };
  }
  // A letter or two inside a word (`x` in `box`) says nothing about it.
  const contains = q.long
    ? (ready.texts ??= [icon.id, ...icon.words]).find(text =>
        text.includes(query),
      )
    : undefined;
  if (contains) {
    return {
      tier: 'partial',
      name: false,
      meaning: false,
      rank: 0,
      reason: `partial "${contains}"`,
    };
  }
  if (q.tokens.length > 1) {
    const allParts = (ready.allParts ??= [
      ...icon.id.split('-'),
      ...icon.words.flatMap(word => word.split(/\s+/)),
    ]);
    if (
      q.tokens.every(token => allParts.some(part => part.startsWith(token)))
    ) {
      return {
        tier: 'partial',
        name: false,
        meaning: false,
        rank: 0,
        reason: `partial "${q.tokens.join(' ')}"`,
      };
    }
  }
  return null;
}

/**
 * Whether two words are one word's singular and plural (`star`, `stars`;
 * `box`, `boxes`), never the same word.
 * @param {string} a
 * @param {string} b
 */
function sameWord(a, b) {
  if (a === b || /\s/u.test(a) || /\s/u.test(b)) return false;
  return pluralPair(a, b);
}

/**
 * Whether one of two different words without spaces is the other's plural.
 * @param {string} a
 * @param {string} b
 */
function pluralPair(a, b) {
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 2 && (long === `${short}s` || long === `${short}es`);
}

/** Words that ask for an icon outright. */
const ICON_WORDS = new Set(['icon', 'icons']);

/**
 * Words that phrase a query without naming anything, the words that only
 * join others among them: left out of a query of several words that nothing
 * answers as typed (`go home` asks for `home`, `card with a star` for
 * `card star`).
 */
const FILLER_WORDS = new Set([
  'a',
  'an',
  'the',
  'go',
  'to',
  'my',
  'of',
  'for',
  'with',
  'and',
  ...ICON_WORDS,
]);

/** Words that may sit between `with` and the icon word of a feature. */
const ARTICLES = new Set(['a', 'an', 'the']);

/** Words after an icon word that describe the glyph itself. */
const GLYPH_WORDS = new Set(['of', 'for']);

/**
 * Whether the icon word at `at` names a feature of something else: it comes
 * right after `with`, with only articles between (`card with an icon`), and
 * no `of` or `for` follows it to describe the glyph (`with an icon of a
 * star`).
 * @param {string[]} words the query's lower-case words
 * @param {number} at
 */
function featureIconWord(words, at) {
  let before = at - 1;
  while (before >= 0 && ARTICLES.has(words[before])) before--;
  return words[before] === 'with' && !GLYPH_WORDS.has(words[at + 1]);
}

/**
 * Whether a query asks for an icon: one word as typed is `icon` or `icons` in
 * any case, names a set in `setNames`, or is written as an icon export name
 * (`SearchIcon`). A word that is the exact name of a component or hook in
 * `declaredNames` asks for that entry, not an icon, so `Icon`, `NavIcon` and
 * `IconButton` stay lookups. When the answer already holds a component or a
 * template (`answersEntry`), an icon word that names a feature of it asks for
 * nothing: `card with an icon` asks for a card.
 * @param {string} query
 * @param {{setNames: string[], declaredNames: string[], answersEntry: boolean}} context
 *   the installed sets' names, the names of the components and hooks search
 *   reads, and whether search's answer holds a component or a template
 */
export function asksForIcon(query, {setNames, declaredNames, answersEntry}) {
  const sets = new Set(setNames.map(name => name.toLowerCase()));
  const declared = new Set(declaredNames);
  const words = query.trim().split(/\s+/u);
  const lower = words.map(word => word.toLowerCase());
  return words.some((word, at) => {
    if (declared.has(word)) return false;
    if (ICON_WORDS.has(lower[at])) {
      return !(answersEntry && featureIconWord(lower, at));
    }
    return sets.has(lower[at]) || ICON_EXPORT_NAME_RE.test(word);
  });
}

/**
 * A query as typed: trimmed and lower-case, one space between words.
 * @param {string} query
 */
function typedQuery(query) {
  return query.trim().toLowerCase().split(/\s+/u).filter(Boolean).join(' ');
}

/**
 * The query without the words that only phrase it, when it has several
 * words and some word names something; else the query as typed.
 * @param {string} query
 */
export function iconQuery(query) {
  const words = typedQuery(query).split(' ').filter(Boolean);
  const named = words.filter(word => !FILLER_WORDS.has(word));
  return (words.length > 1 && named.length > 0 ? named : words).join(' ');
}

/**
 * The query with each word that holds a capital letter read as the icon id
 * its export name stands for, split into its words: `XMarkIcon` reads
 * `x mark` and `Bars3Icon` reads `bars 3` ({@link iconIdOf}).
 * @param {string} query
 */
function exportNameWords(query) {
  return query.replace(/[A-Za-z0-9]+/gu, word =>
    /[A-Z]/u.test(word) ? iconIdOf(word).replace(/-/gu, ' ') : word,
  );
}

/**
 * The matches that answer a query: the whole-word ones (a definition or an
 * exact match, 80 and up) when there are any, else word starts (60) when
 * there are any, else partial matches. A longer word that only starts with
 * the query (`start` for `star`) never stands beside a whole-word answer.
 * @template {{score: number}} T
 * @param {T[]} ranked best first
 * @returns {T[]}
 */
export function answeringMatches(ranked) {
  for (const floor of [80, 60]) {
    if (ranked.some(each => each.score >= floor)) {
      return ranked.filter(each => each.score >= floor);
    }
  }
  return ranked;
}

/**
 * The score of one match, given which exact reading leads.
 * @param {IconMatch} match
 * @param {'name' | 'meaning'} leading
 * @returns {number}
 */
function scoreOf(match, leading) {
  switch (match.tier) {
    case 'definition':
      return 100;
    case 'exact':
      return match[leading] ? 90 : 80;
    case 'prefix':
      return 60;
    default:
      return 40;
  }
}

/**
 * Which exact reading leads for a set of matches: meaning, unless more icons
 * carry the query as a name than as a tag.
 * @param {Array<IconMatch | null>} matches
 * @returns {'name' | 'meaning'}
 */
export function leadingReading(matches) {
  let names = 0;
  let meanings = 0;
  for (const match of matches) {
    if (match?.tier !== 'exact') continue;
    if (match.name) names++;
    if (match.meaning) meanings++;
  }
  return names > meanings ? 'name' : 'meaning';
}

/**
 * How well one icon answers a query on its own, or null when it does not.
 * An exact match is scored as if `leading` were the reading the searched
 * sets favor (meaning, unless told otherwise).
 * @param {string} query lower-case, trimmed
 * @param {IconSetIcon} icon
 * @param {'name' | 'meaning'} [leading]
 * @param {string[]} [definitions] the icon definitions the set maps it to
 * @returns {{score: number, reason: string} | null}
 */
export function scoreIcon(query, icon, leading = 'meaning', definitions = []) {
  const match = matchIcon(query, icon, definitions);
  return match ? {score: scoreOf(match, leading), reason: match.reason} : null;
}

/**
 * A definition name read as lower-case words (`externalLink` is
 * `external link`).
 * @param {string} name
 */
function spokenName(name) {
  return name.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').toLowerCase();
}

/**
 * The icon with the words it matches by: its own words, then the name (read
 * as words) and words of every definition the set's `map` names it for, so
 * `bin` finds the icon mapped to `delete` without the data file repeating
 * the definition's words. The icon's own words keep their places, so its
 * own tags still rank first.
 * @param {IconSetIcon} icon
 * @param {string[]} definitions
 * @param {(name: string) => {name: string, words: string[]} | undefined} lookup
 * @returns {IconSetIcon}
 */
export function withDefinitionWords(icon, definitions, lookup) {
  if (definitions.length === 0) return icon;
  const words = [...icon.words];
  for (const name of definitions) {
    const doc = lookup(name);
    for (const word of [spokenName(name), ...(doc?.words ?? [])]) {
      const lower = word.toLowerCase();
      if (!words.includes(lower)) words.push(lower);
    }
  }
  return {...icon, words};
}

/**
 * Every icon in `sets` that answers the query, ranked. The query is
 * scored as typed; when nothing answers it with a whole word (80 and up),
 * it is scored again without its filler words ({@link iconQuery}), and
 * again with each word written as an export name read as its words
 * ({@link exportNameWords}); the reading whose best match scores higher
 * answers, the one without filler words on a tie. With `words`, a query
 * of several words that no reading answers is ranked by the words each
 * icon carries ({@link rankWords}), the words of both readings together:
 * the finder's own search answers and search's icons block ask for that,
 * while callers that look for a near spelling or a fitting definition do not.
 * @param {DiscoveredIconSet[]} sets in tie order
 * @param {string} query
 * @param {{words?: boolean}} [options]
 * @returns {IconMatchEntry[]}
 */
export function rankIcons(sets, query, {words = false} = {}) {
  /** @type {SearchableIcons} */
  const searchable = new Map();
  const typed = typedQuery(query);
  const asTyped = rankTerm(sets, typed, searchable);
  if (asTyped.some(each => each.score >= 80)) return asTyped;
  const named = iconQuery(query);
  const asNamed = named === typed ? asTyped : rankTerm(sets, named, searchable);
  const answered = asNamed.length > 0 ? asNamed : asTyped;
  const spelled = iconQuery(exportNameWords(query));
  const asSpelled =
    spelled === '' || spelled === named || spelled === typed
      ? []
      : rankTerm(sets, spelled, searchable);
  const best = topScore(asSpelled) > topScore(answered) ? asSpelled : answered;
  if (best.length > 0) return best;
  if (!words) return [];
  const asked = [...new Set([...named.split(' '), ...spelled.split(' ')])];
  return asked.length > 1 ? rankWords(sets, asked.join(' '), searchable) : [];
}

/**
 * The score of the first entry of a ranked list, or -Infinity for none.
 * @param {IconMatchEntry[]} ranked best first
 */
function topScore(ranked) {
  return ranked.length > 0 ? ranked[0].score : -Infinity;
}

/** The score of a word match ({@link rankWords}): below every other tier. */
const WORD_MATCH_SCORE = 20;

/**
 * Icons that carry one or more words of a query of several words, set
 * order first and then best first within a set. A word weighs the log of how many searched icons there are over how
 * many carry it, so a rare word counts more than a common one. An icon's
 * weight is the sum of the weights of the words it carries, with the words
 * that name a definition the set maps it for counted twice
 * ({@link mappedNameWords}).
 * @param {DiscoveredIconSet[]} sets in tie order
 * @param {string} term lower-case words, filler words left out
 * @param {SearchableIcons} searchable this search's worked-out sets
 * @returns {IconMatchEntry[]}
 */
function rankWords(sets, term, searchable) {
  const words = [...new Set(term.split(' '))];
  let total = 0;
  /** @type {Array<{set: DiscoveredIconSet, icon: IconSetIcon, definitions: string[], carried: string[], named: string[], setIndex: number}>} */
  const hits = [];
  sets.forEach((set, setIndex) => {
    for (const each of searchableIcons(set, searchable)) {
      const {icon, definitions} = each;
      total++;
      const terms = (each.terms ??= iconTerms(each.ready.icon));
      const carried = words.filter(word =>
        terms.some(each => each === word || sameWord(each, word)),
      );
      if (carried.length > 0) {
        const named = mappedNameWords(definitions, words);
        hits.push({set, icon, definitions, carried, named, setIndex});
      }
    }
  });
  /** @type {Map<string, number>} */
  const carriers = new Map();
  for (const hit of hits) {
    for (const word of hit.carried) {
      carriers.set(word, (carriers.get(word) ?? 0) + 1);
    }
  }
  /** @param {string} word */
  const weight = word =>
    Math.log((total + 1) / ((carriers.get(word) ?? 0) + 1));
  const ranked = hits.map(hit => ({
    hit,
    value: [...hit.carried, ...hit.named].reduce(
      (sum, word) => sum + weight(word),
      0,
    ),
    unasked: hit.icon.id
      .split('-')
      .filter(
        part => !words.some(word => word === part || sameWord(word, part)),
      ).length,
  }));
  ranked.sort(
    (a, b) =>
      a.hit.setIndex - b.hit.setIndex ||
      b.value - a.value ||
      a.unasked - b.unasked ||
      (a.hit.icon.id < b.hit.icon.id
        ? -1
        : a.hit.icon.id > b.hit.icon.id
          ? 1
          : 0),
  );
  return ranked.map(({hit}) => ({
    ...iconRecord(hit.set, hit.icon, hit.definitions),
    reason: `words "${hit.carried.join('", "')}"`,
    score: WORD_MATCH_SCORE,
  }));
}

/**
 * The query words that spell out the whole name of a definition the set maps
 * the icon for (`external link` for `externalLink`). The map is the set's
 * own statement of what the icon means, so these words count twice.
 * @param {string[]} definitions the names the set maps the icon for
 * @param {string[]} words the query's words
 * @returns {string[]}
 */
function mappedNameWords(definitions, words) {
  /** @type {Set<string>} */
  const named = new Set();
  for (const name of definitions) {
    const asked = spokenName(name)
      .split(' ')
      .map(part => words.find(word => word === part || sameWord(word, part)));
    if (asked.every(Boolean)) {
      for (const word of asked) named.add(/** @type {string} */ (word));
    }
  }
  return [...named];
}

/**
 * The single words an icon carries: its id parts and the parts of its
 * words, since a word can hold several (`align end`).
 * @param {IconSetIcon} icon
 * @returns {string[]}
 */
function iconTerms(icon) {
  return [
    ...new Set([
      ...icon.id.split('-'),
      ...icon.words.flatMap(word => word.split(/[\s-]+/u)),
    ]),
  ].filter(Boolean);
}

/**
 * The sets one search has worked out ({@link searchableIcons}), by set
 * object. Each search starts its own, so a set that a caller edits between
 * searches is read again.
 * @typedef {Map<object, Array<{icon: IconSetIcon, definitions: string[], ready: ReadyIcon, terms?: string[]}>>} SearchableIcons
 */

/**
 * Each icon of a set with the words it matches by and its ready forms
 * ({@link readyIcon}). Every pass of a search reads every icon, so the work
 * is done once per search rather than once per pass.
 * @param {DiscoveredIconSet} set
 * @param {SearchableIcons} kept this search's worked-out sets
 * @returns {Array<{icon: IconSetIcon, definitions: string[], ready: ReadyIcon, terms?: string[]}>}
 */
function searchableIcons(set, kept) {
  const known = kept.get(set);
  if (known) return known;
  const astryx = astryxDefinitionsByName();
  const byIcon = definitionsByIcon(set.data);
  const own = new Map(
    (set.definitions ?? []).map(each => [each.doc.name, each.doc]),
  );
  const list = set.data.icons.map(icon => {
    const definitions = byIcon.get(icon.id) ?? [];
    const searchable = withDefinitionWords(
      icon,
      definitions,
      name => astryx.get(name) ?? own.get(name),
    );
    const replaced = definitions.flatMap(definition =>
      replacedNamesOf(definition, set).map(name => ({name, definition})),
    );
    return {
      icon,
      definitions,
      ready: readyIcon(searchable, definitions, replaced),
    };
  });
  kept.set(set, list);
  return list;
}

/**
 * {@link rankIcons} for one normalized query.
 * @param {DiscoveredIconSet[]} sets
 * @param {string} term
 * @param {SearchableIcons} searchable this search's worked-out sets
 * @returns {IconMatchEntry[]}
 */
function rankTerm(sets, term, searchable) {
  const query = readyQuery(term);
  /** @type {Array<{set: DiscoveredIconSet, icon: IconSetIcon, definitions: string[], match: IconMatch, setIndex: number}>} */
  const hits = [];
  sets.forEach((set, setIndex) => {
    for (const {icon, definitions, ready} of searchableIcons(set, searchable)) {
      const match = matchReady(query, ready);
      if (match) hits.push({set, icon, definitions, match, setIndex});
    }
  });
  const leading = leadingReading(hits.map(hit => hit.match));
  const found = hits.map(({set, icon, definitions, match, setIndex}) => {
    const score = scoreOf(match, leading);
    return {
      entry: {
        ...iconRecord(set, icon, definitions),
        reason: match.reason,
        score,
      },
      // Within an exact score and one set: a name match keeps whole id
      // before id part, a meaning match its tag position.
      rank: match.tier === 'exact' ? match.rank : 0,
      whole: namesWholeId(icon.id, term),
      setIndex,
    };
  });
  found.sort(
    (a, b) =>
      // Equal scores keep set order, so the project's set leads (FR6, FR8).
      b.entry.score - a.entry.score ||
      a.setIndex - b.setIndex ||
      a.rank - b.rank ||
      Number(b.whole) - Number(a.whole) ||
      (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0),
  );
  return found.map(({entry}) => entry);
}

/**
 * Whether the query names every word of an icon's id: each id word is a
 * query word, or its plural or singular.
 * @param {string} id
 * @param {string} term lower-case words
 * @returns {boolean}
 */
function namesWholeId(id, term) {
  const asked = term.split(' ');
  return id
    .split('-')
    .every(part => asked.some(word => word === part || pluralPair(word, part)));
}
