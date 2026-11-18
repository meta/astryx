// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `icon()` / `astryx experimental icon` (AST-084 FR6, FR7).
 * @position packages/cli/api/icon — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'icon',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'icon()',
  summary:
    'Find an icon by meaning in the installed icon sets, read one icon, or list the sets.',
  description:
    "Reads every installed icon set's data file, never the icon modules. With words it ranks icons by meaning: an icon definition the set's `map` names the icon for, then exact matches on its id or words, then a word that starts with the query, then partial matches, and for a query of several words that none of those answer, the icons that carry some of its words, rarer words counting more within a set. A word written as an export name (`SearchIcon`) also reads as its words, and the reading with the better match answers. Equal scores keep the project's set first, then integration load order; within a set, a whole-id name match before an id-part one and a meaning match by its tag position; then id order. With `<set>/<id>` it reads one icon with every variant's import line. With `list` it lists the installed sets, how many icon definitions each one's `map` covers (built-in and all of Astryx's) and its own definitions, and any set withdrawn and why. `search()` and `astryx search` with no `type` answer from the same ranking when a query asks for an icon (one word as typed is `icon` or `icons`, an installed set's name, or an icon export name such as `SearchIcon`, and is not the name of a component or hook; an `icon` or `icons` right after `with`, with only `a`, `an` or `the` between, that no `of` or `for` follows names a feature of an answered component or template, as in `card with an icon`, and asks for none, while `card with an icon of a star` still asks): after `results` they return `icons`, `{matchCount, results}`, with at most 3 icons (fewer when `limit` is smaller), each with `domain: 'icon'`, `name` (`<set>/<id>`), `set`, `id`, `package`, `score`, `reason`, `import` and `command`; text mode lists them last, one line each. It never changes search's `results` or `matchCount`, and it is absent when no icon answers. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'icon(query?: string, options?: IconOptions): Promise<IconSearchResponse | IconDetailResponse | IconListResponse>',
  keywords: ['icon', 'icons', 'icon set', 'glyph', 'import', 'svg'],
  params: [
    {
      name: 'query',
      type: 'string',
      description:
        'Words to search for, or `<set>/<id>` (`<package>/<set>/<id>` when two packages ship a set with one name). Omit with `list`.',
    },
    {
      name: 'options.list',
      type: 'boolean',
      description: 'List the installed icon sets instead of searching.',
    },
    {
      name: 'options.set',
      type: 'string',
      description:
        'Search one set, by name or `<package>/<set>`. With options.definitions: the set to check the definitions against.',
    },
    {
      name: 'options.limit',
      type: 'number',
      description:
        'Max matches, a positive integer (default 10). `matchCount` counts every match.',
    },
    {
      name: 'options.allIcons',
      type: 'boolean',
      description:
        'With options.set and no query: every icon of that set, by id.',
      default: 'false',
    },
    {
      name: 'options.definitions',
      type: 'boolean',
      description:
        "Every Astryx icon definition: name, whether it is built in, how many bundled templates use it, description, and words, and whether a set's `map` names it: options.set, else the project's main set, else the only set of the icon-set package at `cwd`. Takes no query or other option except options.set.",
      default: 'false',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Project directory (default: the current directory).',
    },
  ],
  returns: [
    {
      type: 'icon.search',
      description:
        "The query, how many icons matched, and the ranked matches, each with its set, id, package, module, export, import line, words, filled names, variants, reason, and score. No match is an empty list. When the project picks a look (`experimental.iconVariant`), a match from a set in the project's list has the module, export, and import of that look; one whose icon lacks the look keeps its own and names both looks in `look` ({asked, used}). With no icon set installed, `reason` says so, `definitions` lists the Astryx icon definitions that match ({name, builtIn, description}), built-in ones first, since Core draws those by name, and `next` says how to get a set.",
    },
    {
      type: 'icon.detail',
      description:
        "One icon's fields, as a match names them, with every variant's import line. The envelope names the set's package.",
    },
    {
      type: 'icon.definitions',
      description:
        "With definitions: every Astryx icon definition, with whether it is built in, its description, its words, how many bundled templates use it (`templates`), and, when `set` names the set checked, whether that set's `map` names it (`mapped`).",
    },
    {
      type: 'icon.setIcons',
      description:
        'With set and all: every icon of that set by id, with its export, words, and the definitions it draws.',
    },
    {
      type: 'icon.list',
      description:
        "The project's icon-set state, each installed set with its package, license, icon count, default variant, declared variants, and the icon definitions its `map` covers, and each withdrawn set with its reason. `next` is present when two or more sets are installed and none is the main set, with the command that chooses one, or when no set is installed, with how to get one.",
    },
  ],
  throws: [
    {
      code: 'ERR_MISSING_ARGUMENT',
      when: 'no query is given and `list` is not set',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: '`limit` is not a positive integer, `allIcons` is given without `set`, or a set name two packages share is not qualified with its package',
    },
    {
      code: 'ERR_INVALID_OPTION',
      when: 'two options are given that the call cannot both honor: `list`, `definitions`, or `allIcons` with any other listing, a query, `set` (not `allIcons` or `definitions`), or `limit`; or a `<set>/<id>` query with `set` or `limit`',
    },
    {
      code: 'ERR_NOT_FOUND',
      when: 'the set named by `<set>/<id>` or `options.set` (with words or `allIcons`) is not installed or is withdrawn (the message says which, and why), or the set has no such icon; suggestions name the closest',
    },
  ],
  examples: [
    {label: 'Find by meaning', code: "const {data} = await icon('delete');"},
    {label: 'One icon', code: "await icon('outline/trash');"},
    {label: 'Installed sets', code: 'await icon(undefined, {list: true});'},
  ],
  command: 'experimental icon',
  related: ['search', 'template'],
};
