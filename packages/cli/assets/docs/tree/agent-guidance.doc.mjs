// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/configuration/agent-guidance`: add short lines of
 * guidance that apps put in front of their AI agents, within the limits.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'agent-guidance',
  placement: {parent: 'namespace:configuration', slot: 'guides', order: 10},
  title: 'Agent guidance',
  category: 'guide',
  keywords: ['agent docs', 'agents.md', 'skill', 'SKILL.md'],
  description:
    'Add a few lines of guidance that apps put in front of the AI agents working in their code.',
  sections: [
    {
      id: 'add-a-guidance-line',
      title: 'Add a line of guidance',
      content: [
        {
          type: 'prose',
          text: '`integration add agent-doc` adds one line for AI agents that work in apps using your package. Apps show it in their agent file, such as `AGENTS.md`.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: "{@command integration add agent-doc 'Use AcmeCarousel for rotating content.'}",
        },
        {
          type: 'prose',
          text: 'The line lands in `agentDocs.append` in your manifest:',
        },
        {
          type: 'code',
          lang: 'js',
          code: `// astryx.integration.mjs
export default {
  components: './components',
  agentDocs: {
    append: ['Use AcmeCarousel for rotating content.'],
  },
};`,
        },
        {
          type: 'prose',
          text: 'Adding the same line again changes nothing. To reword or remove a line, edit `agentDocs.append` by hand.',
        },
      ],
    },
    {
      id: 'keep-within-the-limits',
      title: 'Keep within the limits',
      content: [
        {
          type: 'prose',
          text: "Every line costs space in each app's agent file, so the CLI keeps guidance short and few. Put detail in your docs instead.",
        },
        {
          type: 'table',
          headers: ['Limit', 'What happens past it'],
          rows: [
            [
              '8 lines per package',
              '`integration add` fails: `append may contain at most 8 lines`.',
            ],
            [
              '240 characters per line',
              '`integration add` fails: `must contain at most 240 Unicode code points`.',
            ],
            [
              '32 lines per app, from all its packages',
              '`init` writes no agent block and prints `Could not install agent docs.`',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'A line is one line of plain text. Line breaks, control characters, spaces at either end, and managed-block markers such as `<!-- ASTRYX:START -->` are rejected.',
        },
        {
          type: 'prose',
          text: 'Start a command in a line with the word astryx alone, with no runner in front, as in: Run astryx doctor before finishing. The block names the command the app runs once, at its top, for every command below it, so your line works in every app. See {@link generic:cli-command}.',
        },
      ],
    },
    {
      id: 'see-what-agents-read',
      title: 'See what agents read',
      content: [
        {
          type: 'prose',
          text: "An app's `{@command init}` writes your lines near the end of its managed agent block, each labeled with your package name; only the CLI's line on how to remove the block comes after them. The CLI owns the heading, the labels, that last line, and the markers.",
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command init --features agents}',
        },
        {
          type: 'code',
          lang: 'text',
          code: `INTEGRATIONS:
- \`@acme/astryx-widgets\`: Use AcmeCarousel for rotating content.
To remove this block, run \`astryx init --remove-agents\`, …
<!-- ASTRYX:END -->`,
        },
        {
          type: 'prose',
          text: 'The block collects lines from every integration the app has installed, with or without an `astryx.config` entry.',
        },
      ],
    },
    {
      id: 'refresh-the-block',
      title: 'Refresh the block in an app',
      content: [
        {
          type: 'prose',
          text: 'The block changes only when the app runs `init`, or `upgrade --from <version> --apply`. After an app installs a version of your package with new lines, it runs one of them.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: `{@command init --features agents}
# Or: --from takes the Core version the app had before
{@command upgrade --from <version> --apply}`,
        },
        {
          type: 'code',
          lang: 'text',
          code: '[ok] Agent docs refreshed -> AGENTS.md',
        },
        {
          type: 'prose',
          text: '`upgrade --apply` prints that line; `init` prints one line per file, such as `[ok] AI agent docs: AGENTS.md updated (Astryx 0.7.15 -> 0.7.16)` or `[ok] AI agent docs: AGENTS.md already current (Astryx 0.7.16), nothing changed`. Without `--apply`, `upgrade` only reports `Agent docs differ from the installed Astryx and integration configuration.` It refreshes the block even when Core did not change. See {@link command:upgrade}.',
        },
      ],
    },
    {
      id: 'ship-a-skill',
      title: 'Ship a skill',
      content: [
        {
          type: 'prose',
          text: "For guidance longer than a few lines, make one of your docs a skill: add `skill` with a name and a description. An app that keeps the Astryx skill in a skills folder (`{@command init --to skills}`) gets the doc as a skill of its own, `<name>/SKILL.md`; every app's agent block gets one line that names it and points to `{@command docs skills/<name>}`. Agents load a skill only when its description matches the task, so say when to use it, in the words a request would use.",
        },
        {
          type: 'code',
          lang: 'js',
          code: `// docs/entities.doc.mjs
export default {
  type: 'generic',
  name: 'acme-entities-guide',
  title: 'Acme entities',
  description: 'How to show Acme entities.',
  skill: {
    name: 'acme-entities',
    description: 'Use when a page shows Acme customers, orders, or products.',
  },
  sections: [/* ... */],
};`,
        },
        {
          type: 'prose',
          text: 'The rules for the name and the description, and what happens to a skill that breaks one, are on the `skill` field of ReferenceDoc in `{@command docs authoring/field-reference}`; `{@command integration check}` names a skill that breaks one. `agentDocs.append` lines keep working as before.',
        },
      ],
    },
    {
      id: 'global-mode',
      title: 'In global mode',
      content: [
        {
          type: 'prose',
          text: "In global mode: the agent guide the CLI keeps for the computer carries no integration's guidance, because it serves every folder; your guidance reaches agents through the agent docs `init` writes in an app that installs your package. See {@link namespace:global} and {@link generic:computer-agent-guide}.",
        },
      ],
    },
  ],
};
