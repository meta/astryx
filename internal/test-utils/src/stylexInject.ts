// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexInject.ts
 * @input Each CSS rule the StyleX babel plugin injects at runtime in tests
 * @output The `inject` that vitest.config.ts names as the plugin's
 *   `runtimeInjection`: StyleX's own, plus every rule StyleX's dev runtime
 *   drops under a multi-condition prelude, inserted into a sheet of its own
 * @position Test setup only; production CSS comes from the build
 *   (`processStylexRules`), which keeps every rule
 *
 * StyleX 0.19.0's dev runtime keys each rule it has inserted
 * (`getSeenRuleKey` in `lib/es/inject.mjs`) and inserts a rule only once per
 * key. A conditional rule whose prelude has one parenthesized condition,
 * `@media (min-width: 100px)`, is keyed by its prelude plus its inner
 * selector. A prelude with more than one, such as
 * `@media (prefers-reduced-motion: reduce) and (pointer: coarse)`, is keyed by
 * the prelude alone, so jsdom gets only the first rule written under it, and
 * a test that reads a later one reads nothing. This module inserts each of
 * those later rules itself, once, after StyleX's own sheet.
 *
 * Remove it at the StyleX bump to a release that carries facebook/stylex#1991,
 * whose dev runtime keys every conditional rule by its inner rule.
 *
 * SYNC: When modified, update this header, /vitest.config.ts and
 * /internal/test-utils/src/README.md
 */

import inject from '@stylexjs/stylex/lib/stylex-inject';

type InjectArgs = Parameters<typeof inject>[0];

// The preludes StyleX's dev runtime keys by their inner rule: one condition.
const ONE_CONDITION = /^@(media|supports|container)\s*\([^)]+\)\s*{/;
const CONDITIONAL = /^@(media|supports|container)\b/;
// StyleX's own normalization of a key: no space around a comma.
const COMMA = /\s*([,])\s*/g;

// The preludes StyleX has inserted a rule under (it keys the rest the same
// way, and drops them), and the rules this module has inserted.
const preludes = new Set<string>();
const inserted = new Set<string>();
let sheet: CSSStyleSheet | null = null;

function ownSheet(): CSSStyleSheet | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (sheet == null || !(sheet.ownerNode?.isConnected ?? false)) {
    const style = document.createElement('style');
    style.setAttribute('data-stylex-test-inject', '');
    document.head.append(style);
    sheet = style.sheet;
  }
  return sheet;
}

export default function stylexTestInject(args: InjectArgs): string {
  const text = inject(args);
  if (text === '' || !CONDITIONAL.test(text) || ONE_CONDITION.test(text)) {
    return text;
  }
  const prelude = text.slice(0, text.indexOf('{')).trim().replace(COMMA, '$1');
  if (!preludes.has(prelude)) {
    // The first rule under this prelude: StyleX inserted it.
    preludes.add(prelude);
    return text;
  }
  const target = ownSheet();
  if (target != null && !inserted.has(text)) {
    inserted.add(text);
    // jsdom's CSS parser rejects some at-rules; StyleX's own insertion skips
    // those the same way.
    try {
      target.insertRule(text, target.cssRules.length);
    } catch {
      inserted.delete(text);
    }
  }
  return text;
}
