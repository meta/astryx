// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it, vi, afterEach} from 'vitest';
import {render} from '@testing-library/react';
import {useRenamedProp} from './useRenamedProp';

function Probe({
  deprecatedValue,
  value,
}: {
  deprecatedValue?: string;
  value?: string;
}) {
  const resolved = useRenamedProp<string>({
    component: 'Probe',
    deprecated: 'oldName',
    deprecatedValue,
    replacement: 'newName',
    value,
  });
  return <span data-testid="resolved">{resolved ?? '(none)'}</span>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRenamedProp', () => {
  it('returns undefined when neither name is given, leaving the default to the caller', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {getByTestId} = render(<Probe />);
    expect(getByTestId('resolved').textContent).toBe('(none)');
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns the replacement with no warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {getByTestId} = render(<Probe value="new" />);
    expect(getByTestId('resolved').textContent).toBe('new');
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps the released name working, and says it is deprecated', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {getByTestId} = render(<Probe deprecatedValue="old" />);
    expect(getByTestId('resolved').textContent).toBe('old');
    expect(warn).toHaveBeenCalledWith(
      'Probe: `oldName` is deprecated; use `newName` instead. ' +
        '`oldName` still works exactly as released.',
    );
  });

  it('lets the replacement win when both are set, and says so once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {getByTestId} = render(<Probe deprecatedValue="old" value="new" />);
    expect(getByTestId('resolved').textContent).toBe('new');
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Probe: `oldName` and `newName` are both set; `newName` wins. ' +
        '`oldName` is deprecated — drop it.',
    );
  });

  it('treats an explicit null replacement as not given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // `null` is what the adopting components' own `??` already treats as
    // absent, so it must fall through to the deprecated value rather than
    // winning — and the warning must not claim a winner the render did not
    // pick.
    const {getByTestId} = render(
      <Probe deprecatedValue="old" value={null as unknown as string} />,
    );
    expect(getByTestId('resolved').textContent).toBe('old');
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('`oldName` is deprecated'),
    );
  });

  it('falls through to the caller default when null is the only value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {getByTestId} = render(<Probe value={null as unknown as string} />);
    expect(getByTestId('resolved').textContent).toBe('(none)');
    expect(warn).not.toHaveBeenCalled();
  });

  it('distinguishes an explicit falsy replacement from an absent one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // An empty string is a deliberate "render nothing here", not an omission,
    // so it must beat the deprecated value rather than fall through to it.
    const {getByTestId} = render(<Probe deprecatedValue="old" value="" />);
    expect(getByTestId('resolved').textContent).toBe('');
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('are both set'),
    );
  });
});
