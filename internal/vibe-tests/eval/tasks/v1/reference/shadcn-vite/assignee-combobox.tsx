// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {Label} from '@/components/ui/label';

const PEOPLE = [
  'Ada Lovelace',
  'Alan Turing',
  'Grace Hopper',
  'Katherine Johnson',
  'Linus Torvalds',
  'Margaret Hamilton',
  'Radia Perlman',
  'Tim Berners-Lee',
];

export default function App() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <div className="flex max-w-sm flex-col gap-3 p-6">
      <Label htmlFor="assignee">Assignee</Label>
      <Combobox items={PEOPLE} value={value} onValueChange={setValue}>
        <ComboboxInput id="assignee" placeholder="Pick a teammate" />
        <ComboboxContent>
          <ComboboxEmpty>No one found.</ComboboxEmpty>
          <ComboboxList>
            {(person: string) => (
              <ComboboxItem key={person} value={person}>
                {person}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <p>{value ? `Assigned to: ${value}` : 'Unassigned'}</p>
    </div>
  );
}
