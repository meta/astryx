// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent} from 'storybook/test';
import {ChatToolCalls, type ChatToolCallItem} from '@astryxdesign/core/Chat';
import {useState, useCallback} from 'react';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';

const meta: Meta<typeof ChatToolCalls> = {
  title: 'Core/ChatToolCalls',
  component: ChatToolCalls,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div style={{width: 500, padding: 40}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ChatToolCalls>;

// =============================================================================
// Stories
// =============================================================================

/** Single tool call — renders inline, no group chrome */
export const SingleCall: Story = {
  render: () => (
    <ChatToolCalls
      calls={[
        {
          name: 'bash',
          target: 'git status',
          status: 'complete',
          duration: '1.2s',
        },
      ]}
    />
  ),
};

/** Multiple calls — pile visual with collapsible group */
export const MultipleCalls: Story = {
  render: () => (
    <ChatToolCalls
      calls={[
        {
          name: 'bash',
          target: 'git diff --stat',
          status: 'complete',
          duration: '340ms',
        },
        {
          name: 'read',
          target: 'src/Button.tsx',
          status: 'complete',
          duration: '45ms',
        },
        {
          name: 'edit',
          target: 'src/Button.tsx',
          status: 'complete',
          duration: '120ms',
          additions: 12,
          deletions: 3,
        },
      ]}
    />
  ),
};

/** Custom group label — replaces the translated count while expanded */
export const CustomLabel: Story = {
  render: () => (
    <ChatToolCalls
      label="Repository updates"
      defaultIsExpanded
      calls={[
        {name: 'read', target: 'package.json', status: 'complete'},
        {name: 'edit', target: 'package.json', status: 'complete'},
      ]}
    />
  ),
};

/** Focused grouped detail — proves the inset ring survives the animated clip boundary */
export const FocusedGroupedDetail: Story = {
  tags: ['no-visual'],
  render: () => (
    <ChatToolCalls
      defaultIsExpanded
      calls={[
        {
          name: 'read',
          target: 'package.json',
          status: 'complete',
          resultDetail: <CodeBlock code='{"name":"astryx"}' language="json" />,
        },
        {name: 'edit', target: 'package.json', status: 'complete'},
      ]}
    />
  ),
  play: async ({canvasElement}) => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await userEvent.tab();
    await userEvent.tab();
    const focused = canvasElement.querySelector<HTMLElement>(':focus');
    await expect(focused).not.toBeNull();
    await expect(focused).toHaveTextContent('read');
    const style = getComputedStyle(focused as HTMLElement);
    await expect(Number.parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(
      2,
    );
    await expect(Number.parseFloat(style.outlineOffset)).toBeLessThanOrEqual(
      -2,
    );
  },
};

/** Narrow container — long metadata truncates without horizontal overflow */
export const Narrow: Story = {
  tags: ['no-visual'],
  render: () => (
    <div
      data-chat-tool-calls-narrow
      style={{boxSizing: 'border-box', width: 320, padding: 16}}>
      <ChatToolCalls
        calls={[
          {
            name: 'long_running_tool_name',
            target: 'packages/core/src/Chat/ChatToolCalls.tsx',
            status: 'running',
            node: 'workspace',
          },
        ]}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const container = canvasElement.querySelector<HTMLElement>(
      '[data-chat-tool-calls-narrow]',
    );
    await expect(container).not.toBeNull();
    if (container == null) {
      throw new Error('Expected the narrow ChatToolCalls fixture');
    }
    await expect(container.scrollWidth).toBeLessThanOrEqual(
      container.clientWidth,
    );
  },
};

/** With node badges — shows which sandbox ran each tool */
export const WithNodes: Story = {
  render: () => (
    <ChatToolCalls
      calls={[
        {
          name: 'bash',
          target: 'yarn test',
          status: 'complete',
          duration: '4.2s',
          node: 'cli:remote-server',
        },
        {
          name: 'bash',
          target: 'yarn build',
          status: 'complete',
          duration: '12s',
          node: 'cli:remote-server',
        },
        {
          name: 'read',
          target: 'README.md',
          status: 'complete',
          duration: '30ms',
          node: 'workspace',
        },
        {
          name: 'web_search',
          target: 'CSS anchor positioning',
          status: 'complete',
          duration: '1.8s',
        },
      ]}
    />
  ),
};

/** With stats — additions, deletions, file counts */
export const WithStats: Story = {
  render: () => (
    <ChatToolCalls
      calls={[
        {
          name: 'edit',
          target: 'Button.tsx',
          status: 'complete',
          duration: '85ms',
          node: 'cli:remote-server',
          additions: 24,
          deletions: 8,
        },
        {
          name: 'edit',
          target: 'Button.test.tsx',
          status: 'complete',
          duration: '60ms',
          node: 'cli:remote-server',
          additions: 45,
        },
        {
          name: 'bash',
          target: 'grep -r "radius"',
          status: 'complete',
          duration: '200ms',
          node: 'cli:remote-server',
          stats: '6 files · 14 matches',
        },
      ]}
    />
  ),
};

/** Error state — shows error indicator on group and individual calls */
export const WithErrors: Story = {
  render: () => (
    <ChatToolCalls
      calls={[
        {
          name: 'bash',
          target: 'yarn build',
          status: 'complete',
          duration: '8s',
          node: 'cli:remote-server',
        },
        {
          name: 'read',
          target: 'test-output.log',
          status: 'complete',
          duration: '15ms',
          node: 'cli:remote-server',
        },
        {
          name: 'bash',
          target: 'yarn test',
          status: 'error',
          duration: '2.1s',
          node: 'cli:remote-server',
          errorMessage: 'Process exited with code 1: FAIL src/Button.test.tsx',
        },
      ]}
    />
  ),
};

/** Running state — spinner on active calls */
export const Running: Story = {
  render: () => (
    <ChatToolCalls
      calls={[
        {
          name: 'bash',
          target: 'yarn test --watch',
          status: 'running',
          node: 'cli:remote-server',
        },
        {
          name: 'read',
          target: 'vitest.config.ts',
          status: 'complete',
          duration: '20ms',
          node: 'cli:remote-server',
        },
      ]}
    />
  ),
};

/** Streaming — tool calls arrive one by one with status transitions */
export const Streaming: Story = {
  render: () => {
    const allCalls: ChatToolCallItem[] = [
      {
        key: '1',
        name: 'web_search',
        target: 'CSS anchor positioning support',
        status: 'complete',
        duration: '1.8s',
      },
      {
        key: '2',
        name: 'read',
        target: 'packages/core/src/Layer/useLayer.tsx',
        status: 'complete',
        duration: '45ms',
        node: 'cli:remote-server',
      },
      {
        key: '3',
        name: 'bash',
        target: 'npx tsc --noEmit',
        status: 'complete',
        duration: '4.2s',
        node: 'cli:remote-server',
      },
      {
        key: '4',
        name: 'edit',
        target: 'ChatComposer.tsx',
        status: 'complete',
        duration: '120ms',
        node: 'cli:remote-server',
        additions: 8,
        deletions: 2,
      },
      {
        key: '5',
        name: 'bash',
        target: 'yarn test',
        status: 'complete',
        duration: '6.1s',
        node: 'cli:remote-server',
      },
    ];

    const [calls, setCalls] = useState<ChatToolCallItem[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    const start = useCallback(() => {
      setCalls([]);
      setIsRunning(true);
      let i = 0;

      const addNext = () => {
        if (i >= allCalls.length) {
          setIsRunning(false);
          return;
        }
        // Add as running
        const call = allCalls[i];
        if (call == null) {
          return;
        }
        setCalls(prev => [
          ...prev,
          {...call, status: 'running', duration: undefined},
        ]);

        // Complete after a delay
        const idx = i;
        setTimeout(
          () => {
            setCalls(prev =>
              prev.map((c, j) => (j === idx ? {...(allCalls[idx] ?? c)} : c)),
            );
            // Add next after completion
            setTimeout(addNext, 200);
          },
          800 + Math.random() * 1200,
        );

        i++;
      };

      addNext();
    }, []);

    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <button
          onClick={start}
          disabled={isRunning}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #ccc',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.5 : 1,
          }}>
          {isRunning ? 'Running...' : 'Start streaming'}
        </button>
        {calls.length > 0 && <ChatToolCalls calls={calls} />}
      </div>
    );
  },
};

