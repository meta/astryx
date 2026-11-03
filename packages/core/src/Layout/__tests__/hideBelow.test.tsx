// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hideBelow.test.tsx
 * @input Uses vitest, @testing-library/react, react-dom/server
 * @output Unit tests for the LayoutPanel hideBelow responsive-visibility prop
 * @position Testing; validates per-breakpoint media-query CSS output and
 *   SSR-safety (panel stays mounted, no runtime measurement)
 */

import {describe, it, expect} from 'vitest';
import {render} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {Layout} from '../Layout';
import {LayoutContent} from '../LayoutContent';
import {LayoutPanel} from '../LayoutPanel';

const BREAKPOINT_PX = {sm: 640, md: 768, lg: 1024, xl: 1280} as const;
type Breakpoint = keyof typeof BREAKPOINT_PX;

/**
 * StyleX injects atomic rules into the document in the vitest environment
 * (runtimeInjection: true). Scan every sheet and style tag so we can assert
 * the generated media query without relying on jsdom media evaluation.
 * Same approach as Switch.test.tsx's RTL travel assertions.
 */
function injectedCss(): string {
  let out = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        out += rule.cssText + '\n';
      }
    } catch {
      // ignore unreadable sheets
    }
  }
  out += Array.from(document.querySelectorAll('style'))
    .map(s => s.textContent || '')
    .join('\n');
  return out;
}

/**
 * Extracts `{query, selectors}` pairs for every atomic
 * `@media <query> { <selectors> { display: none } }` rule in the CSS text.
 */
function displayNoneMediaRules(
  css: string,
): {query: string; selectors: string}[] {
  const out: {query: string; selectors: string}[] = [];
  const re =
    /@media ([^{]+)\{\s*([^{}]+?)\s*\{\s*display\s*:\s*none\s*;?\s*\}\s*\}/g;
  for (const m of css.matchAll(re)) {
    out.push({query: m[1].trim(), selectors: m[2].trim()});
  }
  return out;
}

/** Hashed (non-debug) class tokens on an element. */
function hashedClasses(el: Element): string[] {
  return (el.getAttribute('class') || '')
    .split(/\s+/)
    .filter(c => c && !c.includes('__'));
}

function renderPanel(hideBelow?: Breakpoint) {
  const {container} = render(
    <Layout
      content={<LayoutContent>Main</LayoutContent>}
      end={
        <LayoutPanel
          data-testid={`panel-${hideBelow ?? 'none'}`}
          hideBelow={hideBelow}>
          Details
        </LayoutPanel>
      }
    />,
  );
  return container.querySelector(
    `[data-testid="panel-${hideBelow ?? 'none'}"]`,
  ) as HTMLElement;
}

describe('LayoutPanel hideBelow', () => {
  describe('per-breakpoint media query output', () => {
    for (const bp of ['sm', 'md', 'lg', 'xl'] as Breakpoint[]) {
      it(`hideBelow="${bp}" emits @media (max-width: ${BREAKPOINT_PX[bp]}px) { display: none }`, () => {
        const panel = renderPanel(bp);

        // Debug class marks the style slot in dev mode.
        expect(panel.className).toContain(`hideBelowStyles.${bp}`);

        // The injected rule for one of the panel's atomic classes must be a
        // display:none toggle under exactly this breakpoint's max-width query.
        const classes = hashedClasses(panel);
        const matching = displayNoneMediaRules(injectedCss()).filter(rule =>
          classes.some(cls => rule.selectors.includes(`.${cls}`)),
        );
        expect(matching.length).toBeGreaterThan(0);
        for (const rule of matching) {
          expect(rule.query).toBe(`(max-width: ${BREAKPOINT_PX[bp]}px)`);
        }
      });
    }

    it('breakpoints produce distinct classes', () => {
      const classLists = (['sm', 'md', 'lg', 'xl'] as Breakpoint[]).map(bp =>
        renderPanel(bp).getAttribute('class'),
      );
      expect(new Set(classLists).size).toBe(4);
    });
  });

  describe('default behavior', () => {
    it('applies no hide class when hideBelow is omitted', () => {
      const panel = renderPanel(undefined);
      expect(panel.className).not.toContain('hideBelowStyles');
    });

    it('keeps the panel mounted (CSS hides it, not conditional render)', () => {
      const panel = renderPanel('lg');
      expect(panel).toBeInTheDocument();
      expect(panel.textContent).toBe('Details');
    });

    it('composes with width and hasDivider', () => {
      const {container} = render(
        <Layout
          content={<LayoutContent>Main</LayoutContent>}
          end={
            <LayoutPanel
              data-testid="composed"
              width={340}
              hasDivider
              hideBelow="md">
              Details
            </LayoutPanel>
          }
        />,
      );
      const panel = container.querySelector(
        '[data-testid="composed"]',
      ) as HTMLElement;
      expect(panel.className).toContain('hideBelowStyles.md');
      expect(panel.className).toContain('dividerStart');
    });
  });

  describe('SSR safety', () => {
    it('renders identical hidden-panel markup on the server (no runtime measurement)', () => {
      const ui = (
        <Layout
          content={<LayoutContent>Main</LayoutContent>}
          end={
            <LayoutPanel data-testid="ssr-panel" hideBelow="lg">
              Details
            </LayoutPanel>
          }
        />
      );
      const html = renderToString(ui);
      // The panel and its content are present in server HTML; visibility is
      // purely a CSS concern, so there is nothing to flash on hydration.
      expect(html).toContain('ssr-panel');
      expect(html).toContain('Details');
      expect(html).toContain('hideBelowStyles.lg');

      // Client render of the same tree produces the same panel class list.
      const {container} = render(ui);
      const clientPanel = container.querySelector(
        '[data-testid="ssr-panel"]',
      ) as HTMLElement;
      const ssrDoc = new DOMParser().parseFromString(html, 'text/html');
      const ssrPanel = ssrDoc.querySelector('[data-testid="ssr-panel"]');
      expect(ssrPanel?.getAttribute('class')).toBe(
        clientPanel.getAttribute('class'),
      );
    });
  });
});
