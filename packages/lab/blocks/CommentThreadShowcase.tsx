// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A controlled inline comment thread and its reply callback
 * @output A margin comment: one thread quoting its passage, inside a Card
 * @position Lab CommentThread's docsite showcase and copyable CLI block
 */

import {useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {
  CommentThread,
  type CommentThreadData,
  type CommentUser,
} from '@astryxdesign/lab';

const VIEWER: CommentUser = {id: 'avery', name: 'Avery Kim'};

export default function CommentThreadShowcase() {
  const [thread, setThread] = useState<CommentThreadData>({
    id: 'margin',
    author: {id: 'maya', name: 'Maya Chen'},
    body: 'Should this say three days? The dry run adds one.',
    createdAt: '2026-09-30T19:00:00Z',
    anchor: {quote: 'The final cohort completes rollout in two days.'},
    replies: [
      {
        id: 'margin-reply',
        author: VIEWER,
        body: 'Good catch, updating it.',
        createdAt: '2026-09-30T19:20:00Z',
      },
    ],
  });

  return (
    <Card padding={0} width={340}>
      <CommentThread
        comment={thread}
        currentUser={VIEWER}
        container="card"
        onSubmit={body =>
          setThread(current => ({
            ...current,
            replies: [
              ...(current.replies ?? []),
              {
                id: `reply-${Date.now()}`,
                author: VIEWER,
                body,
                createdAt: new Date().toISOString(),
              },
            ],
          }))
        }
        onResolveThread={() =>
          setThread(current => ({...current, isResolved: true}))
        }
        onReopenThread={() =>
          setThread(current => ({...current, isResolved: false}))
        }
      />
    </Card>
  );
}
