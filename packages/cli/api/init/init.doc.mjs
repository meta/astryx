// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `init()` / `astryx init`. Colocated with the API
 * function it documents; the shape source of truth stays in `init.type.mjs`.
 * @position packages/cli/api/init — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'init',
  namespace: 'cli/api',
  displayName: 'init()',
  summary:
    'Non-interactive project setup: install agent docs and point at the theme + build workflows.',
  description:
    'Sets a project up with NO prompts, so it behaves identically for humans, ' +
    'agents, CI, and piped I/O. By default it writes the agent-docs cheat sheet, ' +
    'including guidance from configured integrations, at the project root (the nearest ' +
    'package.json that declares an @astryxdesign package, else the nearest package.json, ' +
    'searching no higher than the repository root): to AGENTS.md, ' +
    "to the project's Claude Code file (CLAUDE.md, else .claude/CLAUDE.md; when CLAUDE.md " +
    'exists, a block in .claude/CLAUDE.md is removed, unless the project ignores CLAUDE.md, in which case a ' +
    '.claude/CLAUDE.md the project commits keeps a copy), and as a ' +
    'one-line import of AGENTS.md in GEMINI.md unless GEMINI.md already imports it. ' +
    'In the home folder, or in a settings folder in it outside a project, it writes none: every ' +
    'folder of the home folder whose name starts with a dot is a settings folder, and such a folder itself never ' +
    'counts as a project, even with a package.json; a folder below it with a package.json does. ' +
    'The managed block is Astryx-owned: it is written, refreshed, and removed whatever ignore rules ' +
    'or generated markers say, and the text around it is never changed. It then ' +
    "prints getting-started guidance (the build and search commands instead when every agent-docs block was already current, since the app is set up; an outdated block is still refreshed); `features` / `all` print only the chosen features' " +
    'guidance instead (the theme feature also writes the annotated theme template). ' +
    'With `removeAgents` it removes the managed agent-docs block, at the project root and in `ctx.cwd`, instead of installing. ' +
    'Outside a project it writes the same files but prints no getting-started steps and no step that adds a theme to an app, since those set up a project the folder does not have. ' +
        "With `user` it sets up the computer instead of the folder: it writes the computer-level agent text, one skill file at `~/.agents/skills/astryx/SKILL.md`, linked into the skill folders of agents that read only their own (`~/.claude/skills` always; Kiro, Windsurf, Letta, Xcode's coding assistant, and `~/.config/agents/skills` when that folder exists), with a managed copy for Continue, whose scanner skips links,, telling agents anywhere on the computer that Astryx is there and when to use it; with `user` and `removeAgents` it removes the file and the links it made and records that the text is turned off. " +
    'The CLI installed for the computer refreshes the file in the background after each upgrade; package install scripts, project setup, and upgrade never write it.' +
    " In global mode: with `cwd` outside a project, it writes the agent docs and prints no getting-started steps; `user` writes only the agent guide for the computer, in the home folder, and touches nothing in `cwd`. See {@link namespace:global} and {@link generic:computer-agent-guide}.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'init(options?: InitOptions, ctx?: {cwd?: string}): Promise<InitRunResponse | InitRemoveResponse | InitUserResponse>',
  keywords: ['init', 'setup', 'install', 'scaffold', 'agents', 'bootstrap'],
  params: [
    {
      name: 'options.features',
      type: 'string',
      description:
        'Comma-separated features to install: agents (agent docs), theme (writes the annotated theme.template.ts), template (the page-building commands; writes a page only with templateName).',
    },
    {
      name: 'options.all',
      type: 'boolean',
      description: 'Install all features (agents, theme, template).',
    },
    {
      name: 'options.remove',
      type: 'boolean',
      description:
        'Remove instead of installing: the Astryx skill from every place the project saves (with `to`, the places named, which may be a folder saved for this computer or `user`) and drop each from what is saved, and the managed block at the project root and in `ctx.cwd` when no `to` is given or `to` names `agents-md`. An edited skill file, or one Astryx did not write (in a linked skill folder too), is kept; in the project, linked copy folders share one file, removed once. Folders saved for this computer stay unless `to` names them. With `user`, remove the computer-level agent text instead.',
    },
    {
      name: 'options.removeAgents',
      type: 'boolean',
      description: 'The same as `remove`.',
    },
    {
      name: 'options.once',
      type: 'boolean',
      description:
        'With `to`, write a copy that is saved nowhere, so no later init, upgrade, or background refresh touches it. Refused without `to`, with `user`, with `remove`, and for `agents-md` or a place the project or this computer already saves.',
    },
    {
      name: 'options.user',
      type: 'boolean',
      description:
        "Write or refresh the computer-level agent text instead of setting up `ctx.cwd`: one skill file at `~/.agents/skills/astryx/SKILL.md` in the current user's home folder, linked (a folder symlink with a relative target, a junction on Windows, or a copy where neither can be made) into `~/.claude/skills/astryx`, and into the skills folder of Kiro, Windsurf, Letta, Xcode's coding assistant, and `~/.config/agents/skills` when that folder exists; Continue, whose scanner skips links, gets a managed copy, refreshed with the file. " +
        'The text uses the `astryx` command, or the command of the host that started the run; an integration\'s `cliCommand` never applies. ' +
        'Records the links it made, or with `removeAgents` that the text is turned off, in `astryx/settings.json` in the per-user configuration folder. ' +
        'A file without the Astryx markers, one edited since Astryx wrote it, or a symlink, is kept as it is, and so is anything at a link target that Astryx did not create. When no `astryx` command on the computer runs the Astryx CLI, the text is still written and the receipt carries a warning to install the CLI for the computer (`npm i -g @astryxdesign/cli`). ' +
        'Cannot be combined with `features`, `all`, `agent`, or `agentDocsPath`.',
    },
    {
      name: 'options.to',
      type: 'string | string[]',
      description:
        'Where the Astryx skill goes, one place, a comma list, or several: `agents-md` (the managed block, the default), `skills` (`.agents/skills/astryx-project/SKILL.md` and a byte-identical copy in `.claude/skills/astryx-project` at the project root), `user` (the computer-level skill, the same as the `user` option), or a folder written as a path (`./team`, `~/team`): one in the project gets `<folder>/astryx-project/SKILL.md`, any other the computer-level skill at `<folder>/astryx/SKILL.md`. ' +
        "The project places are saved in astryx.config `skills.to`, so a later `init` writes the same places; a folder outside the project is saved in the settings file, and the CLI installed for the computer refreshes its copy while it is there. Naming project places moves the project to them: the old places are cleared once a new one holds the text. " +
        'An edited skill file, or one Astryx did not write, is kept. A project root in the home folder or a settings folder in it takes no project place, as it takes no agent docs.',
    },
    {
      name: 'options.agent',
      type: 'string',
      description:
        'Agent preset: claude, cursor, codex, hermes, muse, all. `all` writes every existing agent doc except GEMINI.md, ' +
        'which keeps its one-line import of AGENTS.md. With claude and all, when CLAUDE.md gets the block, a block in ' +
        '.claude/CLAUDE.md is removed, unless the project ignores CLAUDE.md, in which case a .claude/CLAUDE.md the ' +
        'project commits gets a copy too. Used only when the agents feature runs. Refused with `user`.',
    },
    {
      name: 'options.agentDocsPath',
      type: 'string | string[]',
      description: 'Explicit agent-docs file path(s) to write.',
    },
    {
      name: 'options.templateName',
      type: 'string',
      description:
        'Scaffold this page template to src/pages/<name>/page.tsx. Used only when the template feature runs (features includes template, or all); otherwise ignored. Programmatic only; the CLI never sets it.',
    },
    {
      name: 'ctx.cwd',
      type: 'string',
      description: 'Directory to set up.',
      default: 'process.cwd()',
    },
  ],
  returns: [
    {
      type: 'init.run',
      description:
        'The install receipt: the `mode` (`default` | `features`), the features run, agent-doc files written, `agentDocsStatus` (the agent docs before the write: `missing` | `stale` | `current`; null when agent docs were not installed or the write failed), what changed in each (`docsChanges`: `{path, change, from, to}`, change `created` | `updated` | `unchanged` | `removed`, from and to the Astryx versions the block names, path relative to the project root), any soft docsError, the theme-template outcome (`created` | `skipped` | `failed`) plus its path, the page-template outcome (`workflow` | `created` | `skipped`) plus its path, whether the next-steps were emitted (never outside a project, and not when `agentDocsStatus` was `current`: a set-up app gets the build and search commands instead), the places written (`to`), one `{path, place, action, reason?}` row per skill file (`skills`; action `created` | `updated` | `unchanged` | `removed` | `kept`, reason `edited` | `not-astryx` | `pair-kept` | `computer-skill`), the `user` place\'s `init.user` data (`user`, null without it), and `once` (true when the copy is saved nowhere). In a project whose saved places hold no `agents-md`, `agentDocsStatus` describes the project skill files.',
    },
    {
      type: 'init.remove',
      description:
        'The removal receipt, returned when `remove` (or `removeAgents`, the same option) is set: `data.removed` is true when it removed an Astryx block or skill file; `data.from`, the places it removed from (each saved place, or the ones `to` named); `data.skills`, one `{path, place, action, reason?}` row per skill file (action `removed` | `kept`, reason `edited` | `not-astryx` | `computer-skill`); `data.user`, the `init.user` data when the `user` place was named (null otherwise). Folders saved for this computer are kept unless `to` names them.',
    },
    {
      type: 'init.user',
      description:
        'The computer-level agent text receipt, returned when `user` is set: `data.files`, one `{path, action, reason?}` per path acted on (`~/.agents/skills/astryx/SKILL.md`, then each link to its folder, such as `~/.claude/skills/astryx`; action `written` | `linked` | `unchanged` | `removed` | `absent` | `kept`; `reason` on `kept`: `edited` | `not-astryx`), `data.command` (the command the text names), and `data.warnings`.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
            when: '--remove-agents is combined with --features, --all, --agent, or --agent-docs-path; --user is combined with --features, --all, --agent, or --agent-docs-path; or --all is combined with --features; or `to` names an unknown place, `skills` outside a project, or no place, is combined with `user`, is `user` alone with `features`, `all`, `agent`, or `agentDocsPath`, leaves out `agents-md` while `agent` or `agentDocsPath` is set, or comes with `features` that leave out agents; or `once` comes without `to`, with `user`, with `remove`, or with `agents-md` or a place already saved',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'with `user`, the file system refuses a write or removal of the computer-level agent text (as a `~/.agents/skills` the user cannot write); the message names the path, the errno, and what to change',
    },
    {
      code: 'ERR_UNKNOWN_AGENT',
            when: 'the agents feature runs (default mode, features includes agents, or all) and `agent` is not one of claude, cursor, codex, hermes, muse, all',
    },
    {
      code: 'ERR_UNKNOWN_FEATURE',
      when: '`features` contains a name other than agents, theme, or template',
    },
    {
      code: 'ERR_UNKNOWN_TEMPLATE',
      when: 'the template feature runs and `templateName` matches no bundled template',
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'scaffolding a template would overwrite an existing page.tsx',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: 'a project skill file `to` would write or clear resolves outside the project (as through a skills folder linked out of it), with nothing changed; the template output path resolves outside cwd (for example through a symlinked src directory), or, with removeAgents, a managed agent-docs file in cwd, or at the project root when run there, resolves outside that folder through a symlink (run below the root, a project-root file is left as it is with a note)',
    },
  ],
  examples: [
    {label: 'Default setup', code: 'const r = await init();'},
    {label: 'All features', code: 'await init({all: true});'},
    {label: 'Remove agent docs', code: 'await init({removeAgents: true});'},
    {label: 'The skill in the project skills folders', code: "await init({to: 'skills'});"},
        {label: 'Agent text for the whole computer', code: 'const r = await init({user: true});\nfor (const w of r.data.warnings) console.warn(w);'},
  ],
  command: 'init',
  related: ['doctor', 'upgrade', 'build', 'themeTemplate'],
};
