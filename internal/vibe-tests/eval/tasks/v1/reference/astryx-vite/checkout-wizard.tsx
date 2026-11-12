// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';

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
  if (done)
    return (
      <VStack padding={6}>
        <Heading level={1}>Order placed</Heading>
      </VStack>
    );
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
    <VStack gap={4} padding={6}>
      <Text>Step {step + 1} of 3</Text>
      <Heading level={1}>{current ? current.title : 'Review'}</Heading>
      {current ? (
        current.fields.map(([key, label]) => (
          <TextInput
            key={key}
            label={label}
            value={values[key]}
            onChange={value => setValues({...values, [key]: value})}
            status={
              showErrors && values[key].trim() === ''
                ? {type: 'error', message: 'Required'}
                : undefined
            }
          />
        ))
      ) : (
        <VStack gap={1}>
          <Text>{values.name}</Text>
          <Text>{values.email}</Text>
          <Text>{values.street}</Text>
          <Text>{values.city}</Text>
        </VStack>
      )}
      <HStack gap={2}>
        {step > 0 && <Button label="Back" onClick={() => setStep(step - 1)} />}
        {current ? (
          <Button label="Next" variant="primary" onClick={next} />
        ) : (
          <Button
            label="Place order"
            variant="primary"
            onClick={() => setDone(true)}
          />
        )}
      </HStack>
    </VStack>
  );
}
