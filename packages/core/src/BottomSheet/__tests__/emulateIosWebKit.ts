// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file emulateIosWebKit.ts
 * @input A Playwright page, before it loads the story
 * @output Exports emulateIosWebKit: the page takes the iOS gate. From the
 *   first script on, `CSS.supports` answers yes for `-webkit-touch-callout`
 *   (only WebKit on iOS implements it), so useTouchIdiom() reads `ios` under
 *   the emulated finger; every `@supports (-webkit-touch-callout: none)`
 *   rule is rewritten to a condition the engine meets, keeping the media
 *   query outside it. Everything else is the engine's own.
 * @position Test helper of the BottomSheet interaction specs (the same
 *   helper as the ContextMenu specs'). Real iOS Safari is the simulator
 *   recording; without this, the same specs see Chromium's and desktop
 *   WebKit's own answer (the Android fallback).
 */

import type {Page} from '@playwright/test';

export async function emulateIosWebKit(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = CSS.supports.bind(CSS);
    CSS.supports = (condition: string, value?: string) =>
      `${condition}${value ?? ''}`.includes('-webkit-touch-callout') ||
      (value === undefined ? original(condition) : original(condition, value));
    const visit = (owner: CSSStyleSheet | CSSGroupingRule) => {
      const rules = owner.cssRules;
      for (let i = 0; i < rules.length; i += 1) {
        const rule = rules[i];
        if (
          rule instanceof CSSSupportsRule &&
          rule.conditionText.includes('-webkit-touch-callout')
        ) {
          const inner = Array.from(rule.cssRules, r => r.cssText).join('\n');
          owner.deleteRule(i);
          owner.insertRule(`@supports (display: block) {${inner}}`, i);
        } else if (rule instanceof CSSGroupingRule) {
          visit(rule);
        }
      }
    };
    const rewrite = () => {
      for (const sheet of Array.from(document.styleSheets)) {
        // A cross-origin sheet's rules cannot be read: skip only that one,
        // so any other error in the walk still throws.
        if (
          sheet.href != null &&
          new URL(sheet.href, location.href).origin !== location.origin
        ) {
          continue;
        }
        visit(sheet);
      }
    };
    // Sheets arrive as the story's modules load.
    new MutationObserver(rewrite).observe(document, {
      childList: true,
      subtree: true,
    });
    addEventListener('load', rewrite);
  });
}
