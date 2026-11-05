// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for the `icon` command (AST-084 FR6, FR7): the source
 * of truth for its response shapes.
 *
 * @position api/icon — typedefs for api/icon/{icon,search,detail,list}
 */

/**
 * The variant an icon's own export draws.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconSetDefaultVariant
 * @property {string} [variant] - One of the set's declared variants.
 */

/**
 * One variant of an icon.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconVariantEntry
 * @property {string} variant - Which of the set's declared variants it draws.
 * @property {string} module - The import specifier the variant is read from.
 * @property {string} export - The named export that draws the variant.
 */

/**
 * One variant of an icon, with its import line.
 * @experimental May change or be removed in a patch release.
 * @typedef {IconVariantEntry & {import: string}} IconDetailVariantEntry
 */

/**
 * One icon, as every icon read names it.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconRecord
 * @property {string} set - The set's name.
 * @property {string} id - The icon's id, unique in its set.
 * @property {string} package - The integration package that ships the set.
 * @property {string} module - The import specifier of the icon's default export.
 * @property {string} export - The named export that draws the default variant.
 * @property {string} import - The import line for the default variant.
 * @property {string[]} words - Terms a person might search for.
 * @property {string[]} definitions - The icon definitions the set's `map` names this icon for.
 * @property {IconVariantEntry[]} variants - Other variants.
 */

/**
 * One ranked icon match.
 * @experimental May change or be removed in a patch release.
 * @typedef {IconRecord & {reason: string, score: number}} IconMatchEntry
 */

/**
 * `astryx --json experimental icon <words>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconSearchResponse
 * @property {'icon.search'} type
 * @property {object} data
 * @property {string} data.query
 * @property {number} data.matchCount - Every match, before `limit`.
 * @property {IconMatchEntry[]} data.matches - The ranked matches, at most `limit`.
 */

/**
 * `astryx --json experimental icon <set>/<id>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconDetailResponse
 * @property {'icon.detail'} type
 * @property {string} package - The integration package that ships the set.
 * @property {Omit<IconRecord, 'variants'> & {variants: IconDetailVariantEntry[]}} data
 */

/**
 * One installed set.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconSetEntry
 * @property {string} name
 * @property {string} displayName
 * @property {string} description
 * @property {string} package
 * @property {string} license
 * @property {number} iconCount
 * @property {IconSetDefaultVariant | null} default
 * @property {string[] | null} variants - The variants the set declares: named looks such as outline or solid; size comes from CSS.
 * @property {IconSetCoverage} coverage - Which icon definitions the set's `map` covers.
 * @property {boolean} project - Whether this is the project's icon set.
 */

/**
 * Which icon definitions one set's `map` covers.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconSetCoverage
 * @property {{mapped: number, total: number, missing: string[]}} builtIn - Built-in definitions: every set maps them all.
 * @property {{mapped: number, total: number}} astryx - Every Astryx definition, built in or not.
 * @property {string[]} own - The definitions the set declares itself, in its `definitions` folder.
 */

/**
 * A set that answers nothing, and why.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconWithdrawnEntry
 * @property {string} name
 * @property {string} package
 * @property {string} reason
 */

/**
 * `astryx --json experimental icon --list`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconListResponse
 * @property {'icon.list'} type
 * @property {object} data
 * @property {'selected' | 'none' | 'ambiguous' | 'missing' | 'withdrawn'} data.status - The project's icon-set state.
 * @property {string | null} data.projectSet - The project's set, as `<package>/<set>`, when selected.
 * @property {string} data.reason - Why the project has that set, or none.
 * @property {IconSetEntry[]} data.sets - Installed sets, the project's first.
 * @property {IconWithdrawnEntry[]} data.withdrawn - Sets found but withdrawn.
 */

/**
 * `astryx --json experimental icon use <set>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconUseResponse
 * @property {'icon.use'} type
 * @property {object} data
 * @property {string} data.iconSet - The value written to `experimental.iconSet`.
 * @property {string} data.set - The set it names, as `<package>/<set>`.
 * @property {string} data.config - The config file, relative to the project.
 * @property {boolean} data.created - Whether the config file was created.
 * @property {string | null} data.previous - The `experimental.iconSet` value it replaced.
 * @property {boolean} data.changed - Whether anything was written.
 * @property {string} [data.warning] - Present when the project's
 *   `@astryxdesign/cli` range admits a release before 0.7.4, which refuses
 *   an astryx.config that sets `experimental.iconSet`: what fails, and the
 *   range to require.
 */

