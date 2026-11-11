// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The preview's Overview page: a compact page of what themes most
 * often break, so a bad contrast, a clipped label or an unreadable small
 * size shows at once. Long and short text, every text level on every
 * surface, every button variant and size with disabled and loading, inputs
 * in their states, selected navigation, badges and status per status, a
 * striped table with a truncating cell, an open popover, and the smallest
 * and biggest sizes.
 *
 * @input Nothing: fixed element trees with Core names.
 * @output OVERVIEW_SECTIONS, each a title and an element tree.
 * @position api/theme-edit — imported by _preview.mjs
 */

/** @typedef {import('./_catalog.mjs').Tree} Tree */

/** @param {string} name @param {Record<string, unknown>} [props] @param {...unknown} children @returns {Tree} */
const h = (name, props = {}, ...children) => ({
  __element: name,
  props,
  ...(children.length ? {children} : {}),
});

const noop = {__code: '() => {}'};
const STATUSES = ['info', 'success', 'warning', 'error'];
const LONG =
  'A long heading that has to wrap onto a second line on most screens, so line height and wrapping show';

/** One surface with every text level on it. @param {Record<string, unknown>} props @param {string} name */
const surface = (props, name) =>
  h(
    'Card',
    {...props, minHeight: 120},
    h(
      'VStack',
      {gap: 1},
      h('Text', {type: 'label'}, name),
      h('Text', {type: 'body'}, 'Body text reads on this surface.'),
      h('Text', {type: 'supporting'}, 'Supporting text, the smallest level.'),
      h('Link', {href: '#'}, 'A link'),
    ),
  );

const ROWS = [
  {
    id: 1,
    task: 'Review the quarterly roadmap with every team lead before the planning offsite next week',
    owner: 'Alex',
    status: 'In progress',
  },
  {id: 2, task: 'Ship onboarding', owner: 'Sam', status: 'Done'},
  {id: 3, task: 'Fix login timeout', owner: 'Riley', status: 'Blocked'},
  {id: 4, task: 'Audit color contrast', owner: 'Jordan', status: 'Planned'},
];

