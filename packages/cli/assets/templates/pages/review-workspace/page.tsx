// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  LayoutPanel,
  VStack,
  HStack,
  StackItem,
} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {Icon} from '@astryxdesign/core/Icon';
import {Markdown} from '@astryxdesign/core/Markdown';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {List, ListItem} from '@astryxdesign/core/List';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import type {StatusDotVariant} from '@astryxdesign/core/StatusDot';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {TextArea} from '@astryxdesign/core/TextArea';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {useToast} from '@astryxdesign/core/Toast';
import {rtlStyles} from '@astryxdesign/core/utils';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  QueueListIcon,
} from '@heroicons/react/24/outline';

// Types
type Decision = 'approve' | 'revise' | 'reject';

interface ReviewItem {
  id: string;
  title: string;
  channel: string;
  customer: string;
  submitted: string;
  body: string;
}

interface Verdict {
  score: string;
  decision: Decision;
  issues: string[];
  note: string;
  status: 'reviewed' | 'skipped';
}

const DECISION_LABEL: Record<Decision, string> = {
  approve: 'Approve',
  revise: 'Needs changes',
  reject: 'Reject',
};

const ISSUES = [
  {id: 'accuracy', label: 'Inaccurate', description: 'States something wrong'},
  {id: 'tone', label: 'Tone', description: 'Too curt or too casual'},
  {
    id: 'incomplete',
    label: 'Incomplete',
    description: 'Misses part of the question',
  },
  {
    id: 'policy',
    label: 'Policy',
    description: 'Promises what policy does not allow',
  },
];

// Mock data: support replies waiting for a quality review
const ITEMS: ReviewItem[] = [
  {
    id: 'R-1041',
    title: 'Refund for a late delivery',
    channel: 'Email',
    customer: 'Priya S.',
    submitted: 'Today, 09:12',
    body: "Hi Priya,\n\nI'm sorry your order arrived four days late. I've refunded the shipping fee to your original card; it should show within 5 business days.\n\nIf anything else went wrong with the order, reply here and I'll take care of it.\n\nBest,\nSam",
  },
  {
    id: 'R-1042',
    title: 'Password reset link expired',
    channel: 'Chat',
    customer: 'Daniel K.',
    submitted: 'Today, 09:20',
    body: 'Reset links expire after 15 minutes for security. I just sent a new one to the email on your account. Open it on the same device you request it from.',
  },
  {
    id: 'R-1043',
    title: 'Change of billing address',
    channel: 'Email',
    customer: 'Maria L.',
    submitted: 'Today, 09:41',
    body: 'Done. Your billing address is updated, and the next invoice will use it.',
  },
  {
    id: 'R-1044',
    title: 'Cancel before renewal',
    channel: 'Phone summary',
    customer: 'Tom B.',
    submitted: 'Today, 10:02',
    body: 'Customer asked to cancel before the annual renewal on the 18th. I cancelled the renewal; access continues until then. Offered a pause instead, declined.',
  },
  {
    id: 'R-1045',
    title: 'Damaged item, wants a replacement',
    channel: 'Email',
    customer: 'Aisha N.',
    submitted: 'Today, 10:15',
    body: "Hi Aisha,\n\nThanks for the photos. A replacement ships today with express delivery, and you don't need to return the damaged one.\n\nSam",
  },
  {
    id: 'R-1046',
    title: 'Question about data export',
    channel: 'Chat',
    customer: 'Leo M.',
    submitted: 'Today, 10:31',
    body: 'You can export everything from Settings > Data > Export. The file is a ZIP of CSVs, one per table.',
  },
  {
    id: 'R-1047',
    title: 'Discount code not applying',
    channel: 'Email',
    customer: 'Grace H.',
    submitted: 'Today, 10:48',
    body: "That code is for first orders only, so it can't be used on this one. I've added a 10% credit to your account for the trouble.",
  },
  {
    id: 'R-1048',
    title: 'Two charges on one order',
    channel: 'Phone summary',
    customer: 'Omar R.',
    submitted: 'Today, 11:05',
    body: 'One charge was a card authorisation that drops off on its own in 3-5 days. Explained and sent a written summary.',
  },
];

const STATUS_DOT: Record<'pending' | 'reviewed' | 'skipped', StatusDotVariant> =
  {
    pending: 'neutral',
    reviewed: 'success',
    skipped: 'warning',
  };

const STATUS_LABEL = {
  pending: 'Not reviewed',
  reviewed: 'Reviewed',
  skipped: 'Skipped',
};

