// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';

export default function App() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <Text>Thanks for subscribing!</Text>;
  return (
    <form
      noValidate
      onSubmit={event => {
        event.preventDefault();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) setDone(true);
        else setError(true);
      }}>
      <VStack gap={2} padding={6}>
        <TextInput
          type="email"
          label="Email"
          value={email}
          onChange={setEmail}
          status={
            error
              ? {type: 'error', message: 'Enter a valid email address'}
              : undefined
          }
        />
        <Button type="submit" label="Subscribe" variant="primary" />
      </VStack>
    </form>
  );
}
