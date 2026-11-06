// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file astryx docs authoring/building-blocks/configuration — set how your integration behaves. */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'configuration',
  placement: {parent: 'namespace:building-blocks', slot: 'guides', order: 60},
  title: 'Configuration',
  summary:
    'Set how your integration behaves in an app: agent guidance, the command your users run, debug and gap reports, and more as it grows.',
  keywords: ['configuration', 'agent guidance', 'cliCommand', 'debug', 'gap reports'],
  slots: {
    guides: {title: 'Configuration', accepts: {kinds: ['generic', 'namespace']}},
  },
  blocks: [
    {
      type: 'prose',
      text: "In global mode: installed for the computer, beside the global CLI, your package's manifest is read as it is in a project and applies in folders outside any project; peer ranges are checked against the global CLI's release. See {@link namespace:global} and {@link generic:global-integrations}.",
    },
    {
      type: 'prose',
      text: 'Beyond the things you ship, an integration can set how it behaves in an app: the guidance it gives the AI agents working there, the command its users run the CLI with, and the record it keeps of each CLI run. Open one below to set it up.',
    },
  ],
};
