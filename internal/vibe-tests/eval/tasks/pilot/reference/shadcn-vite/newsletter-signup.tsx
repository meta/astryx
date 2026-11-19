// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

export default function App() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <p className="p-6">Thanks for subscribing!</p>;
  return (
    <form
      noValidate
      className="flex flex-col gap-2 p-6"
      onSubmit={event => {
        event.preventDefault();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) setDone(true);
        else setError(true);
      }}>
      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        type="email"
        value={email}
        onChange={event => setEmail(event.target.value)}
        aria-invalid={error}
        aria-describedby={error ? 'email-error' : undefined}
      />
      {error && (
        <p id="email-error" className="text-destructive text-sm">
          Enter a valid email address
        </p>
      )}
      <Button type="submit">Subscribe</Button>
    </form>
  );
}