/**
 * Options for `iconMap()`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconMapOptions
 * @property {string} [cwd]
 * @property {string} [set] - The set to edit, when the package ships several.
 * @property {boolean} [remove] - Remove the definition's entry instead.
 * @property {string | string[]} [pairs] - Many entries at once, as `<definition>=<icon>` pairs separated by commas or spaces; then no definition or icon is passed. All are checked before any is written.
 */

/**
 * `astryx --json experimental icon map --pairs <definition>=<icon>,...`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconMapManyResponse
 * @property {'icon.mapMany'} type
 * @property {object} data
 * @property {string} data.set
 * @property {string} data.package
 * @property {string} data.file - The data file, relative to the package.
 * @property {Array<{definition: string, icon: string, previous: string | null, changed: boolean}>} data.entries - Each pair, in order, and what it replaced.
 * @property {boolean} data.changed - Whether the file was written.
 * @property {string[]} [data.files] - The generated module and its types, when its theme map was rewritten.
 */

/**
 * `astryx --json experimental icon map <definition> <icon>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconMapResponse
 * @property {'icon.map'} type
 * @property {object} data
 * @property {string} data.set
 * @property {string} data.package
 * @property {string} data.file - The data file, relative to the package.
 * @property {string} data.definition
 * @property {string | null} data.icon - The id of the icon now mapped (the icon may be named by any name `map` accepts); null after `remove`.
 * @property {string | null} data.previous - The icon id it replaced.
 * @property {boolean} data.changed - Whether the file was written.
 * @property {string[]} [data.files] - The generated module and its types, when its theme map was rewritten.
 */

/**
 * Options for `iconAdd()`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconAddOptions
 * @property {string} [cwd]
 * @property {string} from - The module the icon is exported from: a package, a package subpath, or a relative path in this package.
 * @property {string} [set] - The set to edit, when the package ships several.
 * @property {string} [definition] - The icon definition to map the icon to.
 * @property {string} [newDefinition] - Add the set's own definition with this name and map the icon to it.
 * @property {string} [description] - With `newDefinition`: what the icon is for.
 * @property {string[]} [words] - With `newDefinition`: words people search for.
 * @property {boolean} [useDefault] - The module's default export is the icon.
 * @property {string} [variant] - Add the export as this declared variant of an existing icon.
 * @property {string} [id] - The icon's id, instead of the one its name gives.
 * @property {boolean} [all] - With `variant` and `from`, and no export name: add that variant for every icon whose id an export of `from` has.
 */

/**
 * `astryx --json experimental icon add --variant <name> --from <module> --all`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconAddVariantsResponse
 * @property {'icon.addVariants'} type
 * @property {object} data
 * @property {string} data.set
 * @property {string} data.package
 * @property {string} data.variant
 * @property {string} data.from - The module the variant exports are read from.
 * @property {number} data.added - Icons that gained the variant.
 * @property {number} data.already - Icons that already had it.
 * @property {string[]} data.missing - Ids of icons `from` has no export for; they keep no such variant.
 * @property {string[]} data.files - Files written, relative to the package.
 * @property {boolean} data.changed
 */

/**
 * `astryx --json experimental icon add <Export> --from <module> --definition <name>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconAddResponse
 * @property {'icon.add'} type
 * @property {object} data
 * @property {string} data.set
 * @property {string} data.package
 * @property {{id: string, export: string, module: string}} data.icon
 * @property {string} [data.variant] - The variant, when the export was added as one.
 * @property {string | null} data.definition - The definition mapped to the icon.
 * @property {string} [data.newDefinition] - The set's own definition the command wrote.
 * @property {string[]} data.files - Files written, relative to the package.
 * @property {boolean} data.changed - Whether anything was written.
 * @property {string} [data.note] - What the package still needs, as text to copy: the entry line that exports the icon from the set's module, and the package.json `files` that publishes a `./` source.
 */

/**
 * One icon definition that fits an export.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconDefinitionMatch
 * @property {string} name
 * @property {string} description
 * @property {'astryx' | 'set'} source - Astryx's definition, or the set's own.
 * @property {number} score
 * @property {string} reason
 * @property {string} command - The `experimental icon add` command that maps the icon to it.
 */

/**
 * `astryx --json experimental icon add <Export> --from <module>` with no definition.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconDefinitionMatchesResponse
 * @property {'icon.definitionMatches'} type
 * @property {object} data
 * @property {string} data.export
 * @property {string} data.from
 * @property {string} data.id - The id the icon would get.
 * @property {IconDefinitionMatch[]} data.matches - At most 10, best first.
 * @property {string | null} data.newDefinition - The command that adds the set's own definition, when no match fits.
 */

