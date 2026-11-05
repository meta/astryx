// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {StackItem} from '@astryxdesign/core/Stack';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {Cog6ToothIcon, TrashIcon} from '@heroicons/react/24/outline';

const buttonStoryStyles = stylex.create({
  fullWidth: {
    width: '100%',
  },
});

const meta: Meta<typeof Button> = {
  title: 'Core/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Accessible label (required)',
    },
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'destructive'],
      description: 'Visual style variant',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size variant',
    },
    elevation: {
      control: 'inline-radio',
      options: ['none', 'low', 'med', 'high'],
      description: 'Resting shadow depth (for floating buttons / FABs)',
    },
    isLoading: {
      control: 'boolean',
      description: 'Loading state',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
    endContent: {
      control: false,
      description: 'Content rendered after the label (e.g. icon, badge)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    label: 'Primary Button',
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    label: 'Secondary Button',
    variant: 'secondary',
  },
};

export const Ghost: Story = {
  args: {
    label: 'Ghost Button',
    variant: 'ghost',
  },
};

export const Destructive: Story = {
  args: {
    label: 'Delete',
    variant: 'destructive',
  },
};

export const Loading: Story = {
  args: {
    label: 'Loading...',
    variant: 'primary',
    isLoading: true,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled',
    variant: 'primary',
    isDisabled: true,
  },
};

export const SizeVariants: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
      <Button label="Small" variant="primary" size="sm" />
      <Button label="Medium" variant="primary" size="md" />
      <Button label="Large" variant="primary" size="lg" />
    </div>
  ),
};

export const IconOnly: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '12px'}}>
      <Button
        label="Settings"
        variant="ghost"
        icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
        isIconOnly
      />
      <Button
        label="Delete"
        variant="destructive"
        icon={<TrashIcon style={{width: 16, height: 16}} />}
        isIconOnly
      />
    </div>
  ),
};

export const IconWithText: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '12px'}}>
      <Button
        label="Settings"
        variant="secondary"
        icon={
          <Cog6ToothIcon
            data-testid="button-leading-icon"
            style={{width: 16, height: 16}}
          />
        }>
        <span data-testid="button-label">Settings</span>
      </Button>
      <Button
        label="Delete"
        variant="destructive"
        icon={<TrashIcon style={{width: 16, height: 16}} />}
      />
    </div>
  ),
};

export const WithEndSlot: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
      <Button
        label="Messages"
        variant="primary"
        endContent={<Badge variant="info" label={3} />}
      />
      <Button
        label="Notifications"
        variant="secondary"
        endContent={<Badge variant="neutral" label="New" />}
      />
    </div>
  ),
};

export const IconAndEndSlot: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
      <Button
        label="Settings"
        variant="secondary"
        icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
        endContent={<Badge variant="info" label="New" />}
      />
      <Button
        label="Delete"
        variant="destructive"
        icon={<TrashIcon style={{width: 16, height: 16}} />}
        endContent={<Badge variant="error" label={5} />}
      />
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '600px',
      }}>
      <div style={{display: 'flex', gap: '12px'}}>
        <Button label="Primary" variant="primary" />
        <Button label="Secondary" variant="secondary" />
        <Button label="Ghost" variant="ghost" />
        <Button label="Destructive" variant="destructive" />
      </div>
      <div style={{display: 'flex', gap: '12px'}}>
        <Button label="Loading..." variant="primary" isLoading />
        <Button label="Loading..." variant="secondary" isLoading />
        <Button label="Loading..." variant="ghost" isLoading />
        <Button label="Loading..." variant="destructive" isLoading />
      </div>
      <div style={{display: 'flex', gap: '12px'}}>
        <Button label="Disabled" variant="primary" isDisabled />
        <Button label="Disabled" variant="secondary" isDisabled />
        <Button label="Disabled" variant="ghost" isDisabled />
        <Button label="Disabled" variant="destructive" isDisabled />
      </div>
      <div style={{display: 'flex', gap: '12px'}}>
        <Button
          label="Settings"
          variant="ghost"
          icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
          isIconOnly
        />
        <Button
          label="Settings"
          variant="secondary"
          icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
        />
        <Button
          label="Delete"
          variant="destructive"
          icon={<TrashIcon style={{width: 16, height: 16}} />}
          isIconOnly
        />
      </div>
      <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
        <Button label="Small" variant="primary" size="sm" />
        <Button label="Medium" variant="primary" size="md" />
        <Button label="Large" variant="primary" size="lg" />
      </div>
      <div style={{display: 'flex', gap: '12px'}}>
        <Button
          label="With Badge"
          variant="primary"
          endContent={<Badge variant="info" label={3} />}
        />
        <Button
          label="With Badge"
          variant="secondary"
          endContent={<Badge variant="neutral" label="New" />}
        />
        <Button
          label="Icon + Badge"
          variant="ghost"
          icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
          endContent={<Badge variant="info" label={5} />}>
          Settings
        </Button>
      </div>
    </div>
  ),
};

