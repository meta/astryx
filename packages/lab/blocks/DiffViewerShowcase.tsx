// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A unified diff string parsed with parseUnifiedDiff
 * @output One DiffViewer with a unified/split toggle and click-to-comment line numbers
 * @position Lab DiffViewer's docsite showcase and copyable CLI block
 */

import {useState} from 'react';
import {
  DiffViewer,
  parseUnifiedDiff,
  type DiffViewerLineRef,
} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';

const PATCH = `diff --git a/src/cart/total.ts b/src/cart/total.ts
--- a/src/cart/total.ts
+++ b/src/cart/total.ts
@@ -1,9 +1,11 @@
 import type {CartItem} from './types';
+import {roundCurrency} from '../money';
 
-export function cartTotal(items: CartItem[], discount = 0) {
-  let total = 0;
-  for (const item of items) {
-    total += item.price * item.quantity * (1 - discount);
-  }
-  return total;
+export function cartTotal(items: CartItem[], discount = 0): number {
+  const subtotal = items.reduce(
+    (sum, item) => sum + item.price * item.quantity,
+    0,
+  );
+  return roundCurrency(subtotal * (1 - discount));
 }
`;

const [FILE] = parseUnifiedDiff(PATCH);

export default function DiffViewerShowcase() {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [selected, setSelected] = useState<DiffViewerLineRef | null>(null);

  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center">
        <StackItem size="fill">
          <Text type="supporting" color="secondary">
            {selected == null
              ? 'Click a line number to select a line.'
              : `Selected ${selected.side} line ${selected.lineNumber}`}
          </Text>
        </StackItem>
        <Button
          label={viewMode === 'unified' ? 'Split view' : 'Unified view'}
          variant="secondary"
          onClick={() =>
            setViewMode(mode => (mode === 'unified' ? 'split' : 'unified'))
          }
        />
      </HStack>
      <DiffViewer
        file={FILE}
        viewMode={viewMode}
        onLineNumberClick={ref => setSelected(ref)}
        renderLineAnnotation={ref =>
          selected != null &&
          ref.side === selected.side &&
          ref.lineNumber === selected.lineNumber ? (
            <Text>{`Comment on ${ref.side} line ${ref.lineNumber}`}</Text>
          ) : null
        }
      />
    </VStack>
  );
}
