// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for the `init` command — source of truth for the init
 * API response receipts and options. Re-exported by types/init.d.ts; the public
 * `./api` type surface regenerates from this JSDoc.
 */

/**
 * @typedef {object} InitRunData
 * @property {'default' | 'features'} mode `default` (no flags) or `features` (--features/--all).
 * @property {string[]} features Features that were run, in order.
 * @property {string[]} docsWritten Agent-doc files written, relative to the directory init ran in (empty if agents weren't run or install failed). Without --agent-docs-path they sit at the project root: the nearest folder at or above it whose package.json declares an Astryx package, else the nearest with any package.json, within its repository and never the home folder; with none, the directory init ran in.
 * @property {{kind: 'path-safety' | 'install-failed', message?: string} | null} docsError Soft agent-docs failure, if any. `path-safety` also implies a non-zero exit. `install-failed` carries a message when init wrote no agent docs (the home folder, or a settings folder in it outside a project) or skipped a file that resolves outside the project; docsWritten then lists what was written.
 * @property {boolean} theme Whether the theme feature ran.
 * @property {'created' | 'skipped' | 'failed' | null} themeTemplate Outcome of writing the annotated theme template (`skipped` = a file was already there).
 * @property {string | null} themeTemplatePath Relative output path when `themeTemplate === 'created'`.
 * @property {'workflow' | 'created' | 'skipped' | null} template Template outcome (`workflow` is the CLI default; `created`/`skipped` are programmatic).
 * @property {string | null} templatePath Relative output path when `template === 'created'`.
 * @property {boolean} nextSteps Whether the getting-started "Next steps" were emitted (default mode inside a project; false outside one).
 */

/**
 * @typedef {object} InitRunResponse
 * @property {'init.run'} type
 * @property {InitRunData} data
 */

/**
 * @typedef {object} InitRemoveResponse
 * @property {'init.remove'} type
 * @property {{removed: boolean}} data False when no managed agent-docs block was found, so nothing was removed.
 */

/**
 * What `init --user` did with one file of the computer-level agent text.
 * `written`: created or refreshed. `unchanged`: already this release's text.
 * `removed`: deleted (with `--remove-agents`). `absent`: nothing to remove.
 * `kept`: a file left as it is, because a person edited it or Astryx did not
 * write it (see `reason`).
 * @typedef {'written' | 'linked' | 'unchanged' | 'removed' | 'absent' | 'kept'} InitUserAction
 */

/**
 * @typedef {object} InitUserFile
 * @property {string} path Absolute path in the home folder: the skill file,
 *   or a link to its folder.
 * @property {InitUserAction} action
 * @property {'edited' | 'not-astryx'} [reason] Only on `kept`: `edited`, the
 *   text no longer matches the hash Astryx recorded in it; `not-astryx`, it
 *   has no Astryx markers or is a symlink, or a link target holds something
 *   Astryx did not create.
 */

/**
 * @typedef {object} InitUserData
 * @property {InitUserFile[]} files One row per path acted on: `~/.agents/skills/astryx/SKILL.md` first, then each link to its folder: `~/.claude/skills/astryx` always, and another agent's skills folder when that agent's folder exists (`linked`, or `unchanged` when the link is already there). Removal removes the file and the links Astryx made.
 * @property {string} command The command the text tells agents to run: `astryx`, or the host's command when a host started the run.
 * @property {string[]} warnings Non-fatal notes, such as no `astryx` on the computer that runs the Astryx CLI.
 */

/**
 * @typedef {object} InitUserResponse
 * @property {'init.user'} type
 * @property {InitUserData} data
 */

/**
 * Options for `init()`.
 * @typedef {object} InitOptions
 * @property {string} [features] Comma-separated features to install (agents, theme, template).
 * @property {boolean} [all] Install all features.
 * @property {boolean} [removeAgents] Remove the managed agent-docs block, at the project root and in the folder init runs in, instead of installing; with `user`, remove the computer-level agent text.
 * @property {boolean} [user] Write the computer-level agent text (`~/.agents/skills/astryx/SKILL.md`, linked into `~/.claude/skills` and the skill folders of other installed tools, with a copy for Continue) instead of setting up the folder.
 * @property {string} [agent] Agent preset: claude, cursor, codex, hermes, muse, all. Refused with `user`.
 * @property {string | string[]} [agentDocsPath] Explicit agent-docs file path(s).
 * @property {string} [templateName] Scaffold a named page template (programmatic only; the CLI never sets it).
 */

export {};
