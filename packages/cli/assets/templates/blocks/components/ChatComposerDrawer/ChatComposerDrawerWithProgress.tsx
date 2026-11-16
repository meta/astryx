// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ChatComposer, ChatComposerDrawer} from '@astryxdesign/core/Chat';
import {Token} from '@astryxdesign/core/Token';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Stack} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {PaperClipIcon, AtSymbolIcon} from '@heroicons/react/24/outline';
import {useToast} from '@astryxdesign/core/Toast';

export default function ChatComposerDrawerWithProgress() {
  const showToast = useToast();
  return (
    <Stack direction="vertical" gap={4} width={450} maxWidth="100%">
      <ChatComposer
        onSubmit={() => {}}
        drawer={
          <ChatComposerDrawer count={3} label="Attachments">
            <Token label="design-spec.pdf" onRemove={() => {}} />
            <Token label="api-schema.json" onRemove={() => {}} />
            <Token label="screenshot.png" onRemove={() => {}} />
          </ChatComposerDrawer>
        }
        headerActions={
          <>
            <Button
              label="Mention"
              variant="ghost"
              size="sm"
              icon={<Icon icon={AtSymbolIcon} size="sm" />}
              isIconOnly
              onClick={() =>
                showToast({body: 'Demo: a mention picker would open here'})
              }
            />
            <Button
              label="Attach"
              variant="ghost"
              size="sm"
              icon={<Icon icon={PaperClipIcon} size="sm" />}
              isIconOnly
              onClick={() =>
                showToast({body: 'Demo: a file picker would open here'})
              }
            />
          </>
        }
        headerContext={
          <Stack direction="horizontal" gap={2} vAlign="center">
            <ProgressBar value={42} label="Context usage" isLabelHidden />
          </Stack>
        }
      />
    </Stack>
  );
}
