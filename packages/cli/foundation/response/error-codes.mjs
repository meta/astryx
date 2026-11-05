// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Astryx CLI — stable machine-readable error codes.
 *
 * ## Why codes exist
 *
 * The JSON error envelope (see json.mjs) carries a human-readable `error`
 * string. That string is for people. It changes whenever we improve the
 * wording, add detail, or localize. AI agents and CI scripts that consume
 * `xds --json` must NOT branch on prose — string-matching "No component
 * named X" is brittle and silently breaks the moment we reword it.
 *
 * The `code` field is the stable contract. Every error — whether raised by a
 * command, the API layer (`AstryxError`), or Commander's own parse machinery —
 * carries one of the identifiers below. Codes are append-only: once shipped,
 * a code's meaning never changes and the code is never removed. The message
 * may change freely; the code never does.
 *
 * ## Naming
 *
 * `ERR_<SUBJECT>[_<QUALIFIER>]`, SCREAMING_SNAKE_CASE, always prefixed
 * `ERR_`. Group by subject (component, hook, docs, template, theme, …).
 *
 * ## Usage
 *
 *   import {ERROR_CODES} from './error-codes.mjs';
 *   cliError('No component named "Buton"', {code: ERROR_CODES.ERR_UNKNOWN_COMPONENT});
 *   throw new AstryxError('No component named "Buton"', suggestions, ERROR_CODES.ERR_UNKNOWN_COMPONENT);
 *
 * Consumers read `envelope.code` and compare against the published list in
 * packages/cli/README.md.
 */

/**
 * Stable error-code string union. Append-only.
 *
 * @typedef {(
 *   | 'ERR_UNKNOWN'
 *   | 'ERR_UNKNOWN_COMMAND'
 *   | 'ERR_UNKNOWN_SUBCOMMAND'
 *   | 'ERR_INVALID_OPTION'
 *   | 'ERR_INVALID_ARGUMENT'
 *   | 'ERR_MISSING_ARGUMENT'
 *   | 'ERR_INVALID_LANG'
 *   | 'ERR_INVALID_DETAIL'
 *   | 'ERR_NODE_VERSION'
 *   | 'ERR_CORE_NOT_FOUND'
 *   | 'ERR_CORE_INCOMPATIBLE'
 *   | 'ERR_UNKNOWN_COMPONENT'
 *   | 'ERR_UNKNOWN_HOOK'
 *   | 'ERR_UNKNOWN_TOPIC'
 *   | 'ERR_UNKNOWN_SECTION'
 *   | 'ERR_UNKNOWN_CATEGORY'
 *   | 'ERR_UNKNOWN_TEMPLATE'
 *   | 'ERR_AMBIGUOUS_TEMPLATE'
 *   | 'ERR_AMBIGUOUS_COMPONENT'
 *   | 'ERR_AMBIGUOUS_THEME'
 *   | 'ERR_UNKNOWN_THEME'
 *   | 'ERR_INTEGRATION_ROOT_CONFLICT'
 *   | 'ERR_INTEGRATION_EXPORT_CONFLICT'
 *   | 'ERR_UNKNOWN_PACKAGE'
 *   | 'ERR_UNKNOWN_AGENT'
 *   | 'ERR_UNKNOWN_FEATURE'
 *   | 'ERR_UNKNOWN_CODEMOD'
 *   | 'ERR_CODEMOD_FAILED'
 *   | 'ERR_CODEMOD_PROTECTED'
 *   | 'ERR_CODEMOD_PROTECTION_SOURCE'
 *   | 'ERR_NOT_FOUND'
 *   | 'ERR_NO_DOC'
 *   | 'ERR_NO_SHOWCASE'
 *   | 'ERR_NO_SOURCE'
 *   | 'ERR_INVALID_DOC'
 *   | 'ERR_FILE_NOT_FOUND'
 *   | 'ERR_FILE_EXISTS'
 *   | 'ERR_PATH_TRAVERSAL'
 *   | 'ERR_WRITE_FAILED'
 *   | 'ERR_THEME_INVALID'
 *   | 'ERR_THEME_LOAD'
 *   | 'ERR_PALETTE_GENERATION'
 *   | 'ERR_VERSION_DETECT'
 *   | 'ERR_INVALID_VERSION'
 *   | 'ERR_DEP_MISSING'
 *   | 'ERR_GH_CLI'
 *   | 'ERR_UNKNOWN_POST'
 *   | 'ERR_FETCH_FAILED'
 *   | 'ERR_LAYOUT_PARSE'
 *   | 'ERR_LAYOUT_INVALID'
 *   | 'ERR_UNCLASSIFIED_EXIT'
 *   | 'ERR_SIGNAL_TERMINATED'
 *   | 'ERR_VERSIONS_UNAVAILABLE'
 *   | 'ERR_PROJECT_REQUIRED'
 *   | 'ERR_RENDER_COMPILE'
 *   | 'ERR_RENDER_NO_DEFAULT_EXPORT'
 *   | 'ERR_RENDER_MISSING_DEPENDENCY'
 *   | 'ERR_RENDER_BROWSER_API'
 *   | 'ERR_RENDER_ASSET_TOO_LARGE'
 *   | 'ERR_RENDER_TIMEOUT'
 *   | 'ERR_RENDER_FAILED'
 *   | 'ERR_RENDER_NOT_ASTRYX'
 *   | 'ERR_RENDER_SOURCE_DAMAGED'
 * )} ErrorCode
 */

