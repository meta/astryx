// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file newTabLinkRel.test.tsx
 * @input Button, IconButton, and ClickableCard rendered as links
 * @output Proof that a new-tab link gets `noopener noreferrer` beside the
 *   caller's own rel tokens, and that other links get no added rel
 * @position Unit evidence shared by the three link-rendering components
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {Button} from '../Button/Button';
import {IconButton} from '../IconButton/IconButton';
import {ClickableCard} from '../ClickableCard/ClickableCard';

function relTokens(el: Element): string[] {
  return (el.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean);
}

describe.each([
  [
    'Button',
    (props: {target?: string; rel?: string}) => (
      <Button label="Docs" href="https://example.com" {...props} />
    ),
  ],
  [
    'IconButton',
    (props: {target?: string; rel?: string}) => (
      <IconButton
        label="Docs"
        icon={<span />}
        href="https://example.com"
        {...props}
      />
    ),
  ],
])('%s as a link', (_name, renderLink) => {
  it('adds noopener noreferrer to a new-tab link', () => {
    render(renderLink({target: '_blank'}));
    expect(relTokens(screen.getByRole('link'))).toEqual([
      'noopener',
      'noreferrer',
    ]);
  });

  it('keeps the caller rel tokens once each', () => {
    render(renderLink({target: '_blank', rel: 'author noopener'}));
    expect(relTokens(screen.getByRole('link'))).toEqual([
      'author',
      'noopener',
      'noreferrer',
    ]);
  });

  it('adds nothing without target="_blank"', () => {
    render(renderLink({rel: 'author'}));
    expect(relTokens(screen.getByRole('link'))).toEqual(['author']);
  });
});

describe('ClickableCard as a link', () => {
  it('adds noopener noreferrer to a new-tab link', () => {
    render(
      <ClickableCard label="Docs" href="https://example.com" target="_blank">
        Docs
      </ClickableCard>,
    );
    expect(relTokens(screen.getByRole('link', {name: 'Docs'}))).toEqual([
      'noopener',
      'noreferrer',
    ]);
  });

  it('adds no rel without target="_blank"', () => {
    render(
      <ClickableCard label="Docs" href="https://example.com">
        Docs
      </ClickableCard>,
    );
    expect(screen.getByRole('link', {name: 'Docs'}).hasAttribute('rel')).toBe(
      false,
    );
  });
});

describe('ClickableCard surface clicks that open a new tab', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drop the referrer for a target="_blank" card', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(
      <ClickableCard label="Docs" href="https://example.com" target="_blank">
        Card body
      </ClickableCard>,
    );
    fireEvent.click(screen.getByText('Card body'));
    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('keep the referrer for a modifier click on another card', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(
      <ClickableCard label="Docs" href="https://example.com">
        Card body
      </ClickableCard>,
    );
    fireEvent.click(screen.getByText('Card body'), {metaKey: true});
    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener',
    );
  });
});
