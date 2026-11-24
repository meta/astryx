// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A controlled draft and a list of posted comments
 * @output A comment composer that posts into a short list above it
 * @position CommentComposer's docsite showcase and copyable CLI block
 */

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {
  CommentComposer,
  type CommentEmojiPickerRenderProps,
} from '@astryxdesign/core/Comments';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

const EMOJI = ['👍', '🎉', '❤️', '😂', '👀'];

function EmojiRow({onSelect}: CommentEmojiPickerRenderProps) {
  return (
    <HStack gap={1} padding={2}>
      {EMOJI.map(emoji => (
        <Button
          key={emoji}
          label={emoji}
          variant="ghost"
          onClick={() => onSelect(emoji)}
        />
      ))}
    </HStack>
  );
}

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
        emojiPicker={props => <EmojiRow {...props} />}
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
