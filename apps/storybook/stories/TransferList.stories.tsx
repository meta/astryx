// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferList.stories.tsx
 * @input TransferList option data plus advanced Core selector and table primitives
 * @output Storybook examples for the TransferList composition primitive
 * @position Lab Storybook documentation and visual validation
 *
 * Covers the primitive directly rather than through TransferListSelector. The
 * two surfaces are documented separately because a Storybook title maps to one
 * component, and the accessibility audit derives the component it audits from
 * that title — a primitive shown only inside the wrapper's stories is never
 * audited under its own name.
 *
 * SYNC: When TransferList interaction or panel copy changes, update source,
 * docs, and tests.
 */

import {useEffect, useRef, useState, type SVGProps} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {TransferList} from '@astryxdesign/lab';
import type {TransferListOption} from '@astryxdesign/lab';
import {Theme} from '@astryxdesign/core';
import {Button} from '@astryxdesign/core/Button';
import {ComplexSelector} from '@astryxdesign/core/ComplexSelector';
import {Divider} from '@astryxdesign/core/Divider';
import {Heading} from '@astryxdesign/core/Heading';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Section} from '@astryxdesign/core/Section';
import {Selector} from '@astryxdesign/core/Selector';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {
  Table,
  pixel,
  proportional,
  useTableColumnSettings,
  useTableColumnSettingsState,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {neutralTheme} from '@astryxdesign/theme-neutral';

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

const styles = stylex.create({
  viewOptionsTrigger: {
    backgroundColor: colorVars['--color-background-muted'],
    borderRadius: radiusVars['--radius-element'],
  },
  viewOptionsContent: {
    width: 'min(760px, calc(100vw - 32px))',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'min(680px, calc(100vh - 32px))',
    padding: 0,
    overflow: 'hidden',
  },
  viewOptionsSurface: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    maxHeight: 'min(680px, calc(100vh - 32px))',
  },
  viewOptionsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-3'],
  },
  presetsRow: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
  },
  transferListSection: {
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  viewOptionsFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-3'],
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-6'],
  },
  themePane: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-3'],
    padding: spacingVars['--spacing-4'],
    borderRadius: radiusVars['--radius-element'],
    // Must be a token, not a literal: the pane's whole job is to render the
    // surface each nested Theme resolves to, so a hardcoded colour would sit
    // under text that follows the theme and fail contrast in one of the modes.
    backgroundColor: colorVars['--color-background-body'],
  },
});

