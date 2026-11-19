// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const STEPS = [
  {
    title: 'Contact',
    fields: [
      ['name', 'Full name'],
      ['email', 'Email'],
    ],
  },
  {
    title: 'Shipping',
    fields: [
      ['street', 'Street'],
      ['city', 'City'],
    ],
  },
] as const;

type Key = 'name' | 'email' | 'street' | 'city';

export default function App() {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<Key, string>>({
    name: '',
    email: '',
    street: '',
    city: '',
  });
  const [showErrors, setShowErrors] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <h1 className="p-6 text-2xl font-semibold">Order placed</h1>;
  const current = STEPS[step];
  const next = () => {
    if (current && current.fields.some(([key]) => values[key].trim() === '')) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep(step + 1);
  };
  return (
    <div className="flex max-w-md flex-col gap-4 p-6">
      <p className="text-sm text-muted-foreground">Step {step + 1} of 3</p>
      <h1 className="text-2xl font-semibold">
        {current ? current.title : 'Review'}
      </h1>
      {current ? (
        current.fields.map(([key, label]) => {
          const invalid = showErrors && values[key].trim() === '';
          return (
            <div key={key} className="flex flex-col gap-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                value={values[key]}
                onChange={event =>
                  setValues({...values, [key]: event.target.value})
                }
                aria-invalid={invalid}
                aria-describedby={invalid ? `${key}-error` : undefined}
              />
              {invalid && (
                <p id={`${key}-error`} className="text-sm text-destructive">
                  Required
                </p>
              )}
            </div>
          );
        })
      ) : (
        <dl className="flex flex-col gap-1">
          <dd>{values.name}</dd>
          <dd>{values.email}</dd>
          <dd>{values.street}</dd>
          <dd>{values.city}</dd>
        </dl>
      )}
      <div className="flex gap-2">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {current ? (
          <Button onClick={next}>Next</Button>
        ) : (
          <Button onClick={() => setDone(true)}>Place order</Button>
        )}
      </div>
    </div>
  );
}
