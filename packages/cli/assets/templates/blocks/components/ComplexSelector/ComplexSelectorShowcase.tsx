// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {ComplexSelector} from '@astryxdesign/core/ComplexSelector';
import {Text} from '@astryxdesign/core/Text';
import {useGridFocus} from '@astryxdesign/core/hooks';
import {
  borderVars,
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';

type Fruit = 'Apple' | 'Pear' | 'Peach' | 'Plum';
type Ripeness = 'Crisp' | 'Tender' | 'Juicy' | 'Peak';

interface FruitValue {
  fruit: Fruit;
  ripeness: Ripeness;
}

const fruits: Array<{id: Fruit; emoji: string; description: string}> = [
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

const GRID_CELL_SELECTOR = '[role="gridcell"]';

const styles = stylex.create({
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
    minWidth: 280,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(150px, 1fr) repeat(4, 44px)',
    alignItems: 'center',
    columnGap: spacingVars['--spacing-1'],
  },
  rowHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    textAlign: 'start',
    minWidth: 0,
  },
  emoji: {
    fontSize: 18,
    flexShrink: 0,
  },
  fruitText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  cell: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-card'],
    color: colorVars['--color-text-secondary'],
    fontFamily: 'inherit',
    cursor: 'pointer',
    ':hover': {
      '@media (hover: hover)': {
        borderColor: colorVars['--color-border-emphasized'],
        color: colorVars['--color-text-primary'],
      },
    },
  },
  cellSelected: {
    borderColor: colorVars['--color-accent'],
    backgroundColor: colorVars['--color-accent'],
    color: colorVars['--color-on-accent'],
  },
});

function FruitRipenessGrid({
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
    const rowIndex = fruits.findIndex(f => f.id === value.fruit);
    const columnIndex = ripenessLevels.findIndex(l => l.id === value.ripeness);
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
      {...stylex.props(styles.grid)}>
      {fruits.map(fruit => (
        <div key={fruit.id} role="row" {...stylex.props(styles.row)}>
          <div role="rowheader" {...stylex.props(styles.rowHeader)}>
            <span aria-hidden="true" {...stylex.props(styles.emoji)}>
              {fruit.emoji}
            </span>
            <span {...stylex.props(styles.fruitText)}>
              <Text type="body">{fruit.id}</Text>
              <Text type="supporting" color="secondary">
                {fruit.description}
              </Text>
            </span>
          </div>
          {ripenessLevels.map(level => {
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
                onClick={() => onChange({fruit: fruit.id, ripeness: level.id})}
                {...stylex.props(
                  styles.cell,
                  isSelected && styles.cellSelected,
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

export default function ComplexSelectorShowcase() {
  const [value, setValue] = useState<FruitValue>({
    fruit: 'Apple',
    ripeness: 'Juicy',
  });

  return (
    <ComplexSelector<FruitValue>
      label="Fruit blend"
      description="Choose a fruit and ripeness in one control. Arrow keys move across the grid."
      value={value}
      onChange={setValue}
      triggerLabel={`${value.fruit} · ${value.ripeness}`}
      controlStyle={{width: 280}}>
      {(selectedValue, onChange, close) => (
        <FruitRipenessGrid
          value={selectedValue}
          onChange={nextValue => {
            onChange(nextValue);
            close();
          }}
        />
      )}
    </ComplexSelector>
  );
}
