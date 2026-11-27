// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'SelectableCard',
  displayName: 'Selectable Card',
  group: 'Card',
  category: 'Container',
  keywords: ['card', 'selectable', 'toggle', 'checkbox', 'radio', 'selection'],
  usage: {
    description: 'A card that toggles between selected and unselected states with an accent border. For navigation use ClickableCard.',
    bestPractices: [
      {guidance: true, description: 'Use for multi-select choices: filter chips, feature add-ons, or option grids where several can be on.'},
      {guidance: true, description: 'Use for multi-select groups; track the selected IDs in a Set.'},
      {guidance: true, description: 'When focused, toggle selection with Space or Enter.'},
      {guidance: false, description: 'Use for navigation; use ClickableCard for that.'},
      {guidance: false, description: 'Build a single-select group from standalone cards: each one is a checkbox, so assistive technology announces a multi-select group with one tab stop per card. Give each card a `value` inside a SelectableCardGroup instead.'},
    ],
    anatomy: [
      {name: 'Container', required: true, description: 'Interactive div with accent border on selection.'},
      {name: 'Content', required: true, description: 'Children rendered inside the card.'},
    ],
  },
  props: [
    {name: 'label', type: 'string', description: 'Accessibility label.', required: true},
    {name: 'isSelected', type: 'boolean', description: 'Controlled selection state. Required for a standalone card; a card with a `value` takes it from its group instead.'},
    {name: 'onChange', type: '(isSelected: boolean) => void', description: 'Called when toggled. Required for a standalone card; a card with a `value` asks its group instead.'},
    {name: 'value', type: 'string', description: "The value this card stands for in a SelectableCardGroup's `value`. It makes the card a member of the group around it, in place of `isSelected` and `onChange`: the group gives the card its selection, a radio or checkbox input, and its disabled default."},
    {name: 'isDisabled', type: 'boolean', description: 'Disables the card. In a SelectableCardGroup, a disabled group disables every card, and an enabled group does not enable a card that disables itself.', default: 'false'},
    {name: 'children', type: 'ReactNode', description: 'Card content.'},
    {name: 'padding', type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10', description: 'Inner padding.', default: '4'},
    {name: 'variant', type: "'default' | 'transparent' | 'muted' | 'blue' | 'cyan' | 'gray' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'yellow'", description: 'Background color variant.', default: "'default'"},
    {name: 'elevation', type: "'none' | 'low' | 'med' | 'high'", description: 'Resting shadow depth. The selection ring composes on top, so a selected card keeps its shadow.', default: "'none'"},
    {name: 'width', type: 'SizeValue', description: 'Card width.'},
    {name: 'height', type: 'SizeValue', description: 'Card height.'},
    {name: 'maxWidth', type: 'SizeValue', description: 'Maximum card width.'},
    {name: 'xstyle', type: 'StyleXStyles', description: 'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.'},
  ],
  theming: {
    container: true,
    targets: [{className: 'astryx-selectable-card', visualProps: ['selected', 'variant']}],
    vars: [
      {name: '--selectable-card-ring-color', description: 'Colour of the selection ring drawn for a variant a theme added. The built-in variants each ring in their own border token and ignore this; a theme that adds a variant sets it in the same rule as that variant\'s `backgroundColor`, because no token the component could pick is guaranteed to contrast with a fill it cannot know.', default: 'var(--color-accent)'},
      {name: '--_press-overlay', description: 'Colour of the ::after interaction overlay for the hover and mouse states: transparent at rest, the hover overlay token on hover (hover-capable pointers), the pressed overlay token while a mouse holds `:active`. A press the touch press controller paints (`data-astryx-press`) is the overlay\'s image instead, at the press\'s strength, and the colour yields to it. Set on the card element by its own interaction arms.', default: 'transparent', private: true},
    ],
  },
  playground: {
    defaults: {
      label: 'Pro plan',
      isSelected: true,
      padding: 4,
      children: {
        __element: 'XDSVStack',
        props: {gap: 1},
        children: [
          {__element: 'XDSHeading', props: {level: 3}, children: 'Pro plan'},
          {__element: 'XDSText', props: {type: 'body'}, children: '$29/month, unlimited projects and priority support.'},
        ],
      },
    },
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'Card toggling between selected/unselected states w/ accent border. For navigation use ClickableCard instead.',
  usage: {
    description: 'Card toggling between selected/unselected states w/ accent border. For navigation use ClickableCard instead.',
    bestPractices: [
      {guidance: true, description: 'Use for multi-select choices: filter chips, add-ons, option grids.'},
      {guidance: true, description: 'Use for multi-select groups; track selected IDs in a Set.'},
      {guidance: true, description: 'When focused, toggle selection with Space or Enter.'},
      {guidance: false, description: 'Use for navigation; use ClickableCard instead.'},
      {guidance: false, description: 'Build single-select from standalone cards: each is a checkbox, so screen readers announce multi-select. Use a SelectableCardGroup of cards w/ `value` instead.'},
    ],
  },
  propDescriptions: {
    label: 'accessibility label',
    isSelected: 'controlled selection state; required standalone, from the group w/ value',
    onChange: 'called when toggled; required standalone',
    value: 'joins the SelectableCardGroup around it: the group owns selection, input type, disabled default',
    isDisabled: 'disables card; a disabled group disables every card',
    padding: 'inner padding',
    variant: 'background color variant',
    elevation: 'resting shadow depth: none|low|med|high; selection ring composes on top',
    width: 'card width',
    height: 'card height',
    maxWidth: 'max card width',
  },
};
