// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Controlled comments, events, and every Comments callback
 * @output A working Comments panel: threads with replies, reactions,
 *   edit history, inline comments, controlled typing and hidden seen metadata,
 *   a non-interrupting unread-reply reveal, an agent's reply in progress, a
 *   failed comment, activity events, and earlier comments to load
 * @position Lab Comments's docsite showcase and copyable CLI block
 */

import {useRef, useState} from 'react';
import {VStack} from '@astryxdesign/core/Layout';
import {
  DEFAULT_COMMENT_REACTIONS,
  Comments,
  type CommentData,
  type CommentReactionOption,
  type CommentThreadData,
  type CommentUser,
  type CommentVersion,
  type CommentActivityEvent,
} from '@astryxdesign/lab';

const VIEWER: CommentUser = {id: 'avery', name: 'Avery Kim'};
const MAYA: CommentUser = {id: 'maya', name: 'Maya Chen'};
const NOAH: CommentUser = {id: 'noah', name: 'Noah Williams'};
const ASSISTANT: CommentUser = {
  id: 'release-assistant',
  name: 'Release Assistant',
  kind: 'agent',
};

const EVENTS: readonly CommentActivityEvent[] = [
  {
    id: 'checklist',
    label: 'Rollout checklist attached',
    description: 'Added the launch checklist to the discussion.',
    createdAt: '2026-09-30T18:46:00Z',
    actor: MAYA,
  },
  {
    id: 'status',
    label: 'Status changed to Ready for review',
    createdAt: '2026-09-30T19:02:00Z',
  },
];

const INITIAL_COMMENTS: readonly CommentThreadData[] = [
  {
    id: 'plan',
    author: MAYA,
    body: 'The revised rollout plan is ready. **Avery**, could you check the final cohort?',
    createdAt: '2026-09-30T18:30:00Z',
    isEdited: true,
    isUnread: true,
    typingUsers: [NOAH],
    seenBy: [NOAH],
    previousVersions: [
      {
        id: 'plan-v1',
        body: 'The revised rollout plan is ready for review.',
        editedAt: '2026-09-30T18:10:00Z',
        author: MAYA,
      },
    ],
    reactions: [
      {
        key: 'like',
        label: '👍',
        description: 'Like',
        count: 2,
        reactedByViewer: true,
        actors: [VIEWER, NOAH],
      },
    ],
    replies: [
      {
        id: 'plan-reply-1',
        author: NOAH,
        body: 'I checked the cohort and the guardrail query. Both look good.',
        createdAt: '2026-09-30T18:42:00Z',
      },
      {
        id: 'plan-reply-2',
        author: ASSISTANT,
        body: '',
        createdAt: '2026-09-30T18:45:00Z',
        progress: {label: 'Checking the rollout dependencies…'},
      },
    ],
  },
  {
    id: 'inline',
    author: NOAH,
    body: 'Should this say three days? The dry run adds one.',
    createdAt: '2026-09-30T18:52:00Z',
    anchor: {quote: 'The final cohort completes rollout in two days.'},
    replies: [
      {
        id: 'inline-reply-1',
        author: MAYA,
        body: 'Yes — I updated the rollout window to three days.',
        createdAt: '2026-09-30T19:04:00Z',
        isUnread: true,
      },
    ],
  },
  {
    id: 'orphaned',
    author: MAYA,
    body: 'Typo: "Teh".',
    createdAt: '2026-09-30T18:55:00Z',
    anchor: {quote: 'Teh guardrail query runs hourly.', status: 'orphaned'},
    isResolved: true,
    resolvedBy: VIEWER,
  },
  {
    id: 'failed',
    author: VIEWER,
    body: 'Posting this update failed, but the text is kept.',
    createdAt: '2026-09-30T19:10:00Z',
    status: 'error',
    errorMessage: "Couldn't post this comment.",
  },
];

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

function findComment(
  comments: readonly CommentThreadData[],
  id: string,
): CommentData | undefined {
  for (const comment of comments) {
    if (comment.id === id) {
      return comment;
    }
    const reply = comment.replies?.find(candidate => candidate.id === id);
    if (reply != null) {
      return reply;
    }
  }
  return undefined;
}

