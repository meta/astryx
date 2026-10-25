// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ComplexSelector.stories.tsx
 * @input Uses React state, Astryx primitives, and ComplexSelector
 * @output Storybook examples for rich selector surfaces and trigger variants
 * @position Core component stories and visual integration coverage
 *
 * SYNC: When modified, update:
 * - /packages/core/src/ComplexSelector/ComplexSelector.tsx
 * - /packages/core/src/ComplexSelector/ComplexSelector.doc.mjs
 * - /packages/core/src/ComplexSelector/ComplexSelector.test.tsx
 */

import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import {useEffect, useMemo, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  ComplexSelector,
  type ComplexSelectorHandle,
} from '@astryxdesign/core/ComplexSelector';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Token} from '@astryxdesign/core/Token';
import {TreeList, type TreeListItemData} from '@astryxdesign/core/TreeList';
import {useGridFocus} from '@astryxdesign/core/hooks';
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
  fontWeightVars,
  radiusVars,
  shadowVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const GRID_CELL_SELECTOR = '[role="gridcell"]';

const meta: Meta<typeof ComplexSelector> = {
  title: 'Core/ComplexSelector',
  component: ComplexSelector,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A high-level selector shell for rich custom content. The component owns the field, trigger, popover, focus restore, and async changeAction flow while consumers render the content. Its sm, md, and lg triggers use the 28px, 32px, and 36px element-height tokens. Custom content should use Astryx focus hooks where appropriate and be evaluated against WCAG 2.2.',
      },
    },
  },
  argTypes: {
    variant: {control: 'radio', options: ['input', 'secondary', 'ghost']},
  },
};

export default meta;
type Story = StoryObj<typeof ComplexSelector>;

type Fruit = 'Apple' | 'Pear' | 'Peach' | 'Plum';
type Ripeness = 'Crisp' | 'Tender' | 'Juicy' | 'Peak';

type FruitValue = {
  fruit: Fruit;
  ripeness: Ripeness;
};

const fruits: Array<{
  id: Fruit;
  emoji: string;
  description: string;
}> = [
  {id: 'Apple', emoji: '🍎', description: 'Bright and balanced'},
  {id: 'Pear', emoji: '🍐', description: 'Soft floral sweetness'},
  {id: 'Peach', emoji: '🍑', description: 'Round summer flavor'},
  {id: 'Plum', emoji: '🟣', description: 'Jammy and tart'},
];

const ripenessLevels: Array<{
  id: Ripeness;
  shortLabel: string;
  description: string;
}> = [
  {id: 'Crisp', shortLabel: 'C', description: 'Snappy bite'},
  {id: 'Tender', shortLabel: 'T', description: 'Easy bite'},
  {id: 'Juicy', shortLabel: 'J', description: 'Full juice'},
  {id: 'Peak', shortLabel: 'P', description: 'Most intense'},
];

type DestinationValue = {
  id: string;
  label: string;
  path: string;
};

interface DestinationNode {
  id: string;
  label: string;
  path: string;
  kind: 'folder' | 'space' | 'team';
  isExpanded?: boolean;
  children?: DestinationNode[];
}

const destinationTree: DestinationNode[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    path: '/Workspace',
    kind: 'space',
    children: [
      {
        id: 'workspace-research',
        label: 'Research',
        path: '/Workspace/Research',
        kind: 'folder',
        children: [
          {
            id: 'workspace-research-field-notes',
            label: 'Field notes',
            path: '/Workspace/Research/Field notes',
            kind: 'folder',
          },
          {
            id: 'workspace-research-interviews',
            label: 'Interviews',
            path: '/Workspace/Research/Interviews',
            kind: 'folder',
          },
        ],
      },
      {
        id: 'workspace-roadmap',
        label: 'Roadmap',
        path: '/Workspace/Roadmap',
        kind: 'folder',
      },
    ],
  },
  {
    id: 'teams',
    label: 'Teams',
    path: '/Teams',
    kind: 'space',
    children: [
      {
        id: 'teams-design-systems',
        label: 'Design systems',
        path: '/Teams/Design systems',
        kind: 'team',
        children: [
          {
            id: 'teams-design-systems-components',
            label: 'Components',
            path: '/Teams/Design systems/Components',
            kind: 'folder',
          },
          {
            id: 'teams-design-systems-accessibility',
            label: 'Accessibility',
            path: '/Teams/Design systems/Accessibility',
            kind: 'folder',
          },
        ],
      },
      {
        id: 'teams-growth',
        label: 'Growth',
        path: '/Teams/Growth',
        kind: 'team',
      },
    ],
  },
  {
    id: 'archive',
    label: 'Archive',
    path: '/Archive',
    kind: 'space',
    children: [
      {
        id: 'archive-2025',
        label: '2025 projects',
        path: '/Archive/2025 projects',
        kind: 'folder',
      },
    ],
  },
];

