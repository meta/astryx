// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import * as stylex from '@stylexjs/stylex';
import {
  useCollapsible,
  useCollapsibleContentMotion,
} from '@astryxdesign/core/Collapsible';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {durationVars, easeVars} from '@astryxdesign/core/theme/tokens.stylex';

// The details grow from 0 to the height the hook measures, and shrink back.
const grow = stylex.keyframes({
  from: {height: 0, opacity: 0},
  to: {height: 'var(--details-height)', opacity: 1},
});

const shrink = stylex.keyframes({
  from: {height: 'var(--details-height)', opacity: 1},
  to: {height: 0, opacity: 0},
});

const fadeIn = stylex.keyframes({from: {opacity: 0}, to: {opacity: 1}});

const fadeOut = stylex.keyframes({from: {opacity: 1}, to: {opacity: 0}});

// Under Reduce Motion a touch screen cross-fades and any other pointer
// changes at once. The clip holds only while the height animates.
const styles = stylex.create({
  entering: {
    overflow: {
      default: 'hidden',
      '@media (prefers-reduced-motion: reduce)': 'visible',
    },
    animationName: {
      default: grow,
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': fadeIn,
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        'none',
    },
    animationDuration: {
      default: durationVars['--duration-medium'],
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
        durationVars['--duration-fast'],
    },
    animationTimingFunction: easeVars['--ease-entrance'],
  },
  exiting: {
    overflow: {
      default: 'hidden',
      '@media (prefers-reduced-motion: reduce)': 'visible',
    },
    animationName: {
      default: shrink,
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': fadeOut,
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        'none',
    },
    animationDuration: {
      default: durationVars['--duration-exit'],
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
        durationVars['--duration-fast'],
    },
    animationTimingFunction: easeVars['--ease-exit'],
    animationFillMode: 'forwards',
  },
});

export default function CollapsibleContentMotionUsage() {
  const disclosure = useCollapsible({isCollapsible: {defaultIsOpen: false}});
  const motion = useCollapsibleContentMotion(disclosure, {
    heightProperty: '--details-height',
  });

  return (
    <Card width={360} padding={4}>
      <VStack gap={3}>
        <Text type="body" weight="bold">
          Release checklist
        </Text>
        <Button
          {...disclosure.triggerProps}
          label={disclosure.isOpen ? 'Hide details' : 'Show details'}
          variant="secondary"
        />
        <div
          {...motion.contentProps}
          {...stylex.props(
            motion.isEntering && styles.entering,
            motion.isExiting && styles.exiting,
          )}
          role="region"
          aria-label="Release checklist details">
          {motion.isPresent && (
            <Text type="body" color="secondary">
              Review docs, run visual checks, and confirm keyboard behavior
              before shipping the component update.
            </Text>
          )}
        </div>
      </VStack>
    </Card>
  );
}
