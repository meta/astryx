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

  it('transitions actions when status prop changes from disconnected to connected', () => {
    const {getByText, queryByText, rerender} = render(
      <ByokCard provider={mockProvider} status="disconnected" />,
    );

    expect(getByText('Connect')).toBeInTheDocument();
    expect(queryByText('Rotate')).not.toBeInTheDocument();
    expect(queryByText('Delete')).not.toBeInTheDocument();

    rerender(<ByokCard provider={mockProvider} status="connected" />);

    expect(queryByText('Connect')).not.toBeInTheDocument();
    expect(getByText('Rotate')).toBeInTheDocument();
    expect(getByText('Delete')).toBeInTheDocument();
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

  it('displays error status with accessible message on TextInput when submitting empty key', () => {
    const {getByText, getByPlaceholderText} = render(
      <ByokCard provider={mockProvider} status="disconnected" />,
    );

    fireEvent.click(getByText('Connect'));

    // Click Save Key with empty input
    fireEvent.click(getByText('Save Key'));

    const input = getByPlaceholderText('sk-...');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(getByText('API key is required')).toBeInTheDocument();
  });

  it('toggles password masking when Show key / Hide key is clicked', () => {
    const {getByText, getByPlaceholderText} = render(
      <ByokCard provider={mockProvider} status="disconnected" />,
    );

    fireEvent.click(getByText('Connect'));
    const input = getByPlaceholderText('sk-...');
    expect(input).toHaveAttribute('type', 'password');

    // Toggle to show plain text key
    const toggleBtn = getByText('Show key');
    fireEvent.click(toggleBtn);
    expect(input).toHaveAttribute('type', 'text');
    expect(getByText('Hide key')).toBeInTheDocument();

    // Toggle back to mask key
    fireEvent.click(getByText('Hide key'));
    expect(input).toHaveAttribute('type', 'password');
    expect(getByText('Show key')).toBeInTheDocument();
  });

  it('resets showPlainKey and clears input when connect dialog is closed or reopened', () => {
    const {getByText, getByPlaceholderText, queryByText} = render(
      <ByokCard provider={mockProvider} status="disconnected" />,
    );

    // Open connect dialog
    fireEvent.click(getByText('Connect'));
    const input = getByPlaceholderText('sk-...');
    fireEvent.change(input, {target: {value: 'my-secret-key'}});

    // Show plain text key
    fireEvent.click(getByText('Show key'));
    expect(input).toHaveAttribute('type', 'text');

    // Close dialog via Cancel
    fireEvent.click(getByText('Cancel'));
    expect(queryByText('Save Key')).not.toBeInTheDocument();

    // Reopen connect dialog
    fireEvent.click(getByText('Connect'));
    const reopenedInput = getByPlaceholderText('sk-...');
    expect(reopenedInput).toHaveAttribute('type', 'password');
    expect(reopenedInput).toHaveValue('');
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

  it('shows error message when onDelete promise rejects', async () => {
    const handleDelete = vi
      .fn()
      .mockRejectedValue(new Error('Deletion failed on server'));
    const {getByText, findByText} = render(
      <ByokCard
        provider={mockProvider}
        status="connected"
        onDelete={handleDelete}
      />,
    );

    fireEvent.click(getByText('Delete'));
    fireEvent.click(getByText('Remove'));

    const errorMsg = await findByText('Deletion failed on server');
    expect(errorMsg).toBeInTheDocument();
  });

  it('forwards custom className and data attributes to root element', () => {
    const {container} = render(
      <ByokCard
        provider={mockProvider}
        className="custom-byok-class"
        data-testid="byok-root"
      />,
    );

    const root = container.querySelector('.custom-byok-class');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('data-testid', 'byok-root');
  });
});
