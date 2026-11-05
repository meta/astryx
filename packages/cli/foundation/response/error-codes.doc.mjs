// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file EnumDoc for the CLI's stable error-code taxonomy. Colocated with the
 * source of truth it documents (`error-codes.mjs`); the member set must stay in
 * lockstep with ERROR_CODES — a drift test enforces that the two match exactly.
 * @position packages/cli/foundation/response — enum documentation
 */

/** @type {import('@astryxdesign/cli/authoring').EnumDoc} */
export const doc = {
  type: 'enum',
  name: 'error-codes',
  displayName: 'Error Codes',
  namespace: 'cli/api',
  description:
    'Stable, append-only machine-readable error codes on the --json error envelope (envelope.code). Codes never change or get removed; branch on these, not on prose.',
  members: [
    // Generic
    {
      value: 'ERR_UNKNOWN',
      description: 'Fallback for any error without a more specific code.',
    },

    // CLI parsing / dispatch (Commander + bare invocation)
    {
      value: 'ERR_UNKNOWN_COMMAND',
      description:
        'A top-level command name was not recognized (e.g. `astryx bogus`).',
    },
    {
      value: 'ERR_UNKNOWN_SUBCOMMAND',
      description:
        'A subcommand under a command group was not recognized (e.g. `astryx theme bogus`).',
    },
    {
      value: 'ERR_INVALID_OPTION',
      description:
        'An unknown option was passed, --json was given to a command without JSON output.',
    },
    {
      value: 'ERR_INVALID_ARGUMENT',
      description:
        'An argument or option value is invalid: wrong type, out of range, an unknown choice, an extra argument, or a conflicting combination.',
    },
    {
      value: 'ERR_MISSING_ARGUMENT',
      description: 'A required argument or option value was omitted.',
    },
    {
      value: 'ERR_INVALID_LANG',
      description:
        '`--lang` was given a value outside its choices (en, zh, dense).',
    },
    {
      value: 'ERR_INVALID_DETAIL',
      description:
        '`--detail` was given a value outside its choices (full, compact, brief).',
    },

    // Environment / runtime
    {
      value: 'ERR_NODE_VERSION',
      description:
        'The running Node.js version is below the supported minimum.',
    },
    {
      value: 'ERR_CORE_NOT_FOUND',
      description:
        '`@astryxdesign/core` could not be located (not installed / not in a monorepo).',
    },
    {
      value: 'ERR_CORE_INCOMPATIBLE',
      description:
        'The installed `@astryxdesign/core` loaded but is too old for this input — it lacks a capability the CLI must call to emit correct output (upgrade core).',
    },

    // "Unknown <subject>" lookups
    {
      value: 'ERR_UNKNOWN_COMPONENT',
      description: 'No component matched the requested name.',
    },
    {
      value: 'ERR_UNKNOWN_HOOK',
      description: 'No hook matched the requested name.',
    },
    {
      value: 'ERR_UNKNOWN_TOPIC',
      description: 'No docs topic matched the requested name.',
    },
    {
      value: 'ERR_UNKNOWN_SECTION',
      description:
        'A docs topic exists but the requested section within it does not.',
    },
    {
      value: 'ERR_UNKNOWN_CATEGORY',
      description:
        'A `--category` filter value did not match any known category.',
    },
    {
      value: 'ERR_UNKNOWN_TEMPLATE',
      description: 'No template matched the requested name.',
    },
    {
      value: 'ERR_AMBIGUOUS_TEMPLATE',
      description:
        'A template id matched more than one template (narrow with --type/--package).',
    },
    {
      value: 'ERR_AMBIGUOUS_COMPONENT',
      description:
        'A component name is owned by more than one package (narrow with --package).',
    },
    {
      value: 'ERR_AMBIGUOUS_THEME',
      description:
        'A theme slug is owned by more than one package (narrow with --package).',
    },
    {
      value: 'ERR_UNKNOWN_THEME',
      description: 'No theme matched the requested slug (theme add).',
    },
    {
      value: 'ERR_INTEGRATION_ROOT_CONFLICT',
      description:
        'An integration manifest already declares a different path for the requested contribution root.',
    },
    {
      value: 'ERR_INTEGRATION_EXPORT_CONFLICT',
      description:
        'A package export already maps a generated contribution subpath to a different target.',
    },
    {
      value: 'ERR_UNKNOWN_PACKAGE',
      description: 'No package matched the requested name.',
    },
    {
      value: 'ERR_UNKNOWN_AGENT',
      description: 'An unrecognized `--agent` value was passed to init.',
    },
    {
      value: 'ERR_UNKNOWN_FEATURE',
      description: 'An unrecognized `--features` value was passed to init.',
    },
    {
      value: 'ERR_UNKNOWN_CODEMOD',
      description:
        'A `--codemod` value did not match any registered codemod (upgrade).',
    },
    {
      value: 'ERR_CODEMOD_FAILED',
      description:
        'A codemod or post-codemod hook failed during an upgrade run; the error carries a `receipt` that lists the files the run already changed.',
    },
    {
      value: 'ERR_CODEMOD_PROTECTED',
      description:
        'A required codemod change remains blocked by a protected consumer file.',
    },
    {
      value: 'ERR_CODEMOD_PROTECTION_SOURCE',
      description:
        'A working-tree protection declaration could not be read or parsed.',
    },
    {
      value: 'ERR_NOT_FOUND',
      description:
        'A generic discover/lookup query matched nothing in any package.',
    },

    // Resource shape problems (subject exists, artifact missing)
    {
      value: 'ERR_NO_DOC',
      description: 'A component exists but has no typed `.doc.mjs` file.',
    },
    {
      value: 'ERR_NO_SHOWCASE',
      description: 'No showcase exists for the requested component.',
    },
    {
      value: 'ERR_NO_SOURCE',
      description:
        'No source file could be located for the requested component/template.',
    },
    {
      value: 'ERR_INVALID_DOC',
      description:
        "A component's docs failed validation (malformed `.doc.mjs`).",
    },

    // Filesystem
    {
      value: 'ERR_FILE_NOT_FOUND',
      description: 'A required input file did not exist.',
    },
    {
      value: 'ERR_FILE_EXISTS',
      description: 'Refused to overwrite an existing file.',
    },
    {
      value: 'ERR_PATH_TRAVERSAL',
      description:
        'A path escaped its allowed root, or a name contained traversal markers.',
    },
    {
      value: 'ERR_WRITE_FAILED',
      description: 'Writing output files failed (and was rolled back).',
    },

    // Theme build
    {
      value: 'ERR_THEME_INVALID',
      description:
        'A theme definition or contributed theme descriptor is invalid.',
    },
    {
      value: 'ERR_THEME_LOAD',
      description:
        'A theme file could not be loaded / parsed into a defineTheme result.',
    },
    {
      value: 'ERR_PALETTE_GENERATION',
      description:
        'A palette generation request or one of its constraints was invalid.',
    },

    // Upgrade
    {
      value: 'ERR_VERSION_DETECT',
      description:
        'The current `@astryxdesign/core` version could not be detected.',
    },
    {
      value: 'ERR_INVALID_VERSION',
      description: 'A `--from`/`--to` value was not a valid semver string.',
    },
    {
      value: 'ERR_DEP_MISSING',
      description:
        'A required external dependency (e.g. jscodeshift) is missing.',
    },

    // GitHub CLI
    {
      value: 'ERR_GH_CLI',
      description: 'GitHub CLI (`gh`) is not installed or not authenticated.',
    },

    // Blog (read via the published RSS feed)
    {
      value: 'ERR_UNKNOWN_POST',
      description: 'No blog post matched the requested slug in the feed.',
    },
    {
      value: 'ERR_FETCH_FAILED',
      description: 'A network fetch (RSS feed or post text) failed.',
    },

    // Layout expressions (XLE/XLO)
    {
      value: 'ERR_LAYOUT_PARSE',
      description:
        'A layout expression failed to parse (syntax error, with line/col).',
    },
    {
      value: 'ERR_LAYOUT_INVALID',
      description:
        'A layout expression parsed but failed validation (unknown component/prop/enum/block).',
    },
    {
      value: 'ERR_UNCLASSIFIED_EXIT',
      description:
        'Recorded in the debug log, never printed: a command exited non-zero without reporting an error code.',
    },
    {
      value: 'ERR_SIGNAL_TERMINATED',
      description:
        'Recorded in the debug log, never printed: the process was ended by a signal (Ctrl-C, SIGTERM) before the command reached a terminal path.',
    },

    // Global mode
    {
      value: 'ERR_VERSIONS_UNAVAILABLE',
      description:
        "Nothing could answer this run, and nothing was written: the project's own CLI could not start and nothing else could answer, or the Core a command needs outside a project could not be installed.",
    },
    {
      value: 'ERR_PROJECT_REQUIRED',
      description:
        'The command needs a project (an app with Astryx installed, or an integration package) and was run outside one. Nothing was written.',
    },

    // Render (experimental: may change or be removed in a patch release)
    {
      value: 'ERR_RENDER_COMPILE',
      stability: 'experimental',
      description:
        'The page given to render does not compile. A stylesheet the page imports that is not valid CSS is reported this way too, naming the file. Nothing was written. Raised only by the experimental render command.',
    },
    {
      value: 'ERR_RENDER_NO_DEFAULT_EXPORT',
      stability: 'experimental',
      description:
        'The page given to render has no default export to render. Nothing was written. Raised only by the experimental render command.',
    },
    {
      value: 'ERR_RENDER_MISSING_DEPENDENCY',
      stability: 'experimental',
      description:
        'The page imports a package that is not installed where the page is. Nothing was written. Raised only by the experimental render command.',
    },
    {
      value: 'ERR_RENDER_BROWSER_API',
      stability: 'experimental',
      description:
        'The page reads a browser-only API, such as window or document, while rendering. Nothing was written. Raised only by the experimental render command.',
    },
    {
      value: 'ERR_RENDER_ASSET_TOO_LARGE',
      stability: 'experimental',
      description:
        'A local file the page uses is too large to inline into one file. Nothing was written. Raised only by the experimental render command.',
    },
    {
      value: 'ERR_RENDER_TIMEOUT',
      stability: 'experimental',
      description:
        'The page did not finish rendering in time and was stopped. Nothing was written. Raised only by the experimental render command.',
    },
    {
      value: 'ERR_RENDER_FAILED',
      stability: 'experimental',
      description:
        'The page threw while rendering. Nothing was written. Raised only by the experimental render command.',
    },
    {
      value: 'ERR_RENDER_NOT_ASTRYX',
      stability: 'experimental',
      description:
        '`render --reverse` was given a file with no embedded source and no Astryx markup. Nothing was written. Raised only by the experimental render command.',
    },
    {
      value: 'ERR_RENDER_SOURCE_DAMAGED',
      stability: 'experimental',
      description:
        '`render --reverse` refused the received file, and nothing was written: its embedded source is damaged (not valid, or a file does not match its checksum), lists a path twice, carries a module, stylesheet or JSON file the page does not reach through its own imports, or an image, font or media file whose bytes are not one, or carries a file a render never embeds: a dotfile or dot-folder, anything under node_modules, a package manifest, lockfile or tool configuration, a file a test, story or benchmark runner would run, or any kind but a page module, stylesheet, JSON file or image. Raised only by the experimental render command.',
    },
  ],
};