/**
 * The complete, frozen set of Astryx CLI error codes. Append-only.
 * @type {Readonly<Record<ErrorCode, ErrorCode>>}
 */
export const ERROR_CODES = Object.freeze({
  // ── Generic ──────────────────────────────────────────────────────
  /** Fallback for any error without a more specific code. */
  ERR_UNKNOWN: 'ERR_UNKNOWN',

  // ── CLI parsing / dispatch (Commander + bare invocation) ─────────
  /** A top-level command name was not recognized (e.g. `astryx bogus`). */
  ERR_UNKNOWN_COMMAND: 'ERR_UNKNOWN_COMMAND',
  /** A subcommand under a command group was not recognized (e.g. `astryx theme bogus`). */
  ERR_UNKNOWN_SUBCOMMAND: 'ERR_UNKNOWN_SUBCOMMAND',
  /** An unknown flag/option was passed (Commander `unknownOption`). */
  ERR_INVALID_OPTION: 'ERR_INVALID_OPTION',
  /** An option/argument had a value Commander's parser rejected. */
  ERR_INVALID_ARGUMENT: 'ERR_INVALID_ARGUMENT',
  /** A required positional argument was omitted (Commander `missingArgument`). */
  ERR_MISSING_ARGUMENT: 'ERR_MISSING_ARGUMENT',
  /** `--lang` was given a value outside its choices (en, zh, dense). */
  ERR_INVALID_LANG: 'ERR_INVALID_LANG',
  /** `--detail` was given a value outside its choices (full, compact, brief). */
  ERR_INVALID_DETAIL: 'ERR_INVALID_DETAIL',

  // ── Environment / runtime ────────────────────────────────────────
  /** The running Node.js version is below the supported minimum. */
  ERR_NODE_VERSION: 'ERR_NODE_VERSION',
  /** `@astryxdesign/core` could not be located (not installed / not in a monorepo). */
  ERR_CORE_NOT_FOUND: 'ERR_CORE_NOT_FOUND',
  /**
   * The installed `@astryxdesign/core` was found and loaded, but it is too old
   * for what this input needs: it does not expose a capability the CLI would
   * have to call to produce correct output. Upgrading core is the fix.
   */
  ERR_CORE_INCOMPATIBLE: 'ERR_CORE_INCOMPATIBLE',

  // ── "Unknown <subject>" lookups ──────────────────────────────────
  /** No component matched the requested name. */
  ERR_UNKNOWN_COMPONENT: 'ERR_UNKNOWN_COMPONENT',
  /** No hook matched the requested name. */
  ERR_UNKNOWN_HOOK: 'ERR_UNKNOWN_HOOK',
  /** No docs topic matched the requested name. */
  ERR_UNKNOWN_TOPIC: 'ERR_UNKNOWN_TOPIC',
  /** A docs topic exists but the requested section within it does not. */
  ERR_UNKNOWN_SECTION: 'ERR_UNKNOWN_SECTION',
  /** A `--category` filter value did not match any known category. */
  ERR_UNKNOWN_CATEGORY: 'ERR_UNKNOWN_CATEGORY',
  /** No template matched the requested name. */
  ERR_UNKNOWN_TEMPLATE: 'ERR_UNKNOWN_TEMPLATE',
  /** A template id matched more than one template (narrow with --type/--package). */
  ERR_AMBIGUOUS_TEMPLATE: 'ERR_AMBIGUOUS_TEMPLATE',
  /** A component name is owned by more than one package (narrow with --package). */
  ERR_AMBIGUOUS_COMPONENT: 'ERR_AMBIGUOUS_COMPONENT',
  /** A theme slug is owned by more than one package (narrow with --package). */
  ERR_AMBIGUOUS_THEME: 'ERR_AMBIGUOUS_THEME',
  /** No theme matched the requested slug (theme add). */
  ERR_UNKNOWN_THEME: 'ERR_UNKNOWN_THEME',
  /** An integration root already points somewhere other than the requested path. */
  ERR_INTEGRATION_ROOT_CONFLICT: 'ERR_INTEGRATION_ROOT_CONFLICT',
  /** A package export already maps a generated contribution subpath elsewhere. */
  ERR_INTEGRATION_EXPORT_CONFLICT: 'ERR_INTEGRATION_EXPORT_CONFLICT',
  /** No package matched the requested name (discover). */
  ERR_UNKNOWN_PACKAGE: 'ERR_UNKNOWN_PACKAGE',
  /** An unrecognized `--agent` value was passed to agent-docs/init. */
  ERR_UNKNOWN_AGENT: 'ERR_UNKNOWN_AGENT',
  /** An unrecognized `--features` value was passed to init. */
  ERR_UNKNOWN_FEATURE: 'ERR_UNKNOWN_FEATURE',
  /** A `--codemod` value did not match any registered codemod (upgrade). */
  ERR_UNKNOWN_CODEMOD: 'ERR_UNKNOWN_CODEMOD',
  /** One or more codemods, or a post-codemod hook, failed during an upgrade run. */
  ERR_CODEMOD_FAILED: 'ERR_CODEMOD_FAILED',
  /** A required codemod change remains blocked by a protected consumer file. */
  ERR_CODEMOD_PROTECTED: 'ERR_CODEMOD_PROTECTED',
  /** A working-tree protection declaration could not be read or parsed. */
  ERR_CODEMOD_PROTECTION_SOURCE: 'ERR_CODEMOD_PROTECTION_SOURCE',
  /** A generic discover/lookup query matched nothing in any package. */
  ERR_NOT_FOUND: 'ERR_NOT_FOUND',

  // ── Resource shape problems (subject exists, artifact missing) ───
  /** A component exists but has no typed `.doc.mjs` file. */
  ERR_NO_DOC: 'ERR_NO_DOC',
  /** No showcase exists for the requested component. */
  ERR_NO_SHOWCASE: 'ERR_NO_SHOWCASE',
  /** No source file could be located for the requested component/template. */
  ERR_NO_SOURCE: 'ERR_NO_SOURCE',
  /** A component's docs failed validation (malformed `.doc.mjs`). */
  ERR_INVALID_DOC: 'ERR_INVALID_DOC',

  // ── Filesystem ───────────────────────────────────────────────────
  /** A required input file did not exist. */
  ERR_FILE_NOT_FOUND: 'ERR_FILE_NOT_FOUND',
  /** Refused to overwrite an existing file. */
  ERR_FILE_EXISTS: 'ERR_FILE_EXISTS',
  /** A path escaped its allowed root, or a name contained traversal markers. */
  ERR_PATH_TRAVERSAL: 'ERR_PATH_TRAVERSAL',
  /** Writing output files failed (and was rolled back). */
  ERR_WRITE_FAILED: 'ERR_WRITE_FAILED',

  // ── Theme build ──────────────────────────────────────────────────
  /** A theme definition or contributed theme descriptor is invalid. */
  ERR_THEME_INVALID: 'ERR_THEME_INVALID',
  /** A theme file could not be loaded / parsed into a defineTheme result. */
  ERR_THEME_LOAD: 'ERR_THEME_LOAD',

  // ── Palette generation ──────────────────────────────────────────
  /** A palette generation request or its constraints were invalid. */
  ERR_PALETTE_GENERATION: 'ERR_PALETTE_GENERATION',

  // ── Upgrade ──────────────────────────────────────────────────────
  /** The current `@astryxdesign/core` version could not be detected. */
  ERR_VERSION_DETECT: 'ERR_VERSION_DETECT',
  /** A `--from`/`--to` value was not a valid semver string. */
  ERR_INVALID_VERSION: 'ERR_INVALID_VERSION',
  /** A required external dependency (e.g. jscodeshift) is missing. */
  ERR_DEP_MISSING: 'ERR_DEP_MISSING',

  // ── GitHub CLI ───────────────────────────────────────────────────
  /** GitHub CLI (`gh`) is not installed or not authenticated. */
  ERR_GH_CLI: 'ERR_GH_CLI',

  // ── Blog (read via the published RSS feed) ───────────────────────
  /** No blog post matched the requested slug in the feed. */
  ERR_UNKNOWN_POST: 'ERR_UNKNOWN_POST',
  /** A network fetch (RSS feed or post text) failed. */
  ERR_FETCH_FAILED: 'ERR_FETCH_FAILED',

  // ── Layout expressions (XLE/XLO) ─────────────────────────────────
  /** A layout expression failed to parse (syntax error, with line/col). */
  ERR_LAYOUT_PARSE: 'ERR_LAYOUT_PARSE',
  /** A layout expression parsed but failed validation (unknown component/prop/enum/block). */
  ERR_LAYOUT_INVALID: 'ERR_LAYOUT_INVALID',

  // ── Debug log ────────────────────────────────────────────────────
  /**
   * Recorded (never printed): a command exited non-zero without going through
   * cliError/jsonError, so no stable code was available. Marks a bypass of the
   * error funnel rather than a user-facing condition.
   */
  ERR_UNCLASSIFIED_EXIT: 'ERR_UNCLASSIFIED_EXIT',
  /**
   * Recorded (never printed): the process was ended by a signal, so the
   * command never reached a terminal path of its own.
   */
  ERR_SIGNAL_TERMINATED: 'ERR_SIGNAL_TERMINATED',

  // ── Global mode (which release answers) ──────────────────────────
  /**
   * The CLI release a run needs could not run: the release that matches the
   * project's Core is not installed and could not be fetched (offline, or the
   * registry lacks it), the project's own CLI could not be started, or a copy
   * that carries no Core could not install its release's Core outside a
   * project. Nothing was written.
   */
  ERR_VERSIONS_UNAVAILABLE: 'ERR_VERSIONS_UNAVAILABLE',
  /**
   * The command needs a project (an app with Astryx installed, or an
   * integration package) and was run outside one. Nothing was written.
   */
  ERR_PROJECT_REQUIRED: 'ERR_PROJECT_REQUIRED',

  // ── Render (experimental) ────────────────────────────────────────
  /**
   * The page given to `astryx experimental render` does not compile (a syntax
   * or type-syntax error). Nothing was written.
   */
  ERR_RENDER_COMPILE: 'ERR_RENDER_COMPILE',
  /**
   * The page module has no default export to render. Nothing was written.
   */
  ERR_RENDER_NO_DEFAULT_EXPORT: 'ERR_RENDER_NO_DEFAULT_EXPORT',
  /**
   * The page imports a package that is not installed where the page is.
   * Nothing was written.
   */
  ERR_RENDER_MISSING_DEPENDENCY: 'ERR_RENDER_MISSING_DEPENDENCY',
  /**
   * The page reads a browser-only API (window, document, …) while rendering,
   * and a rendered page has no browser yet. Nothing was written.
   */
  ERR_RENDER_BROWSER_API: 'ERR_RENDER_BROWSER_API',
  /**
   * A local file the page uses is too large to inline into one HTML file.
   * Nothing was written.
   */
  ERR_RENDER_ASSET_TOO_LARGE: 'ERR_RENDER_ASSET_TOO_LARGE',
  /**
   * The page did not finish rendering in time and was stopped. Nothing was
   * written.
   */
  ERR_RENDER_TIMEOUT: 'ERR_RENDER_TIMEOUT',
  /**
   * The page threw while rendering for any other reason. Nothing was written.
   */
  ERR_RENDER_FAILED: 'ERR_RENDER_FAILED',
  /**
   * `render --reverse` was given an HTML file that holds no Astryx markup and
   * no embedded source, so there is nothing to rebuild. Nothing was written.
   */
  ERR_RENDER_NOT_ASTRYX: 'ERR_RENDER_NOT_ASTRYX',
  /**
   * `render --reverse` refused the received file: its embedded source is
   * damaged (not valid, or a file does not match its checksum), lists a path
   * twice, carries a module, stylesheet or JSON file the page does not
   * import or an image, font or media file whose bytes are not one, or
   * carries a file a
   * render never embeds (a dotfile, node_modules, a manifest, lockfile or
   * tool configuration, a file a test, story or benchmark runner would run,
   * or any kind but a page module, stylesheet, JSON file or image). Nothing
   * was written.
   */
  ERR_RENDER_SOURCE_DAMAGED: 'ERR_RENDER_SOURCE_DAMAGED',
});

/**
 * Type guard: is `value` one of the known error codes?
 * @param {unknown} value
 * @returns {value is ErrorCode}
 */
export function isErrorCode(value) {
  return typeof value === 'string' && Object.hasOwn(ERROR_CODES, value);
}

/**
 * All error code string values, sorted. Handy for tests and tooling.
 * @returns {string[]}
 */
export function allErrorCodes() {
  return Object.values(ERROR_CODES).sort();
}
