// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import type {CSSProperties} from 'react';
import {OverflowList} from '@astryxdesign/core/OverflowList';
import type {OverflowItem} from '@astryxdesign/core/OverflowList';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {TextInput} from '@astryxdesign/core/TextInput';

const meta: Meta<typeof OverflowList> = {
  title: 'Core/OverflowList',
  component: OverflowList,
  tags: ['autodocs'],
  argTypes: {
    gap: {
      control: {type: 'number', min: 0, max: 10},
      description:
        'Gap between items as a spacing token step (0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10)',
    },
    minVisibleItems: {
      control: {type: 'number', min: 0, max: 10},
      description: 'Minimum number of items to always show',
    },
    maxVisibleItems: {
      control: {type: 'number', min: 0, max: 10},
      description: 'Maximum number of items to ever show (cap)',
    },
    maxRows: {
      control: {type: 'number', min: 1, max: 4},
      description: 'Wrap items across up to N rows before collapsing',
    },
    collapseFrom: {
      control: 'select',
      options: ['start', 'end'],
      description: 'Which end to collapse items from',
    },
  },
};

export default meta;
type Story = StoryObj<typeof OverflowList>;

// Basic usage - resize the container to see overflow behavior
export const Default: Story = {
  render: () => (
    <div style={{maxWidth: 400, border: '1px dashed #ccc', padding: 8}}>
      <OverflowList
        gap={2}
        overflowRenderer={overflowItems => (
          <Button
            label={`+${overflowItems.length} more`}
            variant="ghost"
            size="sm"
          />
        )}>
        <Button label="Edit" size="sm" />
        <Button label="Duplicate" size="sm" />
        <Button label="Share" size="sm" />
        <Button label="Archive" size="sm" />
        <Button label="Delete" size="sm" />
      </OverflowList>
    </div>
  ),
};

// Resizable container to interactively test overflow
export const Resizable: Story = {
  render: () => (
    <div
      style={{
        resize: 'horizontal',
        overflow: 'hidden',
        border: '1px dashed #ccc',
        padding: 8,
        width: 500,
        minWidth: 100,
        maxWidth: '100%',
      }}>
      <OverflowList
        gap={2}
        overflowRenderer={overflowItems => (
          <Button
            label={`+${overflowItems.length} more`}
            variant="ghost"
            size="sm"
          />
        )}>
        <Button label="Dashboard" size="sm" />
        <Button label="Analytics" size="sm" />
        <Button label="Reports" size="sm" />
        <Button label="Settings" size="sm" />
        <Button label="Users" size="sm" />
        <Button label="Billing" size="sm" />
        <Button label="Integrations" size="sm" />
      </OverflowList>
    </div>
  ),
};

// All items fit - no overflow indicator shown
export const NoOverflow: Story = {
  render: () => (
    <div style={{maxWidth: 600, border: '1px dashed #ccc', padding: 8}}>
      <OverflowList
        gap={2}
        overflowRenderer={overflowItems => (
          <Button
            label={`+${overflowItems.length} more`}
            variant="ghost"
            size="sm"
          />
        )}>
        <Button label="Edit" size="sm" />
        <Button label="Save" size="sm" />
      </OverflowList>
    </div>
  ),
};

// With badges instead of buttons
export const WithBadges: Story = {
  render: () => (
    <div
      style={{
        resize: 'horizontal',
        overflow: 'hidden',
        border: '1px dashed #ccc',
        padding: 8,
        width: 300,
        minWidth: 80,
      }}>
      <OverflowList
        gap={1}
        overflowRenderer={overflowItems => (
          <Badge variant="neutral" label={`+${overflowItems.length}`} />
        )}>
        <Badge variant="info" label="React" />
        <Badge variant="success" label="TypeScript" />
        <Badge variant="warning" label="StyleX" />
        <Badge variant="neutral" label="Storybook" />
        <Badge variant="error" label="Vitest" />
      </OverflowList>
    </div>
  ),
};

