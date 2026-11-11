// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useMemo, useState} from 'react';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Table, useTableSortable} from '@astryxdesign/core/Table';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';

interface User extends Record<string, unknown> {
  name: string;
  email: string;
  role: string;
  joined: string;
}

const USERS: User[] = [
  {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    role: 'Admin',
    joined: '2024-03-01',
  },
  {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    role: 'Editor',
    joined: '2023-11-15',
  },
  {
    name: 'Alan Turing',
    email: 'alan@example.com',
    role: 'Viewer',
    joined: '2024-06-20',
  },
  {
    name: 'Katherine Johnson',
    email: 'katherine@example.com',
    role: 'Editor',
    joined: '2022-09-05',
  },
  {
    name: 'Linus Torvalds',
    email: 'linus@example.com',
    role: 'Viewer',
    joined: '2023-01-30',
  },
  {
    name: 'Margaret Hamilton',
    email: 'margaret@example.com',
    role: 'Admin',
    joined: '2024-01-12',
  },
];

type Sort = Array<{sortKey: string; direction: 'ascending' | 'descending'}>;

export default function App() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>([]);
  const sortable = useTableSortable<User, string>({
    sort,
    onSortChange: setSort,
  });
  const rows = useMemo(() => {
    const needle = query.toLowerCase();
    const filtered = USERS.filter(
      user =>
        user.name.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle),
    );
    const active = sort[0];
    if (!active) return filtered;
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    return active.direction === 'ascending' ? sorted : sorted.reverse();
  }, [query, sort]);
  return (
    <VStack gap={4} padding={6}>
      <TextInput label="Search users" value={query} onChange={setQuery} />
      <Table
        data={rows}
        idKey="email"
        plugins={{sortable}}
        emptyState={<EmptyState title="No users found" isCompact />}
        columns={[
          {key: 'name', header: 'Name', sortable: true},
          {key: 'email', header: 'Email'},
          {key: 'role', header: 'Role'},
          {key: 'joined', header: 'Joined'},
        ]}
      />
    </VStack>
  );
}
