// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for the `upgrade` command — source of truth for the
 * upgrade command JSON responses. Re-exported by `types/upgrade.d.ts`.
 *
 * Invocation                                   -> type discriminator
 * ------------------------------------------------------------------
 * astryx --json upgrade --list                 -> upgrade.list
 * astryx --json upgrade [--apply]              -> upgrade.run
 * astryx --json upgrade --registry [--apply]   -> upgrade.registry
 * astryx --json upgrade (status short-circuit) -> upgrade.status
 * (version detection failure)                  -> CLIError
 */

/**
 * astryx --json upgrade --list
 * @typedef {object} UpgradeListResponse
 * @property {'upgrade.list'} type
 * @property {UpgradeListEntry[]} data
 */

/**
 * @typedef {object} UpgradeListEntry
 * @property {string} name
 * @property {string} package The npm package that ships the codemod.
 * @property {string} title
 * @property {string} version
 * @property {boolean} optional True when the codemod runs only if named with `--codemod`.
 */

/**
 * State of the managed agent-docs block (`<!-- ASTRYX:START --> … END -->`)
 * relative to the fully rendered block for installed Core and configured
 * integration manifests. Present on every upgrade response. Dry-run only
 * reports; apply writes after selected codemods and hooks succeed.
 *
 * - `refreshed`     — a stale block was rewritten (`--apply` only).
 * - `would-refresh` — a stale block was detected in dry-run; nothing written.
 * - `nudge-init`    — no managed block exists; user should run `init`.
 * - `error`         — the expected block could not be rendered or written.
 * - `none`          — nothing to do (block already matches expected content).
 *
 * @typedef {object} AgentDocsSummary
 * @property {'missing' | 'stale' | 'current'} status
 * @property {string} installedVersion Installed core version the block should reflect.
 * @property {string[]} fromVersions Distinct stale block versions found (the "from" side of the refresh).
 * @property {string[]} files Files rewritten (apply) or that would be rewritten (dry-run), relative to the folder the command ran in.
 * @property {boolean} refreshed True only when a block was actually rewritten (apply mode).
 * @property {'refreshed' | 'would-refresh' | 'nudge-init' | 'error' | 'none'} action
 */

/**
 * One copied file tracked by a ShadCN composition receipt.
 * @typedef {object} RegistryCompositionFileSummary
 * @property {string} path
 * @property {'current'|'user-modified'|'would-update'|'updated'|'would-merge'|'merged'|'would-refresh-receipt'|'receipt-refreshed'|'conflict'|'missing'|'invalid'|'target-changed'} action
 * @property {string} [message]
 * @property {string} [conflictFile]
 */

/**
 * One ShadCN registry item checked during upgrade.
 * @typedef {object} RegistryCompositionItemSummary
 * @property {string} item
 * @property {string} [path]
 * @property {'current'|'user-modified'|'would-update'|'updated'|'would-merge'|'merged'|'would-refresh-receipt'|'receipt-refreshed'|'conflict'|'invalid'|'fetch-error'|'write-error'} action
 * @property {string} [message]
 * @property {RegistryCompositionFileSummary[]} files
 */

/**
 * Aggregate receipt for ShadCN-copied composition reconciliation. File paths
 * are relative to the scanned source directory, or, when the upgrade ran in a
 * folder below the project root, to that folder.
 * @typedef {object} RegistryCompositionSummary
 * @property {boolean} applied
 * @property {boolean} ok False when conflicts, missing files, invalid receipts, or failures remain.
 * @property {number} found
 * @property {number} current Item count with no upstream source change.
 * @property {number} wouldUpdate Item count with pristine updates in dry-run.
 * @property {number} updated Item count with pristine updates applied.
 * @property {number} wouldMerge Item count with clean merges in dry-run.
 * @property {number} merged Item count with clean merges applied.
 * @property {number} wouldRefreshReceipt Item count with metadata-only refreshes in dry-run.
 * @property {number} receiptsRefreshed Item count with metadata-only refreshes applied.
 * @property {number} conflicts Item count with at least one unresolved source conflict.
 * @property {number} missing Per-file count of deleted or moved source files.
 * @property {number} invalid Count of invalid receipts, unreadable sources, or changed targets.
 * @property {number} failed Item count with fetch or write failures.
 * @property {RegistryCompositionItemSummary[]} items
 */

