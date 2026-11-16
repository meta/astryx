// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CodeBlock.direction.test.tsx
 * @input Uses vitest, @testing-library/react, CodeBlock, Code and Markdown
 * @output Unit tests for code direction on a right-to-left page
 * @position Testing; validates that code keeps left-to-right order while the
 *   gutter follows the page
 *
 * SYNC: When CodeBlock.tsx, Code.tsx or Markdown's code rendering changes,
 * update tests to match new behavior
 */

import {describe, it, expect} from 'vitest';
import {render} from '@testing-library/react';
import {CodeBlock} from './CodeBlock';
import {Code} from '../Code/Code';
import {Markdown} from '../Markdown/Markdown';

const SOURCE = ['useEffect(() => {', '  run();', '});'].join('\n');

function inRtl(node: React.ReactNode) {
  return render(<div dir="rtl">{node}</div>);
}

function lineRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-line]'));
}

describe('CodeBlock on a right-to-left page', () => {
  for (const highlightMode of ['spans', 'ranges'] as const) {
    it(`isolates each line's code as left-to-right (${highlightMode} mode)`, () => {
      const {container} = inRtl(
        <CodeBlock
          code={SOURCE}
          language="tsx"
          hasLineNumbers
          highlightMode={highlightMode}
        />,
      );
      const rows = lineRows(container);
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        // The row itself follows the page, so its gutter mirrors.
        expect(row.hasAttribute('dir')).toBe(false);
        const content = row.querySelector('[dir]');
        expect(content?.getAttribute('dir')).toBe('ltr');
      }
      // "});" reads as written: the isolated element holds it in source order.
      expect(rows[2].querySelector('[dir="ltr"]')?.textContent).toBe('});');
    });
  }

  it('scrolls and wraps code left to right', () => {
    const {container} = inRtl(<CodeBlock code={SOURCE} language="tsx" />);
    const code = container.querySelector('code');
    const viewport = code?.closest('[dir="ltr"]');
    // The scroll container is the nearest left-to-right ancestor of the code,
    // so a long line starts at the visible edge instead of being cut off.
    expect(viewport?.tagName).toBe('DIV');
    // The block itself, with its header and copy control, follows the page.
    expect(container.querySelector('pre')?.hasAttribute('dir')).toBe(false);
  });

  it('keeps the diff marker and code in their own cells', () => {
    const {container} = inRtl(
      <CodeBlock
        code={['@@ -1 +1 @@', '-a();', '+b();'].join('\n')}
        language="tsx"
        isDiff
        hasLineNumbers
      />,
    );
    const added = lineRows(container)[2];
    expect(added.hasAttribute('dir')).toBe(false);
    expect(added.querySelector('[dir="ltr"]')?.textContent).toBe('b();');
  });
});

describe('Code on a right-to-left page', () => {
  it('isolates inline code as left-to-right', () => {
    const {container} = inRtl(
      <p>
        النص <Code>a =&gt; b</Code> النص
      </p>,
    );
    expect(container.querySelector('code')?.getAttribute('dir')).toBe('ltr');
  });

  it('lets a caller choose another direction', () => {
    const {container} = render(<Code dir="auto">x</Code>);
    expect(container.querySelector('code')?.getAttribute('dir')).toBe('auto');
  });
});

describe('Markdown code on a right-to-left page', () => {
  it('isolates inline code and fenced code as left-to-right', () => {
    const {container} = inRtl(
      <Markdown>{'النص `x => y` النص\n\n```ts\n});\n```'}</Markdown>,
    );
    const inline = Array.from(container.querySelectorAll('code')).find(
      el => el.textContent === 'x => y',
    );
    expect(inline?.getAttribute('dir')).toBe('ltr');
    const fenced = lineRows(container)[0];
    expect(fenced?.querySelector('[dir="ltr"]')?.textContent).toBe('});');
  });
});
