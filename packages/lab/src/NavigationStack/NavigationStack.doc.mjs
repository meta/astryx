// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'NavigationStack',
  displayName: 'Navigation Stack',
  category: 'Navigation',
  keywords: [
    'navigationstack',
    'navigation stack',
    'stack navigator',
    'drill down',
    'push',
    'pop',
    'back swipe',
    'navigation controller',
    'master detail',
    'mobile navigation',
  ],
  description:
    'Drill-down navigation for phone layouts: each screen pushes the next on top, and Back, the back swipe from the screen edge or from anywhere in the content returns to the previous one. Pushes, pops and the back swipe move like iOS: the new screen slides in from the trailing edge over the old one, which slides a third as far under a light dimming, and a released swipe finishes or springs back depending on how far and how fast it went. A push never waits for its animation: the new screen is usable as soon as it starts sliding in. With Reduce Motion the screens cross-fade instead. Experimental: lands in lab first.',
  components: [
    {
      name: 'NavigationStack',
      displayName: 'Navigation Stack',
      description:
        "The navigator. You own the path: pass the entries pushed on the root screen and update them in onPathChange. The stack renders the root screen and one screen per entry, the top one last, keeps covered screens and their scroll positions alive, and makes them inert. The bar shows the top screen's title, its end content and a round Back button with a chevron, named by the screen it returns to. A push moves focus to the new screen's title; a pop returns it to the control that pushed the screen. Under a finger the bar paints no background and no hairline, as iOS 26's does. Once a screen's content has moved 10px under the bar, a veil of the body colour fades in at the top of that screen. Each screen keeps its own veil through a push, a pop or a back swipe. With a mouse the bar keeps its surface and hairline.",
      props: [
        {
          name: 'root',
          type: 'ReactElement<NavigationScreenProps>',
          description:
            'The root screen, a NavigationScreen. It has no Back button.',
          required: true,
        },
        {
          name: 'path',
          type: 'ReadonlyArray<T>',
          description:
            'The entries pushed on the root, bottom first. Adding one at the end pushes its screen; removing the last pops it; removing several pops straight back to the new top.',
          required: true,
        },
        {
          name: 'onPathChange',
          type: '(path: T[]) => void',
          description:
            'Called with the new path when a screen pushes or pops (useNavigationStack), Back is pressed, or a back swipe is released past the point of no return.',
          required: true,
        },
        {
          name: 'renderScreen',
          type: '(entry: T, index: number) => ReactElement<NavigationScreenProps>',
          description: 'Renders the screen for an entry: a NavigationScreen.',
          required: true,
        },
        {
          name: 'getKey',
          type: '(entry: T, index: number) => string | number',
          description:
            "A stable key per entry, so a screen keeps its state while others are pushed on it. Defaults to the entry's position.",
        },
        {
          name: 'isInteractivePopEnabled',
          type: 'boolean',
          description:
            "Whether the back swipe pops: a sideways drag anywhere in the content, under any pointer (a finger, a pen or a mouse drag), and in a web app opened from the home screen also a finger's swipe from the leading screen edge. In a browser tab that edge stays the browser's own back swipe, and on Android the system back owns both screen edges.",
          default: 'true',
        },
        {
          name: 'label',
          type: 'string',
          description: 'Accessible name of the navigator region.',
        },
      ],
    },
    {
      name: 'NavigationScreen',
      displayName: 'Navigation Screen',
      description:
        "One screen of a NavigationStack: its title, the title Back shows on the screen pushed after it, its end content and its content. Returned by NavigationStack's root and renderScreen; it renders nothing on its own.",
      props: [
        {
          name: 'title',
          type: 'string',
          description:
            'Shown in the bar while the screen is on top, and read first when it arrives.',
          required: true,
        },
        {
          name: 'backTitle',
          type: 'string',
          description:
            'What Back reads on the screen pushed on top of this one. Defaults to title.',
        },
        {
          name: 'titleDisplayMode',
          type: "'large' | 'inline'",
          description:
            "How the title shows. 'large' puts it above the content in a large bold type, scrolling with the content; once it has scrolled under the bar, the bar shows the title instead. Use it for a top-level screen, as iOS does.",
          default: "'inline'",
        },
        {
          name: 'endContent',
          type: 'ReactNode',
          description:
            'Content at the end of the bar while the screen is on top.',
        },
        {
          name: 'children',
          type: 'ReactNode',
          description:
            "The screen's content. It scrolls on its own and keeps its scroll position while covered.",
        },
      ],
    },
  ],
  usage: {
    description:
      'Use NavigationStack for hierarchical drill-down on phones: lists of settings, folders, a list and its detail. Call push from a row with useNavigationStack inside a screen.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Keep the path in the app's state (or the URL) and give entries stable keys, so screens keep their state as the stack changes.",
      },
      {
        guidance: true,
        description:
          "Push from the control the person activated (a row's onClick): focus returns to it when the screen is popped.",
      },
      {
        guidance: false,
        description:
          "Don't use it for top-level sections that people switch between; those are tabs or a sidebar, which keep each section's own stack.",
      },
    ],
  },
};
