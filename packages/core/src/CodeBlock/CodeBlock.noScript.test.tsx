// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CodeBlock before script runs, and in a page that never runs it: the
 * served markup already lets the code viewport scroll.
 */

import {renderToString} from 'react-dom/server';
import {render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {CodeBlock} from './CodeBlock';

const LONG_LINE = `const options = createSearchField({${' clearLabel: "Clear search",'.repeat(8)} });`;

describe('CodeBlock without script', () => {
  it('serves a code viewport that scrolls a long line', () => {
    const html = renderToString(<CodeBlock code={LONG_LINE} language="tsx" />);
    expect(html).toContain('--x-overflowX:auto');
    expect(html).not.toContain('--x-overflowX:clip');
  });

  it('serves a height-bounded viewport that scrolls past maxHeight', () => {
    const html = renderToString(
      <CodeBlock code={'const x = 1;\n'.repeat(40)} maxHeight={80} />,
    );
    expect(html).toContain('--x-overflowY:auto');
    expect(html).not.toContain('--x-overflowY:clip');
  });

  it('adds no Tab stop before overflow is measured', () => {
    const {container} = render(<CodeBlock code={LONG_LINE} language="tsx" />);
    const viewport = container.querySelector('[style*="--x-overflowX"]');
    expect(viewport?.getAttribute('style')).toContain('--x-overflowX: auto');
    expect(viewport).not.toHaveAttribute('tabindex');
  });
});
