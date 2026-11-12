// Copyright (c) Meta Platforms, Inc. and affiliates.

import {Collapsible, CollapsibleGroup} from '@astryxdesign/core/Collapsible';
import {Heading, Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

const FAQ = [
  {
    id: 'what',
    question: 'What is Orbit?',
    answer: 'Orbit is a project tracker.',
  },
  {
    id: 'free',
    question: 'Is there a free plan?',
    answer: 'Yes, for up to three projects.',
  },
  {
    id: 'export',
    question: 'Can I export my data?',
    answer: 'Yes, as CSV or JSON.',
  },
  {
    id: 'support',
    question: 'How do I contact support?',
    answer: 'Email support@example.com.',
  },
];

export default function App() {
  return (
    <VStack gap={4} padding={6}>
      <Heading level={1}>Frequently asked questions</Heading>
      <CollapsibleGroup type="single" hasDividers>
        {FAQ.map(item => (
          <Collapsible key={item.id} value={item.id} trigger={item.question}>
            <Text>{item.answer}</Text>
          </Collapsible>
        ))}
      </CollapsibleGroup>
    </VStack>
  );
}
