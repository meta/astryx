// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ChatComposer} from '@astryxdesign/core/Chat';
import {Button} from '@astryxdesign/core/Button';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {Icon} from '@astryxdesign/core/Icon';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';
import {
  SettingsIcon,
  MicrophoneIcon,
  SparklesIcon,
} from '@astryxdesign/template-icons';

export default function ChatComposerFlat() {
  const showToast = useToast();
  return (
    <Stack direction="vertical" gap={2} width={450} maxWidth="100%">
      <Text type="supporting" color="secondary">
        elevation=&quot;none&quot; — flat, with a text-input-style border and
        focus ring
      </Text>
      <ChatComposer
        elevation="none"
        onSubmit={value => {
          console.log('Sent:', value);
        }}
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