// Collapse from start
export const CollapseFromStart: Story = {
  render: () => (
    <div style={{maxWidth: 300, border: '1px dashed #ccc', padding: 8}}>
      <OverflowList
        gap={2}
        collapseFrom="start"
        overflowRenderer={overflowItems => (
          <Button
            label={`+${overflowItems.length} more`}
            variant="ghost"
            size="sm"
          />
        )}>
        <Button label="Step 1" size="sm" />
        <Button label="Step 2" size="sm" />
        <Button label="Step 3" size="sm" />
        <Button label="Step 4" size="sm" />
        <Button label="Step 5" size="sm" />
      </OverflowList>
    </div>
  ),
};

// With dropdown menu as overflow indicator
export const WithDropdownOverflow: Story = {
  render: () => {
    const actions = ['Save', 'Edit', 'Duplicate', 'Share', 'Archive', 'Delete'];
    return (
      <div
        style={{
          resize: 'horizontal',
          overflow: 'hidden',
          border: '1px dashed #ccc',
          padding: 8,
          width: 350,
          minWidth: 100,
          maxWidth: '100%',
        }}>
        <OverflowList
          gap={2}
          overflowRenderer={overflowItems => (
            <DropdownMenu
              button={{
                label: `+${overflowItems.length}`,
                variant: 'ghost',
                size: 'sm',
              }}
              items={overflowItems.map(({index}) => ({
                label: actions[index],
                onClick: () => console.log(actions[index]),
              }))}
            />
          )}>
          <Button label="Save" size="sm" variant="primary" />
          <Button label="Edit" size="sm" />
          <Button label="Duplicate" size="sm" />
          <Button label="Share" size="sm" />
          <Button label="Archive" size="sm" />
          <Button label="Delete" size="sm" variant="destructive" />
        </OverflowList>
      </div>
    );
  },
};

// Alongside another element — the input wraps and hides when space is tight
export const WithSiblingElement: Story = {
  render: () => {
    const [search, setSearch] = useState('');
    return (
      <div
        style={{
          resize: 'horizontal',
          overflow: 'hidden',
          border: '1px dashed #ccc',
          minWidth: 100,
          width: 600,
        }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            padding: 8,
            height: 44,
          }}>
          <OverflowList
            gap={2}
            behavior="observeParent"
            overflowRenderer={overflowItems => (
              <Button
                label={`+${overflowItems.length} more`}
                variant="ghost"
                size="sm"
              />
            )}>
            <Button label="Dashboard" size="sm" />
            <Button label="Analytics" size="sm" />
            <Button label="Reports" size="sm" />
            <Button label="Settings" size="sm" />
            <Button label="Users" size="sm" />
            <Button label="Billing" size="sm" />
          </OverflowList>
          <div style={{width: 70, flexShrink: 0}}>
            <TextInput
              label="Search"
              isLabelHidden
              placeholder="Search..."
              size="sm"
              value={search}
              onChange={setSearch}
            />
          </div>
        </div>
      </div>
    );
  },
};

// Dynamic items
export const DynamicItems: Story = {
  render: () => {
    const [count, setCount] = useState(5);
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
          <Button
            label="Remove"
            size="sm"
            onClick={() => setCount(c => Math.max(1, c - 1))}
          />
          <Button label="Add" size="sm" onClick={() => setCount(c => c + 1)} />
          <span>{count} items</span>
        </div>
        <div
          style={{
            resize: 'horizontal',
            overflow: 'hidden',
            border: '1px dashed #ccc',
            padding: 8,
            width: 400,
            minWidth: 100,
            maxWidth: '100%',
          }}>
          <OverflowList
            gap={2}
            overflowRenderer={items => (
              <Button
                label={`+${items.length} more`}
                variant="ghost"
                size="sm"
              />
            )}>
            {Array.from({length: count}, (_, i) => (
              <Button key={i} label={`Item ${i + 1}`} size="sm" />
            ))}
          </OverflowList>
        </div>
      </div>
    );
  },
};

