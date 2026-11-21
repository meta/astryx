// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {CopyToClipboard} from '../CopyToClipboard';

describe('CopyToClipboard', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {writeText: vi.fn().mockResolvedValue(undefined)},
      configurable: true,
      writable: true,
    });
  });

  it('renders an icon-only button with the localized copy label', () => {
    render(<CopyToClipboard text="Hello World" />);

    const button = screen.getByRole('button', {name: 'Copy to clipboard'});
    expect(button).toBeInTheDocument();
  });

  it('writes the text prop to the clipboard on click', async () => {
    render(<CopyToClipboard text="npm install @astryxdesign/core" />);

    fireEvent.click(screen.getByRole('button', {name: 'Copy to clipboard'}));

    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'npm install @astryxdesign/core',
      );
    });
  });

  it('swaps the accessible name to the copied confirmation after a successful copy', async () => {
    render(<CopyToClipboard text="Hello World" />);

    fireEvent.click(screen.getByRole('button', {name: 'Copy to clipboard'}));

    expect(
      await screen.findByRole('button', {name: 'Copied'}),
    ).toBeInTheDocument();
  });

  it('calls onCopy after a successful copy and skips it on a rejection', async () => {
    const onCopy = vi.fn();
    render(<CopyToClipboard text="Hello World" onCopy={onCopy} />);

    fireEvent.click(screen.getByRole('button', {name: 'Copy to clipboard'}));
    await screen.findByRole('button', {name: 'Copied'});
    expect(onCopy).toHaveBeenCalledTimes(1);

    (
      navigator.clipboard.writeText as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error('denied'));
    // The copied window is still active, so the accessible name is still the
    // copied confirmation for this second click.
    fireEvent.click(screen.getByRole('button', {name: 'Copied'}));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('uses the label prop as the accessible name when provided', () => {
    render(
      <CopyToClipboard text="AASH-2026-11-17" label="Copy invitation code" />,
    );

    expect(
      screen.getByRole('button', {name: 'Copy invitation code'}),
    ).toBeInTheDocument();
  });
});
