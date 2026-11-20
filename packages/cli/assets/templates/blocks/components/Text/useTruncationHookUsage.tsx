// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useId, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Text, useTruncation} from '@astryxdesign/core/Text';
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

// A one-line cell: Text truncates the path and shows it in full in its own
// tooltip only while it is cut off. That tooltip adds no second description,
// so a screen reader reads the path once.
function TruncatedCell({children}: {children: string}) {
  return (
    <Text type="body" maxLines={1} style={{maxWidth: 120}}>
      {children}
    </Text>
  );
}

// A two-line cell that shows its full path in place: useTruncation reports
// whether the clamp cuts the path, and the toggle shows only then.
function ClampedCell({children}: {children: string}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const truncation = useTruncation({maxLines: 2, isExpanded});
  const pathId = useId();
  return (
    <>
      <span
        id={pathId}
        ref={truncation.ref}
        style={{
          display: isExpanded ? 'block' : '-webkit-box',
          WebkitLineClamp: isExpanded ? undefined : 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          maxWidth: 120,
          wordBreak: 'break-all',
        }}>
        {children}
      </span>
      {truncation.isTruncated ? (
        <Button
          label={isExpanded ? 'Show less' : 'Show more'}
          variant="ghost"
          size="sm"
          aria-expanded={isExpanded}
          aria-controls={pathId}
          onClick={() => setIsExpanded(expanded => !expanded)}
        />
      ) : null}
    </>
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
              {file.mode === 'clamped' ? (
                <ClampedCell>{file.path}</ClampedCell>
              ) : (
                <TruncatedCell>{file.path}</TruncatedCell>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
