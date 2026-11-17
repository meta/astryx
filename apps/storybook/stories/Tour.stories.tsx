// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useRef, useState} from 'react';
import {Tour, TourStep} from '@astryxdesign/lab';
import type {LayerAlignment, LayerPlacement} from '@astryxdesign/core/Layer';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {Theme, defineTheme} from '@astryxdesign/core/theme';

const meta: Meta<typeof Tour> = {
  title: 'Lab/Tour',
  component: Tour,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div style={{minHeight: 480, padding: 32}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tour>;

export const Showcase: Story = {
  render: () => {
    const [isActive, setIsActive] = useState(false);
    const saveRef = useRef<HTMLButtonElement>(null);
    const shareRef = useRef<HTMLButtonElement>(null);
    const settingsRef = useRef<HTMLButtonElement>(null);

    return (
      <VStack gap={4}>
        <HStack gap={2}>
          <Button ref={saveRef} variant="secondary" label="Save" />
          <Button ref={shareRef} variant="secondary" label="Share" />
          <Button ref={settingsRef} variant="secondary" label="Settings" />
        </HStack>

        <Button label="Start tour" onClick={() => setIsActive(true)} />

        <Tour
          isActive={isActive}
          hasBackdrop
          isStepCountShown
          onDismiss={() => setIsActive(false)}>
          <TourStep targetRef={saveRef} heading="Save your work">
            Changes save automatically to the cloud as you go.
          </TourStep>
          <TourStep targetRef={shareRef} heading="Share with your team">
            Invite teammates and manage access from here.
          </TourStep>
          <TourStep targetRef={settingsRef} heading="Tune your setup">
            Adjust preferences and defaults in Settings.
          </TourStep>
        </Tour>
      </VStack>
    );
  },
};

export const WithoutBackdrop: Story = {
  render: () => {
    const [isActive, setIsActive] = useState(false);
    const targetRef = useRef<HTMLButtonElement>(null);

    return (
      <VStack gap={4}>
        <Heading level={3}>Feature callout</Heading>
        <Text type="body">
          A single-step tour with no dimmed background — a lightweight
          coachmark.
        </Text>
        <Button ref={targetRef} variant="secondary" label="New feature" />
        <Button label="Highlight it" onClick={() => setIsActive(true)} />

        <Tour isActive={isActive} onDismiss={() => setIsActive(false)}>
          <TourStep
            targetRef={targetRef}
            heading="Try the new feature"
            placement="below">
            We just shipped this — click to explore.
          </TourStep>
        </Tour>
      </VStack>
    );
  },
};

// A step can point at any element, such as a card, and the page stays usable
// while a step shows: Tab reaches the page, and pressing the control a step
// introduces keeps the tour running.
export const CardTarget: Story = {
  render: () => {
    const [isActive, setIsActive] = useState(false);
    const [refreshCount, setRefreshCount] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);
    const refreshRef = useRef<HTMLButtonElement>(null);

    return (
      <VStack gap={4}>
        <Card ref={cardRef} padding={4}>
          <VStack gap={1}>
            <Heading level={4}>Revenue</Heading>
            <Text type="body">$1.2M this quarter</Text>
          </VStack>
        </Card>
        <HStack gap={2}>
          <Button
            ref={refreshRef}
            variant="secondary"
            label="Refresh"
            onClick={() => setRefreshCount(count => count + 1)}
          />
          <Text type="supporting" color="secondary">
            {`Refreshed ${refreshCount} times`}
          </Text>
        </HStack>
        <Button label="Start tour" onClick={() => setIsActive(true)} />

        <Tour
          isActive={isActive}
          isStepCountShown
          onDismiss={() => setIsActive(false)}>
          <TourStep targetRef={cardRef} heading="Your revenue">
            Totals for the quarter, updated daily.
          </TourStep>
          <TourStep targetRef={refreshRef} heading="Refresh it">
            Press Refresh to try it. The tour stays open.
          </TourStep>
        </Tour>
      </VStack>
    );
  },
};

// A scoped theme with a vivid magenta accent. Because the highlight is promoted
// into the top layer IN PLACE (not portaled out of the tree), it stays inside
// this <Theme> subtree and the ring inherits the scoped accent — verifying the
// tour is themeable, not just under the root theme.
const magentaTheme = defineTheme({
  name: 'tour-magenta-demo',
  tokens: {
    '--color-accent': ['#D6006E', '#FF4FA3'],
  },
});

export const ScopedTheme: Story = {
  name: 'Themed ring (scoped theme)',
  render: () => {
    const [isActive, setIsActive] = useState(false);
    const targetRef = useRef<HTMLButtonElement>(null);

    return (
      <Theme theme={magentaTheme} mode="light">
        <VStack gap={4}>
          <Heading level={3}>Scoped theme</Heading>
          <Text type="body">
            This subtree uses a scoped theme with a magenta accent. The
            highlight ring picks it up because the overlay is promoted in place,
            inside the Theme — not portaled to the body.
          </Text>
          <Button ref={targetRef} variant="secondary" label="New feature" />
          <Button label="Highlight it" onClick={() => setIsActive(true)} />

          <Tour
            isActive={isActive}
            hasBackdrop
            onDismiss={() => setIsActive(false)}>
            <TourStep targetRef={targetRef} heading="Themed highlight">
              The ring uses this theme&apos;s accent color.
            </TourStep>
          </Tour>
        </VStack>
      </Theme>
    );
  },
};

// Interactive placement + alignment. Use the Controls panel to move the callout
// to any side of the centered target and align it start / center / end along
// that side. Args here drive the TourStep (not the Tour controller), so this
// story is typed against its own arg shape.
interface PlacementArgs {
  placement: LayerPlacement;
  alignment: LayerAlignment;
}

export const Placement: StoryObj<PlacementArgs> = {
  name: 'Placement & alignment',
  argTypes: {
    placement: {
      control: 'select',
      options: ['above', 'below', 'start', 'end'],
      description: 'Which side of the target the callout sits on',
    },
    alignment: {
      control: 'select',
      options: ['start', 'center', 'end'],
      description: 'How the callout aligns along the placement side',
    },
  },
  args: {
    placement: 'below',
    alignment: 'center',
  },
  render: ({placement, alignment}: PlacementArgs) => {
    const [isActive, setIsActive] = useState(true);
    const targetRef = useRef<HTMLButtonElement>(null);

    return (
      <VStack gap={4} align="center" justify="center" style={{minHeight: 460}}>
        <Button ref={targetRef} variant="secondary" label="Target" />
        {!isActive && (
          <Button label="Show step" onClick={() => setIsActive(true)} />
        )}
        <Tour isActive={isActive} onDismiss={() => setIsActive(false)}>
          <TourStep
            targetRef={targetRef}
            heading="Positioned callout"
            placement={placement}
            alignment={alignment}>
            placement=&quot;{placement}&quot; · alignment=&quot;{alignment}
            &quot;
          </TourStep>
        </Tour>
      </VStack>
    );
  },
};
