// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useTruncation} from '@astryxdesign/core/Text';
import {Tooltip} from '@astryxdesign/core/Tooltip';
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

function TruncatedCell({children}: {children: string}) {
  const truncation = useTruncation({maxLines: 1});
  return (
    <Tooltip
      content={truncation.fullText}
      placement="above"
      isEnabled={truncation.isTruncated}>
      <span
        ref={truncation.ref}
        tabIndex={truncation.isTruncated ? 0 : undefined}
        style={{
          display: 'block',
          maxWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
        {children}
      </span>
    </Tooltip>
  );
}

function ClampedCell({children}: {children: string}) {
  const truncation = useTruncation({maxLines: 2});
  return (
    <Tooltip
      content={truncation.fullText}
      placement="above"
      isEnabled={truncation.isTruncated}>
      <span
        ref={truncation.ref}
        tabIndex={truncation.isTruncated ? 0 : undefined}
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          maxWidth: 120,
          wordBreak: 'break-all',
        }}>
        {children}
      </span>
    </Tooltip>
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
