// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Demonstrates the auto-scroll behavior difference between streaming text
 * and discrete block additions (tool calls, custom elements).
 *
 * Issue: https://github.com/meta/astryx/issues/2282
 *
 * The auto-scroll system (useChatStreamScroll + useChatNewMessages)
 * relies on ResizeObserver detecting content height changes. This story
 * isolates three scenarios:
 *
 * 1. Streaming text — continuous height growth, auto-scroll follows ✓
 * 2. Tool calls — discrete height jumps, auto-scroll may miss ✗
 * 3. Large custom elements — single large height change, may miss ✗
 */

import type {Meta, StoryObj} from '@storybook/react';
import {
  ChatLayout,
  ChatMessageList,
  ChatMessage,
  ChatToolCalls,
  ChatComposer,
  type ChatToolCallItem,
} from '@astryxdesign/core/Chat';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Badge} from '@astryxdesign/core/Badge';
import {useState, useCallback, useRef} from 'react';
import * as stylex from '@stylexjs/stylex';

const meta: Meta = {
  title: 'Core/ChatAutoScroll',
  tags: ['autodocs'],
  parameters: {layout: 'fullscreen'},
};
export default meta;

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  wrapper: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  controls: {
    display: 'flex',
    gap: 8,
    padding: 12,
    borderBottom: '1px solid #e5e5e5',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  statusPill: {
    marginInlineStart: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  customElement: {
    padding: 16,
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
  },
  customElementInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    borderRadius: 8,
    background: '#f3f4f6',
  },
});

// =============================================================================
// Helpers
// =============================================================================

const STREAMING_TEXT = `Let me analyze this codebase for you. I'll start by looking at the project structure and understanding the architecture.

The project uses a **monorepo** structure with the following key directories:

- \`packages/core/\` — Published core components and utilities
- \`packages/cli/\` — CLI tooling for scaffolding
- \`apps/storybook/\` — Storybook for component development
- \`apps/sandbox/\` — Sandbox testing app

Looking at the architecture more closely, the system follows a **plugin-based pattern** where components are composed through a unified swizzle system. This means any internal primitive can be overridden at any level.

The auto-scroll system uses \`useChatStreamScroll\` which provides spring-based scroll-to-bottom with lock/unlock behavior:

\`\`\`tsx
const scroll = useChatStreamScroll({scrollRef});
// scroll.isLocked — auto-following content
// scroll.scrollIfLocked() — call on resize
\`\`\`

This is paired with \`useChatNewMessages\` which observes the content element via ResizeObserver and calls \`scrollIfLocked()\` on every height change.

The key question is: **does the ResizeObserver fire reliably for all types of content additions?**`;

const TOOL_CALLS_SEQUENCE: ChatToolCallItem[][] = [
  [
    {
      key: '1',
      name: 'read',
      target: 'packages/core/src/Chat/useChatStreamScroll.ts',
      status: 'complete',
      duration: '42ms',
      node: 'astryx',
    },
  ],
  [
    {
      key: '2',
      name: 'bash',
      target: 'yarn test --filter Chat',
      status: 'complete',
      duration: '4.2s',
      node: 'astryx',
    },
  ],
  [
    {
      key: '3',
      name: 'edit',
      target: 'ChatLayout.tsx',
      status: 'complete',
      duration: '95ms',
      node: 'astryx',
      additions: 12,
      deletions: 3,
      resultDetail: (
        <CodeBlock
          code={`// Added MutationObserver supplement\nconst observer = new MutationObserver(() => {\n  scrollIfLocked();\n});\nobserver.observe(contentEl, { childList: true, subtree: true });`}
          language="typescript"
        />
      ),
    },
  ],
  [
    {
      key: '4',
      name: 'bash',
      target: 'yarn test',
      status: 'complete',
      duration: '8.1s',
      node: 'astryx',
      resultDetail: (
        <CodeBlock
          code={`$ yarn test\n✓ 142 tests passed (18 suites)\n\nTest Suites: 18 passed, 18 total\nTests:       142 passed, 142 total\nTime:        8.1s`}
          language="bash"
        />
      ),
    },
  ],
  [
    {
      key: '5',
      name: 'read',
      target: 'packages/core/src/Chat/useChatNewMessages.ts',
      status: 'complete',
      duration: '38ms',
      node: 'astryx',
    },
  ],
];

// =============================================================================
// Type for messages
// =============================================================================

type DemoMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: ChatToolCallItem[];
  customElement?: React.ReactNode;
  isStreaming?: boolean;
};

