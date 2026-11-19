// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/build-the-template/template-assets/template-icons`:
 * render template icons through Astryx and ship custom product icons from the
 * package.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'template-icons',
  placement: {
    parent: 'namespace:template-assets',
    slot: 'guides',
    order: 40,
  },
  title: 'Icons',
  category: 'guide',
  description:
    'Keep icons consistent and accessible by rendering them through Astryx, and ship custom product icons from your package.',
  sections: [
    {
      id: 'use-astryx-icon',
      title: 'Use Astryx Icon',
      content: [
        {
          type: 'prose',
          text: 'Use `Icon` for a standalone icon. For a component icon prop, pass what that prop accepts: most, such as `Button` and `IconButton`, take an element like `<Icon icon={BellIcon} />`, and some menu and navigation items also accept the icon definition itself. This keeps sizing, color, and accessibility aligned with the system.',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {BellIcon} from '@heroicons/react/24/outline';

<Icon icon={BellIcon} size="sm" />
<Button label="Alerts" icon={<Icon icon={BellIcon} />} />`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Use one supported icon set consistently inside a template.',
            'Give an icon-only control its required visible or assistive label through the Astryx control API.',
            'Do not paste raw `svg` and `path` markup when an existing icon definition fits.',
            'Do not render a library icon directly when `Icon` or the receiving Astryx component can render it.',
            'Declare an icon library other than Astryx as a dependency ({@link generic:export-template-assets}).',
          ],
        },
      ],
    },
    {
      id: 'ship-a-custom-icon',
      title: 'Ship a custom icon deliberately',
      content: [
        {
          type: 'prose',
          text: 'A product mark or missing domain symbol can stay package-owned. Export a compatible icon definition from a public package path, then import that path from the template.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'templates/acme-dashboard.tsx',
          code: `import {Icon} from '@astryxdesign/core/Icon';
import {AcmePulseIcon} from '@acme/astryx-widgets/icons/AcmePulseIcon';

<Icon icon={AcmePulseIcon} size="sm" label="Account health" />`,
        },
        {
          type: 'prose',
          text: 'Export the icon path and include its file in the package ({@link generic:export-template-assets}).',
        },
      ],
    },
    {
      id: 'check-icons-in-the-app',
      title: 'Check icons in the app',
      content: [
        {
          type: 'prose',
          text: 'When you test the template in an app ({@link generic:test-template-in-app}), also confirm the following.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Every icon state renders, including selected, disabled, loading, and narrow layouts.',
            'Meaningful icons have an accessible name, and decorative icons add no duplicate spoken text.',
            'No missing icon leaves an empty control.',
          ],
        },
      ],
    },
  ],
};