const meta: Meta<typeof TransferList> = {
  title: 'Lab/TransferList',
  component: TransferList,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div style={{width: 'min(760px, calc(100vw - 64px))'}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const BASIC_OPTIONS: ReadonlyArray<TransferListOption<string>> = [
  {
    value: 'name',
    label: 'Name',
    description: 'Primary display name for the record',
  },
  {
    value: 'owner',
    label: 'Owner',
    description: 'Person responsible for the record',
  },
  {value: 'status', label: 'Status', description: 'Current workflow state'},
  {value: 'priority', label: 'Priority', description: 'Relative urgency'},
  {value: 'team', label: 'Team', description: 'Owning team'},
  {
    value: 'updated',
    label: 'Last updated',
    description: 'Most recent change time',
  },
  {value: 'created', label: 'Created', description: 'Original creation time'},
];

function DefaultExample() {
  const [value, setValue] = useState<readonly string[]>([
    'name',
    'owner',
    'status',
  ]);
  return (
    <TransferList
      label="Visible fields"
      description="Move fields between the panels. The selected order is the display order."
      options={BASIC_OPTIONS}
      value={value}
      onChange={setValue}
      selectedLabel="Visible fields"
      availableLabel="Available fields"
      hasSelectAll
      hasClear
    />
  );
}

/** The primitive rendered inline, without the selector's popover. */
export const Default: Story = {
  render: () => <DefaultExample />,
};

const LOCKED_OPTIONS: ReadonlyArray<TransferListOption<string>> = [
  {
    value: 'name',
    label: 'Name',
    description: 'Required identity field',
    group: 'Identity',
    isTransferDisabled: true,
    isReorderDisabled: true,
    disabledMessage: 'Name is required and fixed in position.',
  },
  {
    value: 'owner',
    label: 'Owner',
    description: 'Person responsible for the work',
    group: 'Identity',
    isTransferDisabled: true,
    disabledMessage: 'Owner must remain visible but can be reordered.',
  },
  {value: 'team', label: 'Team', description: 'Owning team', group: 'Identity'},
  {
    value: 'status',
    label: 'Status',
    description: 'Current workflow state',
    group: 'Planning',
    isReorderDisabled: true,
    disabledMessage:
      'Status can be hidden but its current position is fixed while selected.',
  },
  {
    value: 'priority',
    label: 'Priority',
    description: 'Relative urgency',
    group: 'Planning',
  },
  {
    value: 'updated',
    label: 'Last updated',
    description: 'Most recent change time',
    group: 'Activity',
  },
];

function LockedExample() {
  const [value, setValue] = useState<readonly string[]>([
    'name',
    'owner',
    'status',
    'updated',
  ]);
  return (
    <TransferList
      label="Record fields"
      description="Transfer and reorder are constrained per option, so a field can be locked in place without being locked in the list."
      options={LOCKED_OPTIONS}
      value={value}
      onChange={setValue}
      selectedLabel="Shown"
      availableLabel="Hidden"
      hasSelectAll
      hasClear
    />
  );
}

/**
 * TransferList has no component-wide disabled state. Availability is decided
 * per option, and the two constraints are independent: `isTransferDisabled`
 * pins an option to its panel, `isReorderDisabled` pins it to its position.
 */
export const Locked: Story = {
  render: () => <LockedExample />,
};

function UnorderedExample() {
  const [value, setValue] = useState<readonly string[]>([
    'status',
    'priority',
    'team',
  ]);
  return (
    <TransferList
      label="Included filters"
      description="With reordering off the selected panel loses its drag handles and keyboard reorder."
      options={BASIC_OPTIONS}
      value={value}
      onChange={setValue}
      selectedLabel="Included"
      availableLabel="Not included"
      isReorderable={false}
      hasSelectAll
      hasClear
    />
  );
}

/** `isReorderable={false}` for selections where order carries no meaning. */
export const Unordered: Story = {
  render: () => <UnorderedExample />,
};

const LARGE_POOL_OPTIONS: ReadonlyArray<TransferListOption<string>> =
  Array.from({length: 200}, (_, index) => {
    const number = index + 1;
    return {
      value: `field-${number}`,
      label: `Field ${String(number).padStart(3, '0')}`,
      description: `Configurable field ${number}`,
      group: `Group ${Math.floor(index / 40) + 1}`,
    };
  });

function SearchableExample() {
  const [value, setValue] = useState<readonly string[]>(
    LARGE_POOL_OPTIONS.slice(0, 12).map(option => option.value),
  );
  return (
    <TransferList
      label="Report fields"
      description="One search field filters both panels across a pool of 200 grouped options."
      options={LARGE_POOL_OPTIONS}
      value={value}
      onChange={setValue}
      selectedLabel="In report"
      availableLabel="Available"
      hasSearch
      searchPlaceholder="Search 200 fields"
      hasSelectAll
      hasClear
    />
  );
}

/** `hasSearch` over a large grouped pool, exercising both panels at volume. */
export const Searchable: Story = {
  render: () => <SearchableExample />,
};

function EmptyExample() {
  const [value, setValue] = useState<readonly string[]>([]);
  return (
    <TransferList
      label="Visible fields"
      description="Nothing is selected yet, so the selected panel carries its own empty copy."
      options={BASIC_OPTIONS}
      value={value}
      onChange={setValue}
      selectedLabel="Visible fields"
      availableLabel="Available fields"
      selectedEmptyText="No fields are visible yet. Add one from the right."
      availableEmptyText="Every field is already visible."
      hasSelectAll
      hasClear
    />
  );
}

function NoResultsExample() {
  const [value, setValue] = useState<readonly string[]>(['name']);
  return (
    <TransferList
      label="Report fields"
      description="A query that matches nothing replaces both panels with the no-results copy."
      options={BASIC_OPTIONS}
      value={value}
      onChange={setValue}
      selectedLabel="In report"
      availableLabel="Available"
      hasSearch
      searchLabel="Search report fields"
      searchPlaceholder="Try a term that matches nothing"
      noResultsText="No field matches that search."
    />
  );
}

/**
 * The three empty surfaces are distinct: an empty selection, an exhausted
 * available pool, and a search that matches nothing each need their own copy.
 */
export const Empty: Story = {
  render: () => (
    <div {...stylex.props(styles.stack)}>
      <EmptyExample />
      <Divider />
      <NoResultsExample />
    </div>
  ),
};

/** The same list pinned to light and dark, including a nested override. */
export const ThemeMatrix: Story = {
  render: () => (
    <div {...stylex.props(styles.stack)}>
      <Theme theme={neutralTheme} mode="light">
        <div {...stylex.props(styles.themePane)}>
          <Text weight="bold">Light</Text>
          <DefaultExample />
        </div>
      </Theme>
      <Theme theme={neutralTheme} mode="dark">
        <div {...stylex.props(styles.themePane)}>
          <Text weight="bold">Dark</Text>
          <DefaultExample />
          <Theme theme={neutralTheme} mode="light">
            <div {...stylex.props(styles.themePane)}>
              <Text weight="bold">Light nested inside dark</Text>
              <LockedExample />
            </div>
          </Theme>
        </div>
      </Theme>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Pins both modes into one frame so a theme regression is visible without toggling the toolbar, and nests a light theme inside a dark one to confirm the panels read their colours from the nearest provider rather than the document root.',
      },
    },
  },
};

