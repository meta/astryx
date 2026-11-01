// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs global/computer-agent-guide`: the one skill file the global
 * install keeps for the whole computer, its links, and `init --user` (spec
 * AST-081 FR8).
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'computer-agent-guide',
  placement: {
    parent: 'namespace:global',
    slot: 'guides',
    order: 5,
  },
  title: 'The agent guide on your computer',
  category: 'guide',
  keywords: [
    'agent guide',
    'init --user',
    'SKILL.md',
    'skills',
    'remove-agents',
    'claude',
    'codex',
    'cursor',
    'agents',
    'other agents',
    'symlink',
    'link skills',
  ],
  description:
    'Your global install keeps one short Astryx skill in your home folder and links it into the folders agent tools read, so agents anywhere know Astryx is there. `{@command init --user}` writes it now or turns it off.',
  sections: [
    {
      id: 'what',
      title: 'What it is',
      content: [
        {
          type: 'prose',
          text: "A project's agent docs reach only agents working in that project. Your global install also keeps one skill file, `~/.agents/skills/astryx/SKILL.md`, which most coding agents read. It tells agents that Astryx is on this computer, when it is relevant (building or changing UI), and to start with `{@command search}`. It names no version, so it never goes stale. Inside a project, the project's own agent docs come first.",
        },
        {
          type: 'prose',
          text: 'It is written in the background on the first run and again after you upgrade, so no command waits for it. Installing the package does not write it, because some package managers skip install scripts.',
        },
      ],
    },
    {
      id: 'where',
      title: 'Where agents find it',
      content: [
        {
          type: 'prose',
          text: "Agents that read only their own skills folder get a link to the skill's folder, so they read the same one file: a folder symlink with a relative target (a junction on Windows, or a copy where neither can be made). Continue's scanner skips links, so it gets a copy, refreshed with the file:",
        },
        {
          type: 'table',
          headers: ['Folder', 'When'],
          rows: [
            ['`~/.claude/skills/astryx`', 'Always'],
            ['`~/.kiro/skills/astryx`', 'When `~/.kiro` exists'],
            [
              '`~/.codeium/windsurf/skills/astryx`',
              'When `~/.codeium/windsurf` exists',
            ],
            ['`~/.letta/skills/astryx`', 'When `~/.letta` exists'],
            [
              '`~/Library/Developer/Xcode/CodingAssistant/ClaudeAgentConfig/skills/astryx`',
              "When Xcode's coding assistant folder exists",
            ],
            [
              '`~/.config/agents/skills/astryx`',
              'When `~/.config/agents/skills` exists',
            ],
            [
              '`~/.continue/skills/astryx` (a copy)',
              'When `~/.continue` exists',
            ],
          ],
        },
        {
          type: 'prose',
          text: "Astryx never replaces anything it did not create at one of these folders, and never writes a folder another tool manages; `{@command doctor}` names any it skipped, and any link whose skill folder is missing, as in a container that mounts only one agent's folder.",
        },
      ],
    },
    {
      id: 'cloud-and-apps',
      title: 'Cloud agents and apps',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            "Cloud and background agents read only the repository, so the project's own agent docs, the block `{@command init}` writes into AGENTS.md or CLAUDE.md, are what reach them.",
            'Apps that take an uploaded skill: upload `~/.agents/skills/astryx/SKILL.md`, or a zip of its folder.',
          ],
        },
      ],
    },
    {
      id: 'other-agents',
      title: 'Other agents',
      content: [
        {
          type: 'prose',
          text: 'If your agent reads skills from another folder, link it to the skill:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: "ln -s ~/.agents/skills/astryx <your agent's skills folder>/astryx",
        },
        {
          type: 'prose',
          text: 'On Windows, in PowerShell:',
        },
        {
          type: 'code',
          lang: 'powershell',
          code: 'New-Item -ItemType Junction -Path "<your agent\'s skills folder>\\astryx" -Target "$HOME\\.agents\\skills\\astryx"',
        },
      ],
    },
    {
      id: 'choose',
      title: 'Write it now, or turn it off',
      content: [
        {
          type: 'code',
          lang: 'bash',
          code: '{@command init --user}\n{@command init --user --remove-agents}',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`init --user` writes the file and the links now.',
            '`--remove-agents` removes the file and every link Astryx made, and turns it off until you run `{@command init --user}` again.',
            'A file you edited is never overwritten or removed; delete it to get the current text.',
            'Outside a project, `{@command doctor}` says whether the skill is there, current, edited, or turned off, and where it is linked.',
          ],
        },
      ],
    },
    {
      id: 'more',
      title: 'More on global mode',
      content: [
        {
          type: 'prose',
          text: "This page is part of {@link namespace:global}, which explains what global mode is and how each part works. A project's own agent docs: {@link command:init}.",
        },
      ],
    },
  ],
};
