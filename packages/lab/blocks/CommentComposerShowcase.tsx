// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A controlled draft and a list of posted comments
 * @output A comment composer that posts into a short list above it
 * @position Lab CommentComposer's docsite showcase and copyable CLI block
 */

import {useState} from 'react';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {CommentComposer} from '@astryxdesign/lab';

export default function CommentComposerShowcase() {
  const [draft, setDraft] = useState('');
  const [posted, setPosted] = useState<string[]>([]);

  return (
    <VStack gap={3} width={420}>
      {posted.length === 0 ? (
        <Text type="supporting" color="secondary">
          Nothing posted yet.
        </Text>
      ) : (
        posted.map((body, index) => (
          <Text key={index} type="body">
            {body}
          </Text>
        ))
      )}
      <CommentComposer
        value={draft}
        onChange={setDraft}
        onSubmit={body => {
          setPosted(current => [...current, body]);
          setDraft('');
        }}
        anchor={{quote: 'Guardrail alerts page the release oncall.'}}
        onAnchorDismiss={() => {}}
      />
    </VStack>
  );
}
