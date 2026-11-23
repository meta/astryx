// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A two-file patch parsed with parseUnifiedDiff
 * @output One DiffViewer per file, each with a "Viewed" checkbox that folds it
 * @position DiffViewer example block: the file list of a review page
 */

import {useState} from 'react';
import {
  DiffViewer,
  parseUnifiedDiff,
  type DiffViewerFile,
} from '@astryxdesign/core/DiffViewer';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {VStack} from '@astryxdesign/core/Stack';

const PATCH = `diff --git a/src/cart/total.ts b/src/cart/total.ts
--- a/src/cart/total.ts
+++ b/src/cart/total.ts
@@ -1,6 +1,7 @@
 import type {CartItem} from './types';
+import {roundCurrency} from '../money';
 
 export function cartTotal(items: CartItem[], discount = 0) {
-  return items.reduce((sum, item) => sum + item.price, 0) * (1 - discount);
+  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
+  return roundCurrency(subtotal * (1 - discount));
 }
diff --git a/src/money.ts b/src/money.ts
new file mode 100644
--- /dev/null
+++ b/src/money.ts
@@ -0,0 +1,4 @@
+/** Round to whole cents. */
+export function roundCurrency(value: number): number {
+  return Math.round(value * 100) / 100;
+}
`;

const FILES = parseUnifiedDiff(PATCH);

function ReviewFile({file}: {file: DiffViewerFile}) {
  const [isViewed, setIsViewed] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  return (
    <DiffViewer
      file={file}
      collapsible={{isOpen, onOpenChange: setIsOpen}}
      headerEnd={
        <CheckboxInput
          label="Viewed"
          value={isViewed}
          onChange={checked => {
            setIsViewed(checked);
            setIsOpen(!checked);
          }}
        />
      }
    />
  );
}

export default function DiffViewerViewedFiles() {
  return (
    <VStack gap={3}>
      {FILES.map(file => (
        <ReviewFile key={file.newPath ?? file.oldPath} file={file} />
      ))}
    </VStack>
  );
}