interface ProjectRow extends Record<string, unknown> {
  id: string;
  name: string;
  owner: string;
  status: string;
  priority: string;
  team: string;
  updated: string;
}

type ProjectColumnKey =
  'name' | 'owner' | 'status' | 'priority' | 'team' | 'updated';

const PROJECTS: ProjectRow[] = [
  {
    id: 'p-1',
    name: 'Account migration',
    owner: 'Mina Patel',
    status: 'On track',
    priority: 'High',
    team: 'Platform',
    updated: '12 min ago',
  },
  {
    id: 'p-2',
    name: 'Mobile refresh',
    owner: 'Theo Martin',
    status: 'At risk',
    priority: 'High',
    team: 'Product',
    updated: '1 hr ago',
  },
  {
    id: 'p-3',
    name: 'Quarterly planning',
    owner: 'Sam Lee',
    status: 'In review',
    priority: 'Medium',
    team: 'Operations',
    updated: 'Yesterday',
  },
  {
    id: 'p-4',
    name: 'Search improvements',
    owner: 'Avery Chen',
    status: 'On track',
    priority: 'Medium',
    team: 'Product',
    updated: '2 days ago',
  },
];

const PROJECT_COLUMNS: TableColumn<ProjectRow>[] = [
  {key: 'name', header: 'Project', width: proportional(2)},
  {key: 'owner', header: 'Owner', width: proportional(1)},
  {key: 'status', header: 'Status', width: pixel(112)},
  {key: 'priority', header: 'Priority', width: pixel(96)},
  {key: 'team', header: 'Team', width: proportional(1)},
  {key: 'updated', header: 'Updated', width: pixel(112)},
];

const PROJECT_COLUMN_OPTIONS: ReadonlyArray<{
  key: ProjectColumnKey;
  label: string;
  group?: string;
  isAlwaysVisible?: boolean;
}> = [
  {
    key: 'name',
    label: 'Project',
    group: 'Identity',
    isAlwaysVisible: true,
  },
  {key: 'owner', label: 'Owner', group: 'Identity'},
  {key: 'team', label: 'Team', group: 'Identity'},
  {key: 'status', label: 'Status', group: 'Planning'},
  {key: 'priority', label: 'Priority', group: 'Planning'},
  {key: 'updated', label: 'Updated', group: 'Activity'},
];

const PROJECT_TRANSFER_OPTIONS: ReadonlyArray<
  TransferListOption<ProjectColumnKey>
> = PROJECT_COLUMN_OPTIONS.map(option => ({
  value: option.key,
  label: option.label,
  group: option.group,
  isTransferDisabled: option.isAlwaysVisible,
  disabledMessage: option.isAlwaysVisible
    ? 'Project is the primary identity column and must stay visible.'
    : undefined,
}));

