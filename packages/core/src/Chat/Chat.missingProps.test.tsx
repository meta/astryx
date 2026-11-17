// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Chat.missingProps.test.tsx
 * @input ChatToolCalls, ChatDictationButton rendered without a required prop
 * @output In development, the error names the component, the prop and the
 *   fix. In production, the components behave as they did before, and their
 *   bundles carry no check or message.
 * @position Tests; required-prop errors
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render} from '@testing-library/react';
import type {ComponentType, ReactElement, ReactNode} from 'react';
import {bundleCoreExport} from '../utils/__tests__/devBundle';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

type Loose = ComponentType<Record<string, unknown> & {children?: ReactNode}>;

const CASES: {
  name: string;
  module: string;
  load: () => Promise<Loose>;
  element: (C: Loose) => ReactElement;
  message: string;
}[] = [
  {
    name: 'ChatToolCalls',
    module: 'Chat/ChatToolCalls',
    load: async () =>
      (await import('./ChatToolCalls')).ChatToolCalls as unknown as Loose,
    element: C => <C>search</C>,
    message:
      "ChatToolCalls: `calls` must be an array of tool calls, for example calls={[{name: 'search', status: 'complete'}]}.",
  },
  {
    name: 'ChatDictationButton',
    module: 'Chat/ChatDictationButton',
    load: async () =>
      (await import('./ChatDictationButton'))
        .ChatDictationButton as unknown as Loose,
    element: C => <C />,
    message:
      'ChatDictationButton: `dictation` is required: the value of useSpeechRecognition(), for example dictation={dictation}.',
  },
];

/** The message a render throws, or null when it does not throw. */
function thrownBy(element: ReactElement): string | null {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(element);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe.each(CASES)('$name without its required prop', c => {
  it('names the prop and the fix', async () => {
    expect(thrownBy(c.element(await c.load()))).toBe(c.message);
  });

  it('keeps the production behavior', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const message = thrownBy(c.element(await c.load()));
    expect(message).not.toBeNull();
    expect(message).not.toBe(c.message);
  });

  it('keeps the message in a development bundle only', () => {
    const phrase = c.message.slice(c.message.indexOf('`'));
    expect(bundleCoreExport(c.module, c.name, 'development')).toContain(
      phrase.slice(phrase.indexOf(' ') + 1),
    );
    expect(bundleCoreExport(c.module, c.name, 'production')).not.toContain(
      phrase.slice(phrase.indexOf(' ') + 1),
    );
  });
});
