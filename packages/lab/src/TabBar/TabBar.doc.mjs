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
    'minimize on scroll',
    'bottom accessory',
    'mini player',
    'search tab',
    'more tab',
    'overflow tabs',
  ],
  description:
    "The bottom tab bar of a phone app, as on iOS 26: the app's top-level sections as a floating capsule above the bottom edge, with a selection lens that slides to the chosen tab. Each tab has an icon, a label and an optional badge. Under a finger, on iOS and Android alike, it behaves like iOS 26's: the lens lifts into glass as a finger lands, follows a finger dragged across the tabs and settles on the tab nearest where it lifts, while the bar flexes; under a mouse or a pen, a click chooses a tab and the lens follows the theme's motion, and a press dragged across the tabs carries the lens and chooses the tab where it is released. Under a finger it can also collapse into a small circle while the page scrolls down. It can hold a search tab apart at its trailing end. Choosing the selected tab again is reported separately, so a screen can return to its root as iOS does. Experimental: lands in lab first.",
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
            "Called with the selected tab's value when it is chosen again. On iOS this returns the tab's navigation stack to its root (NavigationStack's popToRoot); a screen already at its root stays where it is.",
        },
        {
          name: 'label',
          type: 'string',
          description:
            'Names the tab bar for assistive technology. Without it, or aria-label or aria-labelledby (which win over it and reach the tab list), the tab list is named "Tabs" in the reader\'s language.',
        },
        {
          name: 'minimizeBehavior',
          type: "'never' | 'onScrollDown'",
          description:
            "With 'onScrollDown', scrolling the page down collapses the bar into a small circle at its leading end that holds the selected tab's icon, keeping the content in view, as iOS's tab bar does. Scrolling back up leaves it collapsed; reaching the top of the page or activating the circle expands it. Collapsed, the circle is the bar's one element for assistive technology, named after the selected tab and collapsed, as on iOS; with a search tab, that tab stays in reach beside the circle, and focusing it expands the bar. Only under a finger: a mouse-driven bar stays expanded.",
          default: "'never'",
        },
        {
          name: 'bottomAccessory',
          type: "ReactNode | ((placement: 'expanded' | 'inline') => ReactNode)",
          description:
            "A bottom accessory, such as a music player's now-playing bar: a 48 px capsule as wide as the bar, 8 px above it. When the bar minimizes it moves down inline beside the circle and gets narrower; pass a function to adapt its content to where it is (placement is 'inline' there). Leave 56 px more room at the bottom of the scrolling content, and declare the whole stack on LayerProvider (inset={{blockEnd: 139}}: the bar's 83 px and the accessory's 56) so menus, popovers and toasts clear the accessory too.",
        },
        {
          name: 'children',
          type: 'ReactNode',
          description:
            'The tabs: TabBarItem elements, in order, as direct children, and at most one TabBarSearchTab. With more than five, the bar shows the first four and a More tab that holds the rest.',
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
          name: 'isDisabled',
          type: 'boolean',
          description:
            'Shows the tab dimmed and keeps it from being chosen: a tap, the arrow keys and a lift of the lens over it leave the selection as it is.',
          default: 'false',
        },
      ],
    },
    {
      name: 'TabBarMoreList',
      displayName: 'Tab Bar More List',
      description:
        "The More tab's screen, as on iOS: one row per tab past the fourth, with its icon, its label and a disclosure chevron. Give it the same TabBarItem children as TabBar. Rearranging the tabs (iOS's Edit) is not available yet.",
      props: [
        {
          name: 'children',
          type: 'ReactNode',
          description: 'The same TabBarItem elements given to TabBar.',
          required: true,
        },
        {
          name: 'onChoose',
          type: '(value: string) => void',
          description:
            "Called with a row's value when it is chosen: show that section inside More, which stays selected in the bar.",
          required: true,
        },
        {
          name: 'value',
          type: 'string',
          description: "The selected tab's value: its row reads as selected.",
        },
      ],
    },
    {
      name: 'TabBarSearchTab',
      displayName: 'Tab Bar Search Tab',
      description:
        'The search tab, as on iOS 26: a circle as tall as the bar at its trailing end, apart from the other tabs, which share a narrower capsule. Choosing it selects it like any tab, collapses the bar to a circle holding the tab it was chosen from (a tap on that circle returns there) and shows its field in the bar; by default the same tap activates the field and focuses it, which raises the keyboard on a phone. Active, the field spans the screen but for a Cancel button drawn over the search circle (the circle stays a tab, out of reach while the field is active); on a phone both sit above the keyboard. Under a mouse it selects in place: the bar stays expanded and the field shows at once above it, focused, where the bottom accessory sits; Escape returns to the tab it was chosen from. TabBar reads its props and draws it; it renders nothing on its own.',
      props: [
        {
          name: 'value',
          type: 'string',
          description:
            'Identifies the search tab in value, onChange and onReselect.',
          required: true,
        },
        {
          name: 'label',
          type: 'string',
          description:
            'The tab\'s name for assistive technology, such as "Search".',
          required: true,
        },
        {
          name: 'icon',
          type: 'ReactNode',
          description: 'The search glyph, an Icon at size lg.',
          required: true,
        },
        {
          name: 'children',
          type: 'ReactNode',
          description:
            'The search field: a SearchField with placement="tab", which draws the search landmark. It stays mounted, hidden and inert until the search tab is chosen, so the tap can focus it.',
        },
        {
          name: 'isActive',
          type: 'boolean',
          description:
            'Whether the field is active: widened to span the screen, with the keyboard up on a phone.',
        },
        {
          name: 'onActiveChange',
          type: '(isActive: boolean) => void',
          description:
            'Called with true when the tap that chooses the search tab activates its field, and with false when another tab is chosen while the search tab is selected (a tap on it, the leading circle, or Escape under a mouse) and when Cancel ends search for a field without a cancel method. Under a mouse, a Cancel button you draw sets isActive false itself.',
        },
        {
          name: 'fieldRef',
          type: 'RefObject<{focus(options?: FocusOptions): void; blur(): void; cancel?(): void} | null>',
          description:
            "The field's handle, focused by the tap that activates it (with preventScroll: the field rises above the keyboard itself), and cancelled by the cancel button when it has a cancel method (SearchField's handle does); without one the cancel button calls onActiveChange(false). An input element works.",
        },
        {
          name: 'automaticallyActivates',
          type: 'boolean',
          description:
            'Whether choosing the search tab activates its field at once. When false, the field waits inline in the bar until it is tapped.',
          default: 'true',
        },
      ],
    },
  ],
  usage: {
    description:
      "Use TabBar to switch between an app's three to five top-level sections on a phone, each keeping its own state and navigation stack. Put a NavigationStack in each section and pop it to its root in onReselect.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep every tab visible and the set stable; give each a short label and an outline icon with a filled selectedIcon.',
      },
      {
        guidance: true,
        description:
          'Use a badge for something that needs attention in that section, such as unread items, and say what it counts in badgeLabel.',
      },
      {
        guidance: true,
        description:
          'Use minimizeBehavior="onScrollDown" on screens people read or scroll through at length, such as feeds and articles, so the content gets the space.',
      },
      {
        guidance: true,
        description:
          'Use bottomAccessory for one persistent control that belongs to the whole app, such as what is playing; keep it to a line, and drop secondary controls when its placement is inline.',
      },
      {
        guidance: true,
        description:
          'Add a TabBarSearchTab when search is a section of the app on its own; cancel should return to the tab it was chosen from.',
      },
      {
        guidance: true,
        description:
          'Keep to five tabs where you can; with more, put the sections people use most first, since the rest move into More.',
      },
      {
        guidance: false,
        description:
          "Don't disable a tab to say its section is empty; show the empty section instead, and keep disabled tabs rare.",
      },
      {
        guidance: false,
        description:
          "Don't use it for actions, for filters within one screen (use SegmentedControl) or for tabs inside a page (use TabList).",
      },
    ],
  },
};