const DEFAULT_PROJECT_COLUMNS: ReadonlyArray<ProjectColumnKey> = [
  'name',
  'owner',
  'status',
  'priority',
  'updated',
];

const SAVED_VIEWS: ReadonlyArray<{
  value: string;
  label: string;
  columns: ReadonlyArray<ProjectColumnKey>;
}> = [
  {
    value: 'standard',
    label: 'Standard view',
    columns: DEFAULT_PROJECT_COLUMNS,
  },
  {
    value: 'ownership',
    label: 'Ownership view',
    columns: ['name', 'owner', 'team', 'status'],
  },
  {
    value: 'planning',
    label: 'Planning view',
    columns: ['name', 'status', 'priority', 'owner', 'updated'],
  },
];

function hasSameOrderedColumns(
  left: ReadonlyArray<ProjectColumnKey>,
  right: ReadonlyArray<ProjectColumnKey>,
): boolean {
  return (
    left.length === right.length &&
    left.every((column, index) => column === right[index])
  );
}

function ResetTableDraftOnOpen({
  isOpen,
  appliedColumns,
  savedViews,
  setDraftColumns,
  setActiveSavedView,
}: {
  isOpen: boolean;
  appliedColumns: ReadonlyArray<ProjectColumnKey>;
  savedViews: ReadonlyArray<(typeof SAVED_VIEWS)[number]>;
  setDraftColumns: (columns: ReadonlyArray<ProjectColumnKey>) => void;
  setActiveSavedView: (value: string) => void;
}) {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setDraftColumns([...appliedColumns]);
      setActiveSavedView(
        savedViews.find(view =>
          hasSameOrderedColumns(view.columns, appliedColumns),
        )?.value ?? 'custom',
      );
    }
    wasOpenRef.current = isOpen;
  }, [appliedColumns, isOpen, savedViews, setActiveSavedView, setDraftColumns]);

  return null;
}