const categoryTree: DestinationNode[] = [
  {
    id: 'produce',
    label: 'Produce',
    path: 'Produce',
    kind: 'space',
    children: [
      {
        id: 'produce-fruit',
        label: 'Fruit',
        path: 'Produce / Fruit',
        kind: 'folder',
        children: [
          {
            id: 'produce-fruit-citrus',
            label: 'Citrus',
            path: 'Produce / Fruit / Citrus',
            kind: 'folder',
          },
          {
            id: 'produce-fruit-stone',
            label: 'Stone fruit',
            path: 'Produce / Fruit / Stone fruit',
            kind: 'folder',
          },
        ],
      },
      {
        id: 'produce-vegetables',
        label: 'Vegetables',
        path: 'Produce / Vegetables',
        kind: 'folder',
      },
    ],
  },
  {
    id: 'pantry',
    label: 'Pantry',
    path: 'Pantry',
    kind: 'space',
    children: [
      {
        id: 'pantry-grains',
        label: 'Grains',
        path: 'Pantry / Grains',
        kind: 'folder',
      },
      {
        id: 'pantry-snacks',
        label: 'Snacks',
        path: 'Pantry / Snacks',
        kind: 'folder',
      },
    ],
  },
];

const styles = stylex.create({
  wrapper: {
    width: 340,
  },
  fruitContent: {
    width: 500,
    padding: spacingVars['--spacing-2'],
  },
  treeContent: {
    width: 420,
    padding: spacingVars['--spacing-3'],
  },
  intro: {
    marginBlockEnd: spacingVars['--spacing-3'],
  },
  thinkingSurface: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
  },
  thinkingRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(156px, 1fr) repeat(4, 56px)',
    alignItems: 'center',
    columnGap: spacingVars['--spacing-1'],
    minHeight: 48,
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: {
      default: 'transparent',
      ':hover': {
        '@media (hover: hover)': colorVars['--color-background-muted'],
      },
      ':focus-within': colorVars['--color-background-muted'],
    },
  },
  fruitSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    minWidth: 0,
  },
  fruitEmoji: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-background-muted'],
    fontSize: 17,
    flexShrink: 0,
  },
  fruitText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  fruitName: {
    color: colorVars['--color-text-primary'],
    fontSize: typeScaleVars['--text-label-size'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fruitDescription: {
    color: colorVars['--color-text-secondary'],
    fontSize: typeScaleVars['--text-supporting-size'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  levelButton: {
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-background-card'],
    color: colorVars['--color-text-secondary'],
    minHeight: 30,
    paddingInline: spacingVars['--spacing-2'],
    fontFamily: 'inherit',
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    cursor: 'pointer',
    opacity: 0.68,
    transitionProperty:
      'opacity, background-color, border-color, color, box-shadow',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
    outline: {
      default: 'none',
      ':focus-visible': `2px solid ${colorVars['--color-accent']}`,
    },
    outlineOffset: 2,
    ':hover': {
      '@media (hover: hover)': {
        opacity: 1,
        borderColor: colorVars['--color-border-emphasized'],
        color: colorVars['--color-text-primary'],
      },
    },
  },
  selectedLevelButton: {
    opacity: 1,
    borderColor: colorVars['--color-accent'],
    backgroundColor: colorVars['--color-accent'],
    color: colorVars['--color-on-accent'],
    boxShadow: shadowVars['--shadow-low'],
  },
  keyboardHint: {
    marginBlockStart: spacingVars['--spacing-3'],
    paddingBlockStart: spacingVars['--spacing-3'],
    borderBlockStartWidth: borderVars['--border-width'],
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: colorVars['--color-border'],
  },
  searchArea: {
    marginBlockEnd: spacingVars['--spacing-3'],
  },
  treePanel: {
    maxHeight: 280,
    overflow: 'auto',
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    padding: spacingVars['--spacing-1'],
  },
  selectedSummary: {
    marginBlockStart: spacingVars['--spacing-3'],
    paddingBlockStart: spacingVars['--spacing-3'],
    borderBlockStartWidth: borderVars['--border-width'],
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: colorVars['--color-border'],
  },
  emptyState: {
    padding: spacingVars['--spacing-3'],
    color: colorVars['--color-text-secondary'],
    textAlign: 'center',
  },
  toolbarDemo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacingVars['--spacing-1'],
    width: 360,
    padding: spacingVars['--spacing-1'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-muted'],
  },
  toolbarDemoIntrinsic: {
    width: 'max-content',
  },
  toolbarContent: {
    width: 280,
    padding: spacingVars['--spacing-3'],
  },
  auditMatrix: {
    width: 'min(720px, calc(100vw - 32px))',
  },
  auditPopupContent: {
    width: 220,
  },
});

function formatFruitValue(value: FruitValue) {
  return `${value.fruit} · ${value.ripeness}`;
}

function formatDestinationValue(value: DestinationValue) {
  return value.path;
}

function nodeMatchesQuery(node: DestinationNode, normalizedQuery: string) {
  return (
    node.label.toLowerCase().includes(normalizedQuery) ||
    node.path.toLowerCase().includes(normalizedQuery)
  );
}

function filterDestinationTree(
  nodes: DestinationNode[],
  query: string,
): DestinationNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  const result: DestinationNode[] = [];

  for (const node of nodes) {
    const filteredChildren = node.children
      ? filterDestinationTree(node.children, query)
      : undefined;
    const isMatch =
      normalizedQuery.length === 0 || nodeMatchesQuery(node, normalizedQuery);

    if (!isMatch && (!filteredChildren || filteredChildren.length === 0)) {
      continue;
    }

    result.push({
      ...node,
      isExpanded: normalizedQuery.length > 0 || node.children != null,
      children: filteredChildren,
    });
  }

  return result;
}

function toTreeListItems(
  nodes: DestinationNode[],
  selectedId: string,
  onSelect: (value: DestinationValue) => void,
): TreeListItemData[] {
  return nodes.map(node => {
    const hasChildren = node.children != null && node.children.length > 0;
    return {
      id: node.id,
      label: node.label,
      description: node.path,
      isExpanded: hasChildren,
      isSelected: !hasChildren && node.id === selectedId,
      endContent:
        node.kind === 'team' ? (
          <Token label="Team" size="sm" color="blue" />
        ) : undefined,
      onClick: hasChildren
        ? undefined
        : () => onSelect({id: node.id, label: node.label, path: node.path}),
      children: hasChildren
        ? toTreeListItems(node.children ?? [], selectedId, onSelect)
        : undefined,
    };
  });
}

function FruitRipenessMatrix({
  value,
  onChange,
}: {
  value: FruitValue;
  onChange: (value: FruitValue) => void;
}) {
  const {gridRef, handleKeyDown, handleFocus, focusCell} =
    useGridFocus<HTMLDivElement>({
      columns: ripenessLevels.length,
      cellSelector: GRID_CELL_SELECTOR,
      hasRovingTabIndex: true,
    });

  useEffect(() => {
    const rowIndex = fruits.findIndex(fruit => fruit.id === value.fruit);
    const columnIndex = ripenessLevels.findIndex(
      level => level.id === value.ripeness,
    );
    requestAnimationFrame(() => {
      focusCell(
        rowIndex >= 0 && columnIndex >= 0
          ? rowIndex * ripenessLevels.length + columnIndex
          : 0,
      );
    });
  }, [focusCell, value]);

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="Fruit ripeness choices"
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      {...stylex.props(styles.thinkingSurface)}>
      {fruits.map(fruit => (
        <div key={fruit.id} role="row" {...stylex.props(styles.thinkingRow)}>
          <div role="rowheader" {...stylex.props(styles.fruitSummary)}>
            <span aria-hidden="true" {...stylex.props(styles.fruitEmoji)}>
              {fruit.emoji}
            </span>
            <span {...stylex.props(styles.fruitText)}>
              <span {...stylex.props(styles.fruitName)}>{fruit.id}</span>
              <span {...stylex.props(styles.fruitDescription)}>
                {fruit.description}
              </span>
            </span>
          </div>
          {ripenessLevels.map(level => {
            const nextValue = {fruit: fruit.id, ripeness: level.id};
            const isSelected =
              value.fruit === fruit.id && value.ripeness === level.id;

            return (
              <button
                key={`${fruit.id}-${level.id}`}
                type="button"
                role="gridcell"
                aria-label={`${fruit.id}, ${level.id}: ${level.description}`}
                aria-selected={isSelected || undefined}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onChange(nextValue)}
                {...stylex.props(
                  styles.levelButton,
                  isSelected && styles.selectedLevelButton,
                )}>
                {level.shortLabel}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TreeSearchContent({
  label,
  value,
  tree,
  searchPlaceholder,
  onChange,
  close,
}: {
  label: string;
  value: DestinationValue;
  tree: DestinationNode[];
  searchPlaceholder: string;
  onChange: (value: DestinationValue) => void;
  close: () => void;
}) {
  const [query, setQuery] = useState('');
  const filteredTree = useMemo(
    () => filterDestinationTree(tree, query),
    [query, tree],
  );
  const treeItems = useMemo(
    () =>
      toTreeListItems(filteredTree, value.id, nextValue => {
        onChange(nextValue);
        close();
      }),
    [close, filteredTree, onChange, value.id],
  );

  return (
    <VStack gap={3}>
      <div {...stylex.props(styles.searchArea)}>
        <TextInput
          label={`Search ${label}`}
          isLabelHidden
          value={query}
          onChange={setQuery}
          hasClear
          placeholder={searchPlaceholder}
        />
      </div>
      <div {...stylex.props(styles.treePanel)}>
        {treeItems.length > 0 ? (
          <TreeList items={treeItems} density="compact" />
        ) : (
          <div role="status" {...stylex.props(styles.emptyState)}>
            <Text type="supporting" color="secondary">
              No matching destinations.
            </Text>
          </div>
        )}
      </div>
      <div {...stylex.props(styles.selectedSummary)}>
        <HStack gap={2} wrap="wrap">
          <Text type="supporting" color="secondary">
            Current:
          </Text>
          <Token label={value.path} size="sm" color="blue" />
        </HStack>
      </div>
    </VStack>
  );
}

export const FruitRipenessGrid: Story = {
  name: 'Fruit ripeness selector',
  render: () => {
    const [value, setValue] = useState<FruitValue>({
      fruit: 'Apple',
      ripeness: 'Juicy',
    });

    return (
      <VStack gap={4} xstyle={styles.wrapper}>
        <ComplexSelector<FruitValue>
          label="Fruit blend"
          description="Choose a fruit and ripeness level in one selector. Arrow down preserves the ripeness column."
          value={value}
          onChange={setValue}
          triggerLabel={formatFruitValue(value)}
          contentXstyle={styles.fruitContent}>
          {(selectedValue, onChange, close) => (
            <div>
              <div {...stylex.props(styles.intro)}>
                <Text type="supporting" color="secondary">
                  Pick a blend profile. The compact pills mirror a hover-rich
                  selector while staying available to keyboard users.
                </Text>
              </div>

              <FruitRipenessMatrix
                value={selectedValue}
                onChange={nextValue => {
                  onChange(nextValue);
                  close();
                }}
              />

              <div {...stylex.props(styles.keyboardHint)}>
                <HStack gap={2} wrap="wrap">
                  <Text type="supporting" color="secondary">
                    Try keyboard:
                  </Text>
                  <Text type="supporting">↓ from Apple J lands on Pear J.</Text>
                </HStack>
              </div>
            </div>
          )}
        </ComplexSelector>
      </VStack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'A fruit-themed stand-in for a rich two-axis selector. ComplexSelector owns the trigger, popover, focus restore, and change flow; the custom content owns its grid semantics.',
      },
    },
  },
};

export const TreeListWithSearch: Story = {
  name: 'Tree list with search',
  render: () => {
    const [value, setValue] = useState<DestinationValue>({
      id: 'teams-design-systems-accessibility',
      label: 'Accessibility',
      path: '/Teams/Design systems/Accessibility',
    });

    return (
      <VStack gap={4} xstyle={styles.wrapper}>
        <ComplexSelector<DestinationValue>
          label="Project destination"
          description="Search and browse nested folders from one selector."
          value={value}
          onChange={setValue}
          triggerLabel={formatDestinationValue(value)}
          contentXstyle={styles.treeContent}>
          {(selectedValue, onChange, close) => (
            <TreeSearchContent
              label="destinations"
              value={selectedValue}
              tree={destinationTree}
              searchPlaceholder="Search folders or teams"
              onChange={onChange}
              close={close}
            />
          )}
        </ComplexSelector>
      </VStack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'A complex selector that combines TextInput search with TreeList hierarchy. TreeList owns tree keyboard navigation while ComplexSelector owns the trigger and popover shell. Evaluate the composed content against WCAG 2.2 keyboard, focus, name/role, label, and contrast criteria.',
      },
    },
  },
};

export const CategoryTreeSelector: Story = {
  name: 'Category tree selector',
  render: () => {
    const [value, setValue] = useState<DestinationValue>({
      id: 'produce-fruit-citrus',
      label: 'Citrus',
      path: 'Produce / Fruit / Citrus',
    });

    return (
      <VStack gap={4} xstyle={styles.wrapper}>
        <ComplexSelector<DestinationValue>
          label="Product category"
          description="Search or browse a category tree."
          value={value}
          onChange={setValue}
          triggerLabel={value.path}
          contentXstyle={styles.treeContent}>
          {(selectedValue, onChange, close) => (
            <TreeSearchContent
              label="categories"
              value={selectedValue}
              tree={categoryTree}
              searchPlaceholder="Search categories"
              onChange={onChange}
              close={close}
            />
          )}
        </ComplexSelector>
        <Button label="Save category" variant="primary" />
      </VStack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'A second tree-search example showing the same ComplexSelector shell with different hierarchical data and a form action nearby. The custom content relies on TreeList focus behavior and should be checked against WCAG 2.2.',
      },
    },
  },
};

type ViewDensity = 'Comfortable' | 'Compact';

export const SecondaryVariant: Story = {
  name: 'Secondary toolbar trigger',
  render: () => {
    const [density, setDensity] = useState<ViewDensity>('Comfortable');

    return (
      <div {...stylex.props(styles.toolbarDemo, styles.toolbarDemoIntrinsic)}>
        <Button
          label="Reset view"
          variant="secondary"
          size="sm"
          onClick={() => setDensity('Comfortable')}
        />
        <ComplexSelector<ViewDensity>
          label="View density"
          isLabelHidden
          value={density}
          onChange={setDensity}
          triggerLabel={`Density: ${density}`}
          variant="secondary"
          size="sm"
          width={190}
          startIcon="viewColumns"
          alignment="end"
          contentXstyle={styles.toolbarContent}>
          {(selectedDensity, onChange, close) => (
            <VStack gap={3}>
              <Text type="supporting" color="secondary">
                Choose how densely rows are displayed.
              </Text>
              <HStack gap={2}>
                {(['Comfortable', 'Compact'] as const).map(option => (
                  <Button
                    key={option}
                    label={option}
                    size="sm"
                    variant={
                      selectedDensity === option ? 'primary' : 'secondary'
                    }
                    onClick={() => {
                      onChange(option);
                      close();
                    }}
                  />
                ))}
              </HStack>
            </VStack>
          )}
        </ComplexSelector>
        <Button label="Share" variant="secondary" size="sm" />
      </div>
    );
  },
  play: async ({canvasElement}) => {
    await document.fonts.ready;
    const canvas = within(canvasElement);
    const root = canvasElement.querySelector<HTMLElement>(
      '.astryx-complex-selector[data-variant="secondary"]',
    );
    if (root == null) {
      throw new Error('Secondary ComplexSelector root not found');
    }
    const widthBefore = root.getBoundingClientRect().width;
    expect(widthBefore).toBeCloseTo(190, 0);

    const trigger = canvas.getByRole('combobox', {name: 'View density'});
    await userEvent.click(trigger);
    const dialog = within(document.body).getByRole('dialog', {
      name: 'View density',
    });
    await userEvent.click(
      within(dialog).getByRole('button', {name: 'Compact'}),
    );
    await waitFor(() =>
      expect(root.getBoundingClientRect().width).toBeCloseTo(widthBefore, 0),
    );
    trigger.blur();
  },
  parameters: {
    docs: {
      description: {
        story:
          'A compact toolbar composition where ComplexSelector uses the same neutral-filled treatment as adjacent secondary buttons.',
      },
    },
  },
};

export const ControlledToolbarTrigger: Story = {
  name: 'Controlled toolbar trigger',
  render: () => {
    const [density, setDensity] = useState<ViewDensity>('Comfortable');
    const [isOpen, setIsOpen] = useState(false);
    const selectorRef = useRef<ComplexSelectorHandle>(null);

    return (
      <div {...stylex.props(styles.toolbarDemo)}>
        <Button
          label="Open options externally"
          variant="ghost"
          size="sm"
          onClick={() => selectorRef.current?.toggle()}
        />
        <ComplexSelector<ViewDensity>
          label="View options"
          isLabelHidden
          value={density}
          onChange={setDensity}
          onOpenChange={setIsOpen}
          triggerLabel={`Density: ${density}`}
          variant="ghost"
          startIcon="viewColumns"
          alignment="end"
          handleRef={selectorRef}
          contentXstyle={styles.toolbarContent}>
          {(selectedDensity, onChange, close) => (
            <VStack gap={3}>
              <Text type="supporting" color="secondary">
                The selector owns visibility. An external control drives it
                imperatively via handleRef; choosing a density commits the value
                and closes the surface. onOpenChange reports every open and
                close, including the ones the selector performs itself.
              </Text>
              <HStack gap={2}>
                {(['Comfortable', 'Compact'] as const).map(option => (
                  <Button
                    key={option}
                    label={option}
                    size="sm"
                    variant={
                      selectedDensity === option ? 'primary' : 'secondary'
                    }
                    onClick={() => {
                      onChange(option);
                      close();
                    }}
                  />
                ))}
              </HStack>
            </VStack>
          )}
        </ComplexSelector>
        <Text type="supporting" color="secondary" data-testid="open-state">
          {isOpen ? 'open' : 'closed'}
        </Text>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'A compact toolbar composition using the ghost trigger, a leading icon, end-aligned content, and an external control that opens the selector imperatively through its handleRef. The selector still owns its own visibility, focus restoration, and light dismiss.',
      },
    },
  },
};

export const AuditMatrix: Story = {
  name: 'Audit matrix',
  tags: ['no-visual'],
  render: () => {
    const content = () => <Button label="Apply selection" size="sm" />;

    return (
      <VStack gap={4} xstyle={styles.auditMatrix} data-testid="audit-matrix">
        <ComplexSelector label="Empty small" value="" size="sm">
          {content}
        </ComplexSelector>
        <ComplexSelector
          label="Selected medium"
          value="Design systems"
          triggerLabel="Design systems"
          data-testid="rtl-trigger">
          {content}
        </ComplexSelector>
        <ComplexSelector
          label="Long large"
          value="A long selected destination"
          triggerLabel="A long selected destination that must truncate without widening the field"
          size="lg">
          {content}
        </ComplexSelector>
        <ComplexSelector
          label="Ghost trigger"
          value="Compact"
          triggerLabel="Compact"
          variant="ghost"
          startIcon="viewColumns">
          {content}
        </ComplexSelector>
        <ComplexSelector
          label="Loading value"
          value="Saving"
          triggerLabel="Saving destination"
          isLoading>
          {content}
        </ComplexSelector>
        <ComplexSelector
          label="Disabled value"
          value="Unavailable"
          triggerLabel="Unavailable"
          isDisabled>
          {content}
        </ComplexSelector>
        <ComplexSelector
          label="Invalid required value"
          value="Needs attention"
          triggerLabel="Needs attention"
          isRequired
          status={{type: 'error', message: 'Choose an available destination.'}}>
          {content}
        </ComplexSelector>
        <ComplexSelector
          label="Warning value"
          value="Draft destination"
          triggerLabel="Draft destination"
          status={{type: 'warning', message: 'This destination is archived.'}}>
          {content}
        </ComplexSelector>
        <ComplexSelector
          label="Successful value"
          value="Ready"
          triggerLabel="Ready"
          status={{type: 'success', message: 'Destination is available.'}}>
          {content}
        </ComplexSelector>
        <ComplexSelector
          label="Custom trigger selector"
          value="Custom"
          contentXstyle={styles.auditPopupContent}
          renderTrigger={props => (
            <Button
              data-testid="rtl-custom-trigger"
              label="Custom trigger"
              variant="secondary"
              {...props}
            />
          )}>
          {content}
        </ComplexSelector>
      </VStack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'A bounded audit fixture for the built-in sizes, variants, busy, disabled, validation, overflow, and caller-rendered trigger paths. Browser evidence drives this one fixture through light, dark, RTL, interaction, and 320px states.',
      },
    },
  },
};
