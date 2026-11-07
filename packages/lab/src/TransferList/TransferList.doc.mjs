// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferList.doc.mjs
 * @input TransferListSelector and TransferList public APIs, commit behavior, and usage guidance
 * @output Documents the default-immediate selector, optional staged commits, and advanced TransferList composition
 * @position Lab documentation consumed by component tooling
 *
 * SYNC: When modified, update TransferListSelector.tsx, TransferList.tsx, commit-behavior tests, and package exports.
 */

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TransferListSelector',
  displayName: 'Transfer List Selector',
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
      type: 'TransferListSelectorCommitBehavior',
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
        "Makes the selected options reorderable: pass the object createReorderable makes. Each selected row ends with a reorder handle: on a touch screen hold the handle for a moment, then drag; a mouse drags at once; a tap, a click, Space or Enter on a handle turns on reorder mode for its row, in which each arrow key (or each move in the hint below the handle) moves it a place, and Escape, Done or another activation ends the mode, keeping the moves. The object's isReorderable(value) says which values move: one it rejects has no handle, and at either end of the selected list it also keeps the others from moving past it. In immediate behavior each move goes to the object's onReorder({key, to}); in staged behavior the selector moves its draft instead, so Cancel drops the move with the draft and Apply commits it through onChange. Reordering pauses while a search filters the panel. Without it, the selected options keep their order.",
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
      name: 'noResultsText',
      type: 'string',
      description: 'Message shown when search has no matches in a list.',
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
        'Optional async action run after each immediate commit or a changed staged Apply; drives optimistic and busy state.',
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
      description: 'Test ID for the selector trigger button.',
    },
  ],
  components: [
    {
      name: 'TransferList',
      displayName: 'Transfer List',
      description:
        'Lower-level controlled content primitive for advanced selector compositions that add custom headers, saved views, presets, or actions. Changes are immediate to its controlled value.',
      props: [
        {
          name: 'label',
          type: 'string',
          description: 'Accessible name for the complete transfer control.',
          required: true,
        },
        {
          name: 'isLabelHidden',
          type: 'boolean',
          description:
            'Visually hides the control label while retaining its accessible name.',
          default: 'false',
        },
        {
          name: 'description',
          type: 'string',
          description: 'Supporting guidance shown below the control label.',
        },
        {
          name: 'options',
          type: 'readonly TransferListOption<T>[]',
          description:
            'Complete option pool with optional metadata, grouping, transfer constraints, and reorder constraints.',
          required: true,
        },
        {
          name: 'value',
          type: 'readonly T[]',
          description: 'Selected option values in display order.',
          required: true,
        },
        {
          name: 'onChange',
          type: '(nextValue: readonly T[]) => void',
          description:
            "Called immediately after a permitted option is added, removed, or bulk changed. Moves go to the reorderable object's onReorder instead.",
          required: true,
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
          name: 'isDisabled',
          type: 'boolean',
          description:
            'Disables every transfer, reorder, Clear, Add all and search control. The row controls and the search field stay focusable.',
          default: 'false',
        },
        {
          name: 'searchLabel',
          type: 'string',
          description: 'Accessible label for the shared search field.',
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
            'Makes the selected options reorderable through a handle at the end of each row: pass the object createReorderable makes. Its isReorderable(value) decides which options move (one it rejects at either end of the list also keeps the others from moving past it), and each move goes to its onReorder({key, to}), to being the index of the value in value after the move. Without it, the selected options keep their order.',
        },
        {
          name: 'hasSelectAll',
          type: 'boolean',
          description: 'Shows Add all for transfer-enabled available options.',
          default: 'false',
        },
        {
          name: 'hasClear',
          type: 'boolean',
          description:
            'Shows Clear for transfer-enabled selected options; transfer-disabled values remain selected.',
          default: 'false',
        },
        {
          name: 'renderOption',
          type: '(option: TransferListOption<T>) => ReactNode',
          description:
            'Customizes row content without replacing built-in actions and constraints.',
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
          name: 'noResultsText',
          type: 'string',
          description: 'Message shown when search has no matches in a list.',
          default: "'No results'",
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description: 'StyleX styles for the TransferList root.',
        },
      ],
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
          "With no `reorderable`, TransferList no longer reorders; pass `reorderable={createReorderable(…)}`. Migrating from isReorderable: pass reorderable={createReorderable({onReorder, isReorderable})} instead. The isReorderable prop and each option's isReorderDisabled are gone; return false from the object's isReorderable(value) for an option that stays put.",
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
        name: 'Search',
        required: false,
        description:
          'Filters the selected and available lists without changing their values and uses a uniform 12px inset.',
      },
      {
        name: 'Selected and available sections',
        required: true,
        description:
          'Places two unframed semantic lists beside one divider. Narrow containers stack the sections, use the body background behind each column header, expand both sections to their rows, and delegate overflow to one scrollable containing surface.',
      },
      {
        name: 'Row actions',
        required: true,
        description:
          'Uses a direction-neutral X to remove and plus to add. Selected rows end with a reorder handle when reordering is enabled; a row that keeps its place has none, and transfer constraints disable the remove action.',
      },
      {
        name: 'Reorder hint',
        required: false,
        description:
          'While a selected row is in reorder mode: the hint below its handle, whose Move up, Move down and Done are buttons.',
      },
      {
        name: 'Bulk actions',
        required: false,
        description:
          'Optional Clear and Add all text actions that honor transfer-disabled options.',
      },
      {
        name: 'Apply and Cancel footer',
        required: false,
        description:
          'Rendered only for staged behavior. Apply commits a changed draft; Cancel closes without changing the committed value.',
      },
      {
        name: 'Live announcements',
        required: true,
        description:
          'Reports add, remove, bulk, and reorder results without relying on visual position alone.',
      },
    ],
  },
  // Mirrors the themeProps() calls in TransferList.tsx. `astryx theme build`
  // reads this inventory to learn which visual props a target can vary on, so
  // a target missing here cannot be themed even though it carries the class.
  theming: {
    targets: [
      {
        className: 'astryx-transfer-list',
        visualProps: [],
      },
      {
        className: 'astryx-transfer-list-collection',
        visualProps: [],
      },
      {
        className: 'astryx-transfer-list-panel',
        visualProps: ['side'],
      },
      {
        className: 'astryx-transfer-list-item',
        visualProps: ['side', 'state', 'reorder'],
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
    {
      label: 'Migrating from isReorderable to reorderable',
      code: `// BEFORE: isReorderable turned reordering on, and an option opted out.
<TransferList
  options={[{value: 'name', label: 'Name', isReorderDisabled: true}, ...rest]}
  isReorderable
  value={fields}
  onChange={setFields}
/>;

// AFTER: reordering is opt-in through the object createReorderable makes.
const reorderable = useMemo(
  () =>
    createReorderable<string>({
      onReorder: ({key, to}) => setFields(fields => moveTo(fields, key, to)),
      isReorderable: value => value !== 'name',
    }),
  [],
);

<TransferList
  options={[{value: 'name', label: 'Name'}, ...rest]}
  reorderable={reorderable}
  value={fields}
  onChange={setFields}
/>;`,
    },
    {
      label: 'Saved views in a custom ComplexSelector',
      code: `const savedViews = {
  standard: ['name', 'status', 'owner'],
  ownership: ['name', 'owner', 'team'],
};
const [applied, setApplied] = useState(savedViews.standard);
const [draft, setDraft] = useState(applied);
const activeSavedView =
  Object.entries(savedViews).find(
    ([, columns]) =>
      columns.length === draft.length &&
      columns.every((column, index) => column === draft[index]),
  )?.[0] ?? 'custom';

function ResetDraftOnOpen({isOpen, value, onReset}) {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      onReset([...value]);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, onReset, value]);

  return null;
}

<ComplexSelector
  label="View options"
  isLabelHidden
  triggerLabel="View options"
  value={applied}
  onChange={setApplied}>
  {(_appliedValue, commit, close, state) => (
    <>
      <ResetDraftOnOpen
        isOpen={state.isOpen}
        value={applied}
        onReset={setDraft}
      />
      <Selector
        label="Saved view"
        options={savedViewOptions}
        value={activeSavedView}
        onChange={nextSavedView => {
          setDraft(savedViews[nextSavedView]);
        }}
      />
      <TransferList
        label="Visible fields"
        isLabelHidden
        options={fieldOptions}
        value={draft}
        onChange={setDraft}
        selectedLabel="Visible fields"
        availableLabel="Available fields"
        hasSelectAll
        hasClear
      />
      <Button label="Cancel" variant="ghost" onClick={close} />
      <Button
        label="Apply"
        variant="primary"
        onClick={() => {
          commit(draft);
          close();
        }}
      />
    </>
  )}
</ComplexSelector>`,
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
    noResultsText: 'No search matches message.',
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
      'Async action after each immediate commit or changed staged Apply.',
    xstyle: 'External field StyleX override.',
    className: 'External field class name.',
    style: 'External field inline styles.',
    'data-testid': 'Selector trigger test ID.',
  },
  components: [
    {
      name: 'TransferList',
      displayName: 'Transfer List',
      description:
        'Lower-level controlled content for custom ComplexSelector surfaces; changes its controlled value immediately.',
      propDescriptions: {
        label: 'Accessible control label.',
        isLabelHidden: 'Hide control label visually, preserving its name.',
        description: 'Supporting control guidance.',
        options: 'Full pool with metadata, groups, and transfer constraints.',
        value: 'Selected values in display order.',
        onChange:
          'Called after each add/remove/bulk change; moves go to onReorder.',
        selectedLabel: 'Selected-list heading and name.',
        availableLabel: 'Available-list heading and name.',
        hasSearch: 'Shared list filter; default false.',
        isDisabled:
          'Disable every control; rows and search stay focusable; default false.',
        searchLabel: 'Accessible search label.',
        searchPlaceholder: 'Search placeholder.',
        reorderable:
          'createReorderable object (its isReorderable says which values move; its onReorder gets {key, to} in value terms); paused while searching.',
        hasSelectAll: 'Add all transfer-enabled options.',
        hasClear: 'Remove all transfer-enabled selected options.',
        renderOption: 'Custom row content.',
        selectedEmptyText: 'Selected-list empty message.',
        availableEmptyText: 'Available-list empty message.',
        noResultsText: 'No search matches message.',
        xstyle: 'TransferList-root StyleX override.',
      },
    },
  ],
};
