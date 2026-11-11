// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {InputGroup} from '@astryxdesign/core/InputGroup';
import {InputGroupText} from '@astryxdesign/core/InputGroup';
import {TextInput} from '@astryxdesign/core/TextInput';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {TimeInput} from '@astryxdesign/core/TimeInput';
import {DateInput} from '@astryxdesign/core/DateInput';
import type {ISODateString} from '@astryxdesign/core/Calendar';
import {Typeahead} from '@astryxdesign/core/Typeahead';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';
import {Tokenizer} from '@astryxdesign/core/Tokenizer';
import {Selector} from '@astryxdesign/core/Selector';
import {MultiSelector} from '@astryxdesign/core/MultiSelector';
import {Badge} from '@astryxdesign/core/Badge';
import {Icon} from '@astryxdesign/core/Icon';
import type {ISOTimeString} from '@astryxdesign/core';

const fruits: SearchableItem[] = [
  {id: '1', label: 'Apple'},
  {id: '2', label: 'Banana'},
  {id: '3', label: 'Cherry'},
  {id: '4', label: 'Date'},
  {id: '5', label: 'Elderberry'},
  {id: '6', label: 'Fig'},
  {id: '7', label: 'Grape'},
];

const fruitSource: SearchSource = {
  search: (query: string) =>
    fruits.filter(f => f.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => fruits.slice(0, 5),
};

const meta: Meta<typeof InputGroup> = {
  title: 'Core/InputGroup',
  component: InputGroup,
  tags: ['autodocs'],
  argTypes: {
    label: {control: 'text', description: 'Label text (required)'},
    isLabelHidden: {control: 'boolean', description: 'Visually hide the label'},
    description: {control: 'text', description: 'Description text'},
    isDisabled: {control: 'boolean', description: 'Disable the group'},
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
      description: 'Input size',
    },
  },
};

export default meta;
type Story = StoryObj<typeof InputGroup>;

const TEAM_OPTIONS = ['Design Systems', 'Infrastructure', 'Product'];
const VISIBILITY_OPTIONS = ['Only me', 'Members', 'Anyone'];
const COUNTRY_CODE_OPTIONS = ['+1', '+44', '+81'];

