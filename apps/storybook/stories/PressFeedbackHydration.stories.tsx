// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PressFeedbackHydration.stories.tsx
 * @input Button, React's server renderer, hydrateRoot and a lazy Suspense
 *   boundary whose code the page delivers on demand
 * @output A fixture that server-renders a page, hydrates it with one
 *   boundary's code still loading, and delivers that code later, for the
 *   browser lane; excluded from the visual matrix
 * @position Real-browser server render, hydration and post-hydration fixture
 *   for the press controller under `spec:AST-013` FR9
 */

import type {Meta, StoryObj} from '@storybook/react';
import {
  lazy,
  Suspense,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Button} from '@astryxdesign/core';

const meta = {
  title: 'Core/PressFeedbackHydration',
  tags: ['no-visual', '!autodocs'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Late(): ReactNode {
  return <Button label="Save" onClick={() => {}} />;
}

const page = (content: ReactNode) => (
  <main>
    <Button label="Menu" onClick={() => {}} />
    <Suspense fallback={null}>{content}</Suspense>
  </main>
);

/**
 * "Server render" writes the page's server markup. "Hydrate" hydrates it
 * with the Save button's boundary still loading. "Deliver" hands that
 * boundary its code, so it hydrates. The output counts React's recoverable
 * errors and the console errors that name a hydration mismatch.
 */
function PressHydrationFixture() {
  const hostRef = useRef<HTMLDivElement>(null);
  const deliverRef = useRef<(() => void) | null>(null);
  const [phase, setPhase] = useState<
    'idle' | 'server' | 'hydrating' | 'hydrated'
  >('idle');
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hostRef.current == null) {
            return;
          }
          hostRef.current.innerHTML = renderToString(page(<Late />));
          setPhase('server');
        }}>
        Server render
      </button>
      <button
        type="button"
        onClick={() => {
          if (hostRef.current == null) {
            return;
          }
          const found: string[] = [];
          const report = (message: string) => {
            found.push(message);
            setErrors([...found]);
          };
          const consoleError = console.error;
          console.error = (...args: unknown[]) => {
            if (args.some(arg => /hydrat/i.test(String(arg)))) {
              report(args.map(String).join(' '));
            }
            consoleError(...args);
          };
          const LateCode = lazy(async () => {
            const module = await new Promise<{default: ComponentType}>(
              resolve => {
                deliverRef.current = () => resolve({default: Late});
              },
            );
            return module;
          });
          hydrateRoot(hostRef.current, page(<LateCode />), {
            onRecoverableError: error => report(String(error)),
          });
          setPhase('hydrating');
        }}>
        Hydrate
      </button>
      <button
        type="button"
        onClick={() => {
          deliverRef.current?.();
          setPhase('hydrated');
        }}>
        Deliver
      </button>
      <output data-phase={phase} data-errors={errors.length}>
        {errors.join('\n')}
      </output>
      <div ref={hostRef} data-testid="host" />
    </div>
  );
}

export const StillLoadingBoundary: Story = {
  render: () => <PressHydrationFixture />,
};
