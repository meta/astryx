// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferListSelector.doc.mjs
 * @input TransferListSelector public API, commit behavior, and usage guidance
 * @output Documents the default-immediate selector and its optional staged
 *   commits
 * @position Core documentation consumed by component tooling
 *
 * SYNC: When modified, update TransferListSelector.tsx, commit-behavior tests, and package exports.
 */

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TransferListSelector',
  displayName: 'Transfer List Selector',
  // Keeps the registry route TransferListSelector had as a canary-only Lab
  // component.
  registry: {aliases: ['lab/transfer-list-selector']},
  group: 'Selector',
  category: 'Form Controls',
  keywords: [
    'transfer list',
    'dual list',
    'pick list',
    'selector',
    'popover',
    'selection',
    'reorder',
    'columns',
    'available',
    'selected',
    'immediate',
    'draft',
    'apply',
  ],
  description:
    'A selector field for moving options between selected and available lists and optionally ordering the selected values. Changes commit immediately by default; staged commit behavior adds an internal draft and Apply/Cancel footer. TransferList remains the lower-level content primitive for custom ComplexSelector surfaces.',
  props: [
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible field label shown outside the popover unless isLabelHidden is true.',
      required: true,
    },
    {
      name: 'options',
      type: 'readonly TransferListOption<T>[]',
      description:
        "Complete option pool. Each option has value and label, with optional searchable description metadata, group, an isTransferDisabled constraint, and disabledMessage. Which options keep their place is the reorderable object's isReorderable.",
      required: true,
    },
    {
      name: 'value',
      type: 'readonly T[]',
      description:
        'Committed selected values in display order. In staged behavior this is the applied value copied into a local draft when the selector opens.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(nextValue: readonly T[]) => void',
      description:
        'Called after every permitted list edit in immediate behavior, or once when Apply commits a changed draft in staged behavior.',
      required: true,
    },
    {
      name: 'commitBehavior',
      type: "'immediate' | 'staged'",
      description:
        'Controls when changes commit. Immediate updates on each list edit without a footer; staged waits for Apply and supports Cancel or dismiss.',
      default: "'immediate'",
    },
    {
      name: 'triggerLabel',
      type: 'ReactNode',
      description: 'Content shown in the closed selector trigger.',
      default: '`${value.length} selected`',
    },
    {
      name: 'description',
      type: 'string',
      description: 'Supporting field guidance shown with the external label.',
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description:
        'Visually hides the field label while preserving its accessible name.',
      default: 'false',
    },
    {
      name: 'selectedLabel',
      type: 'string',
      description: 'Heading and accessible name for the selected list.',
      default: "'Selected'",
    },
    {
      name: 'availableLabel',
      type: 'string',
      description: 'Heading and accessible name for the available list.',
      default: "'Available'",
    },
    {
      name: 'hasSearch',
      type: 'boolean',
      description:
        'Shows a shared search field that filters both lists by label and description.',
      default: 'false',
    },
    {
      name: 'searchLabel',
      type: 'string',
      description: 'Accessible label for the shared search field.',
      default: "'Search ' followed by label",
    },
    {
      name: 'searchPlaceholder',
      type: 'string',
      description: 'Placeholder shown in the shared search field.',
      default: "'Search...'",
    },
    {
      name: 'reorderable',
      type: 'Reorderable<T>',
      description:
        "Makes the selected options reorderable: pass the object createReorderable makes. Each selected row ends with a reorder handle, or starts with it when the object's handle.placement is 'start': on a touch screen hold the handle for a moment, then drag; a mouse drags at once; a tap, a click, Space or Enter on a handle turns on reorder mode for its row, in which each arrow key (or each move in the hint below the handle) moves it a place, and Escape, Done or another activation ends the mode, keeping the moves. The object's isReorderable(value) says which values move: one it rejects has no handle, and at either end of the selected list it also keeps the others from moving past it. In immediate behavior each move goes to the object's onReorder({key, to}); in staged behavior the selector moves its draft instead, so Cancel drops the move with the draft and Apply commits it through onChange. Reordering pauses while a search filters the panel. Without it, the selected options keep their order.",
    },
    {
      name: 'hasSelectAll',
      type: 'boolean',
      description:
        'Shows Add all and adds every transfer-enabled available option to the current selection.',
      default: 'false',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description:
        'Shows Clear and removes every transfer-enabled selected option from the current selection.',
      default: 'false',
    },
    {
      name: 'renderOption',
      type: '(option: TransferListOption<T>) => ReactNode',
      description:
        'Customizes row content while retaining built-in labels, actions, constraints, and reorder interaction.',
    },
    {
      name: 'selectedEmptyText',
      type: 'string',
      description: 'Message shown when the selected list is empty.',
      default: "'No selected options'",
    },
    {
      name: 'availableEmptyText',
      type: 'string',
      description: 'Message shown when every option has been selected.',
      default: "'No available options'",
    },
    {
      name: 'emptySearchText',
      type: 'ReactNode',
      description:
        'Shown in a list while the search matches none of its options. An element can carry a link or an action.',
      default: "'No results'",
    },
    {
      name: 'applyLabel',
      type: 'string',
      description:
        'Label for the staged Apply action. Only valid with commitBehavior="staged".',
      default: "'Apply'",
    },
    {
      name: 'cancelLabel',
      type: 'string',
      description:
        'Label for the staged Cancel action. Only valid with commitBehavior="staged".',
      default: "'Cancel'",
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Trigger and field size.',
      default: "'md'",
    },
    {
      name: 'width',
      type: 'SizeValue',
      description:
        'Width of the field and its popup; both track this one value.',
      default: "'min(41rem, calc(100vw - 32px))'",
    },
    {
      name: 'placement',
      type: "'above' | 'below' | 'start' | 'end'",
      description: 'Popover placement relative to the trigger.',
      default: "'below'",
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: 'Marks the field optional.',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: 'Marks the field required.',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Disables the selector trigger and transfer interaction.',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description:
        'Shows loading state on the trigger and disables transfer interaction while busy.',
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description: 'Validation status for the field.',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description: 'Placement treatment for the status message.',
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description: 'Tooltip text displayed next to the field label.',
    },
    {
      name: 'changeAction',
      type: '(value: readonly T[]) => void | Promise<void>',
      description:
        "Optional async action run after each immediate commit or a changed staged Apply; drives optimistic and busy state. While it is pending, the list's add, remove, Add all and Clear actions stay focusable but are busy: they make no change and announce none.",
    },
    {
      name: 'containerXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the field container (label, control, and status together). No effect in a `horizontal-labels` FormLayout. Root `xstyle`, `className`, and `style` are not accepted.',
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
        "StyleX styles for the external selector's bordered control box.",
    },
    {
      name: 'controlClassName',
      type: 'string',
      description: "Class name applied to the external selector's control box.",
    },
    {
      name: 'controlStyle',
      type: 'CSSProperties',
      description:
        "Inline styles applied to the external selector's control box.",
    },
    {
      name: 'data-testid',
      type: 'string',
      description:
        'Test ID for the selector trigger button, which also takes `ref`, `id`, other `data-*` and `aria-*` attributes, and DOM event handlers.',
    },
  ],
  usage: {
    description:
      'Use TransferListSelector by default for medium-to-large, inspectable sets where membership and selected order need explicit control. Immediate behavior commits each edit and renders no footer. Choose staged behavior when users must review a set of changes before Apply. Use TransferList directly only in a deliberately custom ComplexSelector surface, such as table column settings with saved views and a custom footer.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Start with immediate behavior. Add, remove, and bulk changes call onChange as they occur and moves call the reorderable object's onReorder, and closing or dismissing the popover keeps those committed changes.",
      },
      {
        guidance: true,
        description:
          'Set commitBehavior="staged" when the complete selection should be reviewed or persisted as one transaction. Apply commits a changed draft; Cancel, Escape, and light dismiss discard it.',
      },
      {
        guidance: true,
        description:
          'Use TransferList directly inside ComplexSelector only when the surface needs custom structure such as saved views, presets, headers, or footer actions. Keep applied and draft state separate and reset the draft whenever the surface opens.',
      },
      {
        guidance: true,
        description:
          "Use isTransferDisabled and the reorderable object's isReorderable independently: isTransferDisabled pins an option to its panel, and isReorderable keeps an option in its place. Provide disabledMessage when a transfer is unavailable so the constraint is discoverable; a row that keeps its place shows no reorder handle, so say why in its content when it matters.",
      },
      {
        guidance: true,
        description:
          'Keep rows concise and single-line. Use option description as searchable metadata, or renderOption when richer visible content is necessary.',
      },
      {
        guidance: true,
        description:
          "Commit add, remove, and bulk changes immediately. A drag leaves the rows still: the row dims in place, a copy of it follows the finger or pointer, and an insertion line marks where it would land; the reorderable object's onReorder runs once on release.",
      },
      {
        guidance: false,
        description:
          'Use commitBehavior as a presentation or container choice. Both values render the same selector popover; use explicit composition for a different shell.',
      },
      {
        guidance: false,
        description:
          'Use a transfer list for a handful of simple choices; CheckboxInput or MultiSelector is more compact.',
      },
    ],
    anatomy: [
      {
        name: 'Field label and description',
        required: true,
        description:
          'Names and explains the selector outside the popover so placement does not change with supporting text.',
      },
      {
        name: 'Selector trigger',
        required: true,
        description:
          'Summarizes the committed value and opens the transfer-list popover.',
      },
      {
        name: 'Transfer list',
        required: true,
        description:
          'The TransferList in the popover: its two sections, row and bulk actions, search, reorder handles, and announcements.',
      },
      {
        name: 'Apply and Cancel footer',
        required: false,
        description:
          'Rendered only for staged behavior. Apply commits a changed draft; Cancel closes without changing the committed value.',
      },
    ],
  },
  examples: [
    {
      label: 'Default immediate selector',
      code: `const [fields, setFields] = useState(['name', 'status']);

<TransferListSelector
  label="Visible fields"
  description="Choose which fields appear. Changes take effect immediately."
  triggerLabel={fields.length + ' visible fields'}
  options={[
    {value: 'name', label: 'Name'},
    {value: 'status', label: 'Status'},
    {value: 'owner', label: 'Owner'},
  ]}
  value={fields}
  onChange={setFields}
  selectedLabel="Visible fields"
  availableLabel="Available fields"
  hasSelectAll
  hasClear
/>`,
    },
    {
      label: 'Staged commit',
      code: `const [fields, setFields] = useState(['name', 'status']);

<TransferListSelector
  label="Visible fields"
  description="Review the complete selection before applying it."
  options={fieldOptions}
  value={fields}
  onChange={setFields}
  commitBehavior="staged"
  selectedLabel="Visible fields"
  availableLabel="Available fields"
  hasSelectAll
  hasClear
/>`,
    },
    {
      label: 'Independent transfer and reorder constraints',
      code: `const reorderable = useMemo(
  () =>
    createReorderable<string>({
      onReorder: ({key, to}) => setFields(fields => moveTo(fields, key, to)),
      // Status keeps its place, but can be removed.
      isReorderable: value => value !== 'status',
    }),
  [],
);

<TransferListSelector
  label="Visible fields"
  options={[
    {
      value: 'name',
      label: 'Name',
      isTransferDisabled: true,
      disabledMessage: 'Name must remain visible.',
    },
    {value: 'status', label: 'Status'},
    {value: 'owner', label: 'Owner'},
  ]}
  reorderable={reorderable}
  value={fields}
  onChange={setFields}
/>`,
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'default-immediate transfer-list selector with optional staged commit behavior; TransferList is the advanced custom-composition primitive',
  usage: {
    description:
      'Use TransferListSelector with immediate behavior by default: each list edit commits and no footer renders. Use staged behavior to review a draft and commit from Apply. Use TransferList directly only inside a custom ComplexSelector surface with saved views, presets, or custom actions.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Default to immediate behavior; each edit calls onChange and dismiss keeps committed changes.',
      },
      {
        guidance: true,
        description:
          'Use commitBehavior="staged" for review or transactional persistence; Apply commits and Cancel/Escape/light dismiss discard.',
      },
      {
        guidance: true,
        description:
          'Use direct TransferList plus ComplexSelector only for custom saved views, presets, headers, or actions; reset draft from applied value on open.',
      },
      {
        guidance: true,
        description:
          'Set transfer and reorder constraints independently and explain a locked transfer with disabledMessage.',
      },
      {
        guidance: true,
        description:
          'Keep rows single-line; descriptions remain searchable metadata.',
      },
      {
        guidance: false,
        description:
          'Use commitBehavior for presentation/container choice; both values use the selector popover.',
      },
      {
        guidance: false,
        description: 'Use for a few simple choices; prefer CheckboxInput.',
      },
    ],
  },
  propDescriptions: {
    label: 'External field label and accessible name.',
    options:
      'Full pool: value, label, description?, group?, isTransferDisabled?, disabledMessage?.',
    value: 'Committed selected values in display order.',
    onChange:
      'Called per edit in immediate behavior or from changed Apply in staged behavior.',
    commitBehavior:
      'TransferListSelectorCommitBehavior: immediate (default, no footer) or staged (draft plus Apply/Cancel).',
    triggerLabel: 'Closed-trigger content; defaults to selected count.',
    description: 'Supporting field guidance outside the popover.',
    isLabelHidden: 'Hide field label visually, preserving its name.',
    selectedLabel: 'Selected-list heading and name.',
    availableLabel: 'Available-list heading and name.',
    hasSearch: 'Shared list filter; default false.',
    searchLabel: 'Accessible search label.',
    searchPlaceholder: 'Search placeholder.',
    reorderable:
      'createReorderable object for a trailing reorder handle (touch hold, mouse drag, keys); its isReorderable says which values move; staged moves change the draft; paused while searching.',
    hasSelectAll: 'Add all transfer-enabled available options.',
    hasClear: 'Remove all transfer-enabled selected options.',
    renderOption: 'Custom row content.',
    selectedEmptyText: 'Selected-list empty message.',
    availableEmptyText: 'Available-list empty message.',
    emptySearchText: 'No search matches content (ReactNode).',
    applyLabel: 'Staged Apply label; default Apply.',
    cancelLabel: 'Staged Cancel label; default Cancel.',
    size: 'Field and trigger size.',
    width:
      'External field width; its default matches the responsive 41rem popup.',
    placement: 'Popover placement relative to trigger.',
    isOptional: 'Mark field optional.',
    isRequired: 'Mark field required.',
    isDisabled: 'Disable selector trigger and transfer interaction.',
    isLoading: 'Show loading state and disable transfer interaction.',
    status: 'Field validation status.',
    statusVariant: 'Status placement treatment.',
    labelTooltip: 'Field-label tooltip.',
    changeAction:
      'Async action after each immediate commit or changed staged Apply; list actions are busy while it is pending.',
    containerXstyle:
      'StyleX styles for the field container; no effect in horizontal-labels FormLayout. No root xstyle/className/style.',
    containerClassName: 'Class name for the field container.',
    containerStyle: 'Inline styles for the field container.',
    controlXstyle: 'External control box StyleX override.',
    controlClassName: 'External control box class name.',
    controlStyle: 'External control box inline styles.',
    'data-testid':
      'Selector trigger test ID; ref, id, data-*, aria-* and handlers also reach the trigger.',
  },
};
