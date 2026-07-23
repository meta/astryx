// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LineClamp.test.tsx
 * @input Uses vitest, @testing-library/react, LineClamp component
 * @output Unit tests for LineClamp component behavior
 * @position Testing; validates LineClamp.tsx implementation
 *
 * SYNC: When LineClamp.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {LineClamp} from './LineClamp';

// jsdom has no layout engine, so content never actually overflows and
// isTruncated stays false — same constraint core's Text.test.tsx works
// under for the same useTruncation hook. These tests cover the
// non-truncated (default) rendering path; the tooltip-on-truncation path is
// exercised manually in Storybook.
describe('LineClamp', () => {
  it('renders children', () => {
    render(<LineClamp maxLines={2}>Some clamped content</LineClamp>);
    expect(screen.getByText('Some clamped content')).toBeInTheDocument();
  });

  it('renders arbitrary mixed children, not just plain text', () => {
    render(
      <LineClamp maxLines={2}>
        Some <strong>mixed</strong> inline content
      </LineClamp>,
    );
    expect(screen.getByText('mixed')).toBeInTheDocument();
  });

  it('renders as a div by default', () => {
    render(<LineClamp maxLines={2}>Content</LineClamp>);
    expect(screen.getByText('Content').tagName).toBe('DIV');
  });

  it('renders as the element passed via `as`', () => {
    render(
      <LineClamp maxLines={2} as="span">
        Content
      </LineClamp>,
    );
    expect(screen.getByText('Content').tagName).toBe('SPAN');
  });

  it('applies -webkit-line-clamp with the given maxLines', () => {
    render(<LineClamp maxLines={3}>Content</LineClamp>);
    const el = screen.getByText('Content');
    expect(el.style.webkitLineClamp).toBe('3');
  });

  it('does not set a title/tooltip when content is not truncated', () => {
    render(<LineClamp maxLines={2}>Short</LineClamp>);
    expect(screen.getByText('Short')).not.toHaveAttribute('title');
  });

  it('forwards ref to the root element', () => {
    const ref = vi.fn();
    render(
      <LineClamp maxLines={2} ref={ref}>
        Content
      </LineClamp>,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('forwards xstyle/className/style to the root element', () => {
    render(
      <LineClamp maxLines={2} className="custom-class">
        Content
      </LineClamp>,
    );
    expect(screen.getByText('Content')).toHaveClass('custom-class');
  });
});
