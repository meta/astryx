// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Controlled comments and a post callback
 * @output A compact Comments panel filling a Card, its threads divider-bounded
 *   Sections so cards never nest
 * @position Copyable Lab Comments example
 */

import {useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {
  Comments,
  type CommentThreadData,
  type CommentUser,
} from '@astryxdesign/lab';

const VIEWER: CommentUser = {id: 'avery', name: 'Avery Kim'};
const MAYA: CommentUser = {id: 'maya', name: 'Maya Chen'};

const INITIAL_COMMENTS: readonly CommentThreadData[] = [
  {
    id: 'kickoff',
    author: MAYA,
    body: 'Can you review the rollout plan before Friday?',
    createdAt: '2026-09-30T19:00:00Z',
    replies: [
      {
        id: 'kickoff-reply',
        author: VIEWER,
        body: 'On it. I will leave notes on the final cohort.',
        createdAt: '2026-09-30T19:12:00Z',
      },
    ],
  },
  {
    id: 'dashboard',
    author: VIEWER,
    body: 'I added the guardrail dashboard to the summary.',
    createdAt: '2026-09-30T19:20:00Z',
  },
];

export default function CommentsInCard() {
  const [comments, setComments] = useState(INITIAL_COMMENTS);
  const post = (body: string, parentId?: string) => {
    const comment = {
      id: `comment-${Date.now()}`,
      author: VIEWER,
      body,
      createdAt: new Date().toISOString(),
    };
    setComments(current =>
      parentId == null
        ? [...current, comment]
        : current.map(root =>
            root.id === parentId
              ? {...root, replies: [...(root.replies ?? []), comment]}
              : root,
          ),
    );
  };

  return (
    <Card padding={0} width={380} height={460}>
      <Comments
        label="Rollout plan"
        comments={comments}
        currentUser={VIEWER}
        container="card"
        density="compact"
        onSubmit={post}
      />
    </Card>
  );
}
