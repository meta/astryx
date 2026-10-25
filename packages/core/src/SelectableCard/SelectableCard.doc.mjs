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
      {guidance: true, description: 'Use for plan pickers, filter chips, or option grids.'},
      {guidance: true, description: 'For single-select track one ID; for multi-select use a Set.'},
      {guidance: true, description: 'When focused, toggle selection with Space or Enter.'},
      {guidance: false, description: 'Use for navigation; use ClickableCard for that.'},
    ],
    anatomy: [
      {name: 'Container', required: true, description: 'Interactive div with accent border on selection.'},
      {name: 'Content', required: true, description: 'Children rendered inside the card.'},
    ],
  },
  props: [
    {name: 'label', type: 'string', description: 'Accessibility label.', required: true},
    {name: 'isSelected', type: 'boolean', description: 'Controlled selection state.', required: true},
    {name: 'onChange', type: '(isSelected: boolean) => void', description: 'Called when toggled.', required: true},
    {name: 'isDisabled', type: 'boolean', description: 'Disables the card.', default: 'false'},
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
      {guidance: true, description: 'Use for plan pickers, filter chips, option grids.'},
      {guidance: true, description: 'For single-select track one ID; for multi-select use a Set.'},
      {guidance: true, description: 'When focused, toggle selection with Space or Enter.'},
      {guidance: false, description: 'Use for navigation; use ClickableCard instead.'},
    ],
  },
  propDescriptions: {
    label: 'accessibility label',
    isSelected: 'controlled selection state',
    onChange: 'called when toggled',
    isDisabled: 'disables card',
    padding: 'inner padding',
    variant: 'background color variant',
    elevation: 'resting shadow depth: none|low|med|high; selection ring composes on top',
    width: 'card width',
    height: 'card height',
    maxWidth: 'max card width',
  },
};
