// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {
  WeightedSVGIcon,
  WeightedIconSprite,
  weightedStarterIcons,
  bellWeightedIcon,
  homeWeightedIcon,
  searchWeightedIcon,
  settingsWeightedIcon,
  mailWeightedIcon,
  starWeightedIcon,
} from '@astryxdesign/lab';
import {Stack, Text, Button} from '@astryxdesign/core';
import {Heading} from '@astryxdesign/core/Text';

const meta: Meta<typeof WeightedSVGIcon> = {
  title: 'Lab/SVGIcon/Weighted',
  component: WeightedSVGIcon,
};

export default meta;
type Story = StoryObj<typeof WeightedSVGIcon>;

const WEIGHTS = [300, 400, 500, 600, 700] as const;
const ROW_ICONS = [
  bellWeightedIcon,
  homeWeightedIcon,
  searchWeightedIcon,
  settingsWeightedIcon,
  mailWeightedIcon,
  starWeightedIcon,
];

/** Icons pick their drawing from the text around them: no weight prop anywhere. */
export const FollowsFontWeight: Story = {
  render: () => (
    <Stack gap={3}>
      {WEIGHTS.map(w => (
        <div
          key={w}
          style={{
            fontWeight: w,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            fontSize: 20,
          }}>
          <span style={{width: 48}}>{w}</span>
          {ROW_ICONS.map(icon => (
            <WeightedSVGIcon key={icon.name} icon={icon} color="inherit" />
          ))}
          <span>Notifications and settings</span>
        </div>
      ))}
    </Stack>
  ),
};

/** Drag the slider: the text weight changes and the icons follow it, stop by stop. */
export const LiveWeight: Story = {
  render: function LiveWeightStory() {
    const [weight, setWeight] = useState(400);
    return (
      <Stack gap={4}>
        <label style={{display: 'flex', gap: 12, alignItems: 'center'}}>
          font-weight {weight}
          <input
            type="range"
            min={300}
            max={700}
            step={10}
            value={weight}
            onChange={e => setWeight(Number(e.target.value))}
          />
        </label>
        <div
          style={{
            fontWeight: weight,
            fontSize: 32,
            display: 'flex',
            gap: 16,
            alignItems: 'center',
          }}>
          {ROW_ICONS.map(icon => (
            <WeightedSVGIcon
              key={icon.name}
              icon={icon}
              size="lg"
              color="inherit"
            />
          ))}
          <span>Inbox</span>
        </div>
      </Stack>
    );
  },
};

/** Astryx components set font-weight from the theme; icons inside them follow. */
export const InsideAstryxText: Story = {
  render: () => (
    <Stack gap={3}>
      {(['normal', 'medium', 'semibold', 'bold'] as const).map(w => (
        <Text key={w} weight={w}>
          <WeightedSVGIcon icon={mailWeightedIcon} size="sm" color="inherit" />{' '}
          {w}: 3 unread messages
        </Text>
      ))}
      <Stack direction="horizontal" gap={2}>
        <Button
          label="Search"
          icon={<WeightedSVGIcon icon={searchWeightedIcon} color="inherit" />}
        />
        <Button
          label="Settings"
          variant="primary"
          icon={<WeightedSVGIcon icon={settingsWeightedIcon} color="inherit" />}
        />
      </Stack>
    </Stack>
  ),
};

/** One sprite holds each icon's drawings once; every instance is a `<use>` reference. */
export const Sprite: Story = {
  render: () => (
    <Stack gap={3}>
      <WeightedIconSprite icons={weightedStarterIcons} />
      <Heading level={3}>200 references to 15 sprite symbols</Heading>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(20, 28px)',
          gap: 4,
        }}>
        {Array.from({length: 200}, (_, i) => (
          <span key={i} style={{fontWeight: WEIGHTS[i % 5]}}>
            <WeightedSVGIcon
              icon={weightedStarterIcons[i % weightedStarterIcons.length]}
              sprite
              size="md"
              color="inherit"
            />
          </span>
        ))}
      </div>
    </Stack>
  ),
};

/** `weight` pins one icon; `--astryx-icon-weight` pins a whole subtree. */
export const PinnedWeight: Story = {
  render: () => (
    <Stack gap={3}>
      <div
        style={{
          fontWeight: 300,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}>
        <span>Light text, icon pinned to 700:</span>
        <WeightedSVGIcon icon={starWeightedIcon} weight={700} color="inherit" />
      </div>
      <div
        style={{
          fontWeight: 700,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          ['--astryx-icon-weight' as string]: '300',
        }}>
        <span>Bold text, subtree pinned to 300:</span>
        {ROW_ICONS.map(icon => (
          <WeightedSVGIcon key={icon.name} icon={icon} color="inherit" />
        ))}
      </div>
    </Stack>
  ),
};
