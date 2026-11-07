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

const FILES = [
  {name: 'build', path: 'artifacts/release/build-20261103-120344/index.html'},
  {name: 'bundle', path: 'src/index.js'},
  {name: 'readme', path: 'README.md'},
];

function TruncatedCell({children}: {children: string}) {
  const truncation = useTruncation({maxLines: 1});
  return (
    <Tooltip content={truncation.fullText} placement="above">
      <span
        ref={truncation.ref}
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
    <Tooltip content={truncation.fullText} placement="above">
      <span
        ref={truncation.ref}
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          maxWidth: 120,
        }}>
        {children}
      </span>
    </Tooltip>
  );
}

export default function UseTruncationHookUsage() {
  return (
    <Table width={380}>
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
              {file.name === 'readme' ? (
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