/**
 * Demonstrates button rendering as a link when `href` is provided.
 * Right-click to verify native browser link context menu (open in new tab, etc.).
 * Disabled state falls back to `<button>` — disabled links are an a11y anti-pattern.
 */
export const LinkButton: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
      <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
        <Button
          label="Visit Example"
          href="https://example.com"
          variant="primary"
        />
        <Button
          label="Open in new tab"
          href="https://example.com"
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
        />
        <Button label="Ghost link" href="https://example.com" variant="ghost" />
      </div>
      <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
        <Button
          label="Disabled link"
          href="https://example.com"
          variant="primary"
          isDisabled
        />
        <Button
          label="Loading link"
          href="https://example.com"
          variant="primary"
          isLoading
        />
      </div>
      <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
        <Button
          label="Settings"
          href="https://example.com"
          variant="secondary"
          icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
        />
        <Button
          label="Icon-only link"
          href="https://example.com"
          variant="ghost"
          icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
          isIconOnly
        />
      </div>
    </div>
  ),
};

/**
 * Demonstrates button text truncation in constrained containers.
 * When a button's container is narrower than the button's natural width,
 * the label truncates with an ellipsis instead of wrapping to multiple lines.
 */
export const Truncation: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
      <div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            marginBottom: 8,
          }}>
          200px container — label truncates with ellipsis
        </p>
        <div style={{width: 200, border: '1px dashed #ccc', padding: 4}}>
          <Button
            label="A very long button label that overflows"
            variant="primary"
            icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
          />
        </div>
      </div>
      <div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            marginBottom: 8,
          }}>
          Flex row with limited space — button shrinks gracefully
        </p>
        <div style={{display: 'flex', gap: 8, maxWidth: 320}}>
          <div style={{flex: 1, minWidth: 0}}>
            <Button
              label="Submit this extremely long form action"
              variant="primary"
              xstyle={buttonStoryStyles.fullWidth}
            />
          </div>
          <Button label="Cancel" variant="secondary" />
        </div>
      </div>
      <div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            marginBottom: 8,
          }}>
          Unconstrained — renders at natural width
        </p>
        <Button
          label="A very long button label that shows fully"
          variant="primary"
          icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
        />
      </div>
    </div>
  ),
};

function ReviewersCard() {
  const [emails, setEmails] = useState('');
  return (
    <Card maxWidth={560}>
      <VStack gap={4}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Heading level={3} maxLines={1}>
              Design review
            </Heading>
          </StackItem>
          <Button label="Request review from the design team" size="sm" />
          <IconButton
            label="More review options"
            icon={<Icon icon="moreHorizontal" />}
            variant="ghost"
            size="sm"
          />
        </HStack>
        <TextInput
          label="Reviewer emails"
          placeholder="name@example.com"
          value={emails}
          onChange={setEmails}
        />
        <HStack gap={2} hAlign="end">
          <StackItem size="static">
            <Button label="Cancel" variant="secondary" />
          </StackItem>
          <Button
            label="Send invitations to all 12 reviewers"
            variant="primary"
          />
        </HStack>
      </VStack>
    </Card>
  );
}

/**
 * The Button.doc.mjs "Actions in narrow rows" example at a 320px form width,
 * a 390px phone width, and a roomy 600px width. In the narrow frames the long
 * labels truncate with an ellipsis inside the card instead of overflowing or
 * being clipped; the icon-only button stays square; the roomy frame renders
 * every button at its natural width.
 */
export const NarrowRows: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        gap: 24,
        flexWrap: 'wrap',
        alignItems: 'flex-start',
      }}>
      {[320, 390, 600].map(width => (
        <div key={width} style={{width}}>
          <p
            style={{
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              marginBottom: 8,
            }}>
            {width}px
          </p>
          <ReviewersCard />
        </div>
      ))}
    </div>
  ),
};

export const Elevations: Story = {
  render: () => (
    <div style={{display: 'flex', gap: 24, alignItems: 'center'}}>
      {(['none', 'low', 'med', 'high'] as const).map(elevation => (
        <div key={elevation} style={{textAlign: 'center'}}>
          <p
            style={{
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              marginBottom: 8,
            }}>
            elevation=&quot;{elevation}&quot;
          </p>
          <Button label={elevation} variant="primary" elevation={elevation} />
        </div>
      ))}
    </div>
  ),
};