const EMPTY_DRAFT = {
  score: '',
  decision: 'approve' as Decision,
  issues: [] as string[],
  note: '',
};

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count !== 1 ? 's' : ''}`;
}

export default function ReviewWorkspaceTemplate() {
  const showToast = useToast();
  const isNarrow = useMediaQuery('(max-width: 1024px)');
  const [index, setIndex] = useState(0);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  // Unsaved forms by item, so moving away and back keeps what was entered.
  const [drafts, setDrafts] = useState<Record<string, typeof EMPTY_DRAFT>>({});
  const [isDone, setIsDone] = useState(false);
  const [isRailOpen, setIsRailOpen] = useState(false);

  const item = ITEMS[index];
  const handled = Object.keys(verdicts).length;
  const reviewed = Object.values(verdicts).filter(
    v => v.status === 'reviewed',
  ).length;

  // Opens an item with its unsaved form, its saved review, or an empty form,
  // and keeps the current item's unsaved form for later.
  const openItem = (
    next: number,
    keep: Record<string, typeof EMPTY_DRAFT> = {...drafts, [item.id]: draft},
  ) => {
    const id = ITEMS[next].id;
    const saved = verdicts[id];
    setDrafts(keep);
    setDraft(
      keep[id] ??
        (saved?.status === 'reviewed'
          ? {
              score: saved.score,
              decision: saved.decision,
              issues: saved.issues,
              note: saved.note,
            }
          : EMPTY_DRAFT),
    );
    setIndex(next);
    setIsDone(false);
  };

  // The next item after the current one that `isOpen` accepts, wrapping
  // around; the done screen when there is none.
  const moveOn = (
    record: Record<string, Verdict>,
    isOpen: (verdict: Verdict | undefined) => boolean,
    keep: Record<string, typeof EMPTY_DRAFT>,
  ) => {
    const order = ITEMS.map((_, i) => (index + 1 + i) % ITEMS.length).filter(
      i => i !== index,
    );
    const next = order.find(i => isOpen(record[ITEMS[i].id]));
    if (next === undefined) {
      setDrafts(keep);
      setIsDone(true);
    } else {
      openItem(next, keep);
    }
  };

  const saveAndNext = () => {
    const record = {
      ...verdicts,
      [item.id]: {...draft, status: 'reviewed' as const},
    };
    const keep = {...drafts};
    delete keep[item.id];
    setVerdicts(record);
    // After a save, skipped items come back until each has a review.
    moveOn(record, verdict => verdict?.status !== 'reviewed', keep);
  };

  const skip = () => {
    // Skipping a reviewed item keeps its review.
    const record =
      verdicts[item.id]?.status === 'reviewed'
        ? verdicts
        : {
            ...verdicts,
            [item.id]: {...EMPTY_DRAFT, status: 'skipped' as const},
          };
    setVerdicts(record);
    moveOn(record, verdict => verdict === undefined, {
      ...drafts,
      [item.id]: draft,
    });
  };

  const previous = () => {
    if (index > 0) {
      openItem(index - 1);
    }
  };

  const startOver = () => {
    setVerdicts({});
    setDrafts({});
    setDraft(EMPTY_DRAFT);
    setIndex(0);
    setIsDone(false);
  };

  const counts = {
    approve: Object.values(verdicts).filter(
      v => v.status === 'reviewed' && v.decision === 'approve',
    ).length,
    revise: Object.values(verdicts).filter(
      v => v.status === 'reviewed' && v.decision === 'revise',
    ).length,
    reject: Object.values(verdicts).filter(
      v => v.status === 'reviewed' && v.decision === 'reject',
    ).length,
    skipped: Object.values(verdicts).filter(v => v.status === 'skipped').length,
  };

  const rail = (
    <List header="Batch" density="compact">
      {ITEMS.map((candidate, i) => {
        const status = verdicts[candidate.id]?.status ?? 'pending';
        return (
          <ListItem
            key={candidate.id}
            itemKey={candidate.id}
            label={candidate.title}
            description={candidate.id}
            isSelected={!isDone && i === index}
            startContent={
              <StatusDot
                variant={STATUS_DOT[status]}
                label={STATUS_LABEL[status]}
              />
            }
            onClick={() => {
              openItem(i);
              setIsRailOpen(false);
            }}
          />
        );
      })}
    </List>
  );

  const scoring = (
    <VStack gap={5}>
      <SegmentedControl
        label="Overall quality (1 to 5)"
        value={draft.score}
        onChange={value => setDraft(d => ({...d, score: value}))}>
        {['1', '2', '3', '4', '5'].map(score => (
          <SegmentedControlItem key={score} label={score} value={score} />
        ))}
      </SegmentedControl>
      <RadioList
        label="Decision"
        value={draft.decision}
        onChange={value =>
          setDraft(d => ({...d, decision: value as Decision}))
        }>
        {(Object.keys(DECISION_LABEL) as Decision[]).map(decision => (
          <RadioListItem
            key={decision}
            value={decision}
            label={DECISION_LABEL[decision]}
          />
        ))}
      </RadioList>
      <CheckboxList
        label="Issues"
        value={draft.issues}
        onChange={issues => setDraft(d => ({...d, issues}))}>
        {ISSUES.map(issue => (
          <CheckboxListItem
            key={issue.id}
            value={issue.id}
            label={issue.label}
            description={issue.description}
          />
        ))}
      </CheckboxList>
      <TextArea
        label="Note"
        placeholder="What should the writer change?"
        value={draft.note}
        onChange={note => setDraft(d => ({...d, note}))}
      />
    </VStack>
  );

  const actions = (
    <HStack gap={2} vAlign="center">
      <Button
        label="Previous"
        variant="ghost"
        icon={<Icon icon={ArrowLeftIcon} xstyle={rtlStyles.mirror} />}
        isIconOnly={isNarrow}
        isDisabled={index === 0}
        onClick={previous}
      />
      <StackItem size="fill" />
      <Button label="Skip" variant="secondary" onClick={skip} />
      <Button
        label="Save & next"
        variant="primary"
        icon={<Icon icon={ArrowRightIcon} xstyle={rtlStyles.mirror} />}
        isDisabled={draft.score === ''}
        onClick={saveAndNext}
      />
    </HStack>
  );

  const content = isDone ? (
    <EmptyState
      icon={<Icon icon={CheckCircleIcon} size="lg" />}
      title={reviewed === ITEMS.length ? 'Batch reviewed' : 'Pass complete'}
      description={`${counts.approve} approved, ${counts.revise} need changes, ${counts.reject} rejected, ${counts.skipped} skipped.`}
      actions={
        <>
          <Button
            label="Start over"
            variant="secondary"
            icon={<Icon icon={ArrowUturnLeftIcon} />}
            onClick={startOver}
          />
          <Button
            label="Review skipped"
            variant="primary"
            isDisabled={counts.skipped === 0}
            onClick={() =>
              openItem(
                ITEMS.findIndex(c => verdicts[c.id]?.status === 'skipped'),
                drafts,
              )
            }
          />
        </>
      }
    />
  ) : (
    <VStack gap={6}>
      <Card padding={5}>
        <VStack gap={4}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">
              {item.id} · {item.channel}
            </Text>
            <Heading level={2}>{item.title}</Heading>
          </VStack>
          <Markdown headingLevelStart={3}>{item.body}</Markdown>
          <Divider />
          <MetadataList columns={isNarrow ? 'single' : 'multi'}>
            <MetadataListItem label="Customer">
              {item.customer}
            </MetadataListItem>
            <MetadataListItem label="Channel">{item.channel}</MetadataListItem>
            <MetadataListItem label="Submitted">
              {item.submitted}
            </MetadataListItem>
          </MetadataList>
        </VStack>
      </Card>
      {isNarrow && (
        <Card padding={5}>
          <VStack gap={5}>
            <Heading level={3}>Your review</Heading>
            {scoring}
          </VStack>
        </Card>
      )}
    </VStack>
  );

  return (
    <>
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={3}>
              <HStack gap={3} vAlign="center">
                <StackItem size="fill">
                  <Heading level={1}>Reply quality review</Heading>
                </StackItem>
                {isNarrow && (
                  <StackItem size="static">
                    <Button
                      label={`${index + 1} of ${ITEMS.length}`}
                      variant="secondary"
                      icon={<Icon icon={QueueListIcon} />}
                      onClick={() => setIsRailOpen(true)}
                    />
                  </StackItem>
                )}
                <MoreMenu
                  label="Batch actions"
                  items={[
                    {
                      label: 'Export reviews',
                      icon: ArrowDownTrayIcon,
                      onClick: () =>
                        // Demo only: replace this toast with the export call.
                        showToast({
                          body: `Demo: exporting ${pluralize(reviewed, 'review')} would start here`,
                          uniqueID: 'export-reviews',
                        }),
                    },
                    {
                      label: 'Start over',
                      icon: ArrowUturnLeftIcon,
                      onClick: startOver,
                    },
                  ]}
                />
              </HStack>
              <ProgressBar
                label={`${handled} of ${ITEMS.length} handled`}
                value={handled}
                max={ITEMS.length}
                hasValueLabel
              />
            </VStack>
          </LayoutHeader>
        }
        start={
          isNarrow ? undefined : (
            <LayoutPanel
              width={280}
              hasDivider
              role="navigation"
              label="Items in this batch">
              {rail}
            </LayoutPanel>
          )
        }
        content={
          <LayoutContent role="main" padding={isNarrow ? 4 : 6}>
            {content}
          </LayoutContent>
        }
        end={
          isNarrow || isDone ? undefined : (
            <LayoutPanel
              width={340}
              hasDivider
              padding={5}
              role="complementary"
              label="Your review">
              <VStack gap={5}>
                <Heading level={3}>Your review</Heading>
                {scoring}
              </VStack>
            </LayoutPanel>
          )
        }
        footer={
          isDone ? undefined : (
            <LayoutFooter hasDivider padding={3} label="Review actions">
              {actions}
            </LayoutFooter>
          )
        }
      />
      <BottomSheet
        isOpen={isRailOpen}
        onOpenChange={setIsRailOpen}
        label="Items in this batch">
        {rail}
      </BottomSheet>
    </>
  );
}