// Cap the number of visible items with maxVisibleItems — even in a wide
// container only three actions show; the rest move to the overflow dropdown.
export const CappedItems: Story = {
  render: () => {
    const actions = ['Save', 'Edit', 'Duplicate', 'Share', 'Archive', 'Delete'];
    return (
      <div style={{maxWidth: 700, border: '1px dashed #ccc', padding: 8}}>
        <OverflowList
          gap={2}
          maxVisibleItems={3}
          overflowRenderer={overflowItems => (
            <DropdownMenu
              button={{
                label: `+${overflowItems.length}`,
                variant: 'ghost',
                size: 'sm',
              }}
              items={overflowItems.map(({index}) => ({
                label: actions[index],
              }))}
            />
          )}>
          {actions.map(action => (
            <Button key={action} label={action} size="sm" />
          ))}
        </OverflowList>
      </div>
    );
  },
};

// Multi-row wrapping — tags flow onto up to two rows, then collapse the rest
// into a count badge. Resize the container to see rows fill and collapse.
export const MultiRow: Story = {
  render: () => {
    const tags = [
      'React',
      'TypeScript',
      'StyleX',
      'Storybook',
      'Vitest',
      'Playwright',
      'ESLint',
      'Prettier',
      'Vite',
      'pnpm',
    ];
    return (
      <div
        style={{
          resize: 'horizontal',
          overflow: 'hidden',
          border: '1px dashed #ccc',
          padding: 8,
          width: 280,
          minWidth: 120,
          maxWidth: '100%',
        }}>
        <OverflowList
          gap={1}
          maxRows={2}
          overflowRenderer={overflowItems => (
            <Badge variant="neutral" label={`+${overflowItems.length}`} />
          )}>
          {tags.map(tag => (
            <Badge key={tag} variant="info" label={tag} />
          ))}
        </OverflowList>
      </div>
    );
  },
};

// Cap + multi-row together — whichever limit is hit first wins. Here the cap
// of five items applies even though two rows could hold more.
export const CappedMultiRow: Story = {
  render: () => {
    const tags = [
      'React',
      'TypeScript',
      'StyleX',
      'Storybook',
      'Vitest',
      'Playwright',
      'ESLint',
      'Prettier',
    ];
    return (
      <div style={{maxWidth: 520, border: '1px dashed #ccc', padding: 8}}>
        <OverflowList
          gap={1}
          maxRows={2}
          maxVisibleItems={5}
          overflowRenderer={overflowItems => (
            <Badge variant="neutral" label={`+${overflowItems.length}`} />
          )}>
          {tags.map(tag => (
            <Badge key={tag} variant="info" label={tag} />
          ))}
        </OverflowList>
      </div>
    );
  },
};

// A row that already owns a menu — the collapsed actions join it instead of
// growing a second anchor. Drag the container's resize handle: the "More" menu
// stays put and its entries appear and disappear as the row narrows and widens.
export const StandingAnchor: Story = {
  render: () => {
    const actions = ['Rerun', 'Branch', 'Share', 'Export', 'Duplicate'];
    const [hidden, setHidden] = useState<OverflowItem[]>([]);
    return (
      <div
        style={{
          resize: 'horizontal',
          overflow: 'hidden',
          border: '1px dashed #ccc',
          padding: 8,
          width: 520,
          minWidth: 140,
          maxWidth: '100%',
        }}
        data-testid="standing-anchor"
        data-hidden-count={hidden.length}>
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <div style={{flex: '1 1 auto', minWidth: 0}}>
            <OverflowList gap={2} onOverflowChange={setHidden}>
              {actions.map(action => (
                <Button key={action} label={action} size="sm" />
              ))}
            </OverflowList>
          </div>
          <DropdownMenu
            button={{label: 'More', variant: 'ghost', size: 'sm'}}
            items={[
              ...hidden.map(({index}) => ({label: actions[index]})),
              {label: 'Rename session'},
              {label: 'Delete session'},
            ]}
          />
        </div>
      </div>
    );
  },
};

