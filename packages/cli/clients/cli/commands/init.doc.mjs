// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx init`. The terminal binding of the `init()`
 * function (referenced via `fn`); its args/flags map to that function's params
 * so a converter can build Commander config + --help from one source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'init',
  displayName: 'astryx init',
  namespace: 'cli/commands',
  summary: 'Initialize the design system in your project',
  description:
    'Non-interactive project setup (no prompts, so it behaves the same for humans, ' +
    'agents, and CI). By default it writes the agent-docs block, including guidance ' +
    'from configured integrations, to AGENTS.md and to the Claude Code file the project ' +
    'has (CLAUDE.md, else .claude/CLAUDE.md; when CLAUDE.md exists, a block in ' +
    '.claude/CLAUDE.md is removed, unless the project ignores CLAUDE.md, in which case a .claude/CLAUDE.md the ' +
    'project commits keeps a copy), and a one-line import of AGENTS.md to GEMINI.md ' +
    'unless GEMINI.md already imports it. It then prints getting-started steps. Agent ' +
    'docs go to the project root: the nearest folder at or above this one whose ' +
    'package.json declares an @astryxdesign package, else the nearest with any ' +
    'package.json, else this folder. The search stops at a repository root and never ' +
    'counts the home folder. In the home folder, or in a settings folder in it ' +
    'such as ~/.gemini outside a project, no agent docs are written. Every folder of the ' +
    'home folder whose name starts with a dot is a settings folder, and such a folder ' +
    'itself never counts as a project, even with a package.json; a project inside one, ' +
    'such as an agent worktree with its own package.json, works. The managed block is ' +
    'written whatever ignore rules or generated markers say; the text around it is never changed. ' +
    '--features and --all print only ' +
    "the chosen features' " +
    'guidance (no getting-started steps); the theme feature also writes an annotated theme template. ' +
    'Outside a project it writes the same files but prints no step that sets up a project: ' +
    'no getting-started steps, and no step that adds a theme to an app. ' +
        '--user writes the computer-level agent text instead (see the flag), in any folder, and touches nothing in the folder. ' +
    'The CLI installed for the computer also keeps that text current in the background, unless --user --remove-agents turned it off; ' +
    'package install scripts, project setup, and upgrade never write it.',
  fn: 'init',
  options: [
    {
      flag: '--features <list>',
      param: 'options.features',
      description:
        'Comma-separated features: agents (agent docs), theme (writes theme.template.ts), template (prints the page-building commands; writes no file). ' +
        'An unknown feature exits 1 with ERR_UNKNOWN_FEATURE. Refused with --all or --remove-agents',
    },
    {
      flag: '--all',
      param: 'options.all',
      description:
        'Install all features (agents, theme, template); refused with --features. Prints their guidance instead of the getting-started steps',
    },
    {
      flag: '--remove-agents',
      param: 'options.removeAgents',
      description:
        'Remove the managed block from AGENTS.md, CLAUDE.md, .claude/CLAUDE.md, GEMINI.md, .cursorrules, .hermes.md and HERMES.md, ' +
        'at the project root (where init writes them) and in this folder ' +
        "(deleting AGENTS.md or .claude/CLAUDE.md when only init's heading is left, and GEMINI.md when nothing is left) and do nothing else. " +
        'Below the project root, a project-root agent file whose block resolves outside the project is left as it is, with a note. ' +
        '--features, --all, --agent and --agent-docs-path are refused; a file written with --agent-docs-path keeps its block',
    },
    {
      flag: '--user',
      param: 'options.user',
      description:
        'Write or refresh the computer-level agent text instead of setting up the folder: one skill file, ~/.agents/skills/astryx/SKILL.md, which most coding agents read, ' +
        'linked into the skill folders of agents that read only their own (~/.claude/skills always; Kiro, Windsurf, Letta, Xcode\'s coding assistant, and ~/.config/agents/skills when that folder exists): a folder symlink with a relative target, a junction on Windows, or a copy where neither can be made. Continue, whose scanner skips links, gets a managed copy, refreshed with the file. ' +
        "It tells agents anywhere on the computer that Astryx is there, when it is relevant, and to start with `astryx search`. " +
        'Records the links it made in astryx/settings.json in the per-user configuration folder, so removal removes exactly those; the CLI installed for the computer refreshes the file in the background after each upgrade. ' +
        'Works in any folder. A file without the Astryx markers, one edited since Astryx wrote it, or a symlink, is kept as it is, and so is anything at a link target that Astryx did not create. ' +
        'Warns, and still writes, when no `astryx` command on the computer runs the Astryx CLI. ' +
        'With --remove-agents it removes the file, the links, and the copy instead and records that the text is turned off. --features, --all, --agent and --agent-docs-path are refused',
    },
    {
      flag: '--agent <tool>',
      param: 'options.agent',
      choices: ['claude', 'cursor', 'codex', 'hermes', 'muse', 'all'],
      description:
        'Target AI tool for agent docs: claude (CLAUDE.md or .claude/CLAUDE.md, else creates .claude/CLAUDE.md), cursor (.cursorrules if present, else AGENTS.md), ' +
        'codex and muse (AGENTS.md), hermes (.hermes.md or HERMES.md if present, else AGENTS.md), all (every existing agent doc except GEMINI.md, which keeps its ' +
        'one-line import of AGENTS.md, else AGENTS.md and .claude/CLAUDE.md). With claude and all, when CLAUDE.md gets the block, .claude/CLAUDE.md gets none and ' +
        'a block already there is removed, unless the project ignores CLAUDE.md: then a .claude/CLAUDE.md the project commits gets a copy too, with claude and all alike. ' +
        'An unknown tool exits 1 with ERR_UNKNOWN_AGENT. ' +
                'Used only when agent docs are installed (the default, --all, or --features agents); --agent-docs-path takes precedence.',
    },
    {
      flag: '--agent-docs-path <path...>',
      param: 'options.agentDocsPath',
      description:
        'Explicit file path(s) for agent docs, inside the project; takes precedence over --agent. ' +
        'If any path is outside the project, no agent docs are written and the command exits 1. ' +
        'A path in the home folder itself, or in a settings folder in it outside a project (such as ~/.claude or ~/.claude/hooks), is refused with a note (exit 0), and nothing is written. ' +
        'Used only when agent docs are installed',
    },
  ],
  examples: [
    {label: 'Default setup', cli: 'astryx init'},
    {label: 'All features, no prompts', cli: 'astryx init --all'},
    {label: 'Machine-readable receipt', cli: 'astryx init --json'},
    {label: 'Agent text for the whole computer', cli: 'astryx init --user'},
    {label: 'Remove the computer-level agent text and turn it off', cli: 'astryx init --user --remove-agents'},
  ],
  outsideProject: 'own',
  exitCodes: [
    {
      code: 0,
      when: "success, including agent docs left unwritten in five soft cases, each reported as docsError with one note: running in the home folder, or in a settings folder in it outside a project; a GEMINI.md that resolves outside the project; when init runs below the project root, a project-root agent file that resolves outside the project; the project's Claude Code file (root CLAUDE.md, or .claude/CLAUDE.md when there is no root one) when it resolves outside the project and is a block-less import of an existing AGENTS.md, which 0.7.1 left alone; and a .claude/CLAUDE.md that resolves outside the project and that 0.7.1 did not write: beside a CLAUDE.md the project ignores, the one --agent claude adds or a block-less import of an existing AGENTS.md; with --agent claude beside a CLAUDE.md, one whose block it would remove",
    },
    {
      code: 1,
      when: 'an unknown --agent (ERR_UNKNOWN_AGENT) or feature, an --agent-docs-path outside the project, --remove-agents combined with install options, --user combined with --features, --all, --agent or --agent-docs-path, or --all with --features (ERR_INVALID_ARGUMENT); or, when init runs at the project root, an agent file 0.7.1 also wrote there that resolves outside the project (ERR_PATH_TRAVERSAL, docsError path-safety, nothing written)',
    },
  ],
  related: ['doctor', 'upgrade', 'build', 'theme'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, init writes the agent docs (AGENTS.md) into the folder and prints no getting-started steps. `init --user` writes the agent guide for your computer, in any folder, and is never handed to a project's own CLI. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:computer-agent-guide}.",
    },
  ],
};
