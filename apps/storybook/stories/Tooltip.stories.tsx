// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Tooltip, useTooltip} from '@astryxdesign/core/Tooltip';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/Layout';

const meta: Meta<typeof Tooltip> = {
  title: 'Core/Tooltip',
  component: Tooltip,
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
      description: 'Enable/disable the tooltip',
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
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  args: {
    placement: 'above',
    content: 'This is a helpful tooltip',
    children: <Button label="Hover me">Hover me</Button>,
  },
};

export const Below: Story = {
  args: {
    placement: 'below',
    content: 'Tooltip appears below',
    children: <Button label="Hover me">Hover me</Button>,
  },
};

export const Start: Story = {
  args: {
    placement: 'start',
    content: 'Tooltip on start',
    children: <Button label="Hover me">Hover me</Button>,
  },
};

export const RTLLogicalPlacement: Story = {
  args: {
    placement: 'start',
    content: 'Tooltip on logical start',
    children: (
      <Button label="RTL placement target">RTL placement target</Button>
    ),
    isDefaultOpen: true,
  },
};

export const End: Story = {
  args: {
    placement: 'end',
    content: 'Tooltip on end',
    children: <Button label="Hover me">Hover me</Button>,
  },
};

export const CustomDelay: Story = {
  args: {
    placement: 'above',
    delay: 500,
    content: 'Slower tooltip (500ms delay)',
    children: <Button label="Slow tooltip">Slow tooltip</Button>,
  },
};

export const Disabled: Story = {
  name: 'Disabled Tooltip',
  args: {
    placement: 'above',
    isEnabled: false,
    content: 'You should not see this',
    children: <Button label="Hover me">Hover me</Button>,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates disabling the tooltip via the `isEnabled` prop. When `isEnabled` is `false`, the tooltip will not appear on hover or focus, even though the trigger element remains fully interactive. This is useful for conditionally showing tooltips based on application state.',
      },
    },
  },
};

export const AllPlacements: Story = {
  render: () => (
    <div style={{padding: 100, display: 'flex', gap: 24, flexWrap: 'wrap'}}>
      <Tooltip content="Above" placement="above">
        <Button label="Above">Above</Button>
      </Tooltip>
      <Tooltip content="Below" placement="below">
        <Button label="Below">Below</Button>
      </Tooltip>
      <Tooltip content="Start" placement="start">
        <Button label="Start">Start</Button>
      </Tooltip>
      <Tooltip content="End" placement="end">
        <Button label="End">End</Button>
      </Tooltip>
    </div>
  ),
};

export const WithHook: Story = {
  render: function HookExample() {
    const tooltip = useTooltip({
      placement: 'above',
      delay: 100,
    });

    return (
      <div style={{padding: 100}}>
        <Button
          label="Using hook directly"
          ref={tooltip.ref}
          aria-describedby={tooltip.describedBy}>
          Using hook directly
        </Button>
        {tooltip.renderTooltip('Tooltip via hook')}
      </div>
    );
  },
};

export const LongContent: Story = {
  args: {
    placement: 'above',
    content:
      'This is a longer tooltip that contains more detailed information about the element.',
    children: <Button label="Hover for more info">Hover for more info</Button>,
  },
};

/** Sixty lines: taller than the room above or below a mid-page trigger. */
const TALL_LINES = Array.from(
  {length: 60},
  (_, i) => `Line ${i + 1} of a tooltip taller than the space around it`,
);

/**
 * Content taller than the room above and below its trigger. The page is two
 * and a half viewports tall so the trigger can be scrolled to any height.
 */
export const TallContent: Story = {
  parameters: {layout: 'fullscreen'},
  args: {
    placement: 'above',
    content: (
      <div>
        {TALL_LINES.map(line => (
          <div key={line}>{line}</div>
        ))}
      </div>
    ),
    children: <Button label="Hover for details">Hover for details</Button>,
  },
  render: args => (
    <div
      style={{
        minHeight: '250vh',
        display: 'grid',
        placeItems: 'center',
      }}>
      <Tooltip {...args} />
    </div>
  ),
};

/**
 * A tall tooltip held open while its render call moves from a plain container
 * into a paragraph, which hosts the layer elsewhere and remounts it. The
 * replacement must keep its trigger clear exactly as the first one did.
 */
