// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Stack} from '@astryxdesign/core/Layout';
import {MailIcon, LockIcon, UserIcon} from '@astryxdesign/template-icons';

export default function TextInputIcon() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div style={{width: 300}}>
      <Stack direction="vertical" gap={3}>
        <TextInput
          label="Full name"
          value={name}
          onChange={setName}
          placeholder="Sarah Chen"
          startIcon={UserIcon}
        />
        <TextInput
          type="email"
          label="Email"
          value={email}
          onChange={setEmail}
          placeholder="sarah@company.com"
          startIcon={MailIcon}
        />
        <TextInput
          type="password"
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
          startIcon={LockIcon}
        />
      </Stack>
    </div>
  );
}
