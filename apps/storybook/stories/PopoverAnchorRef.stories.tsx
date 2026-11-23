// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverAnchorRef.stories.tsx
 * @input usePopover, Button and TextInput from @astryxdesign/core
 * @output A story with one popover shared by three table rows. One edit
 *   button per row, in a bar above the table, sets `anchorRef` to that row's
 *   value cell and calls `show()`.
 *   A button removes and restores row B's value cell, and a button inside
 *   the popover removes it. A counter shows how often the popover reported a
 *   show and a hide
 * @position Fixture for Popover/__tests__/PopoverAnchor.interaction.browser.spec.ts
 */

import {useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {usePopover} from '@astryxdesign/core/Popover';
import {Button} from '@astryxdesign/core/Button';
import {TextInput} from '@astryxdesign/core/TextInput';

const meta: Meta = {
  title: 'Core/Popover Anchor Ref',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
};
export default meta;

type Story = StoryObj;

const ROWS = ['A', 'B', 'C'];

function RowEditor() {
  const anchorRef = useRef<Element | null>(null);
  const [isRowBShown, setIsRowBShown] = useState(true);
  const [value, setValue] = useState('');
  const [counts, setCounts] = useState({shows: 0, hides: 0});
  const popover = usePopover({
    anchorRef,
    dialogLabel: 'Edit value',
    hasLightDismiss: false,
    onShow: () => setCounts(c => ({...c, shows: c.shows + 1})),
    onHide: () => setCounts(c => ({...c, hides: c.hides + 1})),
  });
  const {show} = popover;
  return (
    <div>
      {/* The edit buttons sit above the table: the popover opens below a
          value cell, so it never covers a button that moves it. */}
      <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
        {ROWS.map(row => (
          <Button
            key={row}
            label={`Edit row ${row}`}
            onClick={() => {
              anchorRef.current = document.querySelector(
                `[data-cell="${row}"]`,
              );
              show();
            }}
          />
        ))}
      </div>
      <table>
        <tbody>
          {ROWS.map(row => (
            <tr key={row}>
              {row === 'B' && !isRowBShown ? (
                <td key="removed" />
              ) : (
                <td
                  key="value"
                  data-cell={row}
                  style={{padding: 8, minWidth: 160}}>
                  Value {row}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Far enough below the table that the open popover never covers it. */}
      <div style={{marginBlockStart: 240}}>
        <Button
          label={isRowBShown ? 'Remove row B value' : 'Restore row B value'}
          onClick={() => setIsRowBShown(isShown => !isShown)}
        />
        <output data-testid="counts">
          shows {counts.shows}, hides {counts.hides}
        </output>
      </div>
      {popover.render(
        <>
          <TextInput label="Value" value={value} onChange={setValue} />
          <Button
            label="Delete value B"
            onClick={() => setIsRowBShown(false)}
          />
        </>,
      )}
    </div>
  );
}

/** One popover that moves between rows; no outside press closes it. */
export const Rows: Story = {
  render: () => <RowEditor />,
};
