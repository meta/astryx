// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Switch} from '@astryxdesign/core/Switch';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

const CHANNELS = [
  {key: 'email', label: 'Email notifications'},
  {key: 'push', label: 'Push notifications'},
  {key: 'sms', label: 'SMS alerts'},
] as const;
type ChannelKey = (typeof CHANNELS)[number]['key'];

export default function App() {
  const [enabled, setEnabled] = useState<Record<ChannelKey, boolean>>({
    email: true,
    push: false,
    sms: false,
  });
  const onCount = Object.values(enabled).filter(Boolean).length;
  return (
    <VStack gap={3} padding={6}>
      {CHANNELS.map(channel => (
        <Switch
          key={channel.key}
          label={channel.label}
          value={enabled[channel.key]}
          onChange={checked =>
            setEnabled(current => ({...current, [channel.key]: checked}))
          }
        />
      ))}
      <Text>{`${onCount} of 3 notifications on`}</Text>
    </VStack>
  );
}
