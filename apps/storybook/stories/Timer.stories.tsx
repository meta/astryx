// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, waitFor} from 'storybook/test';
import {Timer} from '@astryxdesign/core/Timer';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

const meta: Meta<typeof Timer> = {
  title: 'Core/Timer',
  component: Timer,
  tags: ['autodocs'],
  argTypes: {
    startTime: {
      control: 'number',
      description: 'Operation start as Unix milliseconds',
    },
    format: {
      control: 'select',
      options: ['elapsed', 'clock'],
      description: 'Standard elapsed or stopwatch representation',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Timer>;

function FormatsStory() {
  const [startedAt] = useState(() => Date.now() - 3_753_000);
  return (
    <Stack direction="vertical" gap={3}>
      <Stack direction="horizontal" gap={2} vAlign="center">
        <Text type="supporting" color="secondary">
          Elapsed
        </Text>
        <Timer startTime={startedAt} type="body" color="primary" />
      </Stack>
      <Stack direction="horizontal" gap={2} vAlign="center">
        <Text type="supporting" color="secondary">
          Clock
        </Text>
        <Timer
          format="clock"
          startTime={startedAt}
          type="body"
          color="primary"
        />
      </Stack>
    </Stack>
  );
}

function EarlierStartStory() {
  const [startedAt] = useState(() => Date.now() - 65_000);
  return <Timer startTime={startedAt} />;
}

function TypographyStory() {
  const [startedAt] = useState(() => Date.now() - 128_000);
  return (
    <Timer
      startTime={startedAt}
      type="body"
      size="lg"
      color="primary"
      weight="semibold"
    />
  );
}

export const Default: Story = {
  play: async ({canvasElement}) => {
    // The tick is DOM-owned: the zero-duration first paint must advance on
    // its own, with no interaction and no React render. This play runs in the
    // storybook test runner, so a regression that freezes the display fails
    // in a real browser instead of only in jsdom.
    const timer = canvasElement.querySelector('time');
    expect(timer).not.toBeNull();
    await waitFor(
      () => {
        expect(timer?.textContent).not.toBe('0s');
      },
      {timeout: 2500},
    );
  },
};

export const Formats: Story = {
  render: () => <FormatsStory />,
};

export const WaitingMessage: Story = {
  render: () => (
    <Text type="body" color="primary">
      Processing for <Timer type="inherit" color="inherit" />
    </Text>
  ),
};

export const EarlierStart: Story = {
  render: () => <EarlierStartStory />,
};

export const Typography: Story = {
  render: () => <TypographyStory />,
};
