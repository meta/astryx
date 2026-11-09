// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for the `component` command — source of truth for the
 * component command's JSON responses. These typedefs describe the `{type, data}`
 * envelopes emitted by `astryx --json component` and returned by the `component()`
 * API; the `types/component.d.ts` barrel re-exports them for consumers.
 *
 * Detail-level contract for list views (brief < compact < full):
 *   --detail brief    Names only. Smallest, most scannable. (DEFAULT for --list)
 *   --detail compact  Names + 1-line description + import path.
 *   --detail full     Full ComponentDoc per entry (props, theming, examples, etc.).
 *
 * Invocation                                      -> type discriminator
 * ------------------------------------------------------------------
 * astryx --json component                         -> component.list (data.detail='names')
 * astryx --json component --list                  -> component.list (data.detail='names')
 * astryx --json component --category Form         -> component.list (filtered)
 * astryx --json component --list --detail compact -> component.list (data.detail='compact')
 * astryx --json component --list --detail full    -> component.list (data.detail='full')
 * component([])                                  -> component.batch (data.count=0)
 * component(['Button'])                          -> component.batch (data.count=1)
 * astryx --json component Button Badge            -> component.batch
 * astryx --json component Button                  -> component.detail
 * astryx --json component Button --props          -> component.detail.props
 * astryx --json component Button --source         -> component.detail.source
 * astryx --json component Button --showcase       -> component.detail.showcase
 * astryx --json component Button --blocks         -> component.detail.blocks
 * (not found)                                     -> CLIError
 */

/**
 * astryx --json component [--list] [--category X] [--detail names|compact|full]
 *
 * The list view emits ONE `component.list` type across all three detail levels;
 * the depth is carried in `data.detail` and `data.components` holds the grouped
 * map whose entry shape depends on that level:
 *   - 'names'   -> ComponentListEntry[]  (name + owner package + optional import)
 *   - 'compact' -> ComponentBriefEntry[] (name + owner package + 1-line description + import)
 *   - 'full'    -> ComponentDoc[]        (full authored doc per entry, plus its owner package)
 * @typedef {object} ComponentListResponse
 * @property {'component.list'} type
 * @property {ComponentListData} data
 */

/**
 * Detail-tagged payload for `component.list` (discriminated on `detail`).
 * @typedef {(
 *   | {detail: 'names'; components: Record<string, ComponentListEntry[]>}
 *   | {detail: 'compact'; components: Record<string, ComponentBriefEntry[]>}
 *   | {detail: 'full'; components: Record<string, Array<import('@astryxdesign/cli/authoring').ComponentDoc & {package: string}>>}
 * )} ComponentListData
 */

/**
 * `component(string[])` always returns this type, including empty and one-item
 * arrays. The CLI returns it for two or more positional selectors.
 * @typedef {import('../../foundation/response/batch.type.mjs').BatchResponse<
 *   'component.batch',
 *   ComponentSingleResponse,
 *   ComponentBatchCandidate
 * >} ComponentBatchResponse
 */

/**
 * One installed component that makes an unqualified selector ambiguous.
 * Keys match a component row in `discover.search` so a caller does not learn a
 * second candidate shape.
 * @typedef {object} ComponentBatchCandidate
 * @property {string} package
 * @property {string} component
 * @property {'component'} kind
 * @property {true} installed
 */

/**
 * The response a successful single selector would have returned.
 * @typedef {(
 *   | ComponentDetailResponse
 *   | ComponentDetailPropsResponse
 *   | ComponentDetailSourceResponse
 *   | ComponentDetailShowcaseResponse
 *   | ComponentDetailBlocksResponse
 * )} ComponentSingleResponse
 */

/**
 * One row per requested selector, in argument order. Duplicate selectors keep
 * duplicate rows.
 * @typedef {import('../../foundation/response/batch.type.mjs').BatchRow<
 *   ComponentSingleResponse,
 *   ComponentBatchCandidate
 * >} ComponentBatchResult
 */

