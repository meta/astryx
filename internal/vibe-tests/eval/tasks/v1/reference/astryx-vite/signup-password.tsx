// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';

type Errors = {email?: string; password?: string; confirm?: string};

function validate(email: string, password: string, confirm: string): Errors {
  const errors: Errors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address';
  }
  if (password.length < 8) errors.password = 'Use at least 8 characters';
  if (confirm !== password) errors.confirm = 'Passwords do not match';
  return errors;
}

const asStatus = (message?: string) =>
  message ? {type: 'error' as const, message} : undefined;

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isPasswordShown, setIsPasswordShown] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [isDone, setIsDone] = useState(false);
  if (isDone) return <Text>Account created</Text>;
  return (
    <form
      noValidate
      onSubmit={event => {
        event.preventDefault();
        const next = validate(email, password, confirm);
        setErrors(next);
        if (Object.keys(next).length === 0) setIsDone(true);
      }}>
      <VStack gap={4} padding={6} width={400}>
        <Heading level={1}>Create account</Heading>
        <TextInput
          type="email"
          label="Email"
          value={email}
          onChange={setEmail}
          status={asStatus(errors.email)}
          statusVariant="detached"
        />
        <HStack gap={2} align="end">
          <TextInput
            type={isPasswordShown ? 'text' : 'password'}
            label="Password"
            value={password}
            onChange={setPassword}
            status={asStatus(errors.password)}
            statusVariant="detached"
            containerStyle={{flex: 1, minWidth: 0}}
          />
          <Button
            label={isPasswordShown ? 'Hide password' : 'Show password'}
            variant="secondary"
            onClick={() => setIsPasswordShown(shown => !shown)}
          />
        </HStack>
        <TextInput
          type="password"
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          status={asStatus(errors.confirm)}
          statusVariant="detached"
        />
        <Button type="submit" label="Create account" variant="primary" />
      </VStack>
    </form>
  );
}
