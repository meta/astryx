// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';
import type React from 'react';
import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import {
  BODY_ROW_UNCOUNTED,
  TableRowPlacementContext,
} from './TableRowPlacementContext';

export interface TableBodyProps extends BaseProps<HTMLTableSectionElement> {
  ref?: React.Ref<HTMLTableSectionElement>;
  children: ReactNode;
}

export function TableBody({
  ref,
  children,
  xstyle,
  className,
  style,
  ...rest
}: TableBodyProps) {
  return (
    <tbody
      ref={ref}
      {...mergeProps(
        themeProps('table-body'),
        stylex.props(xstyle),
        className,
        style,
      )}
      {...rest}>
      {/* Rows here are body rows. A data-driven table gives each row its
          stripe from its display index; a children-mode row's position is
          the caller's, so it carries no parity. */}
      <TableRowPlacementContext value={BODY_ROW_UNCOUNTED}>
        {children}
      </TableRowPlacementContext>
    </tbody>
  );
}
TableBody.displayName = 'TableBody';
