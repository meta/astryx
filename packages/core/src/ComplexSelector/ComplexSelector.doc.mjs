// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ComplexSelector.doc.mjs
 * @input ComplexSelector public API and composition contract
 * @output Exports full and dense component documentation
 * @position Core documentation consumed by CLI and Storybook autodocs
 *
 * SYNC: When modified, update ComplexSelector.tsx, tests, and stories.
 */

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Field',
    required: true,
    description:
      'Field shell that provides the label and optional supporting field content.',
  },
  {
    name: 'Trigger',
    required: true,
    description:
      'Control that displays the current value or placeholder and opens the popup.',
  },
  {
    name: 'Icon-rendered start icon',
    required: false,
    description:
      'Optional leading semantic icon or icon component rendered through Icon.',
  },
  {
    name: 'Caller-rendered start content',
    required: false,
    description:
      'Optional arbitrary React content rendered directly at the start of the trigger.',
  },
  {
    name: 'Indicator icon',
    required: true,
    description:
      'Trailing chevron that rotates to reflect whether the popup is open.',
  },
  {
    name: 'Popup',
    required: true,
    description:
      'Mounted dialog surface that is painted and shown while open and hidden while closed.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ComplexSelector',
  displayName: 'Complex Selector',
  group: 'Selector',
  category: 'Form Controls',
  keywords: [
    'selector',
    'picker',
    'popover',
    'dialog',
    'custom',
    'rich',
    'matrix',
    'grid',
  ],
  theming: {
    targets: [
      {
        className: 'astryx-complex-selector',
        visualProps: ['variant', 'size', 'status'],
      },
      {
        className: 'astryx-complex-selector-indicator-icon',
        states: ['state'],
      },
      {className: 'astryx-complex-selector-popup'},
    ],
  },
  components: [
    {
      name: 'ComplexSelector',
      displayName: 'Complex Selector',
      description:
        'An input or toolbar trigger and dialog-popover shell for custom selector content.',
      props: [
        {
          name: 'label',
          type: 'string',
          description: 'Label text for accessibility and the field label.',
          required: true,
        },
        {
          name: 'value',
          type: 'Value',
          description: 'Current controlled value.',
          required: true,
        },
        {
          name: 'onChange',
          type: '(value: Value) => void',
          description: 'Called when custom content commits a new value.',
        },
        {
          name: 'changeAction',
          type: '(value: Value) => void | Promise<void>',
          description:
            'Async action after onChange. ComplexSelector exposes optimistic value and busy state while pending.',
        },
        {
          name: 'children',
          type: '(value: Value, onChange: (value: Value) => void, close: () => void, state: ComplexSelectorRenderState) => ReactNode',
          description:
            'Custom dialog content. Receives positional value, onChange, close, and state helpers.',
          required: true,
        },
        {
          name: 'triggerLabel',
          type: 'ReactNode',
          description: 'Label/content shown in the closed trigger.',
        },
        {
          name: 'placeholder',
          type: 'ReactNode',
          description: 'Placeholder shown when triggerLabel is omitted.',
          default: "'Select...'",
        },
        {
          name: 'isDisabled',
          type: 'boolean',
          description: 'Disables the selector.',
        },
        {
          name: 'isLoading',
          type: 'boolean',
          description: 'Shows loading state on the trigger.',
        },
        {
          name: 'status',
          type: "{type: 'warning' | 'error' | 'success', message?: string}",
          description: 'Validation status.',
        },
        {
          name: 'statusVariant',
          type: "'attached' | 'detached' | 'tooltip'",
          description:
            'How the status message is placed relative to the input. attached overlaps directly below the input (bordered treatment; detached when variant is secondary or ghost); detached floats below as a separate element with spacing; tooltip reveals the message in an info-tip button.',
          default:
            "'attached' for input selectors; 'detached' for secondary and ghost selectors",
        },
        {
          name: 'size',
          type: "'sm' | 'md' | 'lg'",
          description: 'Exact trigger height: sm 28px, md 32px, or lg 36px.',
          default: "'md'",
        },
        {
          name: 'variant',
          type: "'input' | 'secondary' | 'ghost'",
          description:
            'Visual trigger style. Input is the bordered form treatment; secondary matches the secondary buttons of the active theme (borderless and neutral-filled by default); ghost is borderless and transparent to match ghost buttons.',
          default: "'input'",
        },
        {
          name: 'startIcon',
          type: 'ReactNode | IconType',
          description: 'Icon displayed at the start of the trigger.',
        },
        {
          name: 'width',
          type: 'SizeValue',
          description: 'Width of the field.',
        },
        {
          name: 'placement',
          type: "'above' | 'below' | 'start' | 'end'",
          description: 'Popup placement.',
          default: "'below'",
        },
        {
          name: 'alignment',
          type: "'start' | 'center' | 'end'",
          description: 'Popup alignment along the placement axis.',
          default: "'start'",
        },
        {
          name: 'renderTrigger',
          type: '(props: ComplexSelectorRenderTriggerProps) => ReactNode',
          description:
            "Render the control the popup hangs off — a glyph in a list row, a chip, an icon button — instead of the selector's own field and button. Spread the given props ({ref, id, onClick, onKeyDown, role, aria-haspopup, aria-expanded, aria-controls, aria-busy, aria-required, aria-disabled}) onto it: the control becomes the selector's combobox field, the popup is anchored to it and still labelled by `label`, and a disabled control keeps its tab stop but does not open. The field chrome is not rendered. Pair with handleRef to open from a keystroke elsewhere.",
        },
        {
          name: 'handleRef',
          type: 'React.Ref<ComplexSelectorHandle>',
          description:
            'Imperative handle for programmatic control. Exposes open(), close(), toggle(), and isOpen().',
        },
        {
          name: 'onOpenChange',
          type: '(isOpen: boolean) => void',
          description:
            'Called whenever the surface opens or closes, however it happened — trigger, keyboard, light dismiss, Escape, close(), or the imperative handle.',
        },
        {
          name: 'contentXstyle',
          type: 'StyleXStyles',
          description: 'StyleX styles for the popup content container.',
        },
        {
          name: 'onClick',
          type: '(event: MouseEvent) => void',
          description:
            'Click handler on the trigger. Runs before the popup opens; call preventDefault() to keep it closed. A press elsewhere in the control box goes through the trigger too. With renderTrigger it runs after the built-in toggle and cannot cancel it.',
        },
        {
          name: 'onKeyDown',
          type: '(event: KeyboardEvent) => void',
          description:
            'Key handler on the trigger. Runs after the built-in handling and receives every key, including the ArrowDown that opens the popup. With renderTrigger it is skipped for keys the built-in handling cancels.',
        },
        {
          name: 'containerXstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for the field container (label, control, and status together). No effect inside InputGroup (style the InputGroup instead) or in a `horizontal-labels` FormLayout. Root `xstyle`, `className`, and `style` are not accepted.',
        },
        {
          name: 'containerClassName',
          type: 'string',
          description:
            'Class name for the field container. Same targeting as `containerXstyle`.',
        },
        {
          name: 'containerStyle',
          type: 'CSSProperties',
          description:
            'Inline styles for the field container. Same targeting as `containerXstyle`.',
        },
        {
          name: 'controlXstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for the visual control box: the element that paints the border and background and holds the value, icons, and end controls. Never the trigger button itself.',
        },
        {
          name: 'controlClassName',
          type: 'string',
          description: 'Class name for the visual control box.',
        },
        {
          name: 'controlStyle',
          type: 'CSSProperties',
          description: 'Inline styles for the visual control box.',
        },
      ],
    },
  ],
  usage: {
    anatomy,
    description:
      'Use ComplexSelector when a selection needs richer custom content than a Selector option row. It is intentionally one component: ComplexSelector owns the field, trigger, popover, focus restore, and changeAction flow, while the content render prop owns the selector-specific accessible structure.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use variant="secondary" beside secondary buttons, or variant="ghost" beside ghost buttons; add a startIcon when it helps identify the trigger. Use alignment="end" when a wide surface should align its end edge to the trigger.',
      },
      {
        guidance: true,
        description:
          'For staged editors, keep draft state in the composed content and call the provided onChange helper only from Apply. Cancel or dismiss without committing.',
      },
      {
        guidance: true,
        description:
          'Compose the dialog content from the appropriate accessible structure for the job: RadioList for a simple choice, Calendar/date inputs for date picking, TreeList or a searchable list for hierarchy, or a custom grid when two-dimensional arrow navigation is useful.',
      },
      {
        guidance: true,
        description:
          'Use the provided onChange helper from children; it already calls both onChange and changeAction and updates optimistic busy state.',
      },
      {
        guidance: true,
        description:
          'Call close() from custom content when a selection should dismiss the popup. Keep it open for multi-step content or freeform entry flows.',
      },
      {
        guidance: true,
        description:
          'Use Astryx focus hooks for custom content: useGridFocus for two-dimensional grids, useTreeFocus through TreeList for hierarchies, and useListFocus for custom linear collections.',
      },
      {
        guidance: true,
        description:
          'Evaluate custom content against WCAG 2.2: keyboard operation, focus visible/not obscured, names and roles, labels/instructions, target size, and contrast/non-text contrast are especially relevant for selector popovers.',
      },
      {
        guidance: false,
        description:
          'Do not rebuild trigger ARIA, popover focus management, or changeAction handling in product code.',
      },
      {
        guidance: false,
        description:
          'Do not use ComplexSelector for a plain single-column text list; use Selector instead.',
      },
    ],
  },
};

