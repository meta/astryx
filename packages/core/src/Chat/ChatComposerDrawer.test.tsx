// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {ChatComposerDrawer} from './ChatComposerDrawer';

describe('ChatComposerDrawer', () => {
  it('links the toggle to the drawer content via aria-controls', () => {
    render(
      <ChatComposerDrawer count={2} label="Attachments">
        <span>Drawer content</span>
      </ChatComposerDrawer>,
    );

    const toggle = screen.getByRole('button', {name: /Attachments/});
    const controlsId = toggle.getAttribute('aria-controls');
    // aria-controls must be present and point at the real content region.
    expect(controlsId).toBeTruthy();
    const region = document.getElementById(controlsId as string);
    expect(region).not.toBeNull();
    expect(region).toContainElement(screen.getByText('Drawer content'));
  });

  it('keeps aria-controls resolvable while collapsed (content stays mounted)', () => {
    render(
      <ChatComposerDrawer count={2} label="Attachments" defaultIsCollapsed>
        <span>Drawer content</span>
      </ChatComposerDrawer>,
    );

    const toggle = screen.getByRole('button', {name: /Attachments/});
    const controlsId = toggle.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    const region = document.getElementById(controlsId as string);
    expect(region).not.toBeNull();
    expect(region).toContainElement(screen.getByText('Drawer content'));
  });

  it('removes collapsed children from the focus order and restores them on expand', () => {
    render(
      <ChatComposerDrawer count={1} label="Attachment">
        <button type="button">Remove attachment</button>
      </ChatComposerDrawer>,
    );

    const toggle = screen.getByRole('button', {name: /Attachment/});
    const region = document.getElementById(
      toggle.getAttribute('aria-controls') as string,
    )!;
    expect(region).not.toHaveAttribute('inert');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(region).toHaveAttribute('inert');
    expect(
      screen
        .getByRole('button', {name: 'Remove attachment'})
        .closest('[inert]'),
    ).toBe(region);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(region).not.toHaveAttribute('inert');
  });

  it('supports both disclosure keys and reports the requested state', () => {
    const onCollapsedChange = vi.fn();
    render(
      <ChatComposerDrawer
        count={2}
        label="Attachments"
        onCollapsedChange={onCollapsedChange}>
        <span>Drawer content</span>
      </ChatComposerDrawer>,
    );

    const toggle = screen.getByRole('button', {name: /Attachments/});
    fireEvent.keyDown(toggle, {key: 'Enter'});
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true);

    fireEvent.keyDown(toggle, {key: ' '});
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
  });

  it('preserves the Badge and label as the default collapsed summary', () => {
    const {container} = render(
      <ChatComposerDrawer count={3} label="Attachments" defaultIsCollapsed>
        <span>Drawer content</span>
      </ChatComposerDrawer>,
    );

    expect(container.querySelector('.astryx-badge')).toHaveTextContent('3');
    expect(screen.getByText('Attachments')).toBeInTheDocument();
  });

  it('replaces the complete collapsed summary with caller content', () => {
    const {container} = render(
      <ChatComposerDrawer
        count={3}
        label="Attachments"
        collapsedSummary={<button type="button">Files ready</button>}
        defaultIsCollapsed>
        <span>Drawer content</span>
      </ChatComposerDrawer>,
    );

    const toggle = screen.getByRole('button', {name: /Attachments/});
    const customSummary = screen.getByText('Files ready');
    const summaryBoundary = customSummary.closest('[inert]');
    expect(toggle).not.toHaveAccessibleName(/Files ready/);
    expect(summaryBoundary).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.astryx-badge')).toBeNull();
    expect(screen.queryByText('Attachments')).toBeNull();
    expect(
      screen.queryByRole('button', {name: 'Files ready'}),
    ).not.toBeInTheDocument();
  });

  it('does not expose collapsedSummary when count is omitted', () => {
    render(
      <ChatComposerDrawer collapsedSummary={<span>Files ready</span>}>
        <span>Drawer content</span>
      </ChatComposerDrawer>,
    );

    expect(screen.queryByText('Files ready')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Drawer content')).toBeInTheDocument();
  });
});
