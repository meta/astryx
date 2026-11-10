// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.tooltipLoad.test.tsx
 * @output Tests that importing Button does not load the Tooltip, that a
 *   Button's tooltip description is its own hidden copy of the text before
 *   and after the tooltip loads, and that the first hover or focus mounts the
 *   tooltip, which then opens by its own rules
 * @position Validates Button's on-demand tooltip (FR12, PR1). Each test
 *   starts from a fresh module registry.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';

const loads = {useTooltip: 0};

beforeEach(() => {
  vi.resetModules();
  loads.useTooltip = 0;
  vi.doUnmock('../Tooltip/useTooltip');
  vi.doMock('../Tooltip/useTooltip', async importOriginal => {
    loads.useTooltip += 1;
    return importOriginal();
  });
});

const restorers: (() => void)[] = [];
afterEach(() => {
  for (const restore of restorers.splice(0)) {
    restore();
  }
});

function withPopover() {
  const proto = window.HTMLElement.prototype;
  const original = {
    showPopover: proto.showPopover,
    hidePopover: proto.hidePopover,
  };
  const showPopover = vi.fn();
  proto.showPopover = showPopover;
  proto.hidePopover = vi.fn();
  restorers.push(() => {
    proto.showPopover = original.showPopover;
    proto.hidePopover = original.hidePopover;
  });
  return showPopover;
}

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
  });
}

function describedByIds(element: HTMLElement): string[] {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean);
}

describe('Button tooltip loading (PR1)', () => {
  it('importing Button loads no Tooltip', async () => {
    const {Button} = await import('./Button');
    render(<Button label="Save" />);
    await settle();
    expect(loads.useTooltip).toBe(0);
  });

  it('a Button with a tooltip loads it after mount', async () => {
    const {Button} = await import('./Button');
    render(<Button label="Save" tooltip="Save your changes" />);
    await waitFor(() => expect(loads.useTooltip).toBe(1), {timeout: 8000});
  }, 15000);
});

describe('Button tooltip description (FR12)', () => {
  it('describes the button by its hidden copy before any interaction', async () => {
    const {Button} = await import('./Button');
    render(<Button label="Save" tooltip="Save your changes" />);
    await settle();
    const button = screen.getByRole('button', {name: 'Save'});
    expect(button).toHaveAccessibleDescription('Save your changes');
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    const [id] = describedByIds(button);
    expect(document.getElementById(id)).toHaveAttribute('popover', 'manual');
  });

  it('keeps the hidden copy as the only target after the tooltip mounts', async () => {
    withPopover();
    const {Button} = await import('./Button');
    render(
      <Button
        label="Save"
        tooltip="Save your changes"
        aria-describedby="hint"
      />,
    );
    await settle();
    const button = screen.getByRole('button', {name: 'Save'});
    const before = describedByIds(button);
    fireEvent.pointerEnter(button, {pointerType: 'mouse'});
    await waitFor(
      () => expect(document.querySelector('[role="tooltip"]')).not.toBeNull(),
      {timeout: 8000},
    );
    const after = describedByIds(button);
    expect(after).toEqual(before);
    expect(after).toHaveLength(2);
    expect(after[0]).toBe('hint');
    const tooltipLayer = document.querySelector('[role="tooltip"]');
    expect(after).not.toContain(tooltipLayer?.id);
  }, 15000);

  it('follows a change of the tooltip text', async () => {
    const {Button} = await import('./Button');
    const {rerender} = render(<Button label="Save" tooltip="First" />);
    const button = screen.getByRole('button', {name: 'Save'});
    expect(button).toHaveAccessibleDescription('First');
    rerender(<Button label="Save" tooltip="Second" />);
    expect(button).toHaveAccessibleDescription('Second');
  });

  it('adds no hidden copy when the tooltip repeats the name', async () => {
    const {Button} = await import('./Button');
    render(<Button label="Close" tooltip="Close" />);
    const button = screen.getByRole('button', {name: 'Close'});
    expect(button).not.toHaveAttribute('aria-describedby');
    expect(document.querySelector('span[popover]')).toBeNull();
  });
});

describe('Button tooltip mount on the first interaction', () => {
  it('the first hover mounts the tooltip and opens it after the delay', async () => {
    const showPopover = withPopover();
    const {Button} = await import('./Button');
    render(<Button label="Save" tooltip="Save your changes" />);
    await settle();
    const button = screen.getByRole('button', {name: 'Save'});
    fireEvent.pointerEnter(button, {pointerType: 'mouse'});
    await waitFor(() => expect(showPopover).toHaveBeenCalled(), {
      timeout: 8000,
    });
  }, 15000);

  it('focus mounts the tooltip and opens it', async () => {
    const showPopover = withPopover();
    const {Button} = await import('./Button');
    render(<Button label="Save" tooltip="Save your changes" />);
    await settle();
    const button = screen.getByRole('button', {name: 'Save'});
    act(() => button.focus());
    await waitFor(() => expect(showPopover).toHaveBeenCalled(), {
      timeout: 8000,
    });
  }, 15000);

  it('a pointer that leaves before the tooltip mounts opens nothing', async () => {
    const showPopover = withPopover();
    const {Button} = await import('./Button');
    render(<Button label="Save" tooltip="Save your changes" />);
    await settle();
    const button = screen.getByRole('button', {name: 'Save'});
    fireEvent.pointerEnter(button, {pointerType: 'mouse'});
    fireEvent.pointerLeave(button, {pointerType: 'mouse'});
    fireEvent.mouseLeave(button);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1500));
    });
    expect(showPopover).not.toHaveBeenCalled();
  });
});
