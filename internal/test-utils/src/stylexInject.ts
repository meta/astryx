// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexInject.ts
 * @input Each CSS rule the StyleX babel plugin injects at runtime in tests
 * @output The `inject` that vitest.config.ts names as the plugin's
 *   `runtimeInjection`: StyleX's own, plus every rule StyleX's dev runtime
 *   drops because it keys the rule by an at-rule's prelude alone, inserted
 *   into a sheet of its own
 * @position Test setup only; production CSS comes from the build
 *   (`processStylexRules`), which keeps every rule
 *
 * StyleX 0.19.0's dev runtime keys each rule it has inserted
 * (`getSeenRuleKey` in `lib/es/inject.mjs`, which it does not export; copied
 * below as `seenRuleKey`) and inserts a rule only once per key. A conditional
 * rule whose prelude has one parenthesized condition,
 * `@media (min-width: 100px)`, is keyed by its prelude plus the key of the
 * rule inside it. Any other at-rule is keyed by its prelude alone:
 * - a prelude with more than one condition, such as
 *   `@media (prefers-reduced-motion: reduce) and (pointer: coarse)`, at the
 *   top level or inside a one-condition prelude;
 * - a named container query;
 * - `@starting-style`.
 *
 * jsdom then gets only the first rule written under such a key, and a test
 * that reads a later one reads nothing. This module inserts each of those
 * later rules itself, once, after StyleX's own sheet. The one exception is the
 * group last-member rule, which the test setup keeps out of jsdom
 * (jsdomRefusedRules.ts).
 *
 * facebook/stylex#1991 keys every conditional prelude by the rule inside it;
 * `@starting-style` rules still share one key there. Remove this module once
 * StyleX keys every rule by its own selector.
 *
 * SYNC: When modified, update this header, /vitest.config.ts and
 * /internal/test-utils/src/README.md
 */

import inject from '@stylexjs/stylex/lib/stylex-inject';
import {GROUP_LAST_MEMBER} from './jsdomRefusedRules';

type InjectArgs = Parameters<typeof inject>[0];

// StyleX 0.19.0's `getSeenRuleKey`, as written in `lib/es/inject.mjs`.
const SELECTOR = /\s*([,])\s*/g;
const ONE_CONDITION = /^@(media|supports|container)\s*\([^)]+\)\s*{/;
function seenRuleKey(cssText: string): string | null {
  if (ONE_CONDITION.test(cssText)) {
    const index = cssText.indexOf('{');
    const query = cssText.substring(0, index).trim();
    const next = seenRuleKey(cssText.substring(index + 1).trim());
    const inner =
      next != null && next !== '' ? next.replace(SELECTOR, '$1') : '';
    return `${query} { ${inner}`;
  }
  const selector = cssText.split('{')[0].trim();
  return selector !== '' ? selector.replace(SELECTOR, '$1') : null;
}

/** Whether StyleX keys `cssText` by an at-rule's prelude, not a selector. */
function keyedByPrelude(cssText: string): boolean {
  let rest = cssText;
  while (ONE_CONDITION.test(rest)) {
    rest = rest.slice(rest.indexOf('{') + 1).trim();
  }
  return rest.startsWith('@');
}

// The keys StyleX has inserted a rule under, every rule under such a key that
// is in the page (the first, which StyleX inserted, and this module's), and
// this module's sheet. They live on globalThis: `vi.resetModules()` loads this
// module again, but StyleX's injector keeps its keys, so a record kept in
// module state would insert restored rules again and lose a later rule
// imported first after a reset.
interface InjectRecord {
  readonly keys: Set<string>;
  readonly present: Set<string>;
  sheet: CSSStyleSheet | null;
}
const RECORD = Symbol.for('astryx.stylexTestInject');
const record: InjectRecord = ((
  globalThis as unknown as Record<symbol, InjectRecord | undefined>
)[RECORD] ??= {keys: new Set(), present: new Set(), sheet: null});
const {keys, present} = record;

function ownSheet(): CSSStyleSheet | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (record.sheet == null || !(record.sheet.ownerNode?.isConnected ?? false)) {
    const style = document.createElement('style');
    style.setAttribute('data-stylex-test-inject', '');
    document.head.append(style);
    record.sheet = style.sheet;
  }
  return record.sheet;
}

export default function stylexTestInject(args: InjectArgs): string {
  const text = inject(args);
  if (text === '' || !keyedByPrelude(text)) {
    return text;
  }
  const key = seenRuleKey(text);
  if (key == null) {
    return text;
  }
  if (!keys.has(key)) {
    // The first rule under this key: StyleX inserted it.
    keys.add(key);
    present.add(text);
    return text;
  }
  if (present.has(text) || text.includes(GROUP_LAST_MEMBER)) {
    return text;
  }
  present.add(text);
  const target = ownSheet();
  target?.insertRule(text, target.cssRules.length);
  return text;
}
