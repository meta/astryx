// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Card} from '@astryxdesign/core/Card';
import {VStack} from '@astryxdesign/core/Layout';
import {Popover} from '@astryxdesign/core/Popover';
import {Button} from '@astryxdesign/core/Button';
import {
  CommentThread,
  Comments,
  type CommentThreadData,
  type CommentUser,
} from '@astryxdesign/lab';
import CommentComposerShowcase from '../../../packages/lab/blocks/CommentComposerShowcase';
import CommentThreadInPopover from '../../../packages/lab/blocks/CommentThreadInPopover';
import CommentThreadShowcase from '../../../packages/lab/blocks/CommentThreadShowcase';
import CommentsShowcase from '../../../packages/lab/blocks/CommentsShowcase';

const meta: Meta = {
  title: 'Lab/Comments',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj;

const VIEWER: CommentUser = {id: 'avery', name: 'Avery Kim'};
const MAYA: CommentUser = {id: 'maya', name: 'Maya Chen'};
const JORDAN: CommentUser = {id: 'jordan', name: 'Jordan Lee'};
const SAM: CommentUser = {id: 'sam', name: 'Sam Rivera'};

const COMMENTS: readonly CommentThreadData[] = [
  {
    id: 'root',
    author: MAYA,
    body: 'The rollout plan is ready for review.',
    createdAt: '2026-09-30T19:00:00Z',
    reactions: [
      {
        key: 'like',
        label: '👍',
        count: 2,
        reactedByViewer: true,
        actors: [VIEWER, MAYA],
      },
    ],
    replies: [
      {
        id: 'reply',
        author: VIEWER,
        body: 'Looks good to me.',
        createdAt: '2026-09-30T19:10:00Z',
      },
    ],
  },
  {
    id: 'second',
    author: VIEWER,
    body: 'I added the guardrail dashboard to the summary.',
    createdAt: '2026-09-30T19:20:00Z',
  },
];

/** Every feature, with working callbacks. */
export const Panel: Story = {
  render: () => (
    <VStack width={920} height={640}>
      <CommentsShowcase />
    </VStack>
  ),
};

/** Inside a card, threads are divider-bounded Sections so cards never nest. */
export const InsideACard: Story = {
  render: () => (
    <Card padding={0} width={380} height={440}>
      <Comments
        comments={COMMENTS}
        currentUser={VIEWER}
        container="card"
        density="compact"
        onSubmit={() => {}}
      />
    </Card>
  ),
};

/** Readers see reactions and replies, and no control that changes data. */
export const ReadOnly: Story = {
  render: () => (
    <VStack width={560} height={320}>
      <Comments comments={COMMENTS} mode="read-only" density="compact" />
    </VStack>
  ),
};

export const Loading: Story = {
  render: () => (
    <VStack width={560} height={420}>
      <Comments
        comments={[]}
        isLoading
        currentUser={VIEWER}
        density="compact"
        onSubmit={() => {}}
      />
    </VStack>
  ),
};

export const Empty: Story = {
  render: () => (
    <VStack width={560} height={320}>
      <Comments comments={[]} currentUser={VIEWER} onSubmit={() => {}} />
    </VStack>
  ),
};

/** One thread on its own: a margin comment beside a document. */
export const MarginComment: Story = {
  render: () => <CommentThreadShowcase />,
};

/**
 * A thread in a Popover that owns its dismissal: with an unsaved reply, the
 * first press outside or Escape shakes the thread and keeps the draft.
 */
export const InPopover: Story = {
  render: () => <CommentThreadInPopover />,
};

/** A lone thread a reader opened, with its replies showing. */
export const OpenThread: Story = {
  render: () => (
    <VStack width={480}>
      <CommentThread
        comment={COMMENTS[0]}
        currentUser={VIEWER}
        isSelected
        onSubmit={() => {}}
        onReact={() => {}}
      />
    </VStack>
  ),
};

/** Controlled typing plus hidden seen metadata, ready for a transport adapter. */
export const LiveState: Story = {
  render: () => (
    <VStack width={480}>
      <CommentThread
        comment={{
          ...COMMENTS[0],
          typingUsers: [JORDAN, SAM],
          seenBy: [JORDAN, SAM],
          replies: [
            {
              id: 'live-reply',
              author: VIEWER,
              body: 'The review notes are incorporated.',
              createdAt: '2026-09-30T19:10:00Z',
              seenBy: [MAYA, JORDAN, SAM],
            },
          ],
        }}
        currentUser={VIEWER}
        isSelected
        onSubmit={() => {}}
      />
    </VStack>
  ),
};

export const Composer: Story = {
  render: () => <CommentComposerShowcase />,
};

/** Loading failed: an error Banner with Retry above the threads. */
export const LoadError: Story = {
  render: () => (
    <VStack width={560} height={360}>
      <Comments
        comments={COMMENTS}
        currentUser={VIEWER}
        loadError="Check your connection and try again."
        onRetryLoad={() => new Promise(resolve => setTimeout(resolve, 800))}
        hasOlderComments
        onLoadOlder={() => Promise.reject(new Error('offline'))}
        density="compact"
        onSubmit={() => {}}
      />
    </VStack>
  ),
};

const LONG_NAME: CommentUser = {
  id: 'long',
  name: 'Maximiliana Alejandra Rodríguez-Vanderberg',
};

/** Long names, unbroken words, and long bodies wrap rather than overflow. */
export const LongContent: Story = {
  render: () => (
    <VStack width={420} height={560}>
      <Comments
        comments={[
          {
            id: 'long-root',
            author: LONG_NAME,
            body: 'Supercalifragilisticexpialidocious-configuration-flag-name-that-never-breaks is still on in the canary. The rollout notes say the final cohort completes in two days, but the dashboard shows three, and the guardrail metrics have not settled for the last two regions, so I would hold the next step until the on-call confirms the numbers and the review queue is clear.',
            createdAt: '2026-09-30T19:00:00Z',
            isEdited: true,
            anchor: {
              quote:
                'The final cohort completes rollout in two days, after the guardrail metrics settle in every region and the review queue is clear.',
            },
            replies: [
              {
                id: 'long-reply',
                author: VIEWER,
                body: 'https://example.com/a/very/long/link/that/keeps/going/and/going/without/any/spaces/at/all',
                createdAt: '2026-09-30T19:10:00Z',
              },
            ],
          },
        ]}
        currentUser={VIEWER}
        density="compact"
        selectedThreadId="long-root"
        onSelectedThreadChange={() => {}}
        onSubmit={() => {}}
      />
    </VStack>
  ),
};

/** At 320 CSS pixels the header actions collapse into the more menu. */
export const Narrow: Story = {
  render: () => (
    <VStack width={320} height={520}>
      <Comments
        comments={COMMENTS}
        currentUser={VIEWER}
        density="compact"
        onSubmit={() => {}}
        onReact={() => {}}
        onResolveThread={() => {}}
        onSaveEdit={() => {}}
        onDelete={() => {}}
      />
    </VStack>
  ),
};

/** Saving an edit that has not finished: the editor stays busy. */
export const SavingAnEdit: Story = {
  render: () => (
    <VStack width={480} height={520}>
      <Comments
        comments={COMMENTS}
        currentUser={VIEWER}
        onSubmit={() => {}}
        onSaveEdit={() => new Promise<void>(() => {})}
        onDelete={() => {}}
      />
    </VStack>
  ),
};

/** Embedded at its content height inside a popover: no scroll area or dock. */
export const EmbeddedInAPopover: Story = {
  render: () => (
    <Popover
      label="Comments"
      width={380}
      padding={0}
      content={
        <Comments
          comments={COMMENTS}
          currentUser={VIEWER}
          layout="embedded"
          container="card"
          density="compact"
          onSubmit={() => {}}
        />
      }>
      <Button label="Show comments" />
    </Popover>
  ),
};
