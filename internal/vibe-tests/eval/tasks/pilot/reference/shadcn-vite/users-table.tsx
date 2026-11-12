// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useMemo, useState} from 'react';
import {ArrowDownAZ, ArrowUpZA} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const USERS = [
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

export default function App() {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'none' | 'ascending' | 'descending'>(
    'none',
  );
  const rows = useMemo(() => {
    const needle = query.toLowerCase();
    const filtered = USERS.filter(
      user =>
        user.name.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle),
    );
    if (order === 'none') return filtered;
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    return order === 'ascending' ? sorted : sorted.reverse();
  }, [query, order]);
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex max-w-sm flex-col gap-2">
        <Label htmlFor="search">Search users</Label>
        <Input
          id="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead aria-sort={order}>
              <Button
                variant="ghost"
                onClick={() =>
                  setOrder(order === 'ascending' ? 'descending' : 'ascending')
                }>
                Name {order === 'descending' ? <ArrowUpZA /> : <ArrowDownAZ />}
              </Button>
            </TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>No users found</TableCell>
            </TableRow>
          ) : (
            rows.map(user => (
              <TableRow key={user.email}>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>{user.joined}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