/**
 * astryx --json upgrade --registry [--apply]
 * @typedef {object} UpgradeRegistryResponse
 * @property {'upgrade.registry'} type
 * @property {RegistryCompositionSummary} data
 */

/**
 * A required codemod change blocked by effective working-tree protection.
 * @typedef {object} ProtectedCodemodFile
 * @property {string} file Path relative to the folder the command ran in.
 * @property {string[]} codemods Codemods that still require a change.
 * @property {string[]} reasons Protection categories (generated, vendored, ignored, and hard boundaries).
 * @property {string[]} declarations Effective declarations that protect the file.
 * @property {string[]} commands Exact regeneration commands found in generated headers, when present.
 */

/**
 * A generated file that must be rebuilt before the upgrade is complete: a
 * protected generated file a codemod still needs to change (also listed in
 * `protectedFiles`), or a generated output a codemod reported out of date.
 * @typedef {object} RegenerateFile
 * @property {string} file Path relative to the folder the command ran in.
 * @property {string[]} codemods Codemods that need the rebuild.
 * @property {string[]} commands Exact commands that rebuild the file, when known: the generated header's `Command:` line, or the command the codemod names (such as `astryx theme build`).
 * @property {string[]} messages Why a codemod reported the file out of date; empty for a protected generated file that no codemod reported out of date, whose `protectedFiles` entry carries its declarations.
 */

/**
 * Present only when the installed `@astryxdesign/core` (the response's `to`) is
 * newer than the running CLI. Core codemods ship inside the CLI, so this CLI
 * has none for the releases after `cliVersion`: the run could not migrate them,
 * whatever else the response reports.
 * @typedef {object} CliBehindCore
 * @property {string} cliVersion The running CLI's version, the last release it has codemods for.
 * @property {string} command The same upgrade, run with the CLI release that matches the installed Core. It first changes to the folder this run used, then names the directory this run scanned as an absolute `--path`, both with symbolic links resolved, so pasted from any folder it finds the same Core and scans the same directory. It is written for a POSIX shell (sh, bash, zsh), or for PowerShell on Windows, with each argument quoted for that shell; cmd.exe is not a target.
 */

/**
 * astryx --json upgrade [--apply]
 * @typedef {object} UpgradeRunResponse
 * @property {'upgrade.run'} type
 * @property {object} data
 * @property {string} data.from
 * @property {string} data.to
 * @property {number} data.codemods
 * @property {string[]} data.integrations Integration packages processed in this upgrade (by name/spec).
 * @property {boolean} data.agentDocsRefreshed
 * @property {AgentDocsSummary} data.agentDocs
 * @property {boolean} data.sourcePathFound Whether the resolved source directory (`path`, default `./src`) exists. False means no source file was read, so a zero `filesChanged` says nothing about the project being migrated.
 * @property {RegistryCompositionSummary} [data.registryCompositions]
 * @property {boolean} [data.complete] False when protected required changes remain, including a protected file in `regenerate`. Declined candidates alone never make it false. Also false on the receipt a failed run's error carries (`UpgradeFailureReceipt`).
 * @property {RegenerateFile[]} [data.regenerate] Generated files to rebuild, with their commands; rebuild them, then run the same upgrade again. A listed file the project protects (for example with an `@generated` header) is also in `protectedFiles`, with the declaration that protects it and the same commands, and makes the run incomplete with `ERR_CODEMOD_PROTECTED`. A listed file nothing protects is a codemod error: it is also in `errors`, and the run fails with `ERR_CODEMOD_FAILED` (`UpgradeFailureReceipt`).
 * @property {string} [data.errorCode] Stable incomplete-result code when complete is false: `ERR_CODEMOD_PROTECTED` on a returned receipt; on the receipt a failed run's error carries, the error's own code.
 * @property {number} [data.filesChanged] Distinct files changed across core + integration codemods (apply mode). One file that four codemods each changed counts once.
 * @property {string[]} [data.modifiedFiles] Files changed or previewed, relative to the folder the command ran in.
 * @property {ProtectedCodemodFile[]} [data.protectedFiles] Protected files that still require a codemod change after regeneration.
 * @property {Array<{file: string, location?: string, reason: string}>} [data.declinedCandidates] Candidates left unchanged because proof was insufficient, one row per file, for manual review. A protected file whose own source does not parse is listed here, with the parse error's `line:column` as `location` and a `reason` that starts with `unparseable protected file`, instead of failing the run. Code a codemod identified but cannot migrate safely is listed here too, with its line as `location` when known and a `reason` that starts with `manual migration needed (<codemod>):` followed by what to change. A file with several declined findings, of either kind, keeps one row: each finding keeps its own prefix, they are joined by `; `, unparseable-file findings first, then manual migrations, each in the order found, and `location` is the first finding's own location (absent when it has none). A later finding whose location differs from the row's ends with ` (at <location>)`, or ` (location unknown)` when it has none; one without a suffix is at the row's location. Declined candidates do not make the run incomplete. Each `file` is relative to the folder the command ran in.
 * @property {number} [data.transformsApplied] Total codemod changes. A code or config codemod counts once for each file it changed, so one file changed by four of them counts four times; a project codemod counts once, however many files it writes.
 * @property {Array<{file: string, codemod: string, error: string}>} [data.errors] Per-codemod errors, when any codemod failed. On the receipt a failed run's error carries, also a post-codemod hook failure (`codemod: 'post-codemod-hook'`) or the error that stopped the run after codemods wrote files. A returned `ERR_CODEMOD_PROTECTED` result lists them too when a protected file wins over them: a post-codemod hook failure, or an `astryx.config` that fails validation (`{file: '.', codemod: 'config', error}`). Each `file` is relative to the folder the command ran in.
 * @property {CliBehindCore} [data.cliBehindCore] Present only when the installed Core is newer than this CLI: codemods for the releases after `cliBehindCore.cliVersion` did not run.
 */

