// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
    <div className="flex flex-col gap-3 p-6">
      {selected.size > 0 && (
        <div className="flex items-center gap-2">
          <span>{selected.size} selected</span>
          <Button
            variant="destructive"
            onClick={() => {
              setOrders(orders.filter(row => !selected.has(row.order)));
              setSelected(new Set());
            }}>
            Delete selected
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <span className="sr-only">Select</span>
            </TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.order}>
              <TableCell>
                <Checkbox
                  aria-label={`Select order ${row.order}`}
                  checked={selected.has(row.order)}
                  onCheckedChange={checked =>
                    toggle(row.order, checked === true)
                  }
                />
              </TableCell>
              <TableCell>{row.order}</TableCell>
              <TableCell>{row.customer}</TableCell>
              <TableCell>{row.total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}>
          Previous page
        </Button>
        <span>
          Showing {orders.length === 0 ? 0 : current * 10 + 1}–
          {current * 10 + rows.length} of {orders.length}
        </span>
        <Button
          variant="outline"
          disabled={current >= pages - 1}
          onClick={() => setPage(current + 1)}>
          Next page
        </Button>
      </div>
    </div>
  );
}
