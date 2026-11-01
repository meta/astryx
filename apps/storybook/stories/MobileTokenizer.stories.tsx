// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file MobileTokenizer.stories.tsx
 * @input Uses MobileTokenizer (Lab) with a 1,000-entry searchable dataset
 * @output Storybook try-it story at 390px: one searchable management sheet
 *   with stable checkbox rows and enough entries to evaluate progressive
 *   list rendering
 * @position Lab story; single-sheet touch-flow prototype
 */
import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';
import {MobileTokenizer} from '@astryxdesign/lab';

const tags: SearchableItem[] = Array.from({length: 1000}, (_, index) => {
  const number = index + 1;
  return {
    id: `tag-${number}`,
    label:
      number === 1
        ? 'Design'
        : number === 2
          ? 'Eng'
          : `Tag ${String(number).padStart(2, '0')}`,
  };
});
const source: SearchSource = {
  search: (q: string) =>
    tags.filter(t => t.label.toLowerCase().includes(q.toLowerCase())),
  bootstrap: () => tags,
};

const meta: Meta<typeof MobileTokenizer> = {
  title: 'Lab/MobileTokenizer',
  component: MobileTokenizer,
};
export default meta;
type Story = StoryObj<typeof MobileTokenizer>;

export const TouchFlow: Story = {
  render: () => {
    const [value, setValue] = useState<SearchableItem[]>([tags[0], tags[1]]);
    return (
      <div style={{width: 350}}>
        <MobileTokenizer
          label="Tags"
          searchSource={source}
          value={value}
          onChange={items => setValue(items)}
          placeholder="Add tags"
          hasCreate
          maxMenuItems={1000}
          debounceMs={0}
        />
      </div>
    );
  },
  name: 'Touch flow (single searchable management sheet)',
};

export const Disabled: Story = {
  render: () => (
    <div style={{width: 350, display: 'grid', gap: 16}}>
      <MobileTokenizer
        label="Tags"
        searchSource={source}
        value={[tags[0], tags[1]]}
        onChange={() => {}}
        placeholder="Add tags"
        isDisabled
      />
      <MobileTokenizer
        label="Empty tags"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        placeholder="Add tags"
        isDisabled
      />
    </div>
  ),
};

export const AtLimit: Story = {
  render: () => {
    const [value, setValue] = useState<SearchableItem[]>([tags[0], tags[1]]);
    return (
      <div style={{width: 350}}>
        <MobileTokenizer
          label="Tags"
          searchSource={source}
          value={value}
          onChange={items => setValue(items)}
          placeholder="Add tags"
          maxEntries={2}
          debounceMs={0}
        />
      </div>
    );
  },
  name: 'At the maxEntries limit',
};