// =============================================================================
// Stories
// =============================================================================

/**
 * Demonstrates the auto-scroll issue: streaming text scrolls correctly,
 * but tool calls and custom elements may not trigger auto-scroll.
 *
 * Use the control buttons to add different content types and observe
 * whether the chat auto-scrolls to keep new content visible.
 */
export const ScrollBehaviorComparison: StoryObj = {
  name: 'Scroll Behavior Comparison',
  render: () => {
    const [messages, setMessages] = useState<DemoMessage[]>([
      {
        id: 1,
        role: 'user',
        text: 'Can you analyze the auto-scroll system and fix the issue with tool calls?',
      },
      {
        id: 2,
        role: 'assistant',
        text: "Sure, I'll look into the auto-scroll behavior. Let me start by reading the relevant files.\n\nThe scroll system uses `useChatStreamScroll` for spring-based scroll tracking and `useChatNewMessages` for content observation.",
      },
      {id: 3, role: 'user', text: 'Great, show me what you find.'},
    ]);
    const [isStreaming, setIsStreaming] = useState(false);
    const streamRef = useRef<ReturnType<typeof setInterval>>(undefined);
    const toolCallIndex = useRef(0);

    // --- Stream text (should auto-scroll) ---
    const handleStreamText = useCallback(() => {
      const msgId = Date.now();
      setIsStreaming(true);

      setMessages(prev => [
        ...prev,
        {id: msgId, role: 'assistant', text: '', isStreaming: true},
      ]);

      let charIdx = 0;
      streamRef.current = setInterval(() => {
        charIdx += 2 + Math.floor(Math.random() * 4);
        if (charIdx >= STREAMING_TEXT.length) {
          clearInterval(streamRef.current);
          setMessages(prev =>
            prev.map(m =>
              m.id === msgId
                ? {...m, text: STREAMING_TEXT, isStreaming: false}
                : m,
            ),
          );
          setIsStreaming(false);
          return;
        }
        setMessages(prev =>
          prev.map(m =>
            m.id === msgId ? {...m, text: STREAMING_TEXT.slice(0, charIdx)} : m,
          ),
        );
      }, 25);
    }, []);

    // --- Add tool calls one at a time (may fail to auto-scroll) ---
    const handleAddToolCall = useCallback(() => {
      const tools =
        TOOL_CALLS_SEQUENCE[toolCallIndex.current % TOOL_CALLS_SEQUENCE.length];
      toolCallIndex.current++;

      const msgId = Date.now();
      // First add with 'running' status
      setMessages(prev => [
        ...prev,
        {
          id: msgId,
          role: 'assistant',
          text: '',
          toolCalls: tools?.map(tc => ({
            ...tc,
            status: 'running' as const,
            duration: undefined,
          })),
        },
      ]);

      // After a delay, mark as complete
      setTimeout(() => {
        setMessages(prev =>
          prev.map(m => (m.id === msgId ? {...m, toolCalls: tools} : m)),
        );
      }, 1200);
    }, []);

    // --- Add batch of tool calls at once (most likely to miss scroll) ---
    const handleBatchToolCalls = useCallback(() => {
      const msgId = Date.now();
      const allCalls = TOOL_CALLS_SEQUENCE.flat().map((tc, i) => ({
        ...tc,
        key: `batch-${i}`,
      }));

      setMessages(prev => [
        ...prev,
        {
          id: msgId,
          role: 'assistant',
          text: 'Here are the results from my investigation:',
          toolCalls: allCalls,
        },
      ]);
    }, []);

    // --- Add a large custom element (simulates embedded widget) ---
    const handleAddCustomElement = useCallback(() => {
      const msgId = Date.now();
      setMessages(prev => [
        ...prev,
        {
          id: msgId,
          role: 'assistant',
          text: '',
          customElement: (
            <div {...stylex.props(styles.customElement)}>
              <Text type="label" weight="bold">
                Architecture Diagram
              </Text>
              <div {...stylex.props(styles.customElementInner)}>
                <Text type="body" color="secondary">
                  📊 Embedded visualization (200px tall custom element)
                </Text>
              </div>
              <CodeBlock
                code={`┌─────────────────────┐\n│  useChatStream   │\n│      Scroll         │\n├─────────────────────┤\n│ ResizeObserver ──►  │──► scrollIfLocked()\n│ (content height)    │\n└─────────────────────┘\n         ▲\n         │ fires on height change\n         │\n┌─────────────────────┐\n│ useChatNew       │\n│     Messages        │\n├─────────────────────┤\n│ observeResize() ──► │──► onResize callback\n│ (shared observer)   │\n└─────────────────────┘`}
                language="text"
              />
            </div>
          ),
        },
      ]);
    }, []);

    // --- Reset ---
    const handleReset = useCallback(() => {
      clearInterval(streamRef.current);
      setIsStreaming(false);
      toolCallIndex.current = 0;
      setMessages([
        {
          id: 1,
          role: 'user',
          text: 'Can you analyze the auto-scroll system and fix the issue with tool calls?',
        },
        {
          id: 2,
          role: 'assistant',
          text: "Sure, I'll look into the auto-scroll behavior. Let me start by reading the relevant files.\n\nThe scroll system uses `useChatStreamScroll` for spring-based scroll tracking and `useChatNewMessages` for content observation.",
        },
        {id: 3, role: 'user', text: 'Great, show me what you find.'},
      ]);
    }, []);

    return (
      <div {...stylex.props(styles.wrapper)}>
        {/* Control bar */}
        <div {...stylex.props(styles.controls)}>
          <Button
            label="Stream Text (works ✓)"
            variant="primary"
            size="sm"
            onClick={handleStreamText}
            isDisabled={isStreaming}
          />
          <Button
            label="Add Tool Call (may fail ✗)"
            variant="secondary"
            size="sm"
            onClick={handleAddToolCall}
          />
          <Button
            label="Batch Tool Calls (likely fails ✗)"
            variant="secondary"
            size="sm"
            onClick={handleBatchToolCalls}
          />
          <Button
            label="Add Custom Element (may fail ✗)"
            variant="secondary"
            size="sm"
            onClick={handleAddCustomElement}
          />
          <Button
            label="Reset"
            variant="ghost"
            size="sm"
            onClick={handleReset}
          />
          <div {...stylex.props(styles.statusPill)}>
            <Badge
              variant={isStreaming ? 'green' : 'neutral'}
              label={isStreaming ? 'Streaming' : 'Idle'}
            />
          </div>
        </div>
        {/* Chat area */}
        <ChatLayout
          composer={
            <ChatComposer
              onSubmit={() => {}}
              placeholder="Observe auto-scroll behavior above..."
              isStopShown={isStreaming}
            />
          }>
          <ChatMessageList>
            {messages.map(msg => (
              <ChatMessage key={msg.id} sender={msg.role}>
                {msg.text && (
                  <Markdown density="compact">{msg.text}</Markdown>
                )}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <ChatToolCalls calls={msg.toolCalls} />
                )}
                {msg.customElement}
              </ChatMessage>
            ))}
          </ChatMessageList>
        </ChatLayout>
      </div>
    );
  },
};

