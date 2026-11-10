// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?case=`: done (the default) or strip
 * @output A bare page with a NavigationStack on a pushed screen, above rows
 *   that make the document scroll. In done, the screen has a "Done" row that
 *   pops to the root. In strip, a strip of cards starts at the screen's edge.
 * @position A raw page, with no sandbox chrome, for checking a tap and a slow
 *   pull at the back swipe's edge on a phone. The page scrolls with the
 *   document, and the stack sits in a fixed-height card.
 */

import {Suspense, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import * as stylex from '@stylexjs/stylex';
import {
  NavigationScreen,
  NavigationStack,
  useNavigationStack,
} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {List, ListItem} from '@astryxdesign/core/List';
import {Heading, Text} from '@astryxdesign/core/Text';

type StackCase = 'done' | 'strip';

const CASES: Record<StackCase, {path: string[]; hint: string}> = {
  done: {
    path: ['General', 'About'],
    hint: 'Tap "Done", letting the finger drift a little to the right: the screen goes back to Settings.',
  },
  strip: {
    path: ['General'],
    hint: 'With the strip at its start, drag slowly to the right on it: the strip stays put and the screen follows the finger.',
  },
};

const SECTIONS: Record<string, string[]> = {
  Settings: ['General', 'Accessibility', 'Display'],
  General: ['About', 'Software Update', 'Storage'],
};

const TILES = [
  'Wi-Fi',
  'Bluetooth',
  'Cellular',
  'Hotspot',
  'Battery',
  'Focus',
  'Screen Time',
  'Sounds',
];

const PAGE_ROWS = Array.from({length: 30}, (_, index) => `Row ${index + 1}`);

const styles = stylex.create({
  tile: {flexShrink: 0},
});

function parseCase(value: string | null): StackCase {
  return value === 'strip' ? 'strip' : 'done';
}

function Rows({title}: {title: string}) {
  const nav = useNavigationStack<string>();
  const rows = SECTIONS[title] ?? [];
  return (
    <List>
      {rows.map(row => (
        <ListItem key={row} label={row} onClick={() => nav.push(row)} />
      ))}
      {rows.length === 0 ? (
        <ListItem label="Done" onClick={() => nav.popToRoot()} />
      ) : null}
    </List>
  );
}

function Strip() {
  return (
    <HStack gap={3} padding={4} isScrollable>
      {TILES.map(tile => (
        <Card
          key={tile}
          width={140}
          height={96}
          padding={2}
          xstyle={styles.tile}>
          <Text>{tile}</Text>
        </Card>
      ))}
    </HStack>
  );
}

function StackCaseView({stackCase}: {stackCase: StackCase}) {
  const [path, setPath] = useState<string[]>(CASES[stackCase].path);
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>NavigationStack edge</Heading>
        <Text color="secondary">{CASES[stackCase].hint}</Text>
        <HStack gap={3}>
          <Link href="?case=done">done</Link>
          <Link href="?case=strip">strip</Link>
        </HStack>
      </VStack>
      <Card height="60dvh" padding={0}>
        <NavigationStack
          label="Settings"
          root={
            <NavigationScreen title="Settings">
              <Rows title="Settings" />
            </NavigationScreen>
          }
          path={path}
          onPathChange={setPath}
          getKey={entry => entry}
          renderScreen={entry => (
            <NavigationScreen title={entry}>
              {stackCase === 'strip' ? <Strip /> : <Rows title={entry} />}
            </NavigationScreen>
          )}
        />
      </Card>
      <Button label="Reset" onClick={() => setPath(CASES[stackCase].path)} />
      <VStack gap={2}>
        {PAGE_ROWS.map(row => (
          <Text key={row} color="secondary">
            {row}
          </Text>
        ))}
      </VStack>
    </VStack>
  );
}

function StackCases() {
  const [searchParams] = useSearchParams();
  const stackCase = parseCase(searchParams.get('case'));
  return <StackCaseView key={stackCase} stackCase={stackCase} />;
}

export default function NavigationStackEdgePage() {
  return (
    <Suspense>
      <StackCases />
    </Suspense>
  );
}
