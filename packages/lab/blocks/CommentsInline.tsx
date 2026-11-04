// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A Markdown-like document, its anchored threads, and controlled
 *   document/thread selection
 * @output A realistic document review: highlighted passages stay synchronized
 *   with a Comments side panel, and a selected passage starts a quoted thread
 * @position Copyable Lab Comments inline-comments example
 */

import {useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {
  borderVars,
  colorVars,
  focusVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {
  Comments,
  type CommentAnchor,
  type CommentData,
  type CommentThreadData,
  type CommentUser,
} from '@astryxdesign/lab';

const VIEWER: CommentUser = {id: 'avery', name: 'Avery Kim'};
const MAYA: CommentUser = {id: 'maya', name: 'Maya Chen'};
const JORDAN: CommentUser = {id: 'jordan', name: 'Jordan Lee'};

const ROLLOUT_PASSAGE =
  'The final cohort completes rollout in three days after the dry run.';
const GUARDRAIL_PASSAGE =
  'Pause if the 95th percentile exceeds 420 ms for two consecutive checks.';
const REVIEW_PASSAGE =
  'Publish the review note after the final cohort is complete.';

const INITIAL_COMMENTS: readonly CommentThreadData[] = [
  {
    id: 'rollout-window',
    author: MAYA,
    body: 'Can we make the dry-run dependency explicit? It explains the extra day.',
    createdAt: '2026-10-14T17:18:00Z',
    anchor: {quote: ROLLOUT_PASSAGE},
    replies: [
      {
        id: 'rollout-reply',
        author: VIEWER,
        body: 'Updated. The window now starts after the dry run finishes.',
        createdAt: '2026-10-14T17:31:00Z',
      },
    ],
  },
  {
    id: 'latency-threshold',
    author: JORDAN,
    body: 'This matches the alert. I would keep the two-check window to avoid pausing on a single spike.',
    createdAt: '2026-10-14T18:04:00Z',
    anchor: {quote: GUARDRAIL_PASSAGE},
    isUnread: true,
  },
];

const styles = stylex.create({
  passage: {
    appearance: 'none',
    backgroundColor: colorVars['--color-background-yellow'],
    borderStyle: 'solid',
    borderWidth: 0,
    borderBlockEndWidth: borderVars['--border-width'],
    borderBlockEndColor: 'transparent',
    borderRadius: radiusVars['--radius-inner'],
    color: 'inherit',
    cursor: 'pointer',
    font: 'inherit',
    lineHeight: 'inherit',
    marginInline: spacingVars['--spacing-0-5'],
    paddingBlock: 0,
    paddingInline: spacingVars['--spacing-0-5'],
    textAlign: 'start',
    outlineStyle: {
      default: 'none',
      ':focus-visible': focusVars['--focus-outline-style'],
    },
    outlineWidth: focusVars['--focus-outline-width'],
    outlineColor: focusVars['--focus-outline-color'],
    outlineOffset: focusVars['--focus-outline-offset'],
  },
  selectedPassage: {
    borderBlockEndColor: colorVars['--color-border-yellow'],
  },
  selectablePassage: {
    backgroundColor: {
      default: 'transparent',
      ':hover': colorVars['--color-background-yellow'],
    },
    borderBlockEndStyle: 'dashed',
    borderBlockEndColor: colorVars['--color-border-emphasized'],
  },
  document: {
    overflowY: 'auto',
  },
});

function updateComment(
  comments: readonly CommentThreadData[],
  id: string,
  update: (comment: CommentData) => CommentData,
): CommentThreadData[] {
  return comments.map(comment =>
    comment.id === id
      ? {...comment, ...update(comment)}
      : {
          ...comment,
          replies: comment.replies?.map(reply =>
            reply.id === id ? update(reply) : reply,
          ),
        },
  );
}

export default function CommentsInline() {
  const [comments, setComments] = useState<CommentThreadData[]>(() => [
    ...INITIAL_COMMENTS,
  ]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    'rollout-window',
  );
  const [selectedPassage, setSelectedPassage] = useState<string | null>(null);
  const [composerAnchor, setComposerAnchor] = useState<CommentAnchor>();
  const nextId = useRef(1);

  const post = (body: string, parentCommentId?: string) => {
    const id = `review-comment-${nextId.current++}`;
    const comment: CommentData = {
      id,
      author: VIEWER,
      body,
      createdAt: new Date().toISOString(),
    };
    if (parentCommentId != null) {
      setComments(current =>
        current.map(thread =>
          thread.id === parentCommentId
            ? {...thread, replies: [...(thread.replies ?? []), comment]}
            : thread,
        ),
      );
      return;
    }
    setComments(current => [...current, {...comment, anchor: composerAnchor}]);
    setComposerAnchor(undefined);
    setSelectedPassage(null);
    setSelectedThreadId(id);
  };

  return (
    <HStack gap={3} align="start">
      <Card width={520} height={620} padding={4}>
        <VStack gap={4} width="100%" xstyle={styles.document}>
          <VStack gap={1}>
            <Text as="h1" type="display-3" weight="bold">
              Launch plan
            </Text>
            <Text type="supporting" color="secondary">
              Draft · updated today
            </Text>
          </VStack>

          <VStack gap={2}>
            <Text as="h2" type="body" weight="bold">
              Rollout
            </Text>
            <Text type="body">
              Begin with the internal cohort, then expand by region.
              <button
                type="button"
                {...stylex.props(
                  styles.passage,
                  selectedThreadId === 'rollout-window' &&
                    styles.selectedPassage,
                )}
                aria-label={`Open comments on “${ROLLOUT_PASSAGE}”`}
                onClick={() => {
                  setSelectedPassage(null);
                  setComposerAnchor(undefined);
                  setSelectedThreadId('rollout-window');
                }}>
                {ROLLOUT_PASSAGE}
              </button>
              Owners confirm each step before the next begins.
            </Text>
          </VStack>

          <VStack gap={2}>
            <Text as="h2" type="body" weight="bold">
              Guardrails
            </Text>
            <Text type="body">
              Watch latency and error rate throughout the rollout.
              <button
                type="button"
                {...stylex.props(
                  styles.passage,
                  selectedThreadId === 'latency-threshold' &&
                    styles.selectedPassage,
                )}
                aria-label={`Open comments on “${GUARDRAIL_PASSAGE}”`}
                onClick={() => {
                  setSelectedPassage(null);
                  setComposerAnchor(undefined);
                  setSelectedThreadId('latency-threshold');
                }}>
                {GUARDRAIL_PASSAGE}
              </button>
              Resume only after the metric returns to baseline.
            </Text>
          </VStack>

          <VStack gap={2} align="start">
            <Text as="h2" type="body" weight="bold">
              Review
            </Text>
            <Text type="body">
              <button
                type="button"
                {...stylex.props(
                  styles.passage,
                  styles.selectablePassage,
                  selectedPassage === REVIEW_PASSAGE && styles.selectedPassage,
                )}
                aria-label={`Select “${REVIEW_PASSAGE}” for a comment`}
                onClick={() => {
                  setSelectedThreadId(null);
                  setComposerAnchor(undefined);
                  setSelectedPassage(REVIEW_PASSAGE);
                }}>
                {REVIEW_PASSAGE}
              </button>
            </Text>
            {selectedPassage === REVIEW_PASSAGE && (
              <Button
                label="Comment on selection"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setComposerAnchor({quote: REVIEW_PASSAGE});
                  setSelectedPassage(null);
                }}
              />
            )}
          </VStack>
        </VStack>
      </Card>

      <Card width={360} height={620} padding={0}>
        <Comments
          label="Comments on Launch plan"
          comments={comments}
          currentUser={VIEWER}
          container="card"
          density="compact"
          selectedThreadId={selectedThreadId}
          onSelectedThreadChange={setSelectedThreadId}
          composerAnchor={composerAnchor}
          onComposerAnchorDismiss={() => setComposerAnchor(undefined)}
          onSubmit={post}
          onResolveThread={commentId =>
            setComments(current =>
              updateComment(current, commentId, comment => ({
                ...comment,
                isResolved: true,
                resolvedBy: VIEWER,
              })),
            )
          }
          onReopenThread={commentId =>
            setComments(current =>
              updateComment(current, commentId, comment => ({
                ...comment,
                isResolved: false,
                resolvedBy: undefined,
              })),
            )
          }
        />
      </Card>
    </HStack>
  );
}
