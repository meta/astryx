// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file StackItemScrollRegion.tsx
 * @input A scrollable `div` or `span` StackItem's props, ref and children
 * @output StackItemScrollRegion (internal; not re-exported from
 *   hooks/index.ts), which renders that element and names it as a group
 *   while its content overflows
 * @position Internal client island for StackItem, which itself stays a
 *   static render. Only a scrollable `div` or `span` item measures its
 *   overflow, on the client; another element keeps its own role.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Stack/StackItem.tsx
 * - /packages/core/src/serverSafeComponents.test.ts
 */

import {createElement, type AriaRole, type ReactNode, type Ref} from 'react';
import {useMergedRefs} from './useMergedRefs';
import {useScrollRegionProps} from './useScrollRegionProps';

export interface StackItemScrollRegionProps {
  as: 'div' | 'span';
  ref?: Ref<HTMLElement>;
  elementProps: {
    role?: AriaRole;
    'aria-label'?: string;
    [prop: string]: unknown;
  };
  children?: ReactNode;
}

export function StackItemScrollRegion({
  as: element,
  ref,
  elementProps,
  children,
}: StackItemScrollRegionProps) {
  const region = useScrollRegionProps({
    isScrollable: true,
    role: elementProps.role,
    label: elementProps['aria-label'],
  });
  const mergedRef = useMergedRefs(ref, region.ref);
  return createElement(
    element,
    {
      ...elementProps,
      ref: mergedRef,
      role: region.role,
      'aria-label': region['aria-label'],
    },
    children,
  );
}