/**
 * Rapid tool call additions — fires 5 tool calls every 500ms to stress-test
 * the ResizeObserver + scrollIfLocked pathway.
 */
export const RapidToolCalls: StoryObj = {
  name: 'Rapid Tool Calls',
  render: () => {
    const [messages, setMessages] = useState<DemoMessage[]>([
      {
        id: 1,
        role: 'user',
        text: 'Run the full test suite across all packages.',
      },
    ]);
    const [isRunning, setIsRunning] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
    const counterRef = useRef(0);

    const handleStart = useCallback(() => {
      setIsRunning(true);
      counterRef.current = 0;

      intervalRef.current = setInterval(() => {
        counterRef.current++;
        if (counterRef.current > 10) {
          clearInterval(intervalRef.current);
          setIsRunning(false);
          return;
        }

        const msgId = Date.now() + counterRef.current;
        const toolNames = ['read', 'bash', 'edit', 'ipython', 'show'];
        const targets = [
          'Button.test.tsx',
          'yarn test --filter=Button',
          'Button.tsx +8 -2',
          'analyze_coverage()',
          'coverage-report.html',
        ];
        const idx = (counterRef.current - 1) % toolNames.length;

        setMessages(prev => [
          ...prev,
          {
            id: msgId,
            role: 'assistant',
            text: '',
            toolCalls: [
              {
                key: String(msgId),
                name: toolNames[idx] ?? 'read',
                target: targets[idx],
                status: 'running',
                node: 'astryx',
              },
            ],
          },
        ]);

        // Mark complete after 300ms
        setTimeout(() => {
          setMessages(prev =>
            prev.map(m =>
              m.id === msgId
                ? {
                    ...m,
                    toolCalls: [
                      {
                        key: String(msgId),
                        name: toolNames[idx] ?? 'read',
                        target: targets[idx],
                        status: 'complete' as const,
                        duration: `${(Math.random() * 3 + 0.1).toFixed(1)}s`,
                        node: 'astryx',
                      },
                    ],
                  }
                : m,
            ),
          );
        }, 300);
      }, 500);
    }, []);

    const handleStop = useCallback(() => {
      clearInterval(intervalRef.current);
      setIsRunning(false);
    }, []);

    const handleReset = useCallback(() => {
      clearInterval(intervalRef.current);
      setIsRunning(false);
      counterRef.current = 0;
      setMessages([
        {
          id: 1,
          role: 'user',
          text: 'Run the full test suite across all packages.',
        },
      ]);
    }, []);

    return (
      <div {...stylex.props(styles.wrapper)}>
        <div {...stylex.props(styles.controls)}>
          <Button
            label={isRunning ? 'Running...' : 'Start Rapid Tool Calls'}
            variant="primary"
            size="sm"
            onClick={handleStart}
            isDisabled={isRunning}
          />
          <Button
            label="Stop"
            variant="destructive"
            size="sm"
            onClick={handleStop}
            isDisabled={!isRunning}
          />
          <Button
            label="Reset"
            variant="ghost"
            size="sm"
            onClick={handleReset}
          />
          <div {...stylex.props(styles.statusPill)}>
            <Badge
              variant={isRunning ? 'yellow' : 'neutral'}
              label={
                isRunning
                  ? `Tool call ${counterRef.current}/10`
                  : `${messages.length - 1} messages`
              }
            />
          </div>
        </div>

        <ChatLayout
          composer={
            <ChatComposer
              onSubmit={() => {}}
              placeholder="Watch scroll behavior..."
            />
          }>
          <ChatMessageList>
            {messages.map(msg => (
              <ChatMessage key={msg.id} sender={msg.role}>
                {msg.text && (
                  <Markdown density="compact">{msg.text}</Markdown>
                )}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <ChatToolCalls calls={msg.toolCalls} />
                )}
              </ChatMessage>
            ))}
          </ChatMessageList>
        </ChatLayout>
      </div>
    );
  },
};

