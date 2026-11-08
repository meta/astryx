// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Controlled popover state, a controlled comment thread, and its reply
 *   callback
 * @output A passage whose comment button opens one thread in a Popover; the
 *   thread owns the Popover's dismissal and keeps an unsaved reply on the
 *   first press outside or Escape
 * @position Copyable Lab CommentThread example
 */

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {VStack} from '@astryxdesign/core/Layout';
import {Popover} from '@astryxdesign/core/Popover';
import {Text} from '@astryxdesign/core/Text';
import {
  CommentThread,
  type CommentThreadData,
  type CommentUser,
} from '@astryxdesign/lab';

const VIEWER: CommentUser = {id: 'avery', name: 'Avery Kim'};

export default function CommentThreadInPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const [thread, setThread] = useState<CommentThreadData>({
    id: 'passage',
    author: {id: 'maya', name: 'Maya Chen'},
    body: 'Should this say three days? The dry run adds one.',
    createdAt: '2026-09-30T19:00:00Z',
    anchor: {quote: 'The final cohort completes rollout in two days.'},
  });
  const replyCount = thread.replies?.length ?? 0;

  return (
    <Card padding={4} width={420}>
      <VStack gap={3} align="start">
        <Text>
          Every region moves to the new build in three cohorts. The final cohort
          completes rollout in two days.
        </Text>
        <Popover
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          // The thread owns dismissal: it keeps an unsaved reply on the first
          // press outside or Escape, which native light dismiss cannot.
          hasLightDismiss={false}
          hasEscapeDismiss={false}
          label="Comment thread"
          padding={0}
          width={340}
          content={
            <CommentThread
              comment={thread}
              currentUser={VIEWER}
              container="card"
              onDismiss={() => setIsOpen(false)}
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
            />
          }>
          <Button
            label={
              replyCount === 0 ? '1 comment' : `${replyCount + 1} comments`
            }
            variant="secondary"
            size="sm"
          />
        </Popover>
      </VStack>
    </Card>
  );
}
