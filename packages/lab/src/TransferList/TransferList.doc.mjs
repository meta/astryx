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
        'Complete option pool. Each option has value and label, with optional searchable description metadata, group, independent isTransferDisabled and isReorderDisabled constraints, and disabledMessage.',
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
      name: 'isReorderable',
      type: 'boolean',
      description:
        'Shows a left-side grip for every selected option. Per-option isReorderDisabled keeps its grip visible but disabled and makes it a fixed-order barrier.',
      default: 'true',
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
            'Called immediately after a permitted option is added, removed, bulk changed, or reordered.',
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
          name: 'isReorderable',
          type: 'boolean',
          description:
            'Enables pointer and keyboard ordering. Per-option isReorderDisabled keeps a visible disabled grip and fixed-order barrier.',
          default: 'true',
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
          'Start with immediate behavior. Add, remove, bulk, and reorder changes call onChange as they occur, and closing or dismissing the popover keeps those committed changes.',
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
          'Use isTransferDisabled and isReorderDisabled independently. Provide disabledMessage whenever either action is unavailable so the constraint is discoverable.',
      },
      {
        guidance: true,
        description:
          'Keep rows concise and single-line. Use option description as searchable metadata, or renderOption when richer visible content is necessary.',
      },
      {
        guidance: true,
        description:
          'Commit add, remove, bulk, and keyboard reorder changes immediately. During pointer reordering, keep rows stationary, lock the translucent preview to its source-column position, use vertical pointer movement to determine insertion, and commit once on release. Keep the preview in the nearest popover or dialog top layer.',
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
          'Uses a direction-neutral X to remove and plus to add. Selected rows retain a start-aligned grip when reordering is enabled; constraints disable each control independently.',
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
        visualProps: ['side', 'state'],
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
      code: `<TransferListSelector
  label="Visible fields"
  options={[
    {
      value: 'name',
      label: 'Name',
      isTransferDisabled: true,
      disabledMessage: 'Name must remain visible.',
    },
    {
      value: 'status',
      label: 'Status',
      isReorderDisabled: true,
      disabledMessage: 'Status is fixed in position but can be removed.',
    },
    {value: 'owner', label: 'Owner'},
  ]}
  value={fields}
  onChange={setFields}
/>`,
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
          'Set transfer and reorder constraints independently and explain either with disabledMessage.',
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
      'Full pool: value, label, description?, group?, isTransferDisabled?, isReorderDisabled?, disabledMessage?.',
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
    isReorderable:
      'Enable grip-based pointer and keyboard ordering; default true.',
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
        options:
          'Full pool with metadata, groups, transfer constraints, and reorder constraints.',
        value: 'Selected values in display order.',
        onChange: 'Called after each add/remove/bulk/reorder change.',
        selectedLabel: 'Selected-list heading and name.',
        availableLabel: 'Available-list heading and name.',
        hasSearch: 'Shared list filter; default false.',
        searchLabel: 'Accessible search label.',
        searchPlaceholder: 'Search placeholder.',
        isReorderable: 'Enable pointer and keyboard ordering; default true.',
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
