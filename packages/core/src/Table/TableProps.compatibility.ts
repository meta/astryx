// Copyright (c) Meta Platforms, Inc. and affiliates.
/** Compile-only coverage for the released interface-extension surface. */
import type {TableProps} from './Table';
interface Item extends Record<string, unknown> {
  id: string;
  name: string;
}
export interface ExtendedTableProps extends TableProps<Item> {
  testExtension?: string;
}
export const extendedProps: ExtendedTableProps = {
  data: [{id: 'a', name: 'A'}],
  idKey: 'id',
  testExtension: 'kept',
};
