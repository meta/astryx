// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Text} from '@astryxdesign/core/Text';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';

interface FileAsset {
  name: string;
  path: string;
  mode: 'single' | 'clamped' | 'short';
}

const FILES: FileAsset[] = [
  {
    name: 'build',
    path: 'artifacts/release/build-20261103-120344/index.html',
    mode: 'single',
  },
  {
    name: 'bundle',
    path: 'reports/coverage/packages/core/src/components/Calendar/index.html',
    mode: 'clamped',
  },
  {
    name: 'readme',
    path: 'README.md',
    mode: 'short',
  },
];

// Text truncates the path to its line count and, built on useTruncation,
// shows it in full in its own tooltip only while it is cut off. That tooltip
// adds no second description, so a screen reader reads the path once.
function TruncatedCell({
  children,
  maxLines,
}: {
  children: string;
  maxLines: 1 | 2;
}) {
  return (
    <Text type="body" maxLines={maxLines} style={{maxWidth: 120}}>
      {children}
    </Text>
  );
}

export default function UseTruncationHookUsage() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHeaderCell>Asset</TableHeaderCell>
          <TableHeaderCell>Path</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {FILES.map(file => (
          <TableRow key={file.name}>
            <TableCell>{file.name}</TableCell>
            <TableCell>
              <TruncatedCell maxLines={file.mode === 'clamped' ? 2 : 1}>
                {file.path}
              </TruncatedCell>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
