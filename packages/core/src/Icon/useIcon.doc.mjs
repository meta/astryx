// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useIcon',
  displayName: 'useIcon',
  group: 'Icon',
  keywords: [
    'icon',
    'semantic icon',
    'theme icons',
    'icon registry',
    'getIcon',
    'registerIcons',
    'success',
    'warning',
    'error',
  ],
  params: [
    {
      name: 'name',
      type: 'IconName | NamespacedIconName',
      description:
        "Semantic icon name, such as 'success', 'warning' or 'close', or a namespaced extension key such as 'richtext:bold'. Both resolve through the same registry.",
      required: true,
    },
  ],
  returns: [
    {
      name: 'icon',
      type: 'ReactNode',
      description:
        "The icon for that name from the nearest Theme's icons (or, outside any Theme, from the registered theme the document root names), else from registerIcons() overrides, else the built-in default. A function entry is read at {size: 'md'}.",
    },
  ],
  usage: {
    description:
      "Resolves a semantic icon name to a React node through the nearest Theme, so a custom component draws the same success, warning or error icon that Astryx components draw and follows a theme that overrides it. Resolution reads the nearest Theme's icons (outside any Theme, the registered theme the document root names), then registerIcons() overrides, then the built-in default. The node is returned as is, with no size or color wrapper: the built-in icons are 1em squares in currentColor, so they follow the surrounding text. A function entry is read at {size: 'md'}. Render <Icon icon={name} /> instead when the icon needs another size, a color or a label.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Use it in a custom component that places a semantic icon itself, so a Theme that overrides the icon changes the component too.',
      },
      {
        guidance: true,
        description:
          'Render <Icon icon={name} /> when the icon needs a size other than md, a color, or an accessible label.',
      },
      {
        guidance: false,
        description:
          'Import a specific icon library glyph for a semantic purpose that a theme should control, such as a success or error state.',
      },
    ],
  },
  relatedComponents: ['Icon', 'Theme'],
  relatedHooks: ['useTheme'],
  importPath: '@astryxdesign/core/Icon',
  category: 'utilities',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "Resolves a semantic icon name to a React node via the nearest Theme, so custom components draw the same icons as Astryx components and follow theme overrides. Fallback: nearest Theme icons (outside any Theme, the root's registered theme), registerIcons() overrides, built-in default. Node returned as is (built-ins are 1em, currentColor). Function entries read at {size: 'md'}. Use <Icon icon={name} /> for another size, a color or a label.",
  paramDescriptions: {
    name: "semantic icon name ('success', 'close') or namespaced key ('richtext:bold'); same registry.",
  },
  returnDescriptions: {
    icon: "icon node from nearest Theme (outside any Theme, the root's registered theme), else registerIcons() overrides, else built-in default; function entries read at {size: 'md'}.",
  },
  usage: {
    description:
      "Semantic icon name to React node via nearest Theme; custom components follow theme icon overrides. Fallback: nearest Theme (or root's registered theme), registerIcons(), built-in. No size/color wrapper; function entries read at {size: 'md'}. Use <Icon icon={name} /> for other sizes, color or a label.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Use in custom components that place a semantic icon, so Theme overrides reach them.',
      },
      {
        guidance: true,
        description:
          'Render <Icon icon={name} /> for a non-md size, a color, or an accessible label.',
      },
      {
        guidance: false,
        description:
          'Import a library glyph for a semantic purpose a theme should control (success, error).',
      },
    ],
  },
};
