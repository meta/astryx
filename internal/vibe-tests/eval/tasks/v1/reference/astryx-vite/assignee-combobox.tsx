// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Text} from '@astryxdesign/core/Text';
import {Typeahead} from '@astryxdesign/core/Typeahead';
import {VStack} from '@astryxdesign/core/VStack';

type Person = {id: string; label: string};

const PEOPLE: Person[] = [
  'Ada Lovelace',
  'Alan Turing',
  'Grace Hopper',
  'Katherine Johnson',
  'Linus Torvalds',
  'Margaret Hamilton',
  'Radia Perlman',
  'Tim Berners-Lee',
].map(label => ({id: label, label}));

const source = {
  search: (query: string) =>
    PEOPLE.filter(person =>
      person.label.toLowerCase().includes(query.toLowerCase()),
    ),
  bootstrap: () => PEOPLE,
};

export default function App() {
  const [value, setValue] = useState<Person | null>(null);
  return (
    <VStack gap={3} padding={6}>
      <Typeahead
        label="Assignee"
        searchSource={source}
        value={value}
        onChange={setValue}
      />
      <Text>{value ? `Assigned to: ${value.label}` : 'Unassigned'}</Text>
    </VStack>
  );
}
