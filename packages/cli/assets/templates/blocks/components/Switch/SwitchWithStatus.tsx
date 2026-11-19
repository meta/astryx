// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Switch} from '@astryxdesign/core/Switch';
import {VStack} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';

export default function SwitchWithStatus() {
  const [terms, setTerms] = useState(false);
  const [sharing, setSharing] = useState(true);
  const [twoFactor, setTwoFactor] = useState(true);

  return (
    <Center width={400} maxWidth="100%">
      <VStack gap={6} width="100%" style={{maxWidth: 400}}>
        <Switch
          label="Accept terms and conditions"
          value={terms}
          onChange={setTerms}
          isRequired
          status={{
            type: 'error',
            message: 'You must accept the terms to continue',
          }}
        />
        <Switch
          label="Share usage data"
          description="Help us improve by sharing anonymous usage statistics"
          value={sharing}
          onChange={setSharing}
          status={{
            type: 'warning',
            message: 'This data may be shared with partners',
          }}
        />
        <Switch
          label="Two-factor authentication"
          value={twoFactor}
          onChange={setTwoFactor}
          status={{type: 'success', message: 'Your account is now more secure'}}
        />
      </VStack>
    </Center>
  );
}
