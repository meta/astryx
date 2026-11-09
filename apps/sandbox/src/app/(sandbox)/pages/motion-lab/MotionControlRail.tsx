// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MotionControlRail.tsx
 * @input Motion Lab store
 * @output The sticky bar of viewing modes that applies to every page
 * @position Motion Lab chrome; rendered by app/motion/layout.tsx
 *
 * These four controls are the difference between a gallery and a bench.
 *
 * Slow-mo stretches every duration without moving the token, so a 175ms curve
 * can be judged at 8x and then exported at 175ms. Reduced motion drives the
 * real policy switch rather than a caption about it. Compare hides one half of
 * every before/after so the proposal can be looked at on its own. Loop keeps
 * the demos running, because a comparison you have to click twice to see is a
 * comparison nobody makes.
 */

import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Slider} from '@astryxdesign/core/Slider';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {
  useMotionLab,
  type CompareMode,
  type ReducedMotionMode,
} from './MotionLabStore';

const sx = stylex.create({
  rail: {
    position: 'sticky',
    top: 'var(--astryx-header-offset, 0px)',
    zIndex: 40,
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 16px',
    borderBlockEndWidth: '1px',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
  },
  speed: {width: '132px'},
  grow: {flexGrow: 1},
  value: {
    fontFamily: 'var(--font-family-code)',
    minWidth: '34px',
  },
});

const SPEEDS = [1, 2, 4, 8] as const;

export function MotionControlRail() {
  const {
    speed,
    setSpeed,
    reducedMotion,
    setReducedMotion,
    compare,
    setCompare,
    isLooping,
    setLooping,
    replay,
    reset,
    dirtyTokens,
  } = useMotionLab();

  return (
    <HStack gap={3} vAlign="center" wrap="wrap" {...stylex.props(sx.rail)}>
      <HStack gap={1.5} vAlign="center" wrap="wrap">
        <Text type="supporting" color="secondary">
          Speed
        </Text>
        <div {...stylex.props(sx.speed)}>
          <Slider
            label="Slow motion multiplier"
            isLabelHidden
            value={speed}
            min={0.25}
            max={8}
            step={0.25}
            valueDisplay="none"
            onChange={setSpeed}
          />
        </div>
        <Text {...stylex.props(sx.value)} type="supporting">
          {speed}&times;
        </Text>
        <HStack gap={0.5}>
          {SPEEDS.map(s => (
            <Button
              key={s}
              size="sm"
              variant={speed === s ? 'secondary' : 'ghost'}
              label={`${s}×`}
              onClick={() => setSpeed(s)}
            />
          ))}
        </HStack>
      </HStack>

      <HStack gap={1.5} vAlign="center">
        <Text type="supporting" color="secondary">
          Reduced motion
        </Text>
        <SegmentedControl
          label="Reduced motion policy"
          size="sm"
          value={reducedMotion}
          onChange={value => setReducedMotion(value as ReducedMotionMode)}>
          <SegmentedControlItem value="off" label="Off" />
          <SegmentedControlItem value="degrade" label="Degrade" />
          <SegmentedControlItem value="delete" label="Delete" />
        </SegmentedControl>
      </HStack>

      <HStack gap={1.5} vAlign="center">
        <Text type="supporting" color="secondary">
          Show
        </Text>
        <SegmentedControl
          label="Which side of each comparison to show"
          size="sm"
          value={compare}
          onChange={value => setCompare(value as CompareMode)}>
          <SegmentedControlItem value="both" label="Both" />
          <SegmentedControlItem value="before" label="Today" />
          <SegmentedControlItem value="after" label="Proposed" />
        </SegmentedControl>
      </HStack>

      <span {...stylex.props(sx.grow)} />

      <HStack gap={1} vAlign="center">
        {dirtyTokens.length > 0 && (
          <Tooltip
            content={`${dirtyTokens.length} token(s) changed from the proposal`}>
            <Text type="supporting" color="secondary">
              {dirtyTokens.length} tuned
            </Text>
          </Tooltip>
        )}
        <Button
          size="sm"
          variant={isLooping ? 'secondary' : 'ghost'}
          label={isLooping ? 'Looping' : 'Loop off'}
          onClick={() => setLooping(!isLooping)}
        />
        <Button size="sm" variant="ghost" label="Replay" onClick={replay} />
        <Button size="sm" variant="ghost" label="Reset" onClick={reset} />
      </HStack>
    </HStack>
  );
}
