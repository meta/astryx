// Copyright (c) Meta Platforms, Inc. and affiliates.

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

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
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Frequently asked questions</h1>
      <Accordion type="single" collapsible>
        {FAQ.map(item => (
          <AccordionItem key={item.id} value={item.id}>
            <AccordionTrigger>{item.question}</AccordionTrigger>
            <AccordionContent>
              <p>{item.answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