export const TallContentMovingHost: Story = {
  parameters: {layout: 'fullscreen'},
  render: function TallContentMovingHostExample() {
    const [inParagraph, setInParagraph] = useState(false);
    const tooltip = useTooltip({placement: 'above', isOpen: true});
    const rendered = tooltip.renderTooltip(
      <div>
        {TALL_LINES.map(line => (
          <div key={line}>{line}</div>
        ))}
      </div>,
    );
    return (
      <div style={{minHeight: '100vh', display: 'grid', placeItems: 'center'}}>
        <div
          style={{
            position: 'fixed',
            insetBlockStart: 16,
            insetInlineStart: 16,
          }}>
          <Button
            label="Move the tooltip's host"
            onClick={() => setInParagraph(value => !value)}>
            Move the tooltip&apos;s host
          </Button>
        </div>
        <Button
          label="Tall tooltip trigger"
          ref={tooltip.ref}
          aria-describedby={tooltip.describedBy}>
          Tall tooltip trigger
        </Button>
        {inParagraph ? <p>{rendered}</p> : <div>{rendered}</div>}
      </div>
    );
  },
};

/**
 * A tooltip held open while its caller replaces the trigger element with
 * another one in the same place. The replacement is the anchor from then on,
 * and the tooltip must keep it clear as it moves or resizes.
 */
export const TallContentReplacedTrigger: Story = {
  parameters: {layout: 'fullscreen'},
  render: function TallContentReplacedTriggerExample() {
    const [generation, setGeneration] = useState(0);
    const tooltip = useTooltip({placement: 'above', isOpen: true});
    return (
      <div style={{minHeight: '100vh'}}>
        <div
          style={{
            position: 'fixed',
            insetBlockStart: 16,
            insetInlineStart: 16,
          }}>
          <Button
            label="Replace the trigger"
            onClick={() => setGeneration(value => value + 1)}>
            Replace the trigger
          </Button>
        </div>
        {/* The trigger's bottom edge sits 682px down, so it grows upward. */}
        <div
          style={{
            blockSize: 682,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
          }}>
          <Button
            key={generation}
            label={`Trigger ${generation + 1}`}
            ref={tooltip.ref}
            aria-describedby={tooltip.describedBy}>
            {`Trigger ${generation + 1}`}
          </Button>
        </div>
        {tooltip.renderTooltip(
          <div>
            <div>A tooltip that stays open</div>
            {Array.from({length: 17}, (_, i) => (
              <div key={i}>{`Line ${i + 1}`}</div>
            ))}
          </div>,
        )}
      </div>
    );
  },
};

export const MultipleTooltips: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <HStack gap={4}>
        <Tooltip content="Save your changes" placement="above">
          <Button label="Save">Save</Button>
        </Tooltip>
        <Tooltip content="Discard changes" placement="above">
          <Button label="Cancel">Cancel</Button>
        </Tooltip>
        <Tooltip content="Delete permanently" placement="above">
          <Button label="Delete" variant="destructive">
            Delete
          </Button>
        </Tooltip>
      </HStack>
    </div>
  ),
};

export const TextNode: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <p>
        This paragraph contains a{' '}
        <Tooltip content="Tooltip on inline text!" placement="above">
          hover-able term
        </Tooltip>{' '}
        that explains what something means.
      </p>
    </div>
  ),
};

export const TextNodeInline: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <p>
        Learn more about our{' '}
        <Tooltip
          content="Your data is encrypted and never shared"
          placement="above">
          privacy policy
        </Tooltip>{' '}
        and{' '}
        <Tooltip content="Standard 30-day agreement" placement="above">
          terms of service
        </Tooltip>
        .
      </p>
    </div>
  ),
};

/**
 * Touch has no hover, so a tap decides instead — and what the trigger does
 * decides for it. Try these on a phone, or in a device emulator with touch
 * emulation on.
 */
export const TouchTriggers: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <HStack gap={4}>
        {/* Acts on tap: the tap belongs to the button, so no tooltip. */}
        <Tooltip content="Saves your changes" placement="above">
          <Button label="Save">Save</Button>
        </Tooltip>
        {/* Does nothing on tap: the tap opens the tooltip. */}
        <Tooltip content="Tooltip on inline text!" placement="above">
          hover-able term
        </Tooltip>
        {/* A button whose only job is the tooltip — say so with `tap`. */}
        <Tooltip
          content="Rows are ranked by how many places import the icon"
          placement="above"
          touchTrigger="tap">
          <Button label="What is this?" variant="secondary">
            ?
          </Button>
        </Tooltip>
      </HStack>
    </div>
  ),
};
