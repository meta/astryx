// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {
  DiffViewer,
  createDiffFile,
  parseUnifiedDiff,
  type DiffViewerLineRef,
} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';

const PATCH = `diff --git a/src/cart/total.ts b/src/cart/total.ts
index 4c1a2b7..9e0f3d1 100644
--- a/src/cart/total.ts
+++ b/src/cart/total.ts
@@ -1,16 +1,18 @@
 import type {CartItem} from './types';
+import {roundCurrency} from '../money';
 
 /**
- * Sum the price of every item in the cart.
+ * Sum the price of every item in the cart, applying the discount once
+ * after the subtotal so rounding errors do not compound per item.
  */
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
 
 export function isEmpty(items: CartItem[]) {
   return items.length === 0;
 }
@@ -40,7 +42,7 @@ export function formatTotal(total: number, currency: string) {
   const formatter = new Intl.NumberFormat(undefined, {
     style: 'currency',
     currency,
-    maximumFractionDigits: 3,
+    maximumFractionDigits: 2,
   });
   return formatter.format(total);
 }
diff --git a/src/money.ts b/src/money.ts
new file mode 100644
index 0000000..b3f1c2e
--- /dev/null
+++ b/src/money.ts
@@ -0,0 +1,4 @@
+/** Round to whole cents. */
+export function roundCurrency(value: number): number {
+  return Math.round(value * 100) / 100;
+}
diff --git a/src/cart/legacy.ts b/src/cart/legacyTotals.ts
similarity index 100%
rename from src/cart/legacy.ts
rename to src/cart/legacyTotals.ts
diff --git a/public/receipt.png b/public/receipt.png
index 1f2e3d4..5a6b7c8 100644
Binary files a/public/receipt.png and b/public/receipt.png differ
`;

const FILES = parseUnifiedDiff(PATCH);
const [TOTAL_FILE] = FILES;

