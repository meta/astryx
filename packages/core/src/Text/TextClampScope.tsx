// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TextClampScope.tsx
 * @input Whether a Text clamps its own lines, and the enclosing clamp
 * @output Exports TextClampScope, which tells Text's children whether they
 *   are in clamped text. A nested Link reads it and renders inline.
 * @position Client part of Text. TruncatableText renders it, and so does a
 *   Server Component's clamped Text with the truncation tooltip off.
 */

import {use, type ReactNode} from 'react';
import {TextClampContext} from './textClampContext';

/**
 * Provides TextClampContext to Text's children. It adds no DOM, so the
 * markup is the same with or without it.
 */
export function TextClampScope({
  isClamped,
  children,
}: {
  isClamped: boolean;
  children?: ReactNode;
}) {
  const isInClampedText = use(TextClampContext);
  return (
    <TextClampContext value={isClamped || isInClampedText}>
      {children}
    </TextClampContext>
  );
}