/** A shrink-to-fit parent sizes to the list's items, and a one-item list keeps its own width. Contributed in #11996. */
export const ContentSizedParent: Story = {
  render: () => (
    <div style={{width: 700, padding: 8}}>
      <div
        data-testid="content-sized"
        style={{display: 'inline-block', verticalAlign: 'top'}}>
        <OverflowList
          gap={2}
          overflowRenderer={overflowItems => (
            <Button
              label={`+${overflowItems.length}`}
              variant="ghost"
              size="sm"
            />
          )}>
          <Button label="Save" size="sm" />
          <Button label="Edit" size="sm" />
          <Button label="Duplicate" size="sm" />
          <Button label="Share" size="sm" />
          <Button label="Archive" size="sm" />
          <Button label="Delete" size="sm" />
        </OverflowList>
      </div>
      <div data-testid="one-item" style={{display: 'flex', marginTop: 8}}>
        <OverflowList
          gap={2}
          overflowRenderer={overflowItems => (
            <Button
              label={`+${overflowItems.length} more`}
              variant="ghost"
              size="sm"
            />
          )}>
          <Button label="Go" size="sm" />
        </OverflowList>
      </div>
    </div>
  ),
};

/** In a wide flex row, a list whose width the caller sets or caps (in pixels, with `calc()`, or with a flex basis) folds within that width and keeps its trigger; one set narrower than its folded width holds its folded width. A list capped at three items is as wide as those items and its trigger. */
export const CallerLimitedWidth: Story = {
  render: () => {
    const items = ['Save', 'Edit', 'Duplicate', 'Share', 'Archive', 'Delete'];
    const list = (style: CSSProperties) => (
      <OverflowList
        gap={2}
        style={style}
        overflowRenderer={overflowItems => (
          <Button
            label={`+${overflowItems.length}`}
            variant="ghost"
            size="sm"
          />
        )}>
        {items.map(label => (
          <Button key={label} label={label} size="sm" />
        ))}
      </OverflowList>
    );
    return (
      <div style={{width: 700, padding: 8}}>
        <div data-testid="width-set" style={{display: 'flex'}}>
          {list({width: 200})}
        </div>
        <div data-testid="width-capped" style={{display: 'flex', marginTop: 8}}>
          {list({maxWidth: 200})}
        </div>
        <div data-testid="width-calc" style={{display: 'flex', marginTop: 8}}>
          {list({maxWidth: 'calc(25% + 30px)'})}
        </div>
        <div data-testid="basis-narrow" style={{display: 'flex', marginTop: 8}}>
          {list({flex: '0 0 30px'})}
        </div>
        <div data-testid="width-narrow" style={{display: 'flex', marginTop: 8}}>
          {list({width: 30})}
        </div>
        <div data-testid="count-capped" style={{display: 'flex', marginTop: 8}}>
          <OverflowList
            gap={2}
            maxVisibleItems={3}
            overflowRenderer={overflowItems => (
              <Button
                label={`+${overflowItems.length}`}
                variant="ghost"
                size="sm"
              />
            )}>
            {items.map(label => (
              <Button key={label} label={label} size="sm" />
            ))}
          </OverflowList>
        </div>
      </div>
    );
  },
};

