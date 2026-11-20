// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/skill-places`: where the Astryx guidance goes for AI
 * agents, in a project (the AGENTS.md block, the default, or the project
 * skills folders) and on the computer, and how `init --to` keeps each place.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'skill-places',
  placement: {parent: 'namespace:cli', slot: 'guides', order: 3},
  title: 'Where agents read Astryx',
  category: 'guide',
  keywords: ['agents.md', 'init --to', 'agent docs'],
  description:
    'In a project, keep the Astryx guidance in AGENTS.md (the default). Add the computer skill so agents outside a project know Astryx is there. `{@command init --to}` picks the place and keeps it.',
  sections: [
    {
      id: 'pick',
      title: 'Pick a place',
      content: [
        {
          type: 'prose',
          text: 'In a project, use the AGENTS.md block: every agent reads it, every time. That is what `{@command init}` writes with no options. Use a skills folder only when your team keeps agent guidance as skills. On your computer, add the computer skill so an agent that works outside a project still knows Astryx is there. The project place and the computer place work together: in a project, the project guidance comes first.',
        },
        {
          type: 'table',
          headers: ['Place', 'Command', 'Writes', 'Saved in'],
          rows: [
            [
              'Project, AGENTS.md (default)',
              '`{@command init}`',
              'The Astryx block in AGENTS.md, a copy in the Claude Code file the project already has, and an import in GEMINI.md',
              'Nothing: it is the default',
            ],
            [
              'Project, skills folder',
              '`{@command init --to skills}`',
              '`.agents/skills/astryx-project/SKILL.md` and a copy in `.claude/skills/astryx-project`',
              '`skills.to` in astryx.config',
            ],
            [
              'This computer',
              '`{@command init --to user}`',
              '`~/.agents/skills/astryx/SKILL.md`, linked where other agents look',
              'The settings file',
            ],
            [
              'Any folder',
              '`{@command init --to ./team-skills}`',
              '`<folder>/astryx-project/SKILL.md` in the project; a folder outside it gets the computer skill',
              'astryx.config, or the settings file for a folder outside the project',
            ],
          ],
        },
        {
          type: 'prose',
          text: "Run the commands for this computer and for folders outside a project with the CLI installed for the computer (`{@pm install @astryxdesign/cli@latest --global}`): it answers them in any folder. In a project, a runner such as npx starts the project's own CLI, and a release from before skill places refuses `--to`.",
        },
        {
          type: 'prose',
          text: 'A skill loads only when the agent decides the task needs it; the AGENTS.md block is always read. So keep the block when your team uses an agent that reads skills less reliably than AGENTS.md.',
        },
      ],
    },
    {
      id: 'keep',
      title: 'Keep each place current',
      content: [
        {
          type: 'prose',
          text: "`{@command init}` writes the project's saved places again. `{@command upgrade --from <old version> --apply}` refreshes them after a dependency bump. The CLI installed for the computer writes the computer skill again after each of its upgrades, until `{@command init --remove --to user}` turns it off. It refreshes the folders outside a project you saved while each file is there; after you delete one, `{@command init --to <folder>}` writes it again. `{@command doctor}` checks each place: current, missing, from another release, edited, or there twice.",
        },
        {
          type: 'code',
          lang: 'bash',
          code: `{@command init --to skills}      # move the project to the skills folders
{@command init --to agents-md}   # move it back; the skill files go
{@command init --to ./bundle --once}   # a copy that nothing keeps current
{@command init --remove}         # remove it from the project's saved places`,
        },
        {
          type: 'prose',
          text: 'Moving a project to another place removes the guidance from the old one, so agents never read it twice. A skill file you edited is kept, and so is one Astryx did not write; delete it, then run `{@command init}` (for a folder outside the project, `{@command init --to <folder>}`; for the computer skill, `{@command init --to user}`) to get the current text.',
        },
      ],
    },
  ],
};
