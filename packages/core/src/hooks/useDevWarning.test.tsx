// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from '@testing-library/react';
import {StrictMode} from 'react';
import {useDevWarning, useDevWarningPerMessage} from './useDevWarning';

afterEach(() => {
  vi.restoreAllMocks();
});

function Probe({
  condition,
  message = 'boom',
  component = 'TestComponent',
}: {
  condition: boolean;
  message?: string;
  component?: string;
}) {
  useDevWarning(component, message, condition);
  return null;
}

function PerMessageProbe({
  condition = true,
  message,
}: {
  condition?: boolean;
  message: string;
}) {
  useDevWarningPerMessage('TestComponent', message, condition);
  return null;
}

describe('useDevWarningPerMessage', () => {
  it('releases warning history when the component unmounts', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(<PerMessageProbe message="first" />);
    view.unmount();
    render(<PerMessageProbe message="first" />);
    expect(warn).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])(
    'warns once per distinct reason without repeating earlier reasons (StrictMode: %s)',
    isStrict => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const wrap = (message: string, condition = true) =>
        isStrict ? (
          <StrictMode>
            <PerMessageProbe message={message} condition={condition} />
          </StrictMode>
        ) : (
          <PerMessageProbe message={message} condition={condition} />
        );
      const {rerender} = render(wrap('first'));
      rerender(wrap('first'));
      rerender(wrap('second', false));
      expect(warn).toHaveBeenCalledTimes(1);
      rerender(wrap('second'));
      rerender(wrap('first'));
      rerender(wrap('second'));
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls).toEqual([
        ['TestComponent: first'],
        ['TestComponent: second'],
      ]);
    },
  );
});

describe('useDevWarning', () => {
  it('warns once, in the standardized format, when the condition is true', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {rerender} = render(<Probe condition={true} />);
    rerender(<Probe condition={true} />);
    rerender(<Probe condition={true} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('TestComponent: boom');
  });

  it('does not warn when the condition is false', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Probe condition={false} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps the public once-per-mount behavior when the message changes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {rerender} = render(
      <StrictMode>
        <Probe condition={true} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <Probe condition={true} message="changed" />
      </StrictMode>,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('TestComponent: boom');
  });

  it('uses the current prefix when the condition first becomes true', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(<Probe component="Initial" condition={false} />);
    view.rerender(<Probe component="Changed" condition />);
    expect(warn).toHaveBeenCalledWith('Changed: boom');
    view.rerender(<Probe component="Next" condition message="later" />);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns after the condition flips from false to true', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {rerender} = render(<Probe condition={false} />);
    expect(warn).not.toHaveBeenCalled();
    rerender(<Probe condition={true} />);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