export const WithPrefix: Story = {
  render: args => {
    const [value, setValue] = useState('');
    return (
      <InputGroup {...args}>
        <InputGroupText>$</InputGroupText>
        <TextInput
          label="Amount"
          isLabelHidden
          value={value}
          onChange={setValue}
          placeholder="0.00"
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Price',
  },
};

export const WithSuffix: Story = {
  render: args => {
    const [value, setValue] = useState('');
    return (
      <InputGroup {...args}>
        <TextInput
          label="Weight"
          isLabelHidden
          value={value}
          onChange={setValue}
          placeholder="0"
        />
        <InputGroupText>kg</InputGroupText>
      </InputGroup>
    );
  },
  args: {
    label: 'Weight',
  },
};

export const WithPrefixAndSuffix: Story = {
  render: args => {
    const [value, setValue] = useState('');
    return (
      <InputGroup {...args}>
        <InputGroupText>https://</InputGroupText>
        <TextInput
          label="URL"
          isLabelHidden
          value={value}
          onChange={setValue}
          placeholder="example"
        />
        <InputGroupText>.com</InputGroupText>
      </InputGroup>
    );
  },
  args: {
    label: 'Website',
  },
};

export const WithIconPrefix: Story = {
  render: args => {
    const [value, setValue] = useState('');
    return (
      <InputGroup {...args}>
        <InputGroupText>
          <Icon icon="search" size="sm" color="secondary" />
        </InputGroupText>
        <TextInput
          label="Search"
          isLabelHidden
          value={value}
          onChange={setValue}
          placeholder="Search..."
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Search',
    isLabelHidden: true,
  },
};

export const WithTypeahead: Story = {
  render: args => {
    const [value, setValue] = useState<SearchableItem | null>(null);
    return (
      <InputGroup {...args}>
        <InputGroupText>Fruit</InputGroupText>
        <Typeahead
          label="Selection"
          isLabelHidden
          searchSource={fruitSource}
          value={value}
          onChange={setValue}
          placeholder="Search fruits..."
          hasEntriesOnFocus
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Favorite fruit',
    description: 'Select one fruit from the list',
  },
};

export const WithTokenizer: Story = {
  render: args => {
    const [value, setValue] = useState<SearchableItem[]>([fruits[0]]);
    return (
      <InputGroup {...args}>
        <InputGroupText>Tags</InputGroupText>
        <Tokenizer
          label="Selections"
          isLabelHidden
          searchSource={fruitSource}
          value={value}
          onChange={setValue}
          placeholder="Add fruits..."
          maxEntries={3}
          hasEntriesOnFocus
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Favorite fruits',
    description: 'Pick up to three fruits',
  },
};

export const WithTokenizerOverflow: Story = {
  render: () => {
    const [many, setMany] = useState<SearchableItem[]>(fruits.slice(0, 6));
    const [sized, setSized] = useState<SearchableItem[]>(fruits.slice(0, 2));
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          width: '320px',
        }}>
        {/* More tokens than fit: the grouped row stays single-line and scrolls. */}
        <InputGroup label="Favorite fruits">
          <InputGroupText>Tags</InputGroupText>
          <Tokenizer
            label="Selections"
            isLabelHidden
            searchSource={fruitSource}
            value={many}
            onChange={setMany}
            placeholder="Add fruits..."
          />
        </InputGroup>
        {/* An explicit lg Tokenizer takes the sm group's size. */}
        <InputGroup label="Snack fruits" size="sm">
          <InputGroupText>Tags</InputGroupText>
          <Tokenizer
            label="Selections"
            isLabelHidden
            size="lg"
            searchSource={fruitSource}
            value={sized}
            onChange={setSized}
            placeholder="Add fruits..."
          />
        </InputGroup>
      </div>
    );
  },
};

/**
 * End controls hold the row's inline end while a grouped Tokenizer's tokens
 * overflow: the tokens scroll beside the clear button and `endContent`, never
 * underneath them, and the controls do not move with the scroll.
 */
export const WithTokenizerOverflowEndControls: Story = {
  render: () => {
    const [value, setValue] = useState<SearchableItem[]>(fruits.slice(0, 6));
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '320px',
        }}>
        <InputGroup label="Favorite fruits">
          <InputGroupText>Tags</InputGroupText>
          <Tokenizer
            label="Selections"
            isLabelHidden
            searchSource={fruitSource}
            value={value}
            onChange={setValue}
            placeholder="Add fruits..."
            hasClear
            endContent={<Badge label={String(value.length)} />}
          />
        </InputGroup>
      </div>
    );
  },
  play: async ({canvasElement}) => {
    const row = canvasElement.querySelector<HTMLElement>('.astryx-tokenizer');
    const input = row?.querySelector<HTMLInputElement>('[role="combobox"]');
    const endContent = row?.querySelector<HTMLElement>('.astryx-badge');
    const clearButton = row?.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear all"]',
    );
    const tokens = Array.from(
      row?.querySelectorAll<HTMLElement>('.astryx-token') ?? [],
    );
    if (!row || !input || !endContent || !clearButton || tokens.length < 2) {
      throw new Error(
        'Grouped end-controls fixture did not render as expected',
      );
    }

    const nextFrame = () =>
      new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await document.fonts.ready;
    await nextFrame();
    await nextFrame();

    // Fail closed if the fixture stops overflowing: without a scrolling token
    // row every check below would pass vacuously.
    const scroller = [row, ...row.querySelectorAll<HTMLElement>('*')].find(
      element => {
        const {overflowX} = getComputedStyle(element);
        return (
          (overflowX === 'auto' || overflowX === 'scroll') &&
          element.scrollWidth > element.clientWidth
        );
      },
    );
    if (!scroller) {
      throw new Error(
        'Fixture no longer overflows: the grouped token row does not scroll',
      );
    }

    const endControlsRect = () => {
      const content = endContent.getBoundingClientRect();
      const clear = clearButton.getBoundingClientRect();
      return {
        left: Math.min(content.left, clear.left),
        right: Math.max(content.right, clear.right),
      };
    };
    const assertClearOfEndControls = (position: string) => {
      const end = endControlsRect();
      const clip = scroller.getBoundingClientRect();
      for (const element of [...tokens, input]) {
        const rect = element.getBoundingClientRect();
        // Only the part the scrolling row leaves visible can paint or be hit.
        const left = Math.max(rect.left, clip.left);
        const right = Math.min(rect.right, clip.right);
        const overlap = Math.min(right, end.right) - Math.max(left, end.left);
        if (right > left && overlap > 0.5) {
          const name =
            element === input
              ? 'The combobox'
              : `Token "${element.textContent}"`;
          throw new Error(
            `${name} sits under the end controls by ${overlap.toFixed(2)}px at the ${position} of the scroll`,
          );
        }
      }
      const clearRect = clearButton.getBoundingClientRect();
      const hit = document.elementFromPoint(
        clearRect.left + clearRect.width / 2,
        clearRect.top + clearRect.height / 2,
      );
      if (!hit || !clearButton.contains(hit)) {
        throw new Error(
          `Clear all center is hit-tested as ${hit?.tagName ?? 'nothing'} at the ${position} of the scroll`,
        );
      }
    };

    const tokenTops = tokens.map(token => token.getBoundingClientRect().top);
    if (Math.max(...tokenTops) - Math.min(...tokenTops) > 0.5) {
      throw new Error('Grouped tokens wrapped onto a second row');
    }

    assertClearOfEndControls('start');
    const endAtStart = endControlsRect();

    const isRTL = getComputedStyle(scroller).direction === 'rtl';
    scroller.scrollLeft = (isRTL ? -1 : 1) * scroller.scrollWidth;
    await nextFrame();
    if (scroller.scrollLeft === 0) {
      throw new Error('The grouped token row did not scroll');
    }

    const endAtEnd = endControlsRect();
    const shift = Math.max(
      Math.abs(endAtEnd.left - endAtStart.left),
      Math.abs(endAtEnd.right - endAtStart.right),
    );
    if (shift > 0.5) {
      throw new Error(
        `End controls moved ${shift.toFixed(2)}px when the token row scrolled`,
      );
    }
    assertClearOfEndControls('end');

    // Leave the row at rest, so that is the frame a screenshot keeps.
    scroller.scrollLeft = 0;
  },
};