/** @type {Array<{title: string, tree: Tree}>} */
export const OVERVIEW_SECTIONS = [
  {
    title: 'Open layers',
    // First on the page, so the layers open below their anchors on load,
    // into space kept free for them: each anchor's cell keeps room for its
    // layer, so nothing sits under one, side by side or stacked.
    tree: h(
      'Card',
      {variant: 'transparent'},
      h(
        'Grid',
        {columns: {minWidth: 280, repeat: 'fit'}, gap: 4},
        h(
          'Card',
          {variant: 'transparent', minHeight: 150},
          h(
            'Popover',
            {
              isOpen: true,
              label: 'Menu',
              placement: 'below',
              content: h(
                'VStack',
                {gap: 1},
                h('Text', {type: 'label'}, 'A popover shown open'),
                h('Button', {label: 'Rename', variant: 'ghost', size: 'sm'}),
                h('Button', {label: 'Delete', variant: 'ghost', size: 'sm'}),
              ),
            },
            h('Button', {label: 'Anchor', variant: 'secondary'}),
          ),
        ),
        h(
          'Card',
          {variant: 'transparent', minHeight: 150},
          h(
            'Tooltip',
            {isOpen: true, placement: 'below', content: 'A tooltip shown open'},
            h('Button', {label: 'Tooltip anchor', variant: 'secondary'}),
          ),
        ),
      ),
    ),
  },
  {
    title: 'Type',
    tree: h(
      'VStack',
      {gap: 2},
      h('Heading', {level: 1, type: 'display-1'}, 'Display'),
      h('Heading', {level: 1}, LONG),
      h('Heading', {level: 2}, 'Heading 2'),
      h('Heading', {level: 3}, 'Heading 3'),
      h('Text', {type: 'large'}, 'Large text for introductions.'),
      h(
        'Text',
        {type: 'body'},
        'Body text: the quick brown fox jumps over the lazy dog. Numbers 0123456789.',
      ),
      h('Text', {type: 'label'}, 'Label text'),
      h('Text', {type: 'supporting'}, 'Supporting text, the smallest size'),
      h('Text', {type: 'code'}, 'const code = true;'),
    ),
  },
  {
    title: 'Surfaces',
    tree: h(
      'Grid',
      {columns: {minWidth: 200, repeat: 'fit'}, gap: 3},
      surface({}, 'Card'),
      surface({variant: 'muted'}, 'Muted card'),
      surface({variant: 'blue'}, 'Colored card'),
      surface({variant: 'transparent'}, 'Page surface'),
    ),
  },
  {
    title: 'Buttons',
    tree: h(
      'VStack',
      {gap: 2},
      ...['sm', 'md', 'lg'].map(size =>
        h(
          'HStack',
          {gap: 2, align: 'center', wrap: 'wrap'},
          ...['primary', 'secondary', 'ghost', 'destructive'].map(variant =>
            h('Button', {label: `${variant} ${size}`, variant, size}),
          ),
        ),
      ),
      h(
        'HStack',
        {gap: 2, align: 'center', wrap: 'wrap'},
        h('Button', {label: 'Disabled', variant: 'primary', isDisabled: true}),
        h('Button', {
          label: 'Disabled',
          variant: 'secondary',
          isDisabled: true,
        }),
        h('Button', {label: 'Loading', variant: 'primary', isLoading: true}),
        h('Button', {
          label: 'A very long button label that must truncate',
          variant: 'secondary',
          width: 180,
        }),
      ),
    ),
  },
  {
    title: 'Inputs',
    tree: h(
      'Grid',
      {columns: {minWidth: 220, repeat: 'fit'}, gap: 3},
      h('TextInput', {label: 'Default', value: 'Jordan Lee'}),
      h('TextInput', {
        label: 'Placeholder',
        value: '',
        placeholder: 'Type to search',
      }),
      h('TextInput', {
        label: 'Error',
        value: 'not-an-email',
        status: {type: 'error', message: 'Enter a valid email address'},
      }),
      h('TextInput', {label: 'Disabled', value: 'Read only', isDisabled: true}),
      h('Selector', {
        label: 'Selector',
        value: 'week',
        options: [
          {value: 'day', label: 'Day'},
          {value: 'week', label: 'Week'},
          {value: 'month', label: 'Month'},
        ],
        onChange: noop,
      }),
      h(
        'VStack',
        {gap: 2},
        h('CheckboxInput', {label: 'Checked', value: true, onChange: noop}),
        h('CheckboxInput', {label: 'Unchecked', value: false, onChange: noop}),
        h('Switch', {label: 'On', value: true, onChange: noop}),
        h('Switch', {label: 'Off', value: false, onChange: noop}),
      ),
      h(
        'RadioList',
        {label: 'Radio', value: 'a', onChange: noop},
        h('RadioListItem', {value: 'a', label: 'Selected'}),
        h('RadioListItem', {value: 'b', label: 'Other'}),
        h('RadioListItem', {value: 'c', label: 'Disabled', isDisabled: true}),
      ),
    ),
  },
  {
    title: 'Navigation',
    tree: h(
      'VStack',
      {gap: 3},
      h(
        'TopNav',
        {label: 'Top', heading: 'App'},
        h('TopNavItem', {label: 'Selected', href: '#', isSelected: true}),
        h('TopNavItem', {label: 'Other', href: '#'}),
        h('TopNavItem', {label: 'Another', href: '#'}),
      ),
      h(
        'TabList',
        {value: 'a'},
        h('Tab', {value: 'a', label: 'Selected tab'}),
        h('Tab', {value: 'b', label: 'Other tab'}),
        h('Tab', {value: 'c', label: 'Third tab'}),
      ),
      h(
        'SegmentedControl',
        {label: 'Range', value: 'b', onChange: noop},
        h('SegmentedControlItem', {value: 'a', label: 'Day'}),
        h('SegmentedControlItem', {value: 'b', label: 'Week'}),
        h('SegmentedControlItem', {value: 'c', label: 'Month'}),
      ),
      h(
        'SideNav',
        {label: 'Side'},
        h('SideNavItem', {label: 'Selected item', href: '#', isSelected: true}),
        h('SideNavItem', {label: 'Other item', href: '#'}),
      ),
    ),
  },
  {
    title: 'Status',
    tree: h(
      'VStack',
      {gap: 3},
      h(
        'HStack',
        {gap: 2, align: 'center', wrap: 'wrap'},
        h('Badge', {variant: 'neutral', label: 'Neutral'}),
        ...STATUSES.map(s =>
          h('Badge', {variant: s, label: s[0].toUpperCase() + s.slice(1)}),
        ),
      ),
      h(
        'HStack',
        {gap: 3, align: 'center', wrap: 'wrap'},
        ...['success', 'warning', 'error', 'accent', 'neutral'].map(v =>
          h('StatusDot', {variant: v, label: v}),
        ),
      ),
      ...STATUSES.map(s =>
        h('Banner', {
          status: s,
          title: `A ${s} banner`,
          description: 'Its text must read on its tinted fill.',
          collapsible: false,
        }),
      ),
      h(
        'HStack',
        {gap: 3, align: 'center'},
        ...['accent', 'success', 'warning', 'error'].map(v =>
          h('ProgressBar', {label: v, variant: v, value: 60, width: 120}),
        ),
        h('Spinner', {size: 'md'}),
      ),
    ),
  },
  {
    title: 'Table',
    tree: h('Table', {
      data: ROWS,
      idKey: 'id',
      dividers: 'rows',
      textOverflow: 'truncate',
      columns: [
        {key: 'task', header: 'Task (truncates)'},
        {key: 'owner', header: 'Owner'},
        {key: 'status', header: 'Status'},
      ],
    }),
  },
];
