// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TabBar',
  displayName: 'Tab Bar',
  category: 'Navigation',
  keywords: [
    'tabbar',
    'tab bar',
    'bottom tabs',
    'bottom navigation',
    'bottom bar',
    'tab bar controller',
    'mobile navigation',
    'app sections',
    'badge',
    'more tab',
    'overflow tabs',
  ],
  description:
    "The bottom tab bar of a phone app, as on iOS 26: the app's top-level sections as a floating capsule above the bottom edge, with a selection lens that slides to the chosen tab. Each tab has an icon, a label and an optional badge. Under a finger, on iOS and Android alike, it behaves like iOS 26's: the lens lifts into glass as a finger lands, follows a finger dragged across the tabs and settles on the tab nearest where it lifts, while the bar flexes; under a mouse, a press is a plain button press: a click chooses a tab and the lens follows the theme's motion. With no tab selected, a held finger highlights the tab under it. Choosing the selected tab again scrolls its panel to the top and is reported separately, so a screen can also return to its root as iOS does. With more than five tabs the bar shows the first four and a More tab, and TabBarMoreList lists the rest. Experimental: lands in lab first.",
  components: [
    {
      name: 'TabBar',
      displayName: 'Tab Bar',
      description:
        "The bar. It sits fixed at the bottom of the viewport, over the page, so leave 83 px of room at the bottom of the scrolling content, and declare it on LayerProvider (inset={{blockEnd: 83}}) so menus, popovers and toasts clear it. You own the selection: pass the selected tab's value and update it in onChange.",
      props: [
        {
          name: 'value',
          type: 'string',
          description: "The selected tab's value.",
          required: true,
        },
        {
          name: 'onChange',
          type: '(value: string) => void',
          description:
            "Called with a tab's value when a different tab is chosen: a finger lifted over it (after a tap or a drag across the bar), a click, or Enter or Space on a focused tab.",
          required: true,
        },
        {
          name: 'onReselect',
          type: '(value: string) => void',
          description:
            "Called with the selected tab's value when it is chosen again, for example to return the tab's navigation stack to its root, as iOS does. On every reselect TabBar also scrolls the tab's panel (panelId) to its top.",
        },
        {
          name: 'label',
          type: 'string',
          description:
            'Names the tab bar for assistive technology. Without it, or aria-label or aria-labelledby (which win over it and reach the tab list), the tab list is named "Tabs" in the reader\'s language.',
        },
        {
          name: 'children',
          type: 'ReactNode',
          description:
            'The tabs: TabBarItem elements, in order, as direct children. With more than five, the bar shows the first four and a More tab that holds the rest.',
          required: true,
        },
        {
          name: 'moreValue',
          type: 'string',
          description:
            "The More tab's value, with more than five tabs. Choosing More calls onChange with it (and onReselect while More holds a tab, to return to its list); More reads as selected while value is moreValue or any tab past the fourth. Render TabBarMoreList while value is moreValue, and a section chosen there inside More's own navigation stack.",
          default: "'more'",
        },
      ],
    },
    {
      name: 'TabBarItem',
      displayName: 'Tab Bar Item',
      description:
        'One tab: its value, label, icon and badge. TabBar reads its props and draws it; it renders nothing on its own.',
      props: [
        {
          name: 'value',
          type: 'string',
          description: 'Identifies the tab in value, onChange and onReselect.',
          required: true,
        },
        {
          name: 'label',
          type: 'string',
          description:
            "The tab's name, shown under its icon. Keep it to one short word.",
          required: true,
        },
        {
          name: 'icon',
          type: 'ReactNode',
          description:
            "The tab's icon, an Icon at size lg. It is drawn in the current text colour, and in the accent colour while selected.",
          required: true,
        },
        {
          name: 'selectedIcon',
          type: 'ReactNode',
          description:
            'The icon while the tab is selected, typically its filled variant. Defaults to icon.',
        },
        {
          name: 'badge',
          type: 'string | number',
          description:
            'A badge over the icon\'s top-trailing corner: a count or a short string such as "!". It appears, changes and disappears without animating. Omit it or pass an empty string for none.',
        },
        {
          name: 'badgeLabel',
          type: 'string',
          description:
            'What assistive technology reads for the badge after the tab\'s label, such as "3 unread". Defaults to the badge itself.',
        },
        {
          name: 'panelId',
          type: 'string',
          description:
            "Id of the panel this tab controls, wired up as aria-controls. Put the same id on the section's panel element. Choosing the selected tab again scrolls that panel to its top: the panel itself when it scrolls, or else the first scroll area inside it.",
        },
        {
          name: 'aria-disabled',
          type: "boolean | 'true' | 'false'",
          description:
            "Disables the tab, as on Core's Tab: it stays focusable but dimmed and is never chosen. A tap, a click or a key on it, or a lift over it, selects nothing, and the arrow keys skip it. A finger that lands on it lifts no lens until it drags or reaches an enabled tab, which the lift then chooses. This differs from iOS on purpose. iOS ignores a touch that starts on a disabled tab, but TabBar follows the action-group rule: the tab you lift on acts.",
        },
      ],
    },
  ],
  usage: {
    description:
      "Use TabBar to switch between an app's three to five top-level sections on a phone, each keeping its own state and navigation stack. Keep each section's navigation stack in the app and return it to its root in onReselect.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep every tab visible and the set stable; give each a short label and an outline icon with a filled selectedIcon.',
      },
      {
        guidance: true,
        description:
          'Keep to five tabs where you can; with more, put the sections people use most first, since the rest move into More.',
      },
      {
        guidance: true,
        description:
          'Use a badge for something that needs attention in that section, such as unread items, and say what it counts in badgeLabel.',
      },
      {
        guidance: true,
        description:
          "Give each tab a panelId naming its section's panel, so assistive technology can associate the two. Put the section's content in a ScrollableArea inside that panel, so choosing the tab again scrolls it to the top.",
      },
      {
        guidance: true,
        description:
          'Disable a tab only while its section cannot open, and keep it in place, so the other tabs do not move.',
      },
      {
        guidance: false,
        description:
          "Don't use it for actions, for filters within one screen (use SegmentedControl) or for tabs inside a page (use TabList).",
      },
    ],
  },
};