export const WithTokenizerOverflowEndControlsRTL: Story = {
  ...WithTokenizerOverflowEndControls,
  decorators: [
    Story => (
      <div dir="rtl">
        <Story />
      </div>
    ),
  ],
  name: 'With Tokenizer Overflow End Controls (RTL)',
};

/**
 * A disabled field has no remove buttons, so the overflowing strip is itself
 * the keyboard stop; one that fits adds no stop. The first field's disabled
 * reason keeps its input focusable, after the strip.
 * Browser evidence: Tokenizer/__tests__/TokenizerGroupScroll.a11y.browser.spec.ts.
 */
export const WithTokenizerOverflowDisabled: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '320px',
      }}>
      <InputGroup label="Favorite fruits">
        <InputGroupText>Tags</InputGroupText>
        <Tokenizer
          label="Selections"
          isLabelHidden
          searchSource={fruitSource}
          value={fruits.slice(0, 6)}
          onChange={() => {}}
          isDisabled
          disabledMessage="Selections are locked for review"
        />
      </InputGroup>
      <InputGroup label="Favorite fruit">
        <InputGroupText>Tags</InputGroupText>
        <Tokenizer
          label="Selection"
          isLabelHidden
          searchSource={fruitSource}
          value={fruits.slice(0, 1)}
          onChange={() => {}}
          isDisabled
        />
      </InputGroup>
    </div>
  ),
};