/** Many calls — auto-collapses when >3 */
export const ManyCalls: Story = {
  render: () => (
    <ChatToolCalls
      calls={[
        {
          name: 'bash',
          target: 'git fetch origin',
          status: 'complete',
          duration: '1.2s',
        },
        {
          name: 'bash',
          target: 'git log --oneline -5',
          status: 'complete',
          duration: '80ms',
        },
        {
          name: 'read',
          target: 'CHANGELOG.md',
          status: 'complete',
          duration: '30ms',
        },
        {
          name: 'read',
          target: 'package.json',
          status: 'complete',
          duration: '15ms',
        },
        {
          name: 'edit',
          target: 'package.json',
          status: 'complete',
          duration: '50ms',
          additions: 1,
          deletions: 1,
        },
        {
          name: 'bash',
          target: 'yarn install',
          status: 'complete',
          duration: '8.5s',
        },
        {
          name: 'bash',
          target: 'yarn build',
          status: 'complete',
          duration: '12s',
        },
        {
          name: 'bash',
          target: 'yarn test',
          status: 'complete',
          duration: '6.2s',
        },
      ]}
    />
  ),
};

/** Interactive calls — edit opens a diff modal, bash opens output */
export const Interactive: Story = {
  render: () => {
    const editDiff = `--- a/packages/core/src/Button/Button.tsx
+++ b/packages/core/src/Button/Button.tsx
@@ -55,7 +55,7 @@ const styles = stylex.create({
     gap: spacingVars['--spacing-2'],
     paddingBlock: spacingVars['--spacing-2'],
     paddingInline: spacingVars['--spacing-3'],
-    '--button-radius': radiusVars['--radius-element'],
-    borderRadius: 'var(--button-radius)',
+    borderRadius: 'var(--button-radius, var(--radius-element))',
     fontFamily: 'inherit',
     fontSize: typeScaleVars['--text-label-size'],
     lineHeight: typeScaleVars['--text-label-leading'],
@@ -93,6 +93,10 @@ const styles = stylex.create({
     '--button-icon-only-aspect': '1 / 1',
     aspectRatio: 'var(--button-icon-only-aspect)',
   },
+  // Focus ring offset for accessibility
+  focusVisible: {
+    outline: '2px solid var(--color-ring-focus)',
+    outlineOffset: '2px',
+  },
 });`;

    const testOutput = `$ yarn test
 PASS  packages/core/src/Button/Button.test.tsx
 PASS  packages/core/src/Chat/ChatToolCalls.test.tsx
 PASS  packages/core/src/Chat/ChatComposerInput.test.tsx

Test Suites: 7 passed, 7 total
Tests:       67 passed, 67 total
Time:        6.1s`;

    return (
      <ChatToolCalls
        calls={[
          {
            name: 'edit',
            target: 'Button.tsx',
            status: 'complete',
            duration: '85ms',
            node: 'cli:remote-server',
            additions: 12,
            deletions: 3,
            resultDetail: (
              <CodeBlock
                code={editDiff}
                language="typescript"
                maxHeight="50vh"
              />
            ),
          },
          {
            name: 'bash',
            target: 'yarn test',
            status: 'complete',
            duration: '6.1s',
            node: 'cli:remote-server',
            resultDetail: (
              <CodeBlock code={testOutput} language="bash" maxHeight="50vh" />
            ),
          },
          {
            name: 'web_search',
            target: 'CSS anchor positioning',
            status: 'complete',
            duration: '1.8s',
          },
        ]}
      />
    );
  },
};

