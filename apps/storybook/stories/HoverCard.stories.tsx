// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {HoverCard, useHoverCard} from '@astryxdesign/core/HoverCard';
import {Button} from '@astryxdesign/core/Button';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

const meta: Meta<typeof HoverCard> = {
  title: 'Core/HoverCard',
  component: HoverCard,
  tags: ['autodocs'],
  argTypes: {
    placement: {
      control: 'select',
      options: ['above', 'below', 'start', 'end'],
      description: 'Position relative to trigger',
    },
    alignment: {
      control: 'select',
      options: ['start', 'center', 'end'],
      description: 'Alignment on placement axis',
    },
    delay: {
      control: 'number',
      description: 'Show delay in ms',
    },
    hideDelay: {
      control: 'number',
      description: 'Hide delay in ms',
    },
    isEnabled: {
      control: 'boolean',
      description: 'Enable/disable the hover card',
    },
    touchTrigger: {
      control: 'select',
      options: ['auto', 'tap', 'none'],
      description:
        'What a tap does where there is no hover: auto (tap unless the trigger acts), tap, or none',
    },
  },
};

export default meta;
type Story = StoryObj<typeof HoverCard>;

// Sample content for hover cards
function ProfileCard() {
  return (
    <div style={{width: 200}}>
      <VStack gap={2}>
        <div style={{fontWeight: 600}}>Jane Doe</div>
        <div style={{fontSize: 14, opacity: 0.7}}>Software Engineer</div>
        <div style={{fontSize: 13}}>
          Building great products with great people.
        </div>
      </VStack>
    </div>
  );
}

export const Default: Story = {
  args: {
    placement: 'above',
    content: <ProfileCard />,
    children: <Button label="Hover me">Hover me</Button>,
  },
};

export const Below: Story = {
  args: {
    placement: 'below',
    content: <ProfileCard />,
    children: <Button label="Hover me">Hover me</Button>,
  },
};

export const Start: Story = {
  args: {
    placement: 'start',
    content: <ProfileCard />,
    children: <Button label="Hover me">Hover me</Button>,
  },
};

export const End: Story = {
  args: {
    placement: 'end',
    content: <ProfileCard />,
    children: <Button label="Hover me">Hover me</Button>,
  },
};

export const CustomDelay: Story = {
  args: {
    placement: 'above',
    delay: 500,
    hideDelay: 300,
    content: <ProfileCard />,
    children: <Button label="Slow hover (500ms)">Slow hover (500ms)</Button>,
  },
};

export const Disabled: Story = {
  args: {
    placement: 'above',
    isEnabled: false,
    content: <ProfileCard />,
    children: <Button label="Hover disabled">Hover disabled</Button>,
  },
};

export const AllPlacements: Story = {
  render: () => (
    <div style={{padding: 100, display: 'flex', gap: 24, flexWrap: 'wrap'}}>
      <HoverCard content={<ProfileCard />} placement="above">
        <Button label="Above">Above</Button>
      </HoverCard>
      <HoverCard content={<ProfileCard />} placement="below">
        <Button label="Below">Below</Button>
      </HoverCard>
      <HoverCard content={<ProfileCard />} placement="start">
        <Button label="Start">Start</Button>
      </HoverCard>
      <HoverCard content={<ProfileCard />} placement="end">
        <Button label="End">End</Button>
      </HoverCard>
    </div>
  ),
};

export const WithHook: Story = {
  render: function HookExample() {
    const hoverCard = useHoverCard({
      placement: 'above',
      delay: 200,
    });

    return (
      <div style={{padding: 100}}>
        <Button
          label="Using hook directly"
          ref={hoverCard.ref}
          aria-describedby={hoverCard.describedBy}>
          Using hook directly
        </Button>
        {hoverCard.renderHoverCard(<ProfileCard />)}
      </div>
    );
  },
};

export const InteractiveContent: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <HoverCard
        placement="below"
        content={
          <VStack gap={2}>
            <div>Interactive hover card content</div>
            <HStack gap={2}>
              <Button label="Follow" variant="primary">
                Follow
              </Button>
              <Button label="Message">Message</Button>
            </HStack>
          </VStack>
        }>
        <Button label="Hover for interactive content">
          Hover for interactive content
        </Button>
      </HoverCard>
    </div>
  ),
};

export const TextNode: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <p>
        This feature was created by{' '}
        <HoverCard content={<ProfileCard />} placement="above">
          Jane Doe
        </HoverCard>{' '}
        and shipped last week.
      </p>
    </div>
  ),
};

export const TextNodeMultiple: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <p>
        The project is maintained by{' '}
        <HoverCard content={<ProfileCard />} placement="above">
          Jane Doe
        </HoverCard>
        ,{' '}
        <HoverCard
          content={
            <div style={{width: 200}}>
              <VStack gap={2}>
                <div style={{fontWeight: 600}}>John Smith</div>
                <div style={{fontSize: 14, opacity: 0.7}}>Product Manager</div>
              </VStack>
            </div>
          }
          placement="above">
          John Smith
        </HoverCard>
        , and others.
      </p>
    </div>
  ),
};

/**
 * Touch has no hover, so a tap decides instead. A tap-opened card is dismissed
 * by a tap outside it, and a tap on the card's own content leaves it open.
 */
export const TouchTriggers: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <HStack gap={4}>
        {/* Acts on tap: the tap belongs to the button, so no card. */}
        <HoverCard content={<ProfileCard />} placement="above">
          <Button label="Open profile">Open profile</Button>
        </HoverCard>
        {/* Does nothing on tap: the tap opens the card. */}
        <HoverCard content={<ProfileCard />} placement="above">
          Jane Doe
        </HoverCard>
      </HStack>
    </div>
  ),
};

function AuditProfile({name, role}: {name: string; role: string}) {
  return (
    <VStack gap={1}>
      <Text type="label">{name}</Text>
      <Text type="supporting">{role}</Text>
    </VStack>
  );
}

/**
 * Both popup roles, shown open. An unlabelled card on a text trigger is a
 * group that describes its trigger. A labelled card with actions is a named
 * dialog that its button advertises.
 */
export const OpenStates: Story = {
  render: () => (
    <VStack gap={0}>
      <div style={{paddingBlock: '24px 152px', paddingInline: 16}}>
        <Text as="p">
          Maintained by{' '}
          <HoverCard
            isOpen
            placement="below"
            alignment="start"
            content={<AuditProfile name="Jane Doe" role="Software engineer" />}>
            Jane Doe
          </HoverCard>
          .
        </Text>
      </div>
      <div style={{paddingBlock: '0 200px', paddingInline: 16}}>
        <HoverCard
          isOpen
          label="Jane Doe profile"
          placement="below"
          alignment="start"
          content={
            <VStack gap={3}>
              <AuditProfile name="Jane Doe" role="Software engineer" />
              <HStack gap={2}>
                <Button label="Follow" variant="primary">
                  Follow
                </Button>
                <Button label="Message">Message</Button>
              </HStack>
            </VStack>
          }>
          <Button label="Jane Doe">Jane Doe</Button>
        </HoverCard>
      </div>
    </VStack>
  ),
};