export const WithNumberInput: Story = {
  render: args => {
    const [value, setValue] = useState<number | undefined>(undefined);
    return (
      <InputGroup {...args}>
        <InputGroupText>$</InputGroupText>
        <NumberInput
          label="Amount"
          isLabelHidden
          value={value}
          onChange={setValue}
          placeholder="0.00"
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Budget',
  },
};

export const WithTimeInput: Story = {
  render: args => {
    const [value, setValue] = useState<ISOTimeString | undefined>(
      '09:00' as ISOTimeString,
    );
    return (
      <InputGroup {...args}>
        <InputGroupText>Starts</InputGroupText>
        <TimeInput
          label="Start time"
          isLabelHidden
          value={value}
          onChange={setValue}
          hourFormat="24h"
          placeholder="09:00"
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Schedule',
    description: 'Use local time',
  },
};

export const WithDateInput: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return (
      <InputGroup {...args}>
        <InputGroupText>Due</InputGroupText>
        <DateInput
          label="Date"
          isLabelHidden
          value={value}
          onChange={setValue}
          placeholder="Select date"
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Deadline',
    description: 'Pick the due date',
  },
};

export const WithSelector: Story = {
  render: args => {
    const [value, setValue] = useState<string | undefined>(undefined);
    return (
      <InputGroup {...args}>
        <InputGroupText>Team</InputGroupText>
        <Selector
          label="Owner"
          isLabelHidden
          options={TEAM_OPTIONS}
          value={value}
          onChange={setValue}
          placeholder="Choose owner"
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Default owner',
  },
};

export const WithActionButton: Story = {
  render: args => {
    const [value, setValue] = useState<string | undefined>('Members');
    return (
      <InputGroup {...args}>
        <Selector
          label="Audience"
          isLabelHidden
          options={VISIBILITY_OPTIONS}
          value={value}
          onChange={setValue}
        />
        <Button label="Save" />
      </InputGroup>
    );
  },
  args: {
    label: 'Visibility',
  },
};

export const ActionButtonCombinations: Story = {
  render: () => {
    const [prefixValue, setPrefixValue] = useState('');
    const [suffixValue, setSuffixValue] = useState('');
    const [visibility, setVisibility] = useState<string | undefined>('Members');

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          maxWidth: 520,
        }}>
        <InputGroup label="Prefix action" size="sm">
          <Button label="Paste" />
          <TextInput
            label="Code"
            isLabelHidden
            value={prefixValue}
            onChange={setPrefixValue}
            placeholder="Enter code"
          />
        </InputGroup>
        <InputGroup label="Text action" size="md">
          <TextInput
            label="Query"
            isLabelHidden
            value={suffixValue}
            onChange={setSuffixValue}
            placeholder="Search"
          />
          <Button label="Search" variant="primary" />
        </InputGroup>
        <InputGroup label="Selector action" size="lg">
          <Selector
            label="Audience"
            isLabelHidden
            options={VISIBILITY_OPTIONS}
            value={visibility}
            onChange={setVisibility}
          />
          <Button label="Save" tooltip="Save visibility" />
        </InputGroup>
      </div>
    );
  },
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState('example');
    return (
      <InputGroup {...args}>
        <TextInput
          label="URL"
          value={value}
          onChange={setValue}
          htmlName="website"
          disabledMessage="Website editing is unavailable"
        />
        <Button label="Clear" onClick={() => setValue('')} />
      </InputGroup>
    );
  },
  args: {
    label: 'Website',
    description: 'The input and action inherit the group disabled state.',
    isDisabled: true,
  },
};

