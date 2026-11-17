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
  Cog6ToothIcon,
  MicrophoneIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

export default function ChatComposerFooterActions() {
  const showToast = useToast();
  return (
    <Stack direction="vertical" gap={4} width={450} maxWidth="100%">
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Model selector and settings dropdowns
        </Text>
        <ChatComposer
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
                  {label: 'Model C', onClick: () => {}},
                ]}
              />
              <DropdownMenu
                button={{
                  label: 'Settings',
                  variant: 'ghost',
                  size: 'md',
                  icon: <Icon icon={Cog6ToothIcon} size="sm" />,
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
    </Stack>
  );
}
