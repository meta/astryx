// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input Nothing
 * @output A bare page that compares two ways a pulled RefreshControl list
 *   returns under Reduce Motion, behind a switch. A cross-fades with a brief
 *   copy of the list. B uses one list: it fades out where it was, then fades
 *   in at rest. Rows below make the document scroll.
 * @position A raw page, with no sandbox chrome, for a phone check. Preview
 *   only.
 */

import {useCallback, useEffect, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {REFRESH_REVEAL_VAR, useRefreshControl} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Heading, Text} from '@astryxdesign/core/Text';

type Form = 'A' | 'B';

const REFRESH_MS = 1500;

const LIST_ROWS = Array.from(
  {length: 30},
  (_, index) => `Message ${index + 1}`,
);
const PAGE_ROWS = Array.from({length: 30}, (_, index) => `Row ${index + 1}`);

const FORMS: Record<Form, string> = {
  A: 'A: cross-fade with a brief copy',
  B: 'B: one list, out then in',
};

const styles = stylex.create({
  scroller: {height: '100%', overflowY: 'auto'},
  content: {position: 'relative'},
  // The indicator's band sits above the content, inside a box that clips it.
  band: {
    position: 'absolute',
    insetInline: 0,
    bottom: '100%',
    height: '100lvh',
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  indicator: {
    position: 'absolute',
    insetInline: 0,
    bottom: 0,
    height: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealed: (opacity: string) => ({opacity}),
});

function useReducedMotion(): boolean {
  const [isReduced, setIsReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setIsReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return isReduced;
}

export default function RefreshControlAbPage() {
  const [form, setForm] = useState<Form>('A');
  const [count, setCount] = useState(0);
  const isReduced = useReducedMotion();
  const onRefresh = useCallback(async () => {
    await new Promise<void>(resolve => {
      setTimeout(resolve, REFRESH_MS);
    });
    setCount(value => value + 1);
  }, []);
  const control = useRefreshControl({onRefresh, announce: 'Refreshing'});
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>Refresh control under Reduce Motion</Heading>
        <Text color="secondary">
          Turn on Reduce Motion in Settings. Pick A or B, then pull the messages
          down past the spinner and let go. Watch the list as it waits below the
          spinner, and as it goes back to the top.
        </Text>
        <Text>{`Reduce Motion is ${isReduced ? 'on' : 'off'}.`}</Text>
      </VStack>
      <HStack gap={2}>
        {(['A', 'B'] as const).map(option => (
          <Button
            key={option}
            label={FORMS[option]}
            variant={form === option ? 'primary' : 'secondary'}
            aria-pressed={form === option}
            onClick={() => setForm(option)}
          />
        ))}
      </HStack>
      <Text>{`${FORMS[form]} · Refreshed ${count} times`}</Text>
      <Card height="60dvh" padding={0}>
        <div
          {...stylex.props(styles.scroller)}
          role="region"
          aria-label="Messages"
          tabIndex={0}
          data-refresh-reduce-motion-form={form === 'B' ? 'dip' : undefined}>
          <div
            ref={control.contentRef}
            {...stylex.props(styles.content)}
            aria-busy={control.isRefreshing || undefined}>
            <List hasDividers>
              {LIST_ROWS.map(row => (
                <ListItem key={row} label={row} />
              ))}
            </List>
            <div {...stylex.props(styles.band)}>
              <div
                ref={control.indicatorRef}
                aria-hidden
                {...stylex.props(styles.indicator)}>
                <span
                  {...stylex.props(
                    styles.revealed(`var(${REFRESH_REVEAL_VAR}, 0)`),
                  )}>
                  <Spinner size="lg" shade="subtle" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>
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
