// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Token, type TokenColor} from '@astryxdesign/core/Token';

const meta: Meta<typeof Token> = {
  title: 'Core/Token',
  component: Token,
  tags: ['autodocs'],
  argTypes: {
    color: {
      control: 'select',
      options: [
        'default',
        'red',
        'orange',
        'yellow',
        'green',
        'teal',
        'cyan',
        'blue',
        'purple',
        'pink',
        'gray',
      ],
      description: 'Color variant',
    },
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
      description: 'Token size',
    },
    label: {
      control: 'text',
      description: 'Token label text',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Whether the token is disabled',
    },
    isLabelHidden: {
      control: 'boolean',
      description: 'Visually hide the label',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Token>;

export const Default: Story = {
  args: {
    label: 'Token',
  },
};

const allColors: TokenColor[] = [
  'default',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'cyan',
  'blue',
  'purple',
  'pink',
  'gray',
];

export const Colors: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
      {allColors.map(color => (
        <Token key={color} label={color} color={color} />
      ))}
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
      <Token
        label="Star"
        icon={
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 0l1.8 3.6L12 4.2 8.9 7.1l.7 4.1L6 9.2 2.4 11.2l.7-4.1L0 4.2l4.2-.6z" />
          </svg>
        }
      />
      <Token
        label="Info"
        color="blue"
        icon={
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle
              cx="6"
              cy="6"
              r="5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <text
              x="6"
              y="9"
              textAnchor="middle"
              fontSize="8"
              fill="currentColor">
              i
            </text>
          </svg>
        }
      />
    </div>
  ),
};

export const WithRemove: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
      <Token label="Removable" onRemove={() => alert('Removed!')} />
      <Token
        label="Red tag"
        color="red"
        onRemove={() => alert('Removed!')}
      />
      <Token
        label="Blue tag"
        color="blue"
        onRemove={() => alert('Removed!')}
      />
    </div>
  ),
};

export const Clickable: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
      <Token label="Click me" onClick={() => alert('Clicked!')} />
      <Token
        label="Green action"
        color="green"
        onClick={() => alert('Clicked!')}
      />
    </div>
  ),
};

export const AsLink: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
      <Token label="Link token" href="#" />
      <Token label="Purple link" color="purple" href="#" />
    </div>
  ),
};

export const WithEndContent: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
      <Token
        label="Count"
        endContent={
          <span
            style={{
              fontSize: '10px',
              opacity: 0.7,
              marginInlineStart: '2px',
            }}>
            (3)
          </span>
        }
      />
      <Token
        label="Status"
        color="green"
        endContent={
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'currentColor',
              marginInlineStart: '2px',
            }}
          />
        }
      />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
      <Token label="Disabled" isDisabled />
      <Token
        label="Disabled click"
        onClick={() => alert('Should not fire')}
        isDisabled
      />
      <Token
        label="Disabled remove"
        onRemove={() => alert('Should not fire')}
        isDisabled
      />
      <Token label="Disabled link" href="#" isDisabled />
    </div>
  ),
};

export const SizeVariants: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
      <div>
        <h4 style={{margin: '0 0 8px'}}>Small (20px)</h4>
        <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
          <Token label="Small" size="sm" />
          <Token label="Removable" size="sm" onRemove={() => {}} />
          <Token label="Clickable" size="sm" onClick={() => {}} />
        </div>
      </div>
      <div>
        <h4 style={{margin: '0 0 8px'}}>Medium (24px, default)</h4>
        <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
          <Token label="Medium" size="md" />
          <Token label="Removable" size="md" onRemove={() => {}} />
          <Token label="Clickable" size="md" onClick={() => {}} />
        </div>
      </div>
      <div>
        <h4 style={{margin: '0 0 8px'}}>Large (28px)</h4>
        <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
          <Token label="Large" size="lg" />
          <Token label="Removable" size="lg" onRemove={() => {}} />
          <Token label="Clickable" size="lg" onClick={() => {}} />
        </div>
      </div>
    </div>
  ),
};

export const AllVariations: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
      <div>
        <h4 style={{margin: '0 0 8px'}}>Display only</h4>
        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
          {allColors.map(color => (
            <Token key={color} label={color} color={color} />
          ))}
        </div>
      </div>
      <div>
        <h4 style={{margin: '0 0 8px'}}>With remove</h4>
        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
          {allColors.map(color => (
            <Token
              key={color}
              label={color}
              color={color}
              onRemove={() => {}}
            />
          ))}
        </div>
      </div>
      <div>
        <h4 style={{margin: '0 0 8px'}}>Clickable</h4>
        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
          {allColors.map(color => (
            <Token
              key={color}
              label={color}
              color={color}
              onClick={() => {}}
            />
          ))}
        </div>
      </div>
      <div>
        <h4 style={{margin: '0 0 8px'}}>Disabled</h4>
        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
          {allColors.map(color => (
            <Token key={color} label={color} color={color} isDisabled />
          ))}
        </div>
      </div>
    </div>
  ),
};
