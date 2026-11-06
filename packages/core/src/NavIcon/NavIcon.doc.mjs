// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Container',
    required: true,
    description: 'Circular painted container for the supplied icon.',
  },
  {
    name: 'Icon',
    required: true,
    description:
      'Caller-supplied visual content rendered inside the container.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'NavIcon',
  displayName: 'Nav Icon',
  group: 'Navigation',
  category: 'Navigation',
  isHiddenFromOverview: true,
  hidden: false,
  keywords: [
    'navicon',
    'iconbutton',
    'toolbar icon',
    'appbar icon',
    'nav button',
  ],
  props: [
    {
      name: 'icon',
      type: 'ReactNode',
      description:
        'The icon element to render inside the circular background. Should be an Icon or similar icon component.',
      required: true,
      slotElements: [{__element: 'Icon', props: {icon: 'check', size: 'sm'}}],
    },
  ],
  theming: {
    targets: [{className: 'astryx-nav-icon'}],
  },
  usage: {
    anatomy,
    description:
      'NavIcon is a circular icon container with an accent-colored background. Use it in navigation headers such as TopNavHeading and PageNavHeader to visually identify a section or application.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use in navigation headers to provide a recognizable visual anchor for the section.',
      },
      {
        guidance: true,
        description:
          'Pass an Icon or similarly sized icon component to ensure proper proportions.',
      },
      {
        guidance: false,
        description:
          'Use NavIcon for interactive purposes; it is a display-only container, not a button.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'NavIcon',
  displayName: 'Nav Icon',
  props: [
    {
      name: 'icon',
      type: 'ReactNode',
      description: '在圆形背景内渲染的图标元素。应为 Icon 或类似的图标组件。',
      required: true,
    },
  ],
  theming: {
    targets: [{className: 'astryx-nav-icon'}],
  },
  usage: {
    anatomy,
    description:
      'NavIcon is a circular icon container with an accent-colored background. Use it in navigation headers such as TopNavHeading and PageNavHeader to visually identify a section or application.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use in navigation headers to provide a recognizable visual anchor for the section.',
      },
      {
        guidance: true,
        description:
          'Pass an Icon or similarly sized icon component to ensure proper proportions.',
      },
      {
        guidance: false,
        description:
          'Use NavIcon for interactive purposes; it is a display-only container, not a button.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Circular icon container w/ accent background for navigation headers.',
  usage: {
    anatomy,
    description:
      'NavIcon is a circular icon container with an accent-colored background. Use it in navigation headers such as TopNavHeading and PageNavHeader to visually identify a section or application.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use in navigation headers to provide a recognizable visual anchor for the section.',
      },
      {
        guidance: true,
        description:
          'Pass an Icon or similarly sized icon component to ensure proper proportions.',
      },
      {
        guidance: false,
        description:
          'Use NavIcon for interactive purposes; it is a display-only container, not a button.',
      },
    ],
  },
  propDescriptions: {
    icon: 'Icon element inside circular background. Should be Icon or similar.',
  },
};
