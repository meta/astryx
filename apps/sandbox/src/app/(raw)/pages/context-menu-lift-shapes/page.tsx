// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file page.tsx
 * @input ContextMenu and the preview's lift switch
 * @output Preview only: one list of message rows, each with the same
 *   ContextMenu, with the lift on (`?lift=L0`) or off (`?lift=L2`)
 * @position A raw Sandbox page (/pages/context-menu-lift-shapes/) with no
 *   sandbox frame. The document scrolls.
 */

'use client';

import {useEffect, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {ContextMenu} from '@astryxdesign/core/ContextMenu';
import {Item} from '@astryxdesign/core/Item';
import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {useThemeControls} from '../../../providers';

type LiftShape = 'L0' | 'L2';

const SHAPES: Record<LiftShape, string> = {
  L0: 'L0: the row lifts above a dimmed page',
  L2: 'L2: no lift',
};

const ACTIONS = ['Copy', 'Share', 'Rename', 'Delete'];

const ROWS = Array.from({length: 12}, (_, i) => `Message ${i + 1}`);

const styles = stylex.create({
  switches: {
    display: 'flex',
    gap: 12,
  },
  switchLink: {
    paddingBlock: 10,
    paddingInline: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'currentColor',
    color: 'inherit',
    fontWeight: 600,
    textDecoration: 'none',
  },
  current: {
    backgroundColor: 'var(--color-background-secondary)',
  },
});

function readShape(): LiftShape {
  return new URLSearchParams(window.location.search).get('lift') === 'L2'
    ? 'L2'
    : 'L0';
}

export default function ContextMenuLiftShapesPage() {
  const {setThemeName, setMode} = useThemeControls();
  const [shape, setShape] = useState<LiftShape | null>(null);
  const [lastAction, setLastAction] = useState('none');

  // The switch is read once, after hydration, before any hold.
  useEffect(() => {
    const next = readShape();
    (
      globalThis as {__astryxPreviewLiftShape?: LiftShape}
    ).__astryxPreviewLiftShape = next;
    setShape(next);
  }, []);

  // The page opens in Neutral light. The reset waits one frame, so it comes
  // after the Sandbox restores the theme it kept from an earlier visit.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setThemeName('neutral');
      setMode('light');
    });
    return () => cancelAnimationFrame(frame);
  }, [setThemeName, setMode]);

  const menu = ACTIONS.map(label => ({
    label,
    onClick: () => setLastAction(label),
  }));

  return (
    <VStack gap={4} padding={4}>
      <VStack gap={2}>
        <Heading level={1}>ContextMenu lift preview</Heading>
        <Text type="body" weight="bold">
          {shape == null ? 'Reading the switch' : SHAPES[shape]}
        </Text>
        <nav {...stylex.props(styles.switches)}>
          {(['L0', 'L2'] as const).map(option => (
            <a
              key={option}
              href={`?lift=${option}`}
              {...stylex.props(
                styles.switchLink,
                option === shape && styles.current,
              )}>
              {option}
            </a>
          ))}
        </nav>
        <Text type="supporting">{`Last action: ${lastAction}`}</Text>
      </VStack>
      <VStack gap={0}>
        {ROWS.map(row => (
          <ContextMenu key={row} items={menu} label={row}>
            <Item
              label={row}
              description="Hold the row until its menu shows."
            />
          </ContextMenu>
        ))}
      </VStack>
    </VStack>
  );
}