const meta: Meta<typeof DiffViewer> = {
  title: 'Lab/DiffViewer',
  component: DiffViewer,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  args: {
    file: TOTAL_FILE,
  },
  decorators: [
    Story => (
      <div style={{maxWidth: 1080, padding: 16}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DiffViewer>;

/** One file, unified view (the default). */
export const Default: Story = {};

/** Old file on the left, new file on the right. */
export const Split: Story = {
  args: {viewMode: 'split'},
};

const LONG_LINE_FILE =
  parseUnifiedDiff(`diff --git a/src/cart/discounts.ts b/src/cart/discounts.ts
--- a/src/cart/discounts.ts
+++ b/src/cart/discounts.ts
@@ -1,4 +1,4 @@
 import type {CartItem} from './types';
-export const discountFor = (item: CartItem, rules: ReadonlyArray<{sku: string; percent: number}>) => rules.find(rule => rule.sku === item.sku)?.percent ?? 0;
+export const discountFor = (item: CartItem, rules: ReadonlyArray<{sku: string; percent: number; expiresAt?: number}>) => rules.find(rule => rule.sku === item.sku && (rule.expiresAt == null || rule.expiresAt > Date.now()))?.percent ?? 0;
 
 export const NO_DISCOUNT = 0;
`)[0];

/**
 * Unwrapped split view with lines wider than their side: the split stays
 * fixed, both sides scroll sideways together, and line numbers and change
 * bars stay pinned.
 */
export const SplitIndependentScroll: Story = {
  args: {
    file: LONG_LINE_FILE,
    viewMode: 'split',
    changeIndicator: 'bars',
  },
  decorators: [
    Story => (
      <div style={{maxWidth: 960}}>
        <Story />
      </div>
    ),
  ],
};

/**
 * Every display option, as on diffs.com: how changes are marked, whether rows
 * are tinted, how finely changed text is highlighted, wrapping, and line
 * numbers.
 */
export const DisplayOptions: Story = {
  args: {
    viewMode: 'split',
    changeIndicator: 'bars',
    inlineHighlight: 'word',
    hasChangeBackground: true,
    isWrapped: false,
    hasLineNumbers: true,
  },
  argTypes: {
    viewMode: {control: 'inline-radio', options: ['unified', 'split']},
    changeIndicator: {
      control: 'inline-radio',
      options: ['classic', 'bars', 'none'],
    },
    inlineHighlight: {
      control: 'inline-radio',
      options: ['word', 'char', 'none'],
    },
  },
};

/** Bars and word highlighting on plain rows: no change tint. */
export const NoBackground: Story = {
  args: {changeIndicator: 'bars', hasChangeBackground: false},
};

/** Character-level highlighting with classic +/− glyphs. */
export const CharacterHighlight: Story = {
  args: {inlineHighlight: 'char'},
};

/** Long lines wrap instead of scrolling. */
export const Wrapped: Story = {
  args: {viewMode: 'split', isWrapped: true},
  decorators: [
    Story => (
      <div style={{maxWidth: 720}}>
        <Story />
      </div>
    ),
  ],
};

/**
 * A right-to-left page with lines wider than the viewer. The hunk area stays
 * left-to-right like a code editor, so every line opens at its start. The file
 * header and comment text follow the page. Comment rows belong to the code
 * layout: each comment reads from its side's right edge and, like the code
 * beside it, may need a horizontal scroll to bring into view.
 */
export const RightToLeft: Story = {
  args: {
    file: LONG_LINE_FILE,
    viewMode: 'split',
    renderLineAnnotation: (ref: DiffViewerLineRef) => {
      if (ref.side === 'old' && ref.lineNumber === 2) {
        return <Text type="body">كان الخصم لا يتحقق من تاريخ الانتهاء.</Text>;
      }
      if (ref.side === 'new' && ref.lineNumber === 2) {
        return <Text type="body">تحقق من تاريخ انتهاء الخصم قبل الدمج.</Text>;
      }
      return null;
    },
  },
  decorators: [
    Story => (
      <div dir="rtl" style={{maxWidth: 960}}>
        <Story />
      </div>
    ),
  ],
};

/** A whole patch: one DiffViewer per file, incl. added, renamed, and binary files. */
export const MultiFilePatch: Story = {
  render: args => (
    <VStack gap={3}>
      {FILES.map(file => (
        <DiffViewer key={file.newPath ?? file.oldPath} {...args} file={file} />
      ))}
    </VStack>
  ),
};

/** Diff two versions of a text with createDiffFile. */
export const FromTwoTexts: Story = {
  args: {
    file: createDiffFile({
      path: 'config/flags.yaml',
      oldValue: [
        'flags:',
        '  checkout_v2: false',
        '  dark_mode: true',
        '  search_suggestions: false',
        '  # owner: payments',
        '  retries: 3',
      ].join('\n'),
      newValue: [
        'flags:',
        '  checkout_v2: true',
        '  dark_mode: true',
        '  search_suggestions: false',
        '  # owner: payments',
        '  retries: 5',
        '  timeout_ms: 2000',
      ].join('\n'),
    }),
  },
};

/**
 * A rewrite too large to compare line by line: the changed lines fold behind a
 * labeled control until the reader shows them.
 */
export const LargeChange: Story = {
  args: {
    file: createDiffFile({
      path: 'src/generated/schema.ts',
      oldValue: [
        '// Generated file. Do not edit.',
        ...Array.from(
          {length: 6000},
          (_, i) => `export const field${i} = 'v1-${i}';`,
        ),
        'export default {};',
      ].join('\n'),
      newValue: [
        '// Generated file. Do not edit.',
        ...Array.from(
          {length: 6000},
          (_, i) => `export const field${i} = 'v2-${i}';`,
        ),
        'export default {};',
      ].join('\n'),
    }),
  },
};

/** File header actions: a "Viewed" checkbox that also folds the file away. */
export const ViewedToggle: Story = {
  render: args => {
    const [isViewed, setIsViewed] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    return (
      <DiffViewer
        {...args}
        isCollapsed={isCollapsed}
        onCollapsedChange={setIsCollapsed}
        headerEnd={
          <CheckboxInput
            label="Viewed"
            value={isViewed}
            onChange={checked => {
              setIsViewed(checked);
              setIsCollapsed(checked);
            }}
          />
        }
      />
    );
  },
};

interface Comment {
  id: number;
  side: DiffViewerLineRef['side'];
  lineNumber: number;
}

/**
 * Review comments: click a line number to open a comment under that line.
 * Anchors (side + lineNumber) stay put when switching view modes.
 */
export const ReviewComments: Story = {
  render: args => {
    const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
    const [comments, setComments] = useState<Comment[]>([
      {id: 1, side: 'new', lineNumber: 13},
    ]);
    return (
      <VStack gap={3}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Text type="supporting" color="secondary">
              Click a line number to add a comment.
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
          {...args}
          viewMode={viewMode}
          onLineNumberClick={ref =>
            setComments(current => [
              ...current,
              {id: Date.now(), side: ref.side, lineNumber: ref.lineNumber},
            ])
          }
          renderLineAnnotation={ref => {
            const here = comments.filter(
              comment =>
                comment.side === ref.side &&
                comment.lineNumber === ref.lineNumber,
            );
            if (here.length === 0) {
              return null;
            }
            return (
              <VStack gap={2}>
                {here.map(comment => (
                  <Card key={comment.id}>
                    <HStack gap={2} vAlign="center">
                      <StackItem size="fill">
                        <Text>
                          {`Comment on ${comment.side} line ${comment.lineNumber}`}
                        </Text>
                      </StackItem>
                      <Button
                        label="Resolve"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setComments(current =>
                            current.filter(c => c.id !== comment.id),
                          )
                        }
                      />
                    </HStack>
                  </Card>
                ))}
              </VStack>
            );
          }}
        />
      </VStack>
    );
  },
};

/**
 * A multi-sentence comment wraps within the width the code sets; it never
 * widens the table.
 */
export const LongComment: Story = {
  args: {
    renderLineAnnotation: (ref: DiffViewerLineRef) =>
      ref.side === 'new' && ref.lineNumber === 13 ? (
        <Text type="body">
          Rounding once after the subtotal fixes the drift we saw on large
          carts, but it changes totals for carts that relied on per-item
          rounding. Before this lands, check the receipt snapshots, confirm the
          discount still applies to gift cards, and add a test with a 33%
          discount on three items so the rounding rule is pinned. If any partner
          integrations read the per-item totals, they need a heads-up as well.
        </Text>
      ) : null,
  },
};

/** Without line numbers, capped height. */
export const Compact: Story = {
  args: {hasLineNumbers: false, maxHeight: 240},
};