function TableColumnSettingsExample() {
  const [appliedColumns, setAppliedColumns] = useState<
    ReadonlyArray<ProjectColumnKey>
  >(DEFAULT_PROJECT_COLUMNS);
  const [draftColumns, setDraftColumns] = useState<
    ReadonlyArray<ProjectColumnKey>
  >(DEFAULT_PROJECT_COLUMNS);
  const [savedViews, setSavedViews] = useState(SAVED_VIEWS);
  const [activeSavedView, setActiveSavedView] = useState('standard');
  const nextSavedViewNumberRef = useRef(1);

  const columnSettingsState = useTableColumnSettingsState<ProjectColumnKey>({
    columns: PROJECT_COLUMN_OPTIONS,
    activeColumnKeys: appliedColumns,
    onChangeActiveColumnKeys: setAppliedColumns,
    defaultColumnKeys: DEFAULT_PROJECT_COLUMNS,
  });
  const columnSettingsPlugin = useTableColumnSettings<
    ProjectRow,
    ProjectColumnKey
  >(columnSettingsState.columnSettingsConfig);

  const savedViewOptions = [
    ...savedViews.map(view => ({value: view.value, label: view.label})),
    {value: 'custom', label: 'Custom', disabled: true},
  ];

  const findSavedViewValue = (
    nextColumns: ReadonlyArray<ProjectColumnKey>,
  ): string =>
    savedViews.find(view => hasSameOrderedColumns(view.columns, nextColumns))
      ?.value ?? 'custom';

  const selectSavedView = (nextValue: string) => {
    const nextView = savedViews.find(view => view.value === nextValue);
    if (nextView == null) {
      return;
    }
    setActiveSavedView(nextView.value);
    setDraftColumns(nextView.columns);
  };

  const changeDraftColumns = (nextColumns: ReadonlyArray<ProjectColumnKey>) => {
    setDraftColumns(nextColumns);
    setActiveSavedView(findSavedViewValue(nextColumns));
  };

  const saveCurrentColumnsAsView = () => {
    const nextNumber = nextSavedViewNumberRef.current;
    nextSavedViewNumberRef.current += 1;
    const nextView = {
      value: `saved-${nextNumber}`,
      label: `Saved view ${nextNumber}`,
      columns: [...draftColumns],
    };
    setSavedViews(currentViews => [...currentViews, nextView]);
    setActiveSavedView(nextView.value);
  };

  return (
    <VStack gap={3} width="100%">
      <HStack gap={3} hAlign="between" vAlign="center">
        <VStack gap={0.5}>
          <Heading level={2}>Projects</Heading>
          <Text type="supporting" color="secondary">
            Customize visible columns without changing the underlying data.
          </Text>
        </VStack>
        <ComplexSelector
          label="View options"
          isLabelHidden
          value={appliedColumns}
          onChange={setAppliedColumns}
          triggerLabel="View Options"
          placement="below"
          controlXstyle={styles.viewOptionsTrigger}
          contentXstyle={styles.viewOptionsContent}>
          {(_currentColumns, commit, close, state) => (
            <div {...stylex.props(styles.viewOptionsSurface)}>
              <ResetTableDraftOnOpen
                isOpen={state.isOpen}
                appliedColumns={appliedColumns}
                savedViews={savedViews}
                setDraftColumns={setDraftColumns}
                setActiveSavedView={setActiveSavedView}
              />
              <div {...stylex.props(styles.viewOptionsHeader)}>
                <Heading level={3}>View Options</Heading>
                <IconButton
                  label="Close view options"
                  icon={<Icon icon="close" size="sm" color="inherit" />}
                  variant="ghost"
                  size="sm"
                  onClick={close}
                />
              </div>
              <Divider />
              <div {...stylex.props(styles.presetsRow)}>
                <Text type="label" weight="semibold">
                  Presets
                </Text>
                <Selector
                  label="Column preset"
                  isLabelHidden
                  options={savedViewOptions}
                  value={activeSavedView}
                  onChange={selectSavedView}
                  width="100%"
                />
                <IconButton
                  label="Save current columns as a preset"
                  icon={<Icon icon={PlusIcon} size="sm" color="inherit" />}
                  variant="secondary"
                  size="sm"
                  onClick={saveCurrentColumnsAsView}
                />
              </div>
              <div {...stylex.props(styles.transferListSection)}>
                <TransferList
                  label="Table columns"
                  isLabelHidden
                  options={PROJECT_TRANSFER_OPTIONS}
                  value={draftColumns}
                  onChange={changeDraftColumns}
                  selectedLabel="Visible fields"
                  availableLabel="Available fields"
                  hasSearch
                  searchPlaceholder="Search columns"
                  hasSelectAll
                  hasClear
                />
              </div>
              <Divider />
              <div {...stylex.props(styles.viewOptionsFooter)}>
                <Button
                  label="Restore columns to default"
                  variant="ghost"
                  onClick={() => {
                    setDraftColumns(DEFAULT_PROJECT_COLUMNS);
                    setActiveSavedView('standard');
                  }}>
                  Restore to default
                </Button>
                <HStack gap={2}>
                  <Button
                    label="Cancel column changes"
                    variant="ghost"
                    onClick={() => {
                      setDraftColumns(appliedColumns);
                      setActiveSavedView(findSavedViewValue(appliedColumns));
                      close();
                    }}>
                    Cancel
                  </Button>
                  <Button
                    label="Apply column changes"
                    variant="primary"
                    onClick={() => {
                      commit(draftColumns);
                      close();
                    }}>
                    Apply
                  </Button>
                </HStack>
              </div>
            </div>
          )}
        </ComplexSelector>
      </HStack>
      <Section padding={0}>
        <Table
          data={PROJECTS}
          columns={PROJECT_COLUMNS}
          idKey="id"
          plugins={{columnSettings: columnSettingsPlugin}}
          hasHover
          textOverflow="truncate"
        />
      </Section>
    </VStack>
  );
}

export const TableColumnSettings: Story = {
  name: 'Advanced: Table column settings',
  render: () => <TableColumnSettingsExample />,
  decorators: [
    Story => (
      <div style={{width: 'min(1100px, calc(100vw - 64px))', minHeight: 480}}>
        <Story />
      </div>
    ),
  ],
};
