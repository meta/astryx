// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The section `astryx docs icons` adds where an icon set is installed:
 *   how to find an icon from that set. The project adds it to the `icons`
 *   topic only where the icon feature gate is on, in the name of the package
 *   that ships the project's set.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'installed-icon-set',
  extends: 'icons',
  stability: 'experimental',
  title: 'Icons from your icon set',
  description: 'Find an icon from the icon set your project installs.',
  sections: [
    {
      id: 'installed-icon-set',
      title: 'Icons from your icon set',
      content: [
        {
          type: 'prose',
          text: 'Icon sets are experimental. Your project installs an icon set, and the package named beside this section ships it. To find an icon by meaning and get its import line, run `{@command experimental icon <words>}`. `{@command experimental icon --list}` names every installed set. These commands can change in a patch release.',
        },
      ],
    },
  ],
};