/**
 * Options for `icon()`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconOptions
 * @property {string} [cwd]
 * @property {boolean} [list] - List the installed sets.
 * @property {string} [set] - Keep one set, by name or `<package>/<set>`.
 * @property {number} [limit] - Max matches (default 10).
 * @property {boolean} [allIcons] - With `set` and no query: every icon of that set.
 * @property {boolean} [definitions] - Every Astryx icon definition, and nothing else.
 */

/**
 * `astryx --json experimental icon --definitions`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconDefinitionsResponse
 * @property {'icon.definitions'} type
 * @property {object} data
 * @property {Array<{name: string, builtIn: boolean, description: string, words: string[]}>} data.definitions - Every Astryx icon definition, by name; `builtIn` ones every set maps.
 */

/**
 * `astryx --json experimental icon --set <name> --all-icons`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconSetIconsResponse
 * @property {'icon.setIcons'} type
 * @property {object} data
 * @property {string} data.set
 * @property {string} data.package
 * @property {number} data.iconCount
 * @property {Array<{id: string, export: string, words: string[], definitions: string[]}>} data.icons - Every icon, by id, with the definitions `map` names it for.
 */

/**
 * Options for `iconNewSet()`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconNewSetOptions
 * @property {string} [cwd] - A directory inside the integration package.
 * @property {boolean} [dryRun] - Return the receipt without writing.
 * @property {string} [from] - A module whose every icon component the set wraps: a package, a package subpath, or a ./ path in the package.
 * @property {string[] | string} [exclude] - With `from`: export names that are not icons; a string is split on commas.
 * @property {string[] | string} [variants] - The variants the set supplies, such as `outline,solid`; a string is split on commas.
 * @property {string} [defaultVariant] - With `variants`: the variant each icon's own export draws; the first variant when absent.
 * @property {string} [displayName] - The descriptor's display name; the set name in title case when absent.
 * @property {string} [description] - The descriptor's one-line description; `<Display name> icons.` when absent.
 */

/**
 * Options for `iconNewDefinition()`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconNewDefinitionOptions
 * @property {string} [cwd] - A directory inside the icon-set package.
 * @property {boolean} [dryRun] - Return the receipt without writing.
 * @property {string} [set] - The set, when the package ships several.
 * @property {string} [description] - What an icon with this definition is for.
 * @property {string[] | string} [words] - Words people search for; a string is split on commas.
 * @property {string} [icon] - An icon id to map the definition to.
 */

/**
 * What `iconNewSet()` and `iconNewDefinition()` wrote.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconNewData
 * @property {'icon-set' | 'icon-definition'} kind
 * @property {string} name
 * @property {{path: string, created: boolean} | null} root - The manifest's `experimental.iconSets` root, when the call declared or used it.
 * @property {string} manifest - The manifest file, relative to the package.
 * @property {string[]} files - Files written, relative to the package.
 * @property {boolean} written
 * @property {boolean} dryRun
 * @property {string} [from]
 * @property {number} [icons] - With `from`: how many icons it wrote.
 * @property {boolean} [refreshed] - With `from` on an existing set: the set was refreshed, not created.
 * @property {Array<{from: string, to: string}>} [renamed] - On a refresh: the icons whose id this release's id rule changes, matched by the export the library still has; each keeps its `map` entries, variants, and words.
 * @property {Array<{definition: string, icon: string}>} [mapped] - With `from`: the `map` entries an icon with the definition's exact name gives (on a refresh, every such entry, kept or new); check each.
 * @property {Array<{definition: string, icon: string, word: string}>} [suggestions] - With `from`: for each unmapped Astryx definition, up to three icons it might map to, best first: the definition's name in another spelling or as another name of an icon, ids that start with it, an id or another name that is one of its words, then two-word ids that are a one-word word sized, shaped, or numbered (`grid-2x2`); never a negated form, the opposite direction, or an icon already mapped. `word` is the name or word that matched. Never written.
 * @property {string[]} [notes] - What the author does next, including each change the package needs that the CLI never makes itself (its entry, peers, scripts), as text to copy.
 */

/**
 * `astryx --json experimental icon new-set <name>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconNewSetResponse
 * @property {'icon.newSet'} type
 * @property {IconNewData} data
 */

/**
 * `astryx --json experimental icon new-definition <name>`.
 * @experimental May change or be removed in a patch release.
 * @typedef {object} IconNewDefinitionResponse
 * @property {'icon.newDefinition'} type
 * @property {IconNewData} data
 */

/**
 * @experimental May change or be removed in a patch release.
 * @typedef {IconNewSetResponse | IconNewDefinitionResponse} IconNewResponse
 */

export {};
