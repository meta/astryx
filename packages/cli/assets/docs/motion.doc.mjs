// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  name: 'motion',
  title: 'Motion',
  category: 'foundations',
  description:
    'Duration and easing tokens for animations and transitions.',
  tokenCategory: 'duration',

  sections: [
    {
      title: 'Overview',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Motion serves two purposes: it makes interfaces easier to understand, and it makes them more pleasant to use. A panel animating open helps the eye track what changed and where new content sits in the layout. These moments reduce cognitive load and make the interface feel responsive.',
        },
        {
          type: 'prose',
          text: 'At the same time, well-tuned motion gives an application a sense of craft and polish that users notice, even if they can\'t name it.',
        },
        {
          type: 'prose',
          text: 'The design system provides duration and easing tokens that keep these moments consistent across your application.',
        },
      ],
    },
    {
      title: 'Duration',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Nine duration tokens in fast, medium, and slow bands.',
        },
        {
          type: 'token-ref',
          topic: 'tokens',
          section: 'Duration Tokens',
        },
      ],
    },
    {
      title: 'Easing',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'One easing curve, `--ease-standard`.',
        },
        {
          type: 'token-ref',
          topic: 'tokens',
          section: 'Easing Tokens',
        },
      ],
    },
    {
      title: 'Where Motion Helps',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Some parts of the interface benefit from animation. Panels, dialogs, and collapsible sections are disorienting when they appear instantly, so animation gives the eye something to follow. Toasts and notifications need just enough entrance to be noticed without startling. State changes like a switch flipping or a selection highlighting feel more intentional with a brief transition.',
        },
        {
          type: 'prose',
          text: 'The common thread is that these are moments where the user needs to understand what happened.',
        },
      ],
    },
    {
      title: 'Where Motion Hurts',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Table row hovers. List item highlights. Anything the user does dozens of times per minute. Adding perceptible duration to these interactions makes the interface feel like it\'s catching up to the cursor. Keep these fast enough that the user never notices a delay.',
        },
        {
          type: 'prose',
          text: 'Animations that block interaction are worse. If a user has to wait for a panel to finish sliding before they can click something inside it, the animation has become an obstacle. Motion should never stand between the user and their next action.',
        },
      ],
    },
    {
      title: 'Movement Principles',
  category: 'foundations',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Not everything needs an animated exit. Elements the user is moving away from, such as tooltips, hover cards, and dropdown menus, can disappear instantly. The user has already shifted their attention. Animate the exit only when it helps orient the user, like a panel closing or a dialog dismissing to reveal what\'s underneath.',
            'When you do animate exit, match the entrance. A panel that slides in from the right should slide back out to the right.',
            'Direction should match the action. Navigating deeper into content should feel like moving forward. Going back should feel like returning. This keeps the user oriented in the structure of the application.',
            'Contextual UI should feel connected to its trigger. A dropdown should expand from the button that opened it. A popover should appear near the element it describes. This doesn\'t apply to global UI like command palettes or toasts, which have their own fixed positions.',
          ],
        },
      ],
    },
    {
      title: 'Respecting User Preferences',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Some users experience motion sensitivity; animation that feels polished to one person can cause discomfort for another. Astryx components already switch to instant changes when the OS reduced-motion setting is on. Do the same in your own animations with `@media (prefers-reduced-motion: reduce)`.',
        },
      ],
    },
    {
      id: 'usage',
      title: 'Animate with motion tokens',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Set transition durations and easing from the motion tokens, so a theme that retunes motion retunes your animations too.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Applying motion tokens',
          code: `import {durationVars, easeVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  fadeIn: {
    transitionProperty: 'opacity',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  slideUp: {
    transitionProperty: 'transform, opacity',
    transitionDuration: durationVars['--duration-medium'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
});`,
        },
      ],
    },
    {
      title: 'Best Practices',
  category: 'foundations',
      content: [
        {
          type: 'list',
          style: 'do',
          items: [
            'Animate transitions that involve spatial change: panels opening, content expanding, elements entering the screen.',
            'Use fast tokens for small, frequent interactions. Use medium tokens for larger transitions that rearrange the layout.',
            'Honor reduced motion preferences at the OS level.',
          ],
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            'Let hover states or high-frequency interactions feel like they\'re lagging behind the user.',
            'Let animation delay when a user can interact with new content. The transition should complete before (or not block) the next action.',
            'Move elements in ways that contradict where they came from or where they\'re going.',
          ],
        },
      ],
    },
  ],
};