/**
 * What a failed upgrade had already done. When a run fails after its codemods
 * ran (a codemod or post-codemod hook failed, or an error stopped it after
 * codemods wrote files), the failure keeps its usual shape: the --json error
 * envelope `{apiVersion, error, code}` and a rejected `upgrade()` with that
 * `code`. The envelope adds `receipt`, and the thrown AstryxError a `receipt`
 * property: the same `upgrade.run` data a completed run returns, with
 * `complete: false` and `errorCode` equal to the error's `code`. Files in
 * `modifiedFiles` stay changed.
 *
 * @typedef {UpgradeRunResponse['data']} UpgradeFailureReceipt
 */

/**
 * astryx --json upgrade — short-circuit status results.
 *
 * - `up_to_date`: `--from` is >= installed target and `--force` was not passed.
 * - `no_codemods`: no codemods (core or integration) apply to the range.
 * - `config_fixable`: DRY-RUN ONLY. The consumer's astryx.config currently
 *   fails strict validation, but a pending core CONFIG codemod (in the selected
 *   range) would repair it. The dry run previews the fix without writing and
 *   reports the exact command to apply it; integrations are skipped for the
 *   preview (they will be processed on the `--apply` run).
 *
 * `no_codemods` and `config_fixable` carry `cliBehindCore` when the installed
 * Core is newer than this CLI; `no_codemods` then means only that this CLI has
 * no codemods for the range.
 *
 * @typedef {object} UpgradeStatusResponse
 * @property {'upgrade.status'} type
 * @property {{status: 'up_to_date', from: string, to: string, agentDocs: AgentDocsSummary, registryCompositions?: RegistryCompositionSummary} | {status: 'no_codemods', from: string, to: string, agentDocs: AgentDocsSummary, registryCompositions?: RegistryCompositionSummary, cliBehindCore?: CliBehindCore} | {status: 'config_fixable', from: string, to: string, configError: string, configCodemods: string[], suggestedCommand: string, message: string, note: string, agentDocs: AgentDocsSummary, cliBehindCore?: CliBehindCore}} data
 */

/**
 * Options for `upgrade()`.
 * @typedef {object} UpgradeOptions
 * @property {string} [from] Version before the dependency bump (required unless `list` or `registry`).
 * @property {boolean} [apply] Write changes to disk (default: dry-run).
 * @property {boolean} [force] Run codemods even if `from` >= installed.
 * @property {string} [codemod] Run a single named transform.
 * @property {string[]} [skipCodemod] Exclude named codemods (re-run past a failure).
 * @property {string[]} [integration] Explicit integration specifiers resolved beneath node_modules; absolute paths and `.` or `..` segments are rejected.
 * @property {string} [path] Source directory to scan (default `./src`).
 * @property {boolean} [installDeps] Auto-install jscodeshift without prompting.
 * @property {boolean} [registry] Reconcile only ShadCN-copied compositions; `from` is not required.
 * @property {boolean} [list] Return the available codemods instead of running.
 */

export {};
