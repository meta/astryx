// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, fireEvent, waitFor} from '@testing-library/react';
import {ByokCard} from './ByokCard';

const mockProvider = {
  id: 'openai',
  name: 'OpenAI',
  description: 'GPT-4o, o1, o3-mini models',
};

// Mock showModal and close methods for jsdom environment
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

describe('ByokCard', () => {
  it('renders provider name and description', () => {
    const {getByText} = render(
      <ByokCard provider={mockProvider} status="disconnected" />,
    );

    expect(getByText('OpenAI')).toBeInTheDocument();
    expect(getByText('GPT-4o, o1, o3-mini models')).toBeInTheDocument();
    expect(getByText('Not connected')).toBeInTheDocument();
    expect(getByText('Connect')).toBeInTheDocument();
  });

  it('renders connected state with rotate and delete buttons', () => {
    const {getByText, queryByText} = render(
      <ByokCard
        provider={mockProvider}
        status="connected"
        accountLabel="sk-proj-...1234"
      />,
    );

    expect(getByText('sk-proj-...1234')).toBeInTheDocument();
    expect(getByText('Rotate')).toBeInTheDocument();
    expect(getByText('Delete')).toBeInTheDocument();
    expect(queryByText('Connect')).not.toBeInTheDocument();
  });

  it('opens connect dialog and calls onConnect with submitted key', async () => {
    const handleConnect = vi.fn();
    const {getByText, getByPlaceholderText} = render(
      <ByokCard
        provider={mockProvider}
        status="disconnected"
        onConnect={handleConnect}
      />,
    );

    // Click Connect button on card
    fireEvent.click(getByText('Connect'));

    // Input API key in dialog
    const input = getByPlaceholderText('sk-...');
    expect(input).toBeInTheDocument();
    fireEvent.change(input, {target: {value: 'sk-test-key-12345'}});

    // Click Save Key in dialog
    const saveBtn = getByText('Save Key');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleConnect).toHaveBeenCalledWith('sk-test-key-12345');
    });
  });

  it('opens rotate dialog and calls onRotate with new key', async () => {
    const handleRotate = vi.fn();
    const {getByText, getByPlaceholderText} = render(
      <ByokCard
        provider={mockProvider}
        status="connected"
        onRotate={handleRotate}
      />,
    );

    // Click Rotate
    fireEvent.click(getByText('Rotate'));

    // Input new API key
    const input = getByPlaceholderText('sk-...');
    fireEvent.change(input, {target: {value: 'sk-new-rotated-key'}});

    // Click Update Key
    fireEvent.click(getByText('Update Key'));

    await waitFor(() => {
      expect(handleRotate).toHaveBeenCalledWith('sk-new-rotated-key');
    });
  });

  it('opens delete confirmation dialog and calls onDelete', async () => {
    const handleDelete = vi.fn();
    const {getByText} = render(
      <ByokCard
        provider={mockProvider}
        status="connected"
        onDelete={handleDelete}
      />,
    );

    // Click Delete on card
    fireEvent.click(getByText('Delete'));

    // Confirm removal in dialog
    const removeBtn = getByText('Remove');
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(handleDelete).toHaveBeenCalled();
    });
  });
});
