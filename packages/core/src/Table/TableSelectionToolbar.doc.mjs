// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'TableSelectionToolbar',
  subComponentOf: 'Table',
  displayName: 'Table Selection Toolbar',
  description:
    'Selection-aware bulk-action surface built on Toolbar. Pass selectionState from useTableSelectionState so count, visibility, and complete clearing stay synchronized with the Table selection plugin. When the app keeps its own selection, such as every row matching a query across server pages, it passes its own TableSelectionState instead (see the example). The component owns no table or sticky layout: place it in flow or apply caller-owned positioning through xstyle.',
  props: [
    {
      name: 'selection',
      type: 'TableSelectionState',
      description:
        'Shared selection state: selectedKeys, selectedCount, hasSelection, and clearSelection. Usually useTableSelectionState returns it; an app that keeps its own selection builds it.',
      required: true,
    },
    {
      name: 'startContent',
      type: 'ReactNode',
      description:
        'Product-owned action controls aligned to the logical start. Child controls inherit the toolbar size.',
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible name for the action surface.',
      default: 'Bulk actions',
    },
    {
      name: 'renderSelectionLabel',
      type: '(selectedCount: number) => ReactNode',
      description:
        'Overrides the visible count text for localisation or domain-specific copy.',
      default: 'count => `${count} selected`',
    },
    {
      name: 'clearLabel',
      type: 'string',
      description:
        'Visible label for the command that clears the complete controlled selection.',
      default: 'Unselect All',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description:
        'Toolbar size. Cascades to product action controls and the clear action.',
      default: 'sm',
    },
    {
      name: 'variant',
      type: 'SectionVariant',
      description: 'Toolbar surface variant.',
      default: 'muted',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'Caller-owned layout styles, including sticky positioning for floating compositions.',
    },
  ],
  usage: {
    description:
      'Pass both outputs of useTableSelectionState to their matching consumers: selectionConfig to useTableSelection and selectionState to TableSelectionToolbar. An app that keeps its own selection, such as every row matching a query across server pages, passes its own config and state instead. Render product actions through startContent. Keep fixed or floating placement in the surrounding layout.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass selectionState directly from useTableSelectionState so the count and clear action stay synchronized with row selection, unless the app keeps its own selection across server pages.',
      },
      {
        guidance: true,
        description:
          'Provide product actions as startContent instead of encoding them as configuration objects.',
      },
      {
        guidance: false,
        description:
          'Inject the toolbar through the Table plugin or its horizontal scroll wrapper.',
      },
    ],
  },
  examples: [
    {
      label: 'Select every matching row across server pages',
      code: `
// The rows load one server page at a time. The app keeps the selection as
// "every matching row, minus the ones the person unticked", so rows on pages
// that never loaded are selected too. Table and the toolbar only show it.
const [isAllMatching, setIsAllMatching] = useState(false);
const [picked, setPicked] = useState(new Set()); // chosen one by one
const [excluded, setExcluded] = useState(new Set()); // unticked in all mode

const isSelected = row =>
  isAllMatching ? !excluded.has(row.id) : picked.has(row.id);
const isPageSelected = pageRows.every(isSelected);
const selectedCount = isAllMatching ? total - excluded.size : picked.size;

const selectionPlugin = useTableSelection({
  getIsItemSelected: isSelected,
  // setRows adds to or removes from excluded in all mode, picked otherwise.
  onSelectItem: ({item, isSelected}) => setRows([item], isSelected),
  onSelectAll: ({isAllSelected}) => setRows(pageRows, isAllSelected),
  getIsAllSelected: () => isPageSelected,
});

<TableSelectionToolbar
  selection={{
    // Only the loaded rows: the full set is not on the client.
    selectedKeys: new Set(pageRows.filter(isSelected).map(row => row.id)),
    selectedCount, // the app's own count
    hasSelection: selectedCount > 0,
    clearSelection: () => {
      setIsAllMatching(false);
      setPicked(new Set());
      setExcluded(new Set());
    },
  }}
  renderSelectionLabel={count =>
    !isAllMatching
      ? count + ' selected'
      : excluded.size === 0
        ? 'All ' + total + ' matching selected'
        : count + ' of ' + total + ' matching selected'
  }
  startContent={
    <>
      <Button label="Archive" variant="ghost" onClick={archive} />
      {/* Beside the action, not in its place. Once used, the offer stays as
          the command that undoes it, so focus stays on it and a second
          press can never run Archive. */}
      {isAllMatching || isPageSelected ? (
        <Button
          label={
            isAllMatching
              ? 'Select only this page'
              : 'Select all ' + total + ' matching'
          }
          variant="ghost"
          onClick={() => {
            if (isAllMatching) {
              // Every row on this page, so the label stays true and the
              // focused button stays mounted.
              setPicked(new Set(pageRows.map(row => row.id)));
              setExcluded(new Set());
            }
            setIsAllMatching(!isAllMatching);
          }}
        />
      ) : null}
    </>
  }
/>;
// In this mode the toolbar's selectedKeys holds only the loaded rows, and
// the count comes from the app. For a bulk action, send the server the
// query and the excluded ids, not a list of selected ids.
`,
    },
  ],
};

export const docsDense = {
  name: 'TableSelectionToolbar',
  displayName: 'Table Selection Toolbar',
  description:
    'Selection-aware Toolbar wrapper. Consumes selectionState from useTableSelectionState, or an app-built state for a selection across server pages; owns count, clear, visibility, and Toolbar semantics. Caller owns actions and fixed/floating placement.',
  propDescriptions: {
    selection:
      'selectionState from useTableSelectionState, or app-built: selectedKeys/count/presence + complete clear command',
    startContent: 'product-owned bulk action controls',
    label: 'accessible toolbar name; defaults to Bulk actions',
    renderSelectionLabel: 'override visible count copy; receives selectedCount',
    clearLabel: 'complete-clear button label; defaults to Unselect All',
    size: 'Toolbar size; defaults to sm and cascades to child controls',
    variant: 'Toolbar surface; defaults to muted',
    xstyle: 'caller-owned layout/positioning styles',
  },
};
