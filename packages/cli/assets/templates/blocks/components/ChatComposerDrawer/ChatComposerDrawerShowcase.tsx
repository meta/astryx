// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ChatComposer, ChatComposerDrawer} from '@astryxdesign/core/Chat';
import {Token} from '@astryxdesign/core/Token';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Stack} from '@astryxdesign/core/Layout';
import {AttachIcon} from '@astryxdesign/template-icons';
import type {CSSProperties} from 'react';

const drawerBorder: CSSProperties = {
  border: 'var(--border-width) solid var(--color-border)',
  borderTopLeftRadius: 'var(--radius-chat)',
  borderTopRightRadius: 'var(--radius-chat)',
};

export default function ChatComposerDrawerShowcase() {
  return (
    <Stack direction="vertical" gap={4} width={450} maxWidth="100%">
      <ChatComposer
        onSubmit={() => {}}
        drawer={
          <ChatComposerDrawer
            count={4}
            label="Attachments"
            style={drawerBorder}>
            <Token label="design-spec.pdf" onRemove={() => {}} />
            <Token label="api-schema.json" onRemove={() => {}} />
            <Token label="screenshot.png" onRemove={() => {}} />
            <Token label="meeting-notes.md" onRemove={() => {}} />
          </ChatComposerDrawer>
        }
        headerActions={
          <Button
            label="Attach"
            variant="ghost"
            size="sm"
            icon={<Icon icon={AttachIcon} size="sm" />}
            isIconOnly
            onClick={() => {}}
          />
        }
      />
    </Stack>
  );
}
