// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Divider} from '@astryxdesign/core/Divider';
import {Icon} from '@astryxdesign/core/Icon';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {ResizeHandle, useResizable} from '@astryxdesign/core/Resizable';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {HStack, VStack, StackItem} from '@astryxdesign/core/Stack';
import {TextArea} from '@astryxdesign/core/TextArea';
import {useToast} from '@astryxdesign/core/Toast';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  ArrowsRightLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';

type Version = {name: string; version: string; text: string};
type Pair = {id: string; topic: string; left: Version; right: Version};

const PAIRS: Pair[] = [
  {
    id: 'reset-password',
    topic: 'Reset your password',
    left: {
      name: 'Baseline',
      version: 'v3',
      text: [
        '# Reset your password',
        '',
        'Open Settings and choose Security.',
        'Select Reset password.',
        'We send a link to your email address.',
        'The link expires after 24 hours.',
        'Choose a new password and confirm it.',
        'You are signed out on every other device.',
      ].join('\n'),
    },
    right: {
      name: 'Edited draft',
      version: 'v4',
      text: [
        '# Reset your password',
        '',
        'Open Settings and choose Security.',
        'Select Reset password.',
        'We send a link to the email address on your account.',
        'The link expires after 1 hour.',
        'Choose a new password and confirm it.',
        'You stay signed in on this device only.',
      ].join('\n'),
    },
  },
  {
    id: 'export-data',
    topic: 'Export your data',
    left: {
      name: 'Baseline',
      version: 'v2',
      text: [
        '# Export your data',
        '',
        'Go to Settings, then Privacy.',
        'Select Export data.',
        'Pick the file format.',
        'We email you when the file is ready.',
      ].join('\n'),
    },
    right: {
      name: 'Edited draft',
      version: 'v3',
      text: [
        '# Export your data',
        '',
        'Go to Settings, then Privacy.',
        'Select Export data.',
        'Pick CSV or JSON.',
        'We email you when the file is ready, usually within a day.',
      ].join('\n'),
    },
  },
  {
    id: 'invite-teammates',
    topic: 'Invite teammates',
    left: {
      name: 'Baseline',
      version: 'v1',
      text: [
        '# Invite teammates',
        '',
        'Open the team page.',
        'Select Invite and enter an email address.',
        'Choose a role for the new member.',
      ].join('\n'),
    },
    right: {
      name: 'Edited draft',
      version: 'v2',
      text: [
        '# Invite teammates',
        '',
        'Open the team page.',
        'Select Invite and enter one or more email addresses.',
        'Choose a role for each new member.',
        'You can change a role later from the same page.',
      ].join('\n'),
    },
  },
];

type View = 'split' | 'unified' | 'changes';

type Op = {kind: 'same' | 'removed' | 'added'; line: string};

/**
 * A line diff of two texts from their longest common subsequence, so an
 * inserted or moved line marks only itself, not every line after it.
 */
function lineDiff(a: string[], b: string[]): Op[] {
  const lcs = a.map(() => b.map(() => 0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? 1 + (lcs[i + 1]?.[j + 1] ?? 0)
          : Math.max(lcs[i + 1]?.[j] ?? 0, lcs[i][j + 1] ?? 0);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({kind: 'same', line: a[i]});
      i++;
      j++;
    } else if (
      i < a.length &&
      (j >= b.length || (lcs[i + 1]?.[j] ?? 0) >= (lcs[i][j + 1] ?? 0))
    ) {
      // A removed line comes before the line that replaces it.
      ops.push({kind: 'removed', line: a[i]});
      i++;
    } else {
      ops.push({kind: 'added', line: b[j]});
      j++;
    }
  }
  return ops;
}

/** The text's words, ignoring Markdown heading marks. */
const wordCount = (text: string) =>
  text.split(/\s+/).filter(w => /\w/.test(w)).length;

