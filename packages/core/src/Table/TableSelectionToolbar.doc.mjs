// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'TableSelectionToolbar',
  subComponentOf: 'Table',
  displayName: 'Table Selection Toolbar',
  description:
    'Selection-aware bulk-action surface built on Toolbar. Pass selectionState from useTableSelectionState so count, visibility, and complete clearing stay synchronized with the Table selection plugin. The component owns no table or sticky layout: place it in flow or apply caller-owned positioning through xstyle.',
  props: [
    {
      name: 'selection',
      type: 'TableSelectionState',
      description:
        'Shared selection state returned by useTableSelectionState: selectedKeys, selectedCount, hasSelection, and clearSelection.',
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
      'Pass both outputs of useTableSelectionState to their matching consumers: selectionConfig to useTableSelection and selectionState to TableSelectionToolbar. Render product actions through startContent. Keep fixed or floating placement in the surrounding layout.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass selectionState directly from useTableSelectionState so the count and clear action stay synchronized with row selection.',
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
};

export const docsDense = {
  name: 'TableSelectionToolbar',
  displayName: 'Table Selection Toolbar',
  description:
    'Selection-aware Toolbar wrapper. Consumes selectionState from useTableSelectionState; owns count, clear, visibility, and Toolbar semantics. Caller owns actions and fixed/floating placement.',
  propDescriptions: {
    selection:
      'selectionState from useTableSelectionState: selectedKeys/count/presence + complete clear command',
    startContent: 'product-owned bulk action controls',
    label: 'accessible toolbar name; defaults to Bulk actions',
    renderSelectionLabel: 'override visible count copy; receives selectedCount',
    clearLabel: 'complete-clear button label; defaults to Unselect All',
    size: 'Toolbar size; defaults to sm and cascades to child controls',
    variant: 'Toolbar surface; defaults to muted',
    xstyle: 'caller-owned layout/positioning styles',
  },
};
