// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
} from '@astryxdesign/core/Chat';
import {Token} from '@astryxdesign/core/Token';
import {Button} from '@astryxdesign/core/Button';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {Icon} from '@astryxdesign/core/Icon';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {
  MentionIcon,
  SettingsIcon,
  MicrophoneIcon,
  AttachIcon,
  SparklesIcon,
} from '@astryxdesign/template-icons';
import {useToast} from '@astryxdesign/core/Toast';

export default function ChatComposerFullFeatured() {
  const showToast = useToast();
  const [isStreaming, setIsStreaming] = useState(false);

  return (
    <Stack direction="vertical" gap={4} width={450} maxWidth="100%">
      <Text type="supporting" color="secondary">
        All slots populated
      </Text>
      <ChatComposer
        onSubmit={value => {
          console.log('Sent:', value);
          setIsStreaming(true);
          setTimeout(() => setIsStreaming(false), 3000);
        }}
        isStopShown={isStreaming}
        onStop={() => setIsStreaming(false)}
        placeholder="Ask me anything..."
        input={<ChatComposerInput style={{minHeight: 44}} />}
        drawer={
          <ChatComposerDrawer count={5}>
            <Token label="design-spec.pdf" onRemove={() => {}} />
            <Token label="requirements.docx" onRemove={() => {}} />
            <Token label="wireframes.fig" onRemove={() => {}} />
            <Token label="api-spec.yaml" onRemove={() => {}} />
            <Token label="user-research.csv" onRemove={() => {}} />
          </ChatComposerDrawer>
        }
        headerActions={
          <>
            <Button
              onClick={() =>
                showToast({body: 'Demo: a mention picker would open here'})
              }
              label="Mention"
              variant="ghost"
              size="sm"
              icon={<Icon icon={MentionIcon} />}
              isIconOnly
            />
            <Button
              onClick={() =>
                showToast({body: 'Demo: a file picker would open here'})
              }
              label="Attach file"
              variant="ghost"
              size="sm"
              icon={<Icon icon={AttachIcon} />}
              isIconOnly
            />
          </>
        }
        headerContext={
          <ProgressBar label="Context window" value={50} isLabelHidden />
        }
        footerActions={
          <>
            <DropdownMenu
              button={{
                label: 'Auto',
                variant: 'ghost',
                size: 'md',
                icon: <Icon icon={SparklesIcon} size="sm" />,
                children: 'Auto',
              }}
              menuWidth={200}
              items={[
                {label: 'Auto', onClick: () => {}},
                {label: 'Model A', onClick: () => {}},
                {label: 'Model B', onClick: () => {}},
                {label: 'Model C', onClick: () => {}},
              ]}
            />
            <DropdownMenu
              button={{
                label: 'Settings',
                variant: 'ghost',
                size: 'md',
                icon: <Icon icon={SettingsIcon} size="sm" />,
                children: 'Settings',
              }}
              menuWidth={200}
              items={[
                {label: 'Preferences', onClick: () => {}},
                {label: 'Keyboard shortcuts', onClick: () => {}},
                {label: 'About', onClick: () => {}},
              ]}
            />
          </>
        }
        sendActions={
          <Button
            label="Microphone"
            variant="ghost"
            size="md"
            icon={<Icon icon={MicrophoneIcon} />}
            isIconOnly
            onClick={() =>
              showToast({body: 'Demo: voice input would start here'})
            }
          />
        }
      />
    </Stack>
  );
}
