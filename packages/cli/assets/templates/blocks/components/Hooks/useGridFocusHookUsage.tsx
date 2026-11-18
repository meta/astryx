// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {useGridFocus} from '@astryxdesign/core/hooks';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

const COLUMNS = 8;

const SWATCHES = [
  {name: 'Red', value: '#e5484d'},
  {name: 'Tomato', value: '#f76b15'},
  {name: 'Amber', value: '#ffc53d'},
  {name: 'Lime', value: '#bdee63'},
  {name: 'Green', value: '#30a46c'},
  {name: 'Teal', value: '#12a594'},
  {name: 'Cyan', value: '#00a2c7'},
  {name: 'Blue', value: '#0090ff'},
  {name: 'Indigo', value: '#3e63dd'},
  {name: 'Violet', value: '#6e56cf'},
  {name: 'Purple', value: '#8e4ec6'},
  {name: 'Plum', value: '#ab4aba'},
  {name: 'Pink', value: '#d6409f'},
  {name: 'Brown', value: '#ad7f58'},
  {name: 'Gray', value: '#8d8d8d'},
  {name: 'Black', value: '#111111'},
];

const ROWS = Array.from({length: SWATCHES.length / COLUMNS}, (_, row) =>
  SWATCHES.slice(row * COLUMNS, (row + 1) * COLUMNS),
);

export default function UseGridFocusHookUsage() {
  const [selected, setSelected] = useState(SWATCHES[0].name);
  const {gridRef, handleKeyDown, handleFocus} = useGridFocus<HTMLDivElement>({
    columns: COLUMNS,
    cellSelector: '[role="gridcell"]',
    getFocusTarget: cell => cell.querySelector('button'),
    hasRovingTabIndex: true,
  });

  return (
    <Card padding={4}>
      <VStack gap={3}>
        <Text type="body">Selected: {selected}</Text>
        <div
          ref={gridRef}
          role="grid"
          aria-label="Colors"
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          style={{display: 'flex', flexDirection: 'column', gap: 4}}>
          {ROWS.map((row, index) => (
            <div key={index} role="row" style={{display: 'flex', gap: 4}}>
              {row.map(swatch => (
                <div
                  key={swatch.name}
                  role="gridcell"
                  aria-selected={swatch.name === selected}>
                  <button
                    type="button"
                    aria-label={swatch.name}
                    aria-pressed={swatch.name === selected}
                    onClick={() => setSelected(swatch.name)}
                    style={{
                      width: 28,
                      height: 28,
                      border: 'none',
                      boxShadow:
                        'inset 0 0 0 1px var(--color-border-emphasized)',
                      borderRadius: 4,
                      background: swatch.value,
                    }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </VStack>
    </Card>
  );
}
