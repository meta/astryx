// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferList.doc.mjs
 * @input TransferList public API, option constraints, and composition guidance
 * @output Documents TransferList, the content of TransferListSelector, for
 *   custom ComplexSelector surfaces
 * @position Core documentation consumed by component tooling
 *
 * SYNC: When modified, update TransferList.tsx, its tests, and package exports.
 */

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TransferList',
  displayName: 'Transfer List',
  // Keeps the registry route TransferList had as a canary-only Lab component.
  registry: {aliases: ['lab/transfer-list']},
  group: 'Selector',
  category: 'Form Controls',
  keywords: [
    'transfer list',
    'dual list',
    'pick list',
    'reorder',
    'columns',
    'available',
    'selected',
    'saved views',
  ],
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
        "Makes the selected options reorderable through a handle on each row: pass the object createReorderable makes. Its handle option places the handle at each row's end (default) or start; the handle always shows unless the option's revealBehavior is 'adaptive', which shows it on hover or focus where the primary pointer is fine. Its isReorderable(value) decides which options move (one it rejects at either end of the list also keeps the others from moving past it), and each move goes to its onReorder({key, to}), to being the index of the value in value after the move. Without it, the selected options keep their order.",
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
      name: 'emptySearchText',
      type: 'ReactNode',
      description:
        'Shown in a list while the search matches none of its options. An element can carry a link or an action.',
      default: "'No results'",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for the TransferList root.',
    },
  ],
  usage: {
    description:
      'Use TransferList directly only in a deliberately custom ComplexSelector surface, such as table column settings with saved views, presets, or a custom footer; TransferListSelector covers the common field. TransferList commits each change to its controlled value at once, so keep a draft yourself when the surface needs Apply and Cancel.',
    bestPractices: [
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
          "Commit add, remove, and bulk changes immediately. A drag leaves the rows still: the row dims in place, a copy of it follows the finger or pointer, and an insertion line marks where it would land; the reorderable object's onReorder runs once on release.",
      },
    ],
    anatomy: [
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
        className: 'astryx-transfer-list-panel',
        visualProps: ['side'],
      },
      {
        className: 'astryx-transfer-list-item',
        visualProps: ['side', 'state', 'reorder'],
      },
    ],
    vars: [
      {
        name: '--transfer-list-panel-min-block-size',
        description:
          "Smallest block size of each panel's body, which scrolls, while the panels sit side by side. Set it through transferListVars.",
        default: '12rem',
      },
      {
        name: '--transfer-list-panel-max-block-size',
        description:
          "Largest block size of each panel's body while the panels sit side by side; a longer list scrolls. Set it through transferListVars.",
        default: '20rem',
      },
    ],
  },
  examples: [
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

  // Syncs the draft with the applied value each time the popover opens.
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
    emptySearchText: 'No search matches content (ReactNode).',
    xstyle: 'TransferList-root StyleX override.',
  },
};
