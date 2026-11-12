// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Toaster} from '@/components/ui/sonner';

const MESSAGES = [
  'Welcome to Orbit',
  'Your invoice is ready',
  'Weekly summary',
];

export default function App() {
  const [archived, setArchived] = useState<ReadonlySet<string>>(new Set());

  const restore = (title: string) =>
    setArchived(current => {
      const next = new Set(current);
      next.delete(title);
      return next;
    });

  const archive = (title: string) => {
    setArchived(current => new Set(current).add(title));
    toast('Message archived', {
      id: 'message-archived',
      duration: 10000,
      action: {label: 'Undo', onClick: () => restore(title)},
    });
  };

  return (
    <div className="flex flex-col gap-3 p-6">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      <ul className="flex flex-col divide-y rounded-lg border">
        {MESSAGES.filter(title => !archived.has(title)).map(title => (
          <li
            key={title}
            className="flex items-center justify-between gap-2 p-3">
            <span>{title}</span>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Archive ${title}`}
              onClick={() => archive(title)}>
              Archive
            </Button>
          </li>
        ))}
      </ul>
      <Toaster />
    </div>
  );
}
