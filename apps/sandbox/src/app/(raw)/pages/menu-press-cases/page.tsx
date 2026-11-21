// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input None
 * @output A bare page with a DropdownMenu in a fixed top bar and one in the
 *   content of a page that scrolls with the document
 * @position A raw page, with no sandbox chrome, for checking on a phone how a
 *   menu opens under a finger. The menu in the fixed bar opens as the finger
 *   presses. The menu in the content waits for the content-touch delay, so a
 *   flick that starts on it scrolls the page.
 */

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  DropdownMenu,
  type DropdownMenuOption,
} from '@astryxdesign/core/DropdownMenu';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  // A fixed bar: a trigger under a fixed ancestor is not in a scroll view.
  bar: {
    position: 'fixed',
    insetBlockStart: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    zIndex: 1,
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-body'],
  },
  content: {
    paddingBlockStart: spacingVars['--spacing-12'],
  },
});

const ROW_COUNT = 40;

export default function MenuPressCasesPage() {
  const [ran, setRan] = useState<string[]>([]);
  const run = (label: string) => () => setRan(previous => [...previous, label]);
  const items = (prefix: string): DropdownMenuOption[] =>
    ['Edit', 'Duplicate', 'Share'].map(label => ({
      label,
      onClick: run(`${prefix}: ${label}`),
    }));
  const last = ran.at(-1);
  const lastCount = ran.filter(entry => entry === last).length;

  return (
    <VStack gap={6} padding={4} xstyle={styles.content}>
      <HStack justify="between" align="center" xstyle={styles.bar}>
        <DropdownMenu button={{label: 'Actions'}} items={items('Actions')} />
        <Text color="secondary" aria-live="polite">
          {last == null ? 'Nothing ran yet' : `Ran ${last} (${lastCount}×)`}
        </Text>
      </HStack>
      <VStack gap={1}>
        <Heading level={1}>Menu press cases</Heading>
        <Text color="secondary">
          Under a finger, Actions in the fixed bar opens as the finger touches
          it. Press it, slide to Duplicate and lift: Duplicate runs once.
        </Text>
        <Text color="secondary">
          More, below, sits in the page, which scrolls. It opens after a short
          beat, so a flick that starts on it scrolls the page instead.
        </Text>
      </VStack>
      <DropdownMenu button={{label: 'More'}} items={items('More')} />
      {Array.from({length: ROW_COUNT}, (_, index) => (
        <Text key={index}>
          Row {index + 1}: text that makes the page taller than the screen.
        </Text>
      ))}
    </VStack>
  );
}
