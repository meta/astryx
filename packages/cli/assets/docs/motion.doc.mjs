// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  name: 'motion',
  title: 'Motion',
  category: 'foundations',
  description: 'Duration and easing tokens for animations and transitions.',
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
          text: "At the same time, well-tuned motion gives an application a sense of craft and polish that users notice, even if they can't name it.",
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
          text: "Table row hovers. List item highlights. Anything the user does dozens of times per minute. Adding perceptible duration to these interactions makes the interface feel like it's catching up to the cursor. Keep these fast enough that the user never notices a delay.",
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
            "Not everything needs an animated exit. Elements the user is moving away from, such as tooltips, hover cards, and dropdown menus, can disappear instantly. The user has already shifted their attention. Animate the exit only when it helps orient the user, like a panel closing or a dialog dismissing to reveal what's underneath.",
            'When you do animate exit, match the entrance. A panel that slides in from the right should slide back out to the right.',
            'Direction should match the action. Navigating deeper into content should feel like moving forward. Going back should feel like returning. This keeps the user oriented in the structure of the application.',
            "Contextual UI should feel connected to its trigger. A dropdown should expand from the button that opened it. A popover should appear near the element it describes. This doesn't apply to global UI like command palettes or toasts, which have their own fixed positions.",
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
      id: 'touch-motion',
      title: 'Touch motion in a theme',
      content: [
        {
          type: 'prose',
          text: 'On a touch screen, sheets, alerts, menus, navigation and scrolling play the springs, durations and curves measured from iOS. Each value is a motion role named by its table path, such as `springs.sheetPresent` or `timing.curves.easeInOut`. A theme retunes a role through `motion.springs`, `motion.durations` or `motion.curves`, at its root or in an adaptation rule; a role it leaves alone keeps its measured default.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Retuning touch motion',
          code: `import {defineTheme} from '@astryxdesign/core/theme';

const calmTheme = defineTheme({
  name: 'calm',
  motion: {
    // Any spring vocabulary: {duration, bounce}, {response, dampingRatio}
    // or {mass, stiffness, damping}.
    springs: {'springs.sheetPresent': {duration: 0.6, bounce: 0.1}},
    durations: {'navigation.transitionMs': 300},
  },
  adaptations: {
    rules: [
      // Touch screens outside iOS: a quicker push.
      {
        when: {platform: 'other', pointer: 'coarse'},
        value: {motion: {springs: {'springs.navigationPush': {duration: 0.25, bounce: 0}}}},
      },
    ],
  },
});`,
        },
        {
          type: 'prose',
          text: 'A theme writes one CSS variable per role it sets, `--motion-` followed by the path in kebab case: a spring as its duration and bounce (`0.6s 0.1`), a duration in milliseconds, a curve as `cubic-bezier()`. Components read the variable when a motion starts and fall back to the default when it is empty. Gesture thresholds, the delays that decide whether a touch scrolls or presses, and haptics are not motion roles. The `platform` condition matches iOS and iPadOS browsers (`ios`) or every other browser (`other`).',
        },
        {
          type: 'table',
          headers: ['Role', 'CSS variable', 'Kind', 'Default'],
          rows: [
            // motion-roles:start (generated by scripts/generate-motion-roles.mjs)
            [
              'navigation.transitionMs',
              '--motion-navigation-transition-ms',
              'duration',
              '350ms',
            ],
            ['scroll.bounce', '--motion-scroll-bounce', 'spring', '0.5s 0'],
            [
              'scroll.paging.snap',
              '--motion-scroll-paging-snap',
              'spring',
              '0.5s 0',
            ],
            [
              'springs.actionSheetDismiss',
              '--motion-springs-action-sheet-dismiss',
              'spring',
              '0.274915s 0',
            ],
            [
              'springs.actionSheetPresent',
              '--motion-springs-action-sheet-present',
              'spring',
              '0.274915s 0',
            ],
            [
              'springs.alertDismiss',
              '--motion-springs-alert-dismiss',
              'spring',
              '0.274915s 0',
            ],
            [
              'springs.alertPresent',
              '--motion-springs-alert-present',
              'spring',
              '0.274915s 0',
            ],
            [
              'springs.banner',
              '--motion-springs-banner',
              'spring',
              '0.344144s 0',
            ],
            ['springs.bouncy', '--motion-springs-bouncy', 'spring', '0.5s 0.3'],
            [
              'springs.contextMenuDismiss',
              '--motion-springs-context-menu-dismiss',
              'spring',
              '0.35s 0.15',
            ],
            [
              'springs.contextMenuLift',
              '--motion-springs-context-menu-lift',
              'spring',
              '0.32s 0.2',
            ],
            [
              'springs.interactive',
              '--motion-springs-interactive',
              'spring',
              '0.15s 0.14',
            ],
            [
              'springs.keyboard',
              '--motion-springs-keyboard',
              'spring',
              '0.2667s 1.71163e-8',
            ],
            [
              'springs.menuClose',
              '--motion-springs-menu-close',
              'spring',
              '0.35s 0.15',
            ],
            [
              'springs.menuOpen',
              '--motion-springs-menu-open',
              'spring',
              '0.32s 0.2',
            ],
            [
              'springs.menuReducedMotion',
              '--motion-springs-menu-reduced-motion',
              'spring',
              '0.4s 0',
            ],
            [
              'springs.navigationBarElements',
              '--motion-springs-navigation-bar-elements',
              'spring',
              '0.6s 0',
            ],
            [
              'springs.navigationInteractivePopFinish',
              '--motion-springs-navigation-interactive-pop-finish',
              'spring',
              '0.3s 0.15',
            ],
            [
              'springs.navigationPop',
              '--motion-springs-navigation-pop',
              'spring',
              '0.3s 0',
            ],
            [
              'springs.navigationPush',
              '--motion-springs-navigation-push',
              'spring',
              '0.3s 0',
            ],
            [
              'springs.segmentedThumb',
              '--motion-springs-segmented-thumb',
              'spring',
              '0.3s 0.25',
            ],
            [
              'springs.sheetDetent',
              '--motion-springs-sheet-detent',
              'spring',
              '0.344144s 0',
            ],
            [
              'springs.sheetDismiss',
              '--motion-springs-sheet-dismiss',
              'spring',
              '0.344144s 0',
            ],
            [
              'springs.sheetDismissSwipe',
              '--motion-springs-sheet-dismiss-swipe',
              'spring',
              '0.344144s 0.2',
            ],
            [
              'springs.sheetPresent',
              '--motion-springs-sheet-present',
              'spring',
              '0.344144s 0',
            ],
            [
              'springs.sheetReleaseFast',
              '--motion-springs-sheet-release-fast',
              'spring',
              '0.344144s 0.2',
            ],
            ['springs.smooth', '--motion-springs-smooth', 'spring', '0.5s 0'],
            [
              'springs.snappy',
              '--motion-springs-snappy',
              'spring',
              '0.5s 0.15',
            ],
            [
              'springs.swiftUIDefault',
              '--motion-springs-swift-u-i-default',
              'spring',
              '0.55s 0',
            ],
            [
              'springs.swiftUISpring',
              '--motion-springs-swift-u-i-spring',
              'spring',
              '0.5s 0.175',
            ],
            [
              'springs.switchThumbMove',
              '--motion-springs-switch-thumb-move',
              'spring',
              '0.3s 0.25',
            ],
            [
              'springs.switchThumbStretch',
              '--motion-springs-switch-thumb-stretch',
              'spring',
              '0.35s 0.13',
            ],
            [
              'springs.uikitDefault',
              '--motion-springs-uikit-default',
              'spring',
              '0.344144s 0',
            ],
            [
              'springs.uikitSpringDuration',
              '--motion-springs-uikit-spring-duration',
              'spring',
              '0.5s 0',
            ],
            [
              'timing.curves.caDefault',
              '--motion-timing-curves-ca-default',
              'curve',
              'cubic-bezier(0.25, 0.1, 0.25, 1)',
            ],
            [
              'timing.curves.easeIn',
              '--motion-timing-curves-ease-in',
              'curve',
              'cubic-bezier(0.42, 0, 1, 1)',
            ],
            [
              'timing.curves.easeInOut',
              '--motion-timing-curves-ease-in-out',
              'curve',
              'cubic-bezier(0.42, 0, 0.58, 1)',
            ],
            [
              'timing.curves.easeOut',
              '--motion-timing-curves-ease-out',
              'curve',
              'cubic-bezier(0, 0, 0.58, 1)',
            ],
            [
              'timing.implicitAnimationMs',
              '--motion-timing-implicit-animation-ms',
              'duration',
              '250ms',
            ],
            [
              'timing.keyboardNotificationMs',
              '--motion-timing-keyboard-notification-ms',
              'duration',
              '383.3ms',
            ],
            [
              'timing.navigationBarHideShowMs',
              '--motion-timing-navigation-bar-hide-show-ms',
              'duration',
              '200ms',
            ],
            [
              'timing.press.buttonReleaseMs',
              '--motion-timing-press-button-release-ms',
              'duration',
              '250ms',
            ],
            [
              'timing.press.flashMs',
              '--motion-timing-press-flash-ms',
              'duration',
              '100ms',
            ],
            [
              'timing.press.highlightInMs',
              '--motion-timing-press-highlight-in-ms',
              'duration',
              '0ms',
            ],
            [
              'timing.press.highlightOutMs',
              '--motion-timing-press-highlight-out-ms',
              'duration',
              '200ms',
            ],
            // motion-roles:end
          ],
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
            "Let hover states or high-frequency interactions feel like they're lagging behind the user.",
            'Let animation delay when a user can interact with new content. The transition should complete before (or not block) the next action.',
            "Move elements in ways that contradict where they came from or where they're going.",
          ],
        },
      ],
    },
  ],
};