/**
 * A single entry in a `component.list` group at `detail: 'names'`. Pre-1.0 the
 * list moved from bare strings to package-qualified objects so consumers can
 * disambiguate ownership (core vs. an integration package). Integration and
 * legacy `astryx.docs` package entries carry `import` — the same specifier their
 * `component.detail` reports; core entries omit it (the specifier is derived
 * from the component name by the renderer).
 * @typedef {object} ComponentListEntry
 * @property {string} name
 * @property {string} package - Owner package, e.g. '@astryxdesign/core' or '@acme/astryx-meta'.
 * @property {string} [import] - Import specifier; present for integration and legacy package components, absent for core.
 */

/**
 * A single entry in a `component.list` group at `detail: 'compact'`.
 * @typedef {object} ComponentBriefEntry
 * @property {string} name
 * @property {string} package - Owner package; '@astryxdesign/core' for a Core component.
 * @property {string} description
 * @property {string} import
 */

/**
 * astryx --json component <name>
 * @typedef {object} ComponentDetailResponse
 * @property {'component.detail'} type
 * @property {string} package The npm package that owns the component.
 * @property {import('@astryxdesign/cli/authoring').ComponentDoc & ComponentOwnership & ComponentDetailScope} data
 */

/**
 * Present only when the requested name is a sub-component documented inside a
 * parent's doc (e.g. `HStack` in the `Stack` doc); the payload is scoped to it.
 * @typedef {object} ComponentDetailScope
 * @property {string} [parentDoc] - Name of the parent doc the payload was scoped from, e.g. 'Stack'.
 */

/**
 * Ownership metadata attached to every `component.detail` payload. Exposes the
 * owner package, the import specifier, and whether a swizzleable source file is
 * available — the inputs the integration-component swizzle (a later PR) needs.
 * @typedef {object} ComponentOwnership
 * @property {string} package - Owner package, e.g. '@astryxdesign/core' or an integration package name.
 * @property {string} import - Import specifier for the component (e.g. '@astryxdesign/core/Button').
 * @property {boolean} sourceAvailable - Whether a component source file exists for `--source` / swizzle.
 */

/**
 * astryx --json component <name> --props
 * @typedef {object} ComponentDetailPropsResponse
 * @property {'component.detail.props'} type
 * @property {string} package The npm package that owns the component.
 * @property {import('@astryxdesign/cli/authoring').ComponentPropDoc[]} data
 */

/**
 * astryx --json component <name> --source
 * @typedef {object} ComponentDetailSourceResponse
 * @property {'component.detail.source'} type
 * @property {string} package The npm package that owns the component.
 * @property {{component: string; source: string}} data
 */

/**
 * astryx --json component <name> --showcase
 * @typedef {object} ComponentDetailShowcaseResponse
 * @property {'component.detail.showcase'} type
 * @property {string} package The npm package that owns the component.
 * @property {{component: string; aspectRatio: number; source: string}} data
 */

/**
 * astryx --json component <name> --blocks
 * @typedef {object} ComponentDetailBlocksResponse
 * @property {'component.detail.blocks'} type
 * @property {string} package The npm package that owns the component.
 * @property {{component: string; showcase: BlockEntry | null; examples: BlockEntry[]; related: BlockEntry[]}} data
 */

/**
 * @typedef {object} BlockEntry
 * @property {string} name
 * @property {string} package The npm package that owns the block template.
 * @property {string} displayName
 * @property {string} description
 * @property {boolean} isShowcase
 * @property {string} category
 */

/**
 * Options for `component()`.
 * @typedef {object} ComponentOptions
 * @property {string} [cwd]
 * @property {boolean} [list]
 * @property {string} [category]
 * @property {string} [package] Scope lookup to a specific external package (e.g. '@acme/xds-widgets').
 * @property {boolean} [props]
 * @property {boolean} [source]
 * @property {boolean} [showcase]
 * @property {boolean} [blocks] List example blocks for the component: showcase, examples, and related.
 * @property {'full' | 'compact' | 'brief'} [detail]
 * @property {string} [lang]
 * @property {boolean} [zh]
 * @property {boolean} [dense]
 */

export {};
