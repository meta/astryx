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
import {Selector} from '@astryxdesign/core/Selector';
import {MultiSelector} from '@astryxdesign/core/MultiSelector';
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
