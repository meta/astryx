// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for the `build` command — source of truth for the
 * `build.help` (playbook) and `build.kit` (composition kit) JSON responses.
 */

/**
 * A command the playbook tells the caller to run.
 *
 * @typedef {object} BuildPlaybookCommand
 * @property {string} command Bare subcommand with `<placeholder>` arguments (e.g. `template <name> <path>`) and no package-manager prefix — render it with your own CLI invocation.
 * @property {string} [purpose] What running it is for.
 */

/**
 * One step of the page-building workflow.
 *
 * @typedef {object} BuildPlaybookStep
 * @property {string} title What to do.
 * @property {BuildPlaybookCommand[]} commands The commands for this step, in the order to run them.
 * @property {string} [returns] What the step's command gives back, when that decides the next step.
 */

/**
 * astryx --json build (no query) — the "how to build a page" playbook.
 *
 * @typedef {object} BuildHelpResponse
 * @property {'build.help'} type
 * @property {object} data
 * @property {true} data.playbook Always true; marks this envelope as the playbook rather than a result set.
 * @property {string} data.title The playbook's heading.
 * @property {BuildPlaybookStep[]} data.steps The workflow, in order.
 * @property {string[]} data.rules The rules that keep a page on-system.
 * @property {BuildPlaybookCommand[]} data.related Lookups to reach for alongside the workflow.
 */

/**
 * The page template a kit recommends starting from.
 *
 * @typedef {object} BuildStart
 * @property {string} name Template id, as `astryx template <name>` takes it.
 * @property {string} displayName Human-facing template name.
 * @property {string} description What the page is: its layout and the ideas it serves.
 * @property {string} package The npm package that owns this template.
 * @property {string} command The scaffold command that selects exactly this template, `astryx template <id> --type page <path>`: `<id>` is the Core id an integration replacement stands in for, else the template's own id, `<path>` is a placeholder for the file or folder to write the template to, and the `astryx` prefix is for the caller to replace with its own invocation.
 * @property {'direct' | 'closest' | 'fallback'} basis Why this template. The page ranker picks every start: it weighs each matched word by how rare it is among page templates, favors the family the idea's head names and the container it names ("in a modal"), and discounts words that only modify another. `direct` when its pick is also search's direct match (`directMatch`); `closest` when it is not; `fallback` when no template has the evidence to lead and the page starts from the app shell.
 * @property {string} reason One sentence saying the same as `basis`, for a reader.
 * @property {BuildAlternative[]} alternatives The ranker's next closest page templates (≤2), for when the start's layout is wrong.
 * @property {string[]} [notes] Setup notes: what the template needs that the project lacks (missing packages, missing StyleX compiler). Present only when the start template imports packages the project does not have or needs a StyleX compiler the project has not configured.
 */

/**
 * A page template to consider instead of the start.
 *
 * @typedef {object} BuildAlternative
 * @property {string} name Template id, as `astryx template <name>` takes it.
 * @property {string} displayName Human-facing template name.
 * @property {string} description What the page is: its layout and the ideas it serves.
 * @property {string} package The npm package that owns this template.
 * @property {string} command The scaffold command, in the same form as the start's.
 */

/**
 * astryx --json build "<idea>" — the page template to start from, and the kit around it.
 *
 * Entries are raw `SearchResultEntry` objects (no package-manager-prefixed
 * command strings — the CLI adds those); `frame`/`foundation` are static
 * component-name arrays surfaced on every kit.
 *
 * @typedef {object} BuildKitResponse
 * @property {'build.kit'} type
 * @property {object} data
 * @property {string} data.query
 * @property {boolean} data.hasResults False when search returned nothing. The kit still names a template in `start`.
 * @property {number} data.matchCount Total ranked search matches for the query — counted before the search `limit`, the kit's score floors, and its per-group caps, so it is never a cap read back.
 * @property {boolean} data.directMatch True when the top page template is a confident direct match.
 * @property {BuildStart | null} data.start The page template to start from: the ranker's pick, else the app shell. Null only when the kit is narrowed to components or hooks (`type`), or when the project has no page template to offer.
 * @property {import('../search/search.type.mjs').SearchResultEntry[]} data.pages Closest page templates by search (≤3). Each entry's `command` carries `--skeleton` when `directMatch` is false, so it previews the layout; `start.command` is the scaffold.
 * @property {import('../search/search.type.mjs').SearchResultEntry[]} data.blocks Drop-in block patterns covering parts of the idea (≤5), best first. A block search returned keeps search's score and reason; any other block carries the block picker's relative score (100 for its best candidate, never below 1) and reason, so the two kinds of score are not comparable.
 * @property {import('../search/search.type.mjs').SearchResultEntry[]} data.domain Idea-specific components/hooks (≤6), excluding frame/foundation.
 * @property {string[]} data.frame Always-on page-shell component names. Every page template already uses them.
 * @property {string[]} data.foundation Always-on layout/typography/action component names. Every page template already uses them.
 * @property {{reason: string, commands: string[]}} [data.hint] Present only when the kit is thin. `reason` says why, `commands` are bare subcommands (e.g. `component --list`) for the caller to render with its own invocation — so a reader is never handed a command that does not resolve in their project.
 */

/**
 * Options for `build()`.
 * @typedef {object} BuildOptions
 * @property {string} [cwd]
 * @property {import('../search/search.type.mjs').SearchDomain} [type]
 * @property {number} [limit]
 */

export {};
