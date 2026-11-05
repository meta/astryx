// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TabList',
  displayName: 'Tab List',
  group: 'Tabs',
  category: 'Navigation',
  keywords: ["tabs","tabbar","tabstrip","navigation","tabpanel","tabgroup","segmented","navtabs","tab"],
  playground: {
    defaults: {
      value: 'tab-1',
    },
  },
  theming: {
    targets: [
      {className: 'astryx-tab-list', visualProps: ['size']},
      {className: 'astryx-tab-strip'},
      {className: 'astryx-tab-scroll-button'},
      {className: 'astryx-tab', states: ['selected']},
      {className: 'astryx-tab-indicator', states: ['selected']},
      {className: 'astryx-tab-menu'},
      {className: 'astryx-tab-menu-dropdown'},
      {className: 'astryx-tab-menu-item'},
    ],
    vars: [
      {name: '--_tab-indicator-bottom', description: 'Vertical offset of the selected-tab indicator from the tab bottom edge. A host that draws its own bottom divider (Toolbar) sets this so the indicator sits on the divider instead of above it.', default: '-1px', private: true},
    ],
  },
  description: 'Tab strip that provides TabListContext (value, onChange, size) to Tab and TabMenu children; a nav landmark, or the WAI-ARIA tabs pattern where role="tablist" asks for it.',
  props: [
    {
      name: 'value',
      type: 'string',
      description: 'The currently selected tab value.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: string) => void',
      description: 'Callback fired when a tab is selected.',
      required: true,
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Size variant applied to all child tabs.',
      default: "'md'",
    },
    {
      name: 'layout',
      type: "'hug' | 'fill'",
      description: "Layout mode for tab sizing. 'hug': each tab hugs its content width. 'fill': tabs stretch equally to fill the container width.",
      default: "'hug'",
    },
    {
      name: 'hasDivider',
      type: 'boolean',
      description: 'Whether to show a bottom border divider under the tab list.',
      default: 'false',
    },
    {
      name: 'isFullBleed',
      type: 'boolean',
      description: "Makes the tab strip escape its parent's container padding, extending to the container's content edges (cancels the nearest padded Layout container's --container-padding-* custom properties with negative margins). The inner strip pads back by the portion of the container inset that is not already supplied by the first or last tab stop, keeping edge labels aligned while a hasDivider underline spans the full content width. Matches Divider's isFullBleed: inline (start/end) edges only; block-edge docking stays with the surrounding layout.",
      default: 'false',
    },
    {
      name: 'role',
      type: 'AriaRole',
      description: "ARIA role for the strip. 'tablist' asks for the WAI-ARIA tabs pattern: role=\"tablist\" / role=\"tab\" and aria-selected, with each tab pointing at the panel it controls via its panelId; only tabs may live in a tablist strip, and an href on a tab is ignored there. Left unset, the strip is a nav landmark marking the current tab with aria-current. Any other value is passed through to the element unchanged.",
    },
    {
      name: 'overflow',
      type: "'auto' | 'scroll' | 'visible'",
      description: "What happens when the tabs are wider than the strip. 'auto' lets the component choose, which today always scrolls. 'scroll' scrolls the tabs horizontally, with edge fades and arrow affordances for pointers that can hover. 'visible' turns overflow handling off and lets the tabs spill out of the strip. The selected tab is always scrolled back into view.",
      default: "'auto'",
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Tab and TabMenu items to render inside the strip.',
      slotElements: [
        {
          __element: 'Tab',
          props: {
            label: 'Tab',
            value: 'tab',
          },
        },
      ],
      required: true,
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
  ],
  components: [
    {name: 'Tab'},
    {name: 'TabMenu'},
  ],
  usage: {
    accessibility: [
      {
        name: 'Tab label',
        category: 'Color contrast',
        criterion: '1.4.3 Contrast (Minimum)',
        requirement: '4.5:1',
        states: ['Rest', 'Hover', 'Pointer down', 'Selected'],
        description:
          'Each label must have at least 4.5:1 contrast with the tab surface behind it. For Hover and Pointer down, measure the final background after the overlay layer is applied.',
      },
    ],
    description:
      'TabList provides tab-style navigation for organizing content into categorized sections. Use it to let users switch between related views without leaving the page. A strip narrower than its tabs scrolls horizontally and keeps the selected tab in view.',
    bestPractices: [
      { guidance: true, description: 'Keep tab labels short and descriptive so users can quickly scan available sections.' },
      { guidance: true, description: 'Leave overflow handling on: a strip narrower than its tabs scrolls, and the selected tab is kept in view. Use TabMenu when you want a curated group of extra options rather than a scrolling strip.' },
      { guidance: true, description: 'When using hasDivider with action buttons alongside tabs, match the Button size to the TabList size (both md, both sm); the divided tab strip reserves space so tabs and same-size buttons align to a shared baseline above the rail.' },
      { guidance: true, description: 'Reach for role="tablist" when the strip switches panels in place, and give each tab a panelId pointing at the panel it opens: that link is how a screen reader gets from a tab to its content. Leave it off for navigation between views.' },
      { guidance: true, description: 'Set isFullBleed to stretch a tab bar inside a padded LayoutHeader, Card, or Section to the container\'s inline content edges, instead of reaching for negative-margin CSS.' },
      { guidance: false, description: 'Use tabs for sequential steps or workflows; use a stepper or wizard pattern instead.' },
      { guidance: false, description: 'Place more than 6–8 visible tabs before the overflow menu; prioritize the most important categories.' },
      { guidance: false, description: 'Confuse TabList with SegmentedControl or ToggleButton. TabList is for navigation between views. SegmentedControl and ToggleButton are input controls: SegmentedControl always has exactly one selected option, while ToggleButton can be toggled on or off.' },
    ],
    anatomy: [
      {name: 'Left Content', required: false, description: 'Most important area; hugs content width.'},
      {name: 'Center-Fill Content', required: false, description: 'Stretches to fill available space.'},
      {name: 'Right Content', required: false, description: 'Hugs content width.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'TabList provides tab-style navigation for organizing content into categorized sections. Use it to let users switch between related views without leaving the page. A strip narrower than its tabs scrolls horizontally and keeps the selected tab in view.',
    bestPractices: [
      { guidance: true, description: 'Keep tab labels short and descriptive so users can quickly scan available sections.' },
      { guidance: true, description: 'Leave overflow handling on: a strip narrower than its tabs scrolls, and the selected tab is kept in view. Use TabMenu when you want a curated group of extra options rather than a scrolling strip.' },
      { guidance: true, description: 'When using hasDivider with action buttons alongside tabs, match the Button size to the TabList size (both md, both sm); the divided tab strip reserves space so tabs and same-size buttons align to a shared baseline above the rail.' },
      { guidance: true, description: 'Reach for role="tablist" when the strip switches panels in place, and give each tab a panelId pointing at the panel it opens: that link is how a screen reader gets from a tab to its content. Leave it off for navigation between views.' },
      { guidance: true, description: 'Set isFullBleed to stretch a tab bar inside a padded LayoutHeader, Card, or Section to the container\'s inline content edges, instead of reaching for negative-margin CSS.' },
      { guidance: false, description: 'Use tabs for sequential steps or workflows; use a stepper or wizard pattern instead.' },
      { guidance: false, description: 'Place more than 6–8 visible tabs before the overflow menu; prioritize the most important categories.' },
      { guidance: false, description: 'Confuse TabList with SegmentedControl or ToggleButton. TabList is for navigation between views. SegmentedControl and ToggleButton are input controls: SegmentedControl always has exactly one selected option, while ToggleButton can be toggled on or off.' },
    ],
    anatomy: [
      {name: 'Left Content', required: false, description: 'Most important area; hugs content width.'},
      {name: 'Center-Fill Content', required: false, description: 'Stretches to fill available space.'},
      {name: 'Right Content', required: false, description: 'Hugs content width.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'Tab strip w/ overflow scrolling; nav landmark by default, WAI-ARIA tabs pattern under role="tablist".',
  usage: {
    description:
      'TabList provides tab-style navigation for organizing content into categorized sections. Use it to let users switch between related views without leaving the page. A strip narrower than its tabs scrolls horizontally and keeps the selected tab in view.',
    bestPractices: [
      { guidance: true, description: 'Keep tab labels short and descriptive so users can quickly scan available sections.' },
      { guidance: true, description: 'Leave overflow handling on: a strip narrower than its tabs scrolls, and the selected tab is kept in view. Use TabMenu when you want a curated group of extra options rather than a scrolling strip.' },
      { guidance: true, description: 'When using hasDivider with action buttons alongside tabs, match the Button size to the TabList size (both md, both sm); the divided tab strip reserves space so tabs and same-size buttons align to a shared baseline above the rail.' },
      { guidance: true, description: 'Reach for role="tablist" when the strip switches panels in place, and give each tab a panelId pointing at the panel it opens: that link is how a screen reader gets from a tab to its content. Leave it off for navigation between views.' },
      { guidance: true, description: 'Set isFullBleed to stretch a tab bar inside a padded LayoutHeader, Card, or Section to the container\'s inline content edges, instead of reaching for negative-margin CSS.' },
      { guidance: false, description: 'Use tabs for sequential steps or workflows; use a stepper or wizard pattern instead.' },
      { guidance: false, description: 'Place more than 6–8 visible tabs before the overflow menu; prioritize the most important categories.' },
      { guidance: false, description: 'Confuse TabList with SegmentedControl or ToggleButton. TabList is for navigation between views. SegmentedControl and ToggleButton are input controls: SegmentedControl always has exactly one selected option, while ToggleButton can be toggled on or off.' },
    ],
    anatomy: [
      {name: 'Left Content', required: false, description: 'Most important area; hugs content width.'},
      {name: 'Center-Fill Content', required: false, description: 'Stretches to fill available space.'},
      {name: 'Right Content', required: false, description: 'Hugs content width.'},
    ],
  },
};
