// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'IconButton',
  displayName: 'Icon Button',
  group: 'Button',
  category: 'Action',
  keywords: ['icon-button', 'icon', 'button', 'toolbar', 'action', 'compact'],

  props: [
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible label. Used as aria-label (not rendered as visible text).',
      required: true,
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description: 'Icon element rendered inside the button. An Astryx Icon with no explicit size defaults to sm for sm/md buttons and md for lg buttons.',
      required: true,
      slotElements: [{__element: 'Icon', props: {icon: 'check'}}],
    },
    {
      name: 'variant',
      type: "\'primary\' | \'secondary\' | \'ghost\' | \'destructive\'",
      description: 'Visual style variant.',
      default: "\'secondary\'",
    },
    {
      name: 'size',
      type: "\'sm\' | \'md\' | \'lg\'",
      description: 'Size variant.',
      default: "\'md\'",
    },
    {
      name: 'elevation',
      type: "'none' | 'low' | 'med' | 'high'",
      description:
        'Resting shadow depth. The most common FAB shape is an icon-only button, so raise it with `low`/`med`/`high` for a floating action button. `none` is the default flat button.',
      default: "'none'",
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description: 'Shows a loading spinner and blocks re-activation while staying focusable (aria-busy + aria-disabled, not native disabled).',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Disables the button.',
      default: 'false',
    },
    {
      name: 'tooltip',
      type: 'string',
      description: 'Tooltip text shown on hover.',
    },
    {
      name: 'onClick',
      type: '(e: MouseEvent) => void',
      description: 'Standard click handler.',
    },
    {
      name: 'clickAction',
      type: '(e: MouseEvent) => void | Promise<void>',
      description: 'Async click handler with automatic loading state.',
    },
  ],

  usage: {
    description: 'A button that shows only an icon with no visible text. Use IconButton in toolbars, table rows, and compact UI where space is tight and the icon is universally understood.',
    accessibility: [
      {
        name: 'Essential icon or spinner arc',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: '3:1',
        states: ['Rest', 'Hover', 'Pointer down', 'Loading'],
        description:
          'IconButton has no visible label. Its icon must have at least 3:1 contrast with the button background in Rest, Hover, and Pointer down. The moving spinner arc must also meet 3:1 while loading.',
      },
      {
        name: 'Visible control boundary',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: '3:1 if needed',
        states: ['Rest'],
        description:
          'The button edge needs 3:1 contrast only when users need it to see the control.',
      },
      {
        name: 'Keyboard focus indicator',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: '3:1',
        states: ['Focus visible'],
        description:
          'The focus outline must have at least 3:1 contrast with the area around the button. Check the red outline on destructive buttons too.',
      },
      {
        name: 'Disabled appearance',
        category: 'Color contrast',
        criterion: '1.4.3 and 1.4.11 exceptions',
        requirement: 'Not required',
        states: ['Disabled'],
        description:
          'Disabled controls do not need to meet these contrast ratios.',
      },
    ],
    bestPractices: [
      { guidance: true, description: 'Make the aria-label specific: a trash icon labeled "Delete conversation" is clearer than just "Delete" for screen readers.' },
      { guidance: true, description: 'Add a tooltip: even a gear icon can mean Settings, Preferences, or Configure.' },
      { guidance: true, description: 'Use ghost in toolbars and dense areas to reduce visual clutter.' },
      { guidance: false, description: 'Use IconButton if the action isn\'t obvious from the icon alone; use Button with text.' },
      { guidance: false, description: 'Skip the tooltip; label only reaches screen readers, sighted users need the hover hint.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'Button showing only an icon, no visible text. Use in toolbars, table rows, compact UI where space is tight + icon universally understood.',
  usage: {
    description: 'Button showing only an icon, no visible text. Use in toolbars, table rows, compact UI where space is tight + icon universally understood.',
    bestPractices: [
      { guidance: true, description: 'Make aria-label specific: trash icon labeled "Delete conversation" > just "Delete" for screen readers.' },
      { guidance: true, description: 'Add tooltip: even gear icon can mean Settings/Preferences/Configure.' },
      { guidance: true, description: 'Use ghost in toolbars + dense areas to reduce visual clutter.' },
      { guidance: false, description: "Use IconButton if action isn't obvious from icon alone; use Button w/ text instead." },
      { guidance: false, description: 'Skip tooltip: label only reaches screen readers; sighted users need hover hint.' },
    ],
  },
  propDescriptions: {
    label: 'accessible label; used as aria-label, not rendered as visible text',
    icon: 'icon element rendered inside button; unsized Astryx Icon defaults to sm for sm/md buttons and md for lg',
    variant: 'visual style variant',
    size: 'size variant',
    elevation: 'resting shadow depth: none|low|med|high; raise for a floating action button (FAB)',
    isLoading: 'shows loading spinner, blocks re-activation but stays focusable (aria-disabled, not native disabled)',
    isDisabled: 'disables button',
    tooltip: 'tooltip text shown on hover',
    onClick: 'standard click handler',
    clickAction: 'async click handler w/ automatic loading state',
  },
};
