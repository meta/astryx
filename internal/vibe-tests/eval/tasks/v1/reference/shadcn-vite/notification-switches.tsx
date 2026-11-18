// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';

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
    <div className="flex flex-col gap-4 p-6">
      {CHANNELS.map(channel => (
        <div key={channel.key} className="flex items-center gap-3">
          <Switch
            id={`switch-${channel.key}`}
            checked={enabled[channel.key]}
            onCheckedChange={checked =>
              setEnabled(current => ({...current, [channel.key]: checked}))
            }
          />
          <Label htmlFor={`switch-${channel.key}`}>{channel.label}</Label>
        </div>
      ))}
      <p className="text-sm">{`${onCount} of 3 notifications on`}</p>
    </div>
  );
}