/** 1-based line numbers of one side's changed lines. */
function changedOn(ops: Op[], side: 'removed' | 'added'): number[] {
  const out: number[] = [];
  let n = 0;
  for (const op of ops) {
    if (op.kind === 'same' || op.kind === side) {
      n++;
    }
    if (op.kind === side) {
      out.push(n);
    }
  }
  return out;
}

type Review = {verdict: string; notes: string};

export default function ContentComparePage() {
  const showToast = useToast();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [index, setIndex] = useState(0);
  const [isSwapped, setIsSwapped] = useState(false);
  const [view, setView] = useState<View>('split');
  const [phonePane, setPhonePane] = useState('left');
  // Each pair keeps its own choice and notes, so going back restores them.
  // The choice names a version, not a side, so swapping sides keeps it.
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const leftPane = useResizable({defaultSize: 520, minSize: 280, maxSize: 900});

  // Demo only: replace these toasts with the calls that perform each action.
  const demo = (body: string, uniqueID: string) => showToast({body, uniqueID});

  const pair = PAIRS[index];
  const [left, right] = isSwapped
    ? [pair.right, pair.left]
    : [pair.left, pair.right];
  const leftLines = left.text.split('\n');
  const rightLines = right.text.split('\n');
  const ops = lineDiff(leftLines, rightLines);
  const removedLines = changedOn(ops, 'removed');
  const addedLines = changedOn(ops, 'added');
  const review = reviews[pair.id] ?? {verdict: '', notes: ''};
  const setReview = (patch: Partial<Review>) =>
    setReviews(all => ({...all, [pair.id]: {...review, ...patch}}));

  const goTo = (next: number) => setIndex((next + PAIRS.length) % PAIRS.length);

  const only = (lines: string[], numbers: number[]) =>
    numbers.map(n => lines[n - 1]).join('\n');

  const pane = (v: Version, lines: string[], marked: number[]) => (
    <CodeBlock
      title={`${v.name} · ${v.version}`}
      code={
        view === 'changes'
          ? only(lines, marked) || 'No changed lines on this side.'
          : lines.join('\n')
      }
      language="markdown"
      hasLanguageLabel={false}
      hasLineNumbers={view !== 'changes'}
      highlightLines={view === 'changes' ? [] : marked}
      isWrapped
      width="100%"
      endContent={<Badge label={`${wordCount(v.text)} words`} />}
    />
  );

  const unified = (
    <CodeBlock
      title={`${left.name} → ${right.name}`}
      code={ops
        .map(
          op =>
            `${op.kind === 'added' ? '+' : op.kind === 'removed' ? '-' : ' '}${op.line}`,
        )
        .join('\n')}
      language="markdown"
      hasLanguageLabel={false}
      isDiff
      isWrapped
      width="100%"
    />
  );

  const viewSwitch = (
    <SegmentedControl
      label="Comparison view"
      size="sm"
      value={view}
      onChange={value => setView(value as View)}>
      <SegmentedControlItem value="split" label="Side by side" />
      <SegmentedControlItem value="unified" label="Unified" />
      <SegmentedControlItem value="changes" label="Only changes" />
    </SegmentedControl>
  );

  const panes = isMobile ? (
    <VStack gap={3}>
      <SegmentedControl
        label="Version shown"
        layout="fill"
        value={phonePane}
        onChange={setPhonePane}>
        <SegmentedControlItem value="left" label={left.name} />
        <SegmentedControlItem value="right" label={right.name} />
        <SegmentedControlItem value="unified" label="Unified" />
      </SegmentedControl>
      {phonePane === 'unified'
        ? unified
        : phonePane === 'left'
          ? pane(left, leftLines, removedLines)
          : pane(right, rightLines, addedLines)}
    </VStack>
  ) : view === 'unified' ? (
    unified
  ) : (
    <HStack gap={0} vAlign="stretch">
      <StackItem style={{width: leftPane.size, minWidth: 0}}>
        {pane(left, leftLines, removedLines)}
      </StackItem>
      <ResizeHandle
        direction="horizontal"
        resizable={leftPane.props}
        label="Resize the two versions"
      />
      <StackItem size="fill" style={{minWidth: 0}}>
        {pane(right, rightLines, addedLines)}
      </StackItem>
    </HStack>
  );

  return (
    <Layout
      height="auto"
      contentWidth={1280}
      content={
        <LayoutContent isScrollable={false} padding={isMobile ? 4 : 6}>
          <VStack gap={5}>
            <VStack gap={3}>
              <HStack gap={3} vAlign="center" wrap="wrap">
                <StackItem size="fill">
                  <Heading level={1} type="display-3">
                    {pair.topic}: edited draft vs baseline
                  </Heading>
                </StackItem>
                <Badge
                  label={`Pair ${index + 1} of ${PAIRS.length}`}
                  variant="info"
                />
              </HStack>
              <Card>
                <HStack gap={3} vAlign="start">
                  <StackItem size="fill">
                    <VStack gap={1}>
                      <Text type="label">Shared brief</Text>
                      <Text type="body" color="secondary">
                        Rewrite the help article so a new customer can finish
                        the task without contacting support. Keep every step.
                      </Text>
                    </VStack>
                  </StackItem>
                  <Button
                    label="Edit brief"
                    variant="ghost"
                    size="sm"
                    isIconOnly={isMobile}
                    icon={<Icon icon={PencilSquareIcon} />}
                    onClick={() =>
                      demo(
                        'Demo: the brief would open for editing here.',
                        'edit',
                      )
                    }
                  />
                </HStack>
              </Card>
            </VStack>

            <HStack gap={3} vAlign="center" wrap="wrap">
              <StackItem size="fill">
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Badge label={`${removedLines.length} lines removed`} />
                  <Badge label={`${addedLines.length} lines added`} />
                </HStack>
              </StackItem>
              {!isMobile && viewSwitch}
              <Button
                label="Swap sides"
                variant="secondary"
                size="sm"
                icon={<Icon icon={ArrowsRightLeftIcon} />}
                onClick={() => setIsSwapped(s => !s)}
              />
            </HStack>

            {panes}
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <VStack gap={3}>
            <Divider />
            <HStack gap={4} vAlign="end" wrap="wrap">
              <RadioList
                label="Which version is better?"
                orientation={isMobile ? 'vertical' : 'horizontal'}
                value={review.verdict}
                onChange={verdict => setReview({verdict})}>
                <RadioListItem
                  value={left.name}
                  label={`${left.name} is better`}
                />
                <RadioListItem value="tie" label="About the same" />
                <RadioListItem
                  value={right.name}
                  label={`${right.name} is better`}
                />
              </RadioList>
              <StackItem size="fill">
                <TextArea
                  label="Notes"
                  isOptional
                  rows={1}
                  value={review.notes}
                  onChange={notes => setReview({notes})}
                  placeholder="What made the difference?"
                />
              </StackItem>
            </HStack>
            <HStack gap={2} vAlign="center">
              <Button
                label="Previous pair"
                variant="ghost"
                isIconOnly
                icon={<Icon icon={ChevronLeftIcon} />}
                onClick={() => goTo(index - 1)}
              />
              <Button
                label="Next pair"
                variant="ghost"
                isIconOnly
                icon={<Icon icon={ChevronRightIcon} />}
                onClick={() => goTo(index + 1)}
              />
              <StackItem size="fill" />
              <Button
                label="Skip"
                variant="secondary"
                onClick={() => goTo(index + 1)}
              />
              <Button
                label="Submit"
                variant="primary"
                isDisabled={review.verdict === ''}
                onClick={() => {
                  demo(
                    'Demo: your choice and notes would be saved here.',
                    'submit',
                  );
                  goTo(index + 1);
                }}
              />
            </HStack>
          </VStack>
        </LayoutFooter>
      }
    />
  );
}
