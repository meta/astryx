// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Chat.missingProps.test.tsx
 * @input ChatToolCalls, ChatDictationButton rendered without a required prop
 * @output In development, the error names the component, the prop and the
 *   fix. In production, the component throws as it did before, and the
 *   bundle carries no check or message.
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
  id: string;
  name: string;
  module: string;
  load: () => Promise<Loose>;
  element: (C: Loose) => ReactElement;
  message: string;
  productionMessage: string;
}[] = [
  {
    id: 'ChatToolCalls',
    name: 'ChatToolCalls',
    module: 'Chat/ChatToolCalls',
    load: async () =>
      (await import('./ChatToolCalls')).ChatToolCalls as unknown as Loose,
    element: C => <C>search</C>,
    message:
      "ChatToolCalls: `calls` must be an array of tool calls, for example calls={[{name: 'search', status: 'complete'}]}.",
    productionMessage: "Cannot read properties of undefined (reading 'length')",
  },
  {
    id: 'ChatDictationButton',
    name: 'ChatDictationButton',
    module: 'Chat/ChatDictationButton',
    load: async () =>
      (await import('./ChatDictationButton'))
        .ChatDictationButton as unknown as Loose,
    element: C => <C />,
    message:
      'ChatDictationButton: `dictation` is required: the value of useSpeechRecognition(), for example dictation={dictation}.',
    productionMessage:
      "Cannot read properties of undefined (reading 'isSupported')",
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

/** The part of the message the component passes to devPropError. */
function phraseOf(message: string): string {
  const afterProp = message.slice(
    message.indexOf('`', message.indexOf('`') + 1) + 1,
  );
  return afterProp.trim();
}

describe.each(CASES)('$id without its required prop', c => {
  it('names the prop and the fix', async () => {
    expect(thrownBy(c.element(await c.load()))).toBe(c.message);
  });

  it('throws in production as it did before', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    expect(thrownBy(c.element(await c.load()))).toBe(c.productionMessage);
  });

  it('keeps the message in a development bundle only', () => {
    const phrase = phraseOf(c.message);
    expect(bundleCoreExport(c.module, c.name, 'development')).toContain(phrase);
    expect(bundleCoreExport(c.module, c.name, 'production')).not.toContain(
      phrase,
    );
  });
});