/**
 * Mixed content — alternates between streaming text and tool call blocks,
 * showing the transition points where scroll may break.
 */
export const MixedStreamAndTools: StoryObj = {
  name: 'Mixed Stream + Tools',
  render: () => {
    const [messages, setMessages] = useState<DemoMessage[]>([
      {id: 1, role: 'user', text: 'Fix the focus ring and run the tests.'},
    ]);
    const [phase, setPhase] = useState<'idle' | 'streaming' | 'tools' | 'done'>(
      'idle',
    );
    const streamRef = useRef<ReturnType<typeof setInterval>>(undefined);

    const handleRun = useCallback(() => {
      setPhase('streaming');
      const msgId = Date.now();
      const introText =
        "Let me look at the Button component's focus styles and fix the ring.\n\nI can see the issue — the focus ring uses a hardcoded color instead of the theme token. Let me fix that and run the tests.";

      setMessages(prev => [
        ...prev,
        {id: msgId, role: 'assistant', text: '', isStreaming: true},
      ]);

      let i = 0;
      streamRef.current = setInterval(() => {
        i += 3 + Math.floor(Math.random() * 4);
        if (i >= introText.length) {
          clearInterval(streamRef.current);
          setMessages(prev =>
            prev.map(m =>
              m.id === msgId ? {...m, text: introText, isStreaming: false} : m,
            ),
          );

          // Transition to tool calls
          setPhase('tools');
          setTimeout(() => {
            const toolMsgId = Date.now();
            setMessages(prev => [
              ...prev,
              {
                id: toolMsgId,
                role: 'assistant',
                text: '',
                toolCalls: [
                  {
                    key: '1',
                    name: 'edit',
                    target: 'Button.tsx',
                    status: 'running',
                    node: 'astryx',
                  },
                ],
              },
            ]);

            setTimeout(() => {
              setMessages(prev =>
                prev.map(m =>
                  m.id === toolMsgId
                    ? {
                        ...m,
                        toolCalls: [
                          {
                            key: '1',
                            name: 'edit',
                            target: 'Button.tsx',
                            status: 'complete',
                            duration: '92ms',
                            node: 'astryx',
                            additions: 4,
                            deletions: 2,
                            resultDetail: (
                              <CodeBlock
                                code={`- outline: 2px solid blue;\n+ outline: 2px solid var(--color-ring-focus);\n+ outline-offset: 2px;`}
                                language="diff"
                              />
                            ),
                          },
                        ],
                      }
                    : m,
                ),
              );

              // Second tool call
              setTimeout(() => {
                const testMsgId = Date.now();
                setMessages(prev => [
                  ...prev,
                  {
                    id: testMsgId,
                    role: 'assistant',
                    text: '',
                    toolCalls: [
                      {
                        key: '2',
                        name: 'bash',
                        target: 'yarn test --filter Button',
                        status: 'running',
                        node: 'astryx',
                      },
                    ],
                  },
                ]);

                setTimeout(() => {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === testMsgId
                        ? {
                            ...m,
                            toolCalls: [
                              {
                                key: '2',
                                name: 'bash',
                                target: 'yarn test --filter Button',
                                status: 'complete',
                                duration: '3.8s',
                                node: 'astryx',
                                resultDetail: (
                                  <CodeBlock
                                    code={`✓ 24 tests passed\n\nTest Suites: 3 passed, 3 total\nTests:       24 passed, 24 total`}
                                    language="bash"
                                  />
                                ),
                              },
                            ],
                          }
                        : m,
                    ),
                  );

                  // Final streaming summary
                  setTimeout(() => {
                    const summaryId = Date.now();
                    const summaryText =
                      'Done! The focus ring now uses the theme token `var(--color-ring-focus)` with a 2px offset. All 24 tests pass.\n\nThe fix ensures the ring adapts to different themes automatically — no more hardcoded blue.';
                    setMessages(prev => [
                      ...prev,
                      {
                        id: summaryId,
                        role: 'assistant',
                        text: '',
                        isStreaming: true,
                      },
                    ]);

                    let j = 0;
                    streamRef.current = setInterval(() => {
                      j += 3 + Math.floor(Math.random() * 4);
                      if (j >= summaryText.length) {
                        clearInterval(streamRef.current);
                        setMessages(prev =>
                          prev.map(m =>
                            m.id === summaryId
                              ? {...m, text: summaryText, isStreaming: false}
                              : m,
                          ),
                        );
                        setPhase('done');
                        return;
                      }
                      setMessages(prev =>
                        prev.map(m =>
                          m.id === summaryId
                            ? {...m, text: summaryText.slice(0, j)}
                            : m,
                        ),
                      );
                    }, 25);
                  }, 600);
                }, 2000);
              }, 800);
            }, 1500);
          }, 500);

          return;
        }
        setMessages(prev =>
          prev.map(m =>
            m.id === msgId ? {...m, text: introText.slice(0, i)} : m,
          ),
        );
      }, 25);
    }, []);

    const handleReset = useCallback(() => {
      clearInterval(streamRef.current);
      setPhase('idle');
      setMessages([
        {id: 1, role: 'user', text: 'Fix the focus ring and run the tests.'},
      ]);
    }, []);

    return (
      <div {...stylex.props(styles.wrapper)}>
        <div {...stylex.props(styles.controls)}>
          <Button
            label="Run Full Sequence"
            variant="primary"
            size="sm"
            onClick={handleRun}
            isDisabled={phase !== 'idle' && phase !== 'done'}
          />
          <Button
            label="Reset"
            variant="ghost"
            size="sm"
            onClick={handleReset}
          />
          <div {...stylex.props(styles.statusPill)}>
            <Badge
              variant={
                phase === 'streaming'
                  ? 'green'
                  : phase === 'tools'
                    ? 'yellow'
                    : 'neutral'
              }
              label={
                phase === 'idle'
                  ? 'Ready'
                  : phase === 'streaming'
                    ? 'Streaming text...'
                    : phase === 'tools'
                      ? 'Adding tool calls...'
                      : 'Complete'
              }
            />
          </div>
        </div>

        <ChatLayout
          composer={
            <ChatComposer
              onSubmit={() => {}}
              placeholder="Watch the transition from streaming → tool calls..."
            />
          }>
          <ChatMessageList>
            {messages.map(msg => (
              <ChatMessage key={msg.id} sender={msg.role}>
                {msg.text && (
                  <Markdown density="compact">{msg.text}</Markdown>
                )}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <ChatToolCalls calls={msg.toolCalls} />
                )}
              </ChatMessage>
            ))}
          </ChatMessageList>
        </ChatLayout>
      </div>
    );
  },
};
