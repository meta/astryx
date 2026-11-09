// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Table, pixel} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {useTruncation} from '@astryxdesign/core/Text';
import type {CSSProperties} from 'react';

interface FileRow extends Record<string, unknown> {
  id: string;
  path: string;
  details: string;
  owner: string;
}

const files: FileRow[] = [
  {
    id: '1',
    path: '/src/components/design-system/theme/tokens/color-scales.ts',
    details:
      'Maps every semantic color role to the raw palette values used by the light and dark themes.',
    owner: 'Maya',
  },
  {
    id: '2',
    path: '/src/utils.ts',
    details: 'Shared helpers.',
    owner: 'Ivan',
  },
  {
    id: '3',
    path: '/src/features/checkout/payment-methods/credit-card-form.tsx',
    details:
      'Validates the card fields and keeps the entered billing address in sync with the checkout state.',
    owner: 'Noah',
  },
];

const singleLine: CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const twoLines: CSSProperties = {
  display: '-webkit-box',
  overflow: 'hidden',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
};

function TruncatedCell({text, maxLines}: {text: string; maxLines: number}) {
  const truncation = useTruncation({maxLines});
  return (
    <Tooltip content={truncation.fullText} isEnabled={truncation.isTruncated}>
      <span
        ref={truncation.ref}
        style={maxLines === 1 ? singleLine : twoLines}>
        {text}
      </span>
    </Tooltip>
  );
}

const columns: TableColumn<FileRow>[] = [
  {
    key: 'path',
    header: 'File path',
    width: pixel(200),
    renderCell: row => <TruncatedCell text={row.path} maxLines={1} />,
  },
  {
    key: 'details',
    header: 'Details',
    width: pixel(220),
    renderCell: row => <TruncatedCell text={row.details} maxLines={2} />,
  },
  {
    key: 'owner',
    header: 'Owner',
    width: pixel(140),
    renderCell: row => <TruncatedCell text={row.owner} maxLines={1} />,
  },
];

export default function useTruncationHookUsage() {
  return <Table data={files} columns={columns} idKey="id" />;
}
