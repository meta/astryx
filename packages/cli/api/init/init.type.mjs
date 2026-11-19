// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for the `init` command — source of truth for the init
 * API response receipts and options. Re-exported by types/init.d.ts; the public
 * `./api` type surface regenerates from this JSDoc.
 */

/**
 * What init did to one agent-doc file. `created`: the file did not exist.
 * `updated`: its text changed. `unchanged`: it already held this text.
 * `removed`: its Astryx block was removed, because another file holds it, or
 * because `--to` moved the project's skill to another place.
 * @typedef {object} InitDocsChange
 * @property {string} path The file, relative to the project root (the folder init writes agent docs in), `--agent-docs-path` files included. Never absolute.
 * @property {'created' | 'updated' | 'unchanged' | 'removed'} change
 * @property {string | null} from The Astryx version the block named before; null on `created`, and when there was no block or no version line.
 * @property {string | null} to The Astryx version the block names now; null on `removed`, and when there is no block (such as an import of AGENTS.md).
 */

/**
 * @typedef {object} InitRunData
 * @property {'default' | 'features'} mode `default` (no flags) or `features` (--features/--all).
 * @property {string[]} features Features that were run, in order.
 * @property {string[]} docsWritten Agent-doc files written, relative to the directory init ran in (empty if agents weren't run or install failed). Without --agent-docs-path they sit at the project root: the nearest folder at or above it whose package.json declares an Astryx package, else the nearest with any package.json, within its repository and never the home folder; with none, the directory init ran in.
 * @property {'missing' | 'stale' | 'current' | null} agentDocsStatus The agent docs init writes, before this run: `missing` (no Astryx block), `stale` (a block from another release or with other text, or with `--agent-docs-path` a named file without the block), or `current` (every block already matches); null when agent docs were not installed or the write failed. In a project whose saved places hold no `agents-md`, it describes the project skill files instead: `missing` (none there), `current` (each already this release's), else `stale`.
 * @property {InitDocsChange[]} docsChanges What init did to each file in `docsWritten`, in the same order; each path is relative to the project root.
 * @property {{kind: 'path-safety' | 'install-failed', message?: string} | null} docsError Soft agent-docs failure, if any. `path-safety` also implies a non-zero exit. `install-failed` carries a message when init wrote no agent docs (the home folder, or a settings folder in it outside a project) or skipped a file that resolves outside the project; docsWritten then lists what was written.
 * @property {boolean} theme Whether the theme feature ran.
 * @property {'created' | 'skipped' | 'failed' | null} themeTemplate Outcome of writing the annotated theme template (`skipped` = a file was already there).
 * @property {string | null} themeTemplatePath Relative output path when `themeTemplate === 'created'`.
 * @property {'workflow' | 'created' | 'skipped' | null} template Template outcome (`workflow` is the CLI default; `created`/`skipped` are programmatic).
 * @property {string | null} templatePath Relative output path when `template === 'created'`.
 * @property {boolean} nextSteps Whether the getting-started "Next steps" were emitted (default mode inside a project; false outside one, and false when `agentDocsStatus` is `current`, where init prints the build and search commands instead).
 * @property {string[]} to The places init wrote the Astryx skill to, as they are saved: `agents-md` (the agent docs above), `skills`, `user`, or a folder. Without `--to`, the project's saved places, else `agents-md`. Empty when agent docs were not installed.
 * @property {boolean} once Whether `--once` made this a copy that is saved nowhere: no later `init`, `upgrade`, or background refresh writes it again.
 * @property {InitSkillFile[]} skills One row per skill file of the `skills` and folder places: written, or, when `--to` moved the project off a place, removed. Empty for `agents-md` alone.
 * @property {InitUserData | null} user What the `user` place did, as `init --user` reports it; null when `to` has no `user`.
 */

/**
 * @typedef {object} InitRunResponse
 * @property {'init.run'} type
 * @property {InitRunData} data
 */

/**
 * @typedef {object} InitRemoveData
 * @property {boolean} removed False when nothing was found to remove: no managed agent-docs block, and no Astryx skill file in the places removed from.
 * @property {string[]} from The places removed from, as they were saved: without `--to`, the project's saved places (`agents-md` when nothing is saved); with `--to`, the places it names. Each is dropped from what is saved.
 * @property {InitSkillFile[]} skills One row per skill file of the `skills` and folder places removed from: `removed`, or `kept` (reason `edited`, `not-astryx`, or `computer-skill` for the computer-level skill reached through a saved folder).
 * @property {InitUserData | null} user What removing the `user` place did, as `init --user --remove-agents` reports it; null when `from` has no `user`.
 */

/**
 * @typedef {object} InitRemoveResponse
 * @property {'init.remove'} type
 * @property {InitRemoveData} data
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
 * What init did to one skill file. `created`, `updated`, `unchanged`: as for
 * an agent-doc file. `removed`: a place `--to` moved off held it. `kept`:
 * left as it is (see `reason`).
 * @typedef {object} InitSkillFile
 * @property {string} path The file: relative to the project root for a project place, absolute for a folder outside the project.
 * @property {string} place The place it belongs to, as saved: `skills` or a folder.
 * @property {'created' | 'updated' | 'unchanged' | 'removed' | 'kept'} action
 * @property {'edited' | 'not-astryx' | 'pair-kept' | 'computer-skill'} [reason] Only on `kept`: `edited`, a person changed it since Astryx wrote it; `not-astryx`, Astryx did not write it (a linked skill folder's file included); `pair-kept`, the other copy of the `skills` place is a person's own, so neither copy is written and every agent reads one text; `computer-skill`, it is the computer-level skill or one of its links or copies, reached through a saved folder, which `init --remove --to user` removes.
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
 * @property {boolean} [remove] Remove the Astryx skill from every saved place (with `to`, from the places it names) and drop them from what is saved; `removeAgents` is the same option.
 * @property {boolean} [once] With `to`, write a copy that is saved nowhere, so no later run refreshes it. Refused without `to`, with `user`, with `remove`, and for `agents-md` or a place the project or this computer already saves.
 * @property {boolean} [removeAgents] The same as `remove`.
 * @property {boolean} [user] Write the computer-level agent text (`~/.agents/skills/astryx/SKILL.md`, linked into `~/.claude/skills` and the skill folders of other installed tools, with a copy for Continue) instead of setting up the folder.
 * @property {string | string[]} [to] Where the Astryx skill goes: `agents-md`, `skills`, `user`, or a folder written as a path; a comma list or several. Saved in the project's config (project places) or the settings file (folders outside the project).
 * @property {string} [agent] Agent preset: claude, cursor, codex, hermes, muse, all. Refused with `user`.
 * @property {string | string[]} [agentDocsPath] Explicit agent-docs file path(s).
 * @property {string} [templateName] Scaffold a named page template (programmatic only; the CLI never sets it).
 */

export {};
