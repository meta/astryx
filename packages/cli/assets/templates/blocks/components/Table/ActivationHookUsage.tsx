// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useCallback, useState} from 'react';
import {Table, useTableActivation} from '@astryxdesign/core/Table';

interface Order extends Record<string, unknown> {
  id: string;
  customer: string;
  total: string;
  status: string;
}

const orders: Order[] = [
  {id: '1001', customer: 'Acme Corp', total: '$1,240.00', status: 'Shipped'},
  {id: '1002', customer: 'Globex', total: '$860.50', status: 'Processing'},
  {id: '1003', customer: 'Initech', total: '$2,105.99', status: 'Delivered'},
  {id: '1004', customer: 'Umbrella', total: '$415.00', status: 'Processing'},
  {id: '1005', customer: 'Hooli', total: '$3,300.00', status: 'Shipped'},
];

const columns = [
  {key: 'id', header: 'Order'},
  {key: 'customer', header: 'Customer'},
  {key: 'total', header: 'Total'},
  {key: 'status', header: 'Status'},
];

export default function ActivationHookUsage() {
  const [activeKey, setActiveKey] = useState<string | null>('1001');
  const handleActivate = useCallback(
    (_item: Order, key: string | number) => setActiveKey(key as string),
    [],
  );
  const activation = useTableActivation<Order>({
    activeKey,
    onActivate: handleActivate,
  });
  const active = orders.find(order => order.id === activeKey) ?? null;

  return (
    <div style={{display: 'flex', gap: 24, alignItems: 'flex-start'}}>
      <div style={{flex: 3, minWidth: 0}}>
        <Table
          data={orders}
          columns={columns}
          idKey="id"
          hasHover
          plugins={{activation}}
        />
      </div>
      <div style={{flex: 2, minWidth: 0}}>
        {active == null ? (
          <p>Select an order to inspect it here.</p>
        ) : (
          <div>
            <p>
              <strong>Order {active.id}</strong>
            </p>
            <p>
              {active.customer} — {active.total} ({active.status})
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