export default function CommentsShowcase() {
  const [comments, setComments] = useState<CommentThreadData[]>(() => [
    ...INITIAL_COMMENTS,
  ]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    'plan',
  );
  const [hasOlderComments, setHasOlderComments] = useState(true);
  const nextId = useRef(1);

  const post = (body: string, parentCommentId?: string) => {
    const comment = {
      id: `demo-${nextId.current++}`,
      author: VIEWER,
      body,
      createdAt: new Date().toISOString(),
    };
    setComments(current =>
      parentCommentId == null
        ? [...current, comment]
        : current.map(root =>
            root.id === parentCommentId
              ? {...root, replies: [...(root.replies ?? []), comment]}
              : root,
          ),
    );
  };

  const saveEdit = (commentId: string, body: string) =>
    setComments(current =>
      updateComment(current, commentId, comment => ({
        ...comment,
        body,
        isEdited: true,
        previousVersions: [
          {
            id: `${comment.id}-${Date.now()}`,
            body: comment.body,
            editedAt: new Date().toISOString(),
            author: comment.author,
          },
          ...(comment.previousVersions ?? []),
        ],
      })),
    );

  const remove = (commentId: string) =>
    setComments(current =>
      current
        .filter(comment => comment.id !== commentId)
        .map(comment => ({
          ...comment,
          replies: comment.replies?.filter(reply => reply.id !== commentId),
        })),
    );

  const react = (
    commentId: string,
    key: string,
    picked?: CommentReactionOption,
  ) => {
    const option =
      picked ??
      DEFAULT_COMMENT_REACTIONS.find(candidate => candidate.key === key);
    if (option == null) {
      return;
    }
    setComments(current =>
      updateComment(current, commentId, comment => {
        const existing = comment.reactions?.find(
          reaction => reaction.key === key,
        );
        const reactions =
          existing == null
            ? [
                ...(comment.reactions ?? []),
                {...option, count: 1, reactedByViewer: true, actors: [VIEWER]},
              ]
            : (comment.reactions ?? [])
                .map(reaction =>
                  reaction.key === key
                    ? {
                        ...reaction,
                        count:
                          reaction.count + (reaction.reactedByViewer ? -1 : 1),
                        reactedByViewer: !reaction.reactedByViewer,
                      }
                    : reaction,
                )
                .filter(reaction => reaction.count > 0);
        return {...comment, reactions};
      }),
    );
  };

  const setResolved = (commentId: string, isResolved: boolean) =>
    setComments(current =>
      current.map(comment =>
        comment.id === commentId
          ? {
              ...comment,
              isResolved,
              resolvedBy: isResolved ? VIEWER : undefined,
            }
          : comment,
      ),
    );

  const loadVersions = async (
    commentId: string,
  ): Promise<readonly CommentVersion[]> => {
    const comment = findComment(comments, commentId);
    if (comment == null) {
      return [];
    }
    return [
      {
        id: `${comment.id}-current`,
        body: comment.body,
        editedAt: comment.updatedAt ?? comment.createdAt,
        author: comment.author,
        isCurrent: true,
      },
      ...(comment.previousVersions ?? []),
    ];
  };

  return (
    <VStack width="100%" height="100%">
      <Comments
        comments={comments}
        events={EVENTS}
        currentUser={VIEWER}
        selectedThreadId={selectedThreadId}
        onSelectedThreadChange={setSelectedThreadId}
        density="compact"
        hasOlderComments={hasOlderComments}
        onLoadOlder={() => {
          setComments(current => [
            {
              id: 'older',
              author: NOAH,
              body: 'Earlier context loads above the threads.',
              createdAt: '2026-09-30T17:45:00Z',
            },
            ...current,
          ]);
          setHasOlderComments(false);
        }}
        agentCommands={[
          {
            command: 'ask',
            name: 'Release Assistant',
            description: 'Ask about the rollout',
          },
        ]}
        onUploadImages={async files =>
          files.map(file => ({url: URL.createObjectURL(file), alt: file.name}))
        }
        onSubmit={post}
        onSaveEdit={saveEdit}
        onDelete={remove}
        onReact={react}
        onResolveThread={id => setResolved(id, true)}
        onReopenThread={id => setResolved(id, false)}
        onRetryComment={commentId =>
          setComments(current =>
            updateComment(current, commentId, comment => ({
              ...comment,
              status: 'sent',
              errorMessage: undefined,
            })),
          )
        }
        loadVersions={loadVersions}
      />
    </VStack>
  );
}