/** In a flex row that narrows and widens again, a list that folds from the start, one that keeps one item, and one whose indicator is plain text unfold again as the row widens. */
export const RowWidensAfterFold: Story = {
  render: () => {
    const items = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'];
    const list = (props: {
      collapseFrom?: 'start' | 'end';
      minVisibleItems?: number;
      textIndicator?: boolean;
    }) => (
      <OverflowList
        gap={2}
        collapseFrom={props.collapseFrom}
        minVisibleItems={props.minVisibleItems}
        overflowRenderer={overflowItems =>
          props.textIndicator === true ? (
            `+${overflowItems.length}`
          ) : (
            <Button
              label={`+${overflowItems.length}`}
              variant="ghost"
              size="sm"
            />
          )
        }>
        {items.map(label => (
          <Button key={label} label={label} size="sm" />
        ))}
      </OverflowList>
    );
    return (
      <div data-testid="widen-frame" style={{width: 900, padding: 8}}>
        <div data-testid="from-start" style={{display: 'flex'}}>
          {list({collapseFrom: 'start'})}
        </div>
        <div data-testid="one-kept" style={{display: 'flex', marginTop: 8}}>
          {list({minVisibleItems: 1})}
        </div>
        <div
          data-testid="text-indicator"
          style={{display: 'flex', marginTop: 8}}>
          {list({textIndicator: true})}
        </div>
      </div>
    );
  },
};

/** A list followed by a button in a flex row: a folded list keeps the width the row gives it, up to its unfolded width, and the button sits after that width. Below it, a list in a block parent fills the line, as before. */
export const FollowedBySibling: Story = {
  render: () => {
    const items = ['Save', 'Edit', 'Duplicate', 'Share', 'Archive', 'Delete'];
    return (
      <div
        data-testid="sibling-frame"
        style={{
          width: 900,
          maxWidth: '100%',
          resize: 'horizontal',
          overflow: 'auto',
          padding: 8,
        }}>
        <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
          <OverflowList
            gap={2}
            overflowRenderer={overflowItems => (
              <Button
                label={`+${overflowItems.length}`}
                variant="ghost"
                size="sm"
              />
            )}>
            {items.map(label => (
              <Button key={label} label={label} size="sm" />
            ))}
          </OverflowList>
          <Button label="After" size="sm" variant="secondary" />
        </div>
        <div data-testid="block-parent" style={{marginTop: 8}}>
          <OverflowList gap={2}>
            <Button label="Save" size="sm" />
            <Button label="Edit" size="sm" />
          </OverflowList>
        </div>
      </div>
    );
  },
};

/** Lists in flex rows under an ancestor scaled to one half: one with room shows every item, one in a 30 px parent keeps its trigger whole. */
export const ScaledRow: Story = {
  render: () => {
    const items = ['Save', 'Edit', 'Duplicate', 'Share', 'Archive', 'Delete'];
    const list = () => (
      <OverflowList
        gap={2}
        overflowRenderer={overflowItems => (
          <Button
            label={`+${overflowItems.length}`}
            variant="ghost"
            size="sm"
          />
        )}>
        {items.map(label => (
          <Button key={label} label={label} size="sm" />
        ))}
      </OverflowList>
    );
    return (
      <div
        data-testid="scaled-frame"
        style={{width: 700, transform: 'scale(0.5)', transformOrigin: '0 0'}}>
        <div data-testid="scaled-wide" style={{display: 'flex'}}>
          {list()}
        </div>
        <div
          data-testid="scaled-narrow"
          style={{display: 'flex', width: 30, marginTop: 8}}>
          {list()}
        </div>
      </div>
    );
  },
};

/** A list wider than 1000 px in a flex row with room: it shows every item and holds its width across frames. */
export const WideRow: Story = {
  render: () => {
    const items = Array.from({length: 14}, (_, index) => `Action ${index + 1}`);
    return (
      <div data-testid="wide-frame" style={{width: 1400, padding: 8}}>
        <div data-testid="wide-row" style={{display: 'flex'}}>
          <OverflowList
            gap={2}
            overflowRenderer={overflowItems => (
              <Button
                label={`+${overflowItems.length}`}
                variant="ghost"
                size="sm"
              />
            )}>
            {items.map(label => (
              <Button key={label} label={label} size="sm" />
            ))}
          </OverflowList>
        </div>
      </div>
    );
  },
};