export const WithMultiSelector: Story = {
  render: args => {
    const [value, setValue] = useState<string[]>([]);
    return (
      <InputGroup {...args}>
        <InputGroupText>Teams</InputGroupText>
        <MultiSelector
          label="Owners"
          isLabelHidden
          options={TEAM_OPTIONS}
          value={value}
          onChange={setValue}
          placeholder="Choose owners"
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Default owners',
    description: 'Select one or more teams',
  },
};

export const WithDescription: Story = {
  render: args => {
    const [value, setValue] = useState('');
    return (
      <InputGroup {...args}>
        <InputGroupText>@</InputGroupText>
        <TextInput
          label="Username"
          isLabelHidden
          value={value}
          onChange={setValue}
          placeholder="username"
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Username',
    description: 'Your public display name',
  },
};

export const WithErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState('');
    return (
      <InputGroup {...args}>
        <InputGroupText>$</InputGroupText>
        <TextInput
          label="Amount"
          isLabelHidden
          value={value}
          onChange={setValue}
          placeholder="0.00"
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Price',
    status: {type: 'error', message: 'Price is required'},
  },
};

export const SmallSize: Story = {
  render: args => {
    const [value, setValue] = useState('');
    return (
      <InputGroup {...args}>
        <InputGroupText>$</InputGroupText>
        <TextInput
          label="Amount"
          isLabelHidden
          value={value}
          onChange={setValue}
          placeholder="0.00"
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Price',
    size: 'sm',
  },
};

export const FullWidth: Story = {
  render: args => {
    const [value, setValue] = useState('');
    return (
      <div style={{maxWidth: 500}}>
        <InputGroup {...args}>
          <InputGroupText>https://</InputGroupText>
          <TextInput
            label="URL"
            isLabelHidden
            value={value}
            onChange={setValue}
            placeholder="example.com"
          />
        </InputGroup>
      </div>
    );
  },
  args: {
    label: 'Website URL',
  },
};

export const TwoInputs: Story = {
  render: args => {
    const [left, setLeft] = useState('');
    const [right, setRight] = useState('');
    return (
      <InputGroup {...args}>
        <TextInput
          label="Address"
          isLabelHidden
          value={left}
          onChange={setLeft}
          placeholder="Address"
        />
        <InputGroupText>@</InputGroupText>
        <TextInput
          label="Domain"
          isLabelHidden
          value={right}
          onChange={setRight}
          placeholder="Domain"
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Email',
  },
};

export const AllVariations: Story = {
  render: () => {
    const [v1, setV1] = useState('');
    const [v2, setV2] = useState('');
    const [v3, setV3] = useState('');
    const [v4, setV4] = useState('');
    const [v5, setV5] = useState<SearchableItem | null>(null);
    const [v6, setV6] = useState<string | undefined>(undefined);

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '400px',
        }}>
        <InputGroup label="Price">
          <InputGroupText>$</InputGroupText>
          <TextInput
            label="Amount"
            isLabelHidden
            value={v1}
            onChange={setV1}
            placeholder="0.00"
          />
        </InputGroup>
        <InputGroup label="Website">
          <InputGroupText>https://</InputGroupText>
          <TextInput
            label="URL"
            isLabelHidden
            value={v2}
            onChange={setV2}
            placeholder="example"
          />
          <InputGroupText>.com</InputGroupText>
        </InputGroup>
        <InputGroup label="Favorite fruit">
          <InputGroupText>Fruit</InputGroupText>
          <Typeahead
            label="Selection"
            isLabelHidden
            searchSource={fruitSource}
            value={v5}
            onChange={setV5}
            placeholder="Search fruits..."
            hasEntriesOnFocus
          />
        </InputGroup>
        <InputGroup label="Weight">
          <TextInput
            label="Weight"
            isLabelHidden
            value={v3}
            onChange={setV3}
            placeholder="0"
          />
          <InputGroupText>kg</InputGroupText>
        </InputGroup>
        <InputGroup
          label="Price"
          status={{type: 'error', message: 'Price is required'}}>
          <InputGroupText>$</InputGroupText>
          <TextInput
            label="Amount"
            isLabelHidden
            value={v4}
            onChange={setV4}
            placeholder="0.00"
          />
        </InputGroup>
        <InputGroup label="Default owner">
          <InputGroupText>Team</InputGroupText>
          <Selector
            label="Owner"
            isLabelHidden
            options={TEAM_OPTIONS}
            value={v6}
            onChange={setV6}
            placeholder="Choose owner"
          />
        </InputGroup>
      </div>
    );
  },
};

/**
 * Two inputs side by side, with no addon between them. Focus either one: its
 * whole focus ring shows, because a focused member stays above its
 * neighbour.
 */
export const AdjacentInputs: Story = {
  render: args => {
    const [code, setCode] = useState<string | undefined>('+1');
    const [number, setNumber] = useState('');
    return (
      <InputGroup {...args}>
        <Selector
          label="Country code"
          isLabelHidden
          options={COUNTRY_CODE_OPTIONS}
          value={code}
          onChange={setCode}
        />
        <TextInput
          label="Number"
          isLabelHidden
          value={number}
          onChange={setNumber}
          placeholder="555 0100"
        />
      </InputGroup>
    );
  },
  args: {
    label: 'Phone',
  },
};
