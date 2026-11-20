// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useLinkComponent',
  displayName: 'useLinkComponent',
  group: 'Link',
  keywords: [
    'link',
    'router',
    'client-side routing',
    'LinkProvider',
    'as',
    'polymorphic',
    'anchor',
    'nextjs',
    'href',
  ],
  params: [
    {
      name: 'as',
      type: 'LinkComponentType',
      description:
        "Component to render the link with, such as a router's link or 'a'. When set it wins over any LinkProvider.",
      required: false,
    },
  ],
  returns: [
    {
      name: 'LinkComponent',
      type: 'LinkComponentType',
      description:
        "The resolved component: as, else the nearest LinkProvider's component, else a native 'a'. It is stable while the resolved component is the same. It checks href and to under the Link href rule before rendering; when either is rejected it renders an anchor with no destination and never invokes the router. A custom component receives to={href} unless an explicit to is passed.",
    },
  ],
  usage: {
    description:
      "Resolves which component renders a link, so a custom component's links follow the app's router the same way Astryx's own links do. The order is the as argument, then the nearest LinkProvider's component, then a native anchor. Render the returned component with href (and to, for a router that reads it). Before rendering it checks both destinations under the Link href rule: a rejected destination renders an anchor with no destination, and a custom router is never invoked with it. A custom component receives to={href} unless to is passed explicitly.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Use it for links inside a custom component, so a LinkProvider wired to the router reaches them without a prop on every link.',
      },
      {
        guidance: true,
        description:
          "Pass as='a' for a destination the router cannot handle, such as a file download or a page outside the app.",
      },
      {
        guidance: false,
        description:
          "Import the router's link directly in a shared component; the component then ignores LinkProvider and the destination check.",
      },
    ],
  },
  relatedComponents: ['Link', 'LinkProvider'],
  relatedHooks: ['useLinkify'],
  importPath: '@astryxdesign/core/Link',
  category: 'utilities',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "Resolves which component renders a link: as arg, else nearest LinkProvider's component, else native anchor. Custom components' links follow the app router like Astryx links. Checks href/to under the Link href rule: rejected => anchor with no destination, router never invoked. Custom components get to={href} unless to given.",
  paramDescriptions: {
    as: "component to render the link with (router link or 'a'); wins over LinkProvider.",
  },
  returnDescriptions: {
    LinkComponent:
      "resolved component (as, else LinkProvider, else 'a'); stable per resolved component. Checks href/to first; rejected => anchor w/o destination, no router call. Custom components get to={href} unless to given.",
  },
  usage: {
    description:
      'Resolves the link component: as, else nearest LinkProvider, else native anchor. Render it with href (and to). Rejected destinations render an anchor w/o destination, never invoking the router. Custom components get to={href} unless to given.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for links inside custom components so a router LinkProvider reaches them.',
      },
      {
        guidance: true,
        description:
          "Pass as='a' for destinations the router cannot handle (downloads, pages outside the app).",
      },
      {
        guidance: false,
        description:
          'Import the router link directly in shared components; that skips LinkProvider and the destination check.',
      },
    ],
  },
};