/** Error with modal — clicking a failed call shows error detail with banner */
export const ErrorWithDetail: Story = {
  render: () => {
    const errorOutput = `$ yarn test
 PASS  packages/core/src/Chat/ChatReasoning.test.tsx (7 tests)
 FAIL  packages/core/src/Chat/ChatToolCalls.test.tsx

  ● ChatToolCalls > renders group header for multiple calls

    ReferenceError: hasError is not defined

Test Suites: 1 failed, 6 passed, 7 total
Tests:       4 failed, 63 passed, 67 total
Time:        6.84s`;

    return (
      <ChatToolCalls
        calls={[
          {
            name: 'bash',
            target: 'yarn build',
            status: 'complete',
            duration: '8s',
            node: 'cli:remote-server',
          },
          {
            name: 'read',
            target: 'ChatToolCalls.tsx',
            status: 'complete',
            duration: '15ms',
            node: 'cli:remote-server',
          },
          {
            name: 'bash',
            target: 'yarn test',
            status: 'error',
            duration: '6.8s',
            node: 'cli:remote-server',
            errorMessage: '4 tests failed',
            resultDetail: (
              <CodeBlock code={errorOutput} language="bash" maxHeight="50vh" />
            ),
          },
        ]}
      />
    );
  },
};

/** All statuses — shows every status icon treatment side by side */
export const AllStatuses: Story = {
  render: () => (
    <ChatToolCalls
      calls={[
        {key: 'pending', name: 'bash', target: 'yarn build', status: 'pending'},
        {key: 'running', name: 'bash', target: 'yarn test', status: 'running'},
        {
          key: 'complete',
          name: 'edit',
          target: 'Button.tsx',
          status: 'complete',
          duration: '120ms',
          additions: 8,
          deletions: 2,
        },
        {
          key: 'error',
          name: 'bash',
          target: 'yarn lint',
          status: 'error',
          duration: '0.8s',
          errorMessage: '3 lint errors found',
        },
      ]}
    />
  ),
};
