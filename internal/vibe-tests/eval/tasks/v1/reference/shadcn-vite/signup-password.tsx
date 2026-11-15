// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

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

function FieldError({id, message}: {id: string; message?: string}) {
  if (!message) return null;
  return (
    <p id={id} className="text-destructive text-sm">
      {message}
    </p>
  );
}

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isPasswordShown, setIsPasswordShown] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [isDone, setIsDone] = useState(false);
  if (isDone) return <p className="p-6">Account created</p>;
  return (
    <form
      noValidate
      className="flex w-96 flex-col gap-4 p-6"
      onSubmit={event => {
        event.preventDefault();
        const next = validate(email, password, confirm);
        setErrors(next);
        if (Object.keys(next).length === 0) setIsDone(true);
      }}>
      <h1 className="text-xl font-semibold">Create account</h1>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        <FieldError id="email-error" message={errors.email} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <div className="flex gap-2">
          <Input
            id="password"
            type={isPasswordShown ? 'text' : 'password'}
            value={password}
            onChange={event => setPassword(event.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error' : undefined}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsPasswordShown(shown => !shown)}>
            {isPasswordShown ? 'Hide password' : 'Show password'}
          </Button>
        </div>
        <FieldError id="password-error" message={errors.password} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={event => setConfirm(event.target.value)}
          aria-invalid={Boolean(errors.confirm)}
          aria-describedby={errors.confirm ? 'confirm-error' : undefined}
        />
        <FieldError id="confirm-error" message={errors.confirm} />
      </div>
      <Button type="submit">Create account</Button>
    </form>
  );
}
