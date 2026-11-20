// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {HStack} from '@astryxdesign/core/HStack';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

const ALL = Array.from({length: 30}, (_, index) => {
  const nn = String(index + 1).padStart(2, '0');
  return {
    order: `#10${nn}`,
    customer: `Customer ${nn}`,
    total: `$${((index + 1) * 10).toFixed(2)}`,
  };
});

export default function App() {
  const [orders, setOrders] = useState(ALL);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pages = Math.max(1, Math.ceil(orders.length / 10));
  const current = Math.min(page, pages - 1);
  const rows = orders.slice(current * 10, current * 10 + 10);
  const toggle = (order: string, checked: boolean) => {
    const nextSelected = new Set(selected);
    if (checked) nextSelected.add(order);
    else nextSelected.delete(order);
    setSelected(nextSelected);
  };
  return (
    <VStack gap={3} padding={6}>
      {selected.size > 0 && (
        <HStack gap={2}>
          <Text>{selected.size} selected</Text>
          <Button
            label="Delete selected"
            variant="destructive"
            onClick={() => {
              setOrders(orders.filter(row => !selected.has(row.order)));
              setSelected(new Set());
            }}
          />
        </HStack>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Select</TableHeaderCell>
            <TableHeaderCell>Order</TableHeaderCell>
            <TableHeaderCell>Customer</TableHeaderCell>
            <TableHeaderCell>Total</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.order}>
              <TableCell>
                <CheckboxInput
                  label={`Select order ${row.order}`}
                  isLabelHidden
                  value={selected.has(row.order)}
                  onChange={checked => toggle(row.order, checked)}
                />
              </TableCell>
              <TableCell>{row.order}</TableCell>
              <TableCell>{row.customer}</TableCell>
              <TableCell>{row.total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <HStack gap={2}>
        <Button
          label="Previous page"
          isDisabled={current === 0}
          onClick={() => setPage(current - 1)}
        />
        <Text>
          Showing {orders.length === 0 ? 0 : current * 10 + 1}–
          {current * 10 + rows.length} of {orders.length}
        </Text>
        <Button
          label="Next page"
          isDisabled={current >= pages - 1}
          onClick={() => setPage(current + 1)}
        />
      </HStack>
    </VStack>
  );
}