export const docsDense = {
  name: 'ComplexSelector',
  displayName: 'Complex Selector',
  group: 'Selector',
  category: 'Form Controls',
  description:
    'Input/secondary/ghost trigger + dialog-popover shell for rich custom selectors. Content gets value/onChange/close/state; content owns semantics. Use focus hooks and evaluate custom content against WCAG 2.2.',
  usage: {
    anatomy,
    description:
      'Use when a selection needs richer custom content than a Selector row. One component: it owns field, trigger, popover, focus restore, and changeAction; the render prop owns the selector-specific accessible structure.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use variant="ghost" with a startIcon for a toolbar trigger. Use alignment="end" when a wide surface should align its end edge to the trigger.',
      },
      {
        guidance: true,
        description:
          'For staged editors, keep draft state in the composed content and call the provided onChange helper only from Apply. Cancel or dismiss without committing.',
      },
      {
        guidance: true,
        description:
          'Compose content from the right accessible structure: RadioList for a simple choice, Calendar/date inputs for dates, TreeList or a searchable list for hierarchy, a custom grid for 2D arrow navigation.',
      },
      {
        guidance: true,
        description:
          'Use the onChange helper from children; it calls both onChange and changeAction and updates optimistic busy state.',
      },
      {
        guidance: true,
        description:
          'Call close() from custom content when a selection should dismiss the popup. Keep it open for multi-step or freeform flows.',
      },
      {
        guidance: true,
        description:
          'Use Astryx focus hooks: useGridFocus for 2D grids, useTreeFocus via TreeList for hierarchies, useListFocus for custom linear collections.',
      },
      {
        guidance: true,
        description:
          'Evaluate custom content against WCAG 2.2: keyboard operation, focus visible/not obscured, names and roles, labels/instructions, target size, and contrast.',
      },
      {
        guidance: false,
        description:
          'Do not rebuild trigger ARIA, popover focus management, or changeAction handling in product code.',
      },
      {
        guidance: false,
        description:
          'Do not use ComplexSelector for a plain single-column text list; use Selector instead.',
      },
    ],
  },
  propDescriptions: {
    label: 'Accessible field label.',
    value: 'Controlled value.',
    onChange: 'Commit value.',
    changeAction: 'Async action after onChange; drives optimistic value/busy.',
    children: 'Render custom dialog content from (value,onChange,close,state).',
    triggerLabel: 'Closed trigger label/content.',
    variant:
      'input for forms; secondary beside secondary buttons; ghost beside ghost buttons.',
    startIcon: 'Leading trigger icon.',
    placement: 'Popup placement.',
    alignment: 'Popup alignment.',
    renderTrigger:
      'Caller-rendered opener replacing the field+button; spread the given props; popup anchored to it, labelled by label.',
    handleRef: 'Imperative open/close/toggle handle.',
    onOpenChange: 'Notified on every open and close, whatever caused it.',
    onClick:
      'Trigger click; runs before opening, preventDefault() keeps the popup closed.',
    onKeyDown:
      'Trigger keys; runs after built-in handling, sees the opening ArrowDown.',
    containerXstyle:
      'StyleX styles for the field container; no effect in InputGroup or horizontal-labels FormLayout. No root xstyle/className/style.',
    containerClassName: 'Class name for the field container.',
    containerStyle: 'Inline styles for the field container.',
    controlXstyle:
      'StyleX styles for the visual control box (border, background, icons); not the trigger button.',
    controlClassName: 'Class name for the visual control box.',
    controlStyle: 'Inline styles for the visual control box.',
    statusVariant:
      'How status message is placed: attached overlaps below input (detached for secondary and ghost); detached floats below w/ spacing; tooltip shows on status icon.',
    accessibility:
      'Custom content must provide its own accessible structure. Use focus hooks and evaluate against WCAG 2.2.',
  },
};
