// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  ChatComposer,
  ChatComposerInput,
  type ChatComposerInputHandle,
  type ChatComposerTrigger,
} from '@astryxdesign/core/Chat';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import {Badge} from '@astryxdesign/core/Badge';
import {TypeaheadItem} from '@astryxdesign/core/Typeahead';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';
import {expect, fireEvent, userEvent, within} from 'storybook/test';
import {useRef, useState} from 'react';

const meta: Meta = {
  title: 'Core/ChatComposerInput',
  component: ChatComposerInput,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div style={{width: 600, padding: 40}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj;

// =============================================================================
// Mock data
// =============================================================================

const USERS: SearchableItem<{role: string}>[] = [
  {id: 'cindy', label: 'Cindy Zhang', auxiliaryData: {role: 'Design Systems'}},
  {id: 'alex', label: 'Alex Johnson', auxiliaryData: {role: 'Frontend'}},
  {id: 'sam', label: 'Sam Rivera', auxiliaryData: {role: 'Backend'}},
  {id: 'jordan', label: 'Jordan Lee', auxiliaryData: {role: 'Product'}},
  {id: 'taylor', label: 'Taylor Kim', auxiliaryData: {role: 'Design'}},
  {id: 'morgan', label: 'Morgan Chen', auxiliaryData: {role: 'Infrastructure'}},
  {
    id: 'maria',
    label: 'María José García de la Fuente',
    auxiliaryData: {role: 'Research'},
  },
  {
    id: 'rdj',
    label: 'Robert Downey Jr.',
    auxiliaryData: {role: 'Guest Speaker'},
  },
  {id: 'q4_review', label: 'Design Review: Q4', auxiliaryData: {role: 'Topic'}},
];

const COMMANDS: SearchableItem<{description: string}>[] = [
  {
    id: 'summarize',
    label: 'summarize',
    auxiliaryData: {description: 'Summarize the conversation'},
  },
  {
    id: 'translate',
    label: 'translate',
    auxiliaryData: {description: 'Translate text to another language'},
  },
  {
    id: 'search',
    label: 'search',
    auxiliaryData: {description: 'Search the web or documents'},
  },
  {
    id: 'code',
    label: 'code',
    auxiliaryData: {description: 'Generate or explain code'},
  },
  {
    id: 'help',
    label: 'help',
    auxiliaryData: {description: 'Show available commands'},
  },
];

const userSource = createStaticSource(USERS);
const commandSource = createStaticSource(COMMANDS);

const EMOJIS: SearchableItem[] = [
  {id: 'smile', label: 'smile (😄)'},
  {id: 'heart', label: 'heart (❤️)'},
  {id: 'thumbsup', label: 'thumbsup (👍)'},
  {id: 'fire', label: 'fire (🔥)'},
  {id: 'rocket', label: 'rocket (🚀)'},
  {id: 'sparkles', label: 'sparkles (✨)'},
];
const emojiSource = createStaticSource(EMOJIS);

const asyncUserSource: SearchSource = {
  search(query: string) {
    return new Promise(resolve => {
      setTimeout(() => {
        const lower = query.toLowerCase();
        resolve(USERS.filter(u => u.label.toLowerCase().includes(lower)));
      }, 300);
    });
  },
  bootstrap() {
    return USERS;
  },
};

// =============================================================================
// Basic input stories
// =============================================================================

/** Controlled value — shows the serialized value below */
export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
        <ChatComposer
          onSubmit={v => {
            alert(`Submitted: ${v}`);
            setValue('');
          }}
          value={value}
          onChange={setValue}
          input={
            <ChatComposerInput
              value={value}
              onChange={setValue}
              placeholder="Type a message..."
            />
          }
        />
        <div
          style={{
            fontSize: 12,
            fontFamily: 'monospace',
            color: 'var(--color-text-secondary)',
          }}>
          Value: {JSON.stringify(value)}
        </div>
      </div>
    );
  },
};

/** Custom placeholder */
export const CustomPlaceholder: Story = {
  render: () => (
    <ChatComposer
      onSubmit={v => alert(v)}
      input={
        <ChatComposerInput placeholder="Ask me anything about Astryx..." />
      }
    />
  ),
};

/** Disabled state */
export const Disabled: Story = {
  render: () => (
    <ChatComposer
      onSubmit={() => {}}
      isDisabled
      input={<ChatComposerInput isDisabled placeholder="Input is disabled" />}
    />
  ),
};

/**
 * Toggling `isDisabled` on an empty input must not change its own height —
 * an empty disabled editable region stops reserving its line in Chromium,
 * and the absolutely positioned placeholder standing in for it doesn't
 * contribute to layout height, so without an explicit floor the root
 * shrinks by its own padding and shifts anything bottom-aligned beside it
 * (#6651).
 */
function DisabledHeightToggleExample() {
  const [isDisabled, setIsDisabled] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setIsDisabled(value => !value)}>
        Toggle disabled: {String(isDisabled)}
      </button>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'end',
          gap: 12,
          padding: 12,
          border: '1px solid gray',
          width: 360,
        }}>
        <ChatComposerInput
          value=""
          onChange={() => {}}
          placeholder="Type a message…"
          label="Reproduction input"
          isDisabled={isDisabled}
        />
        <button type="button" style={{width: 36, height: 36}}>
          ↑
        </button>
      </div>
    </div>
  );
}

export const DisabledHeightToggle: Story = {
  render: () => <DisabledHeightToggleExample />,
};

/** Max rows — scrolls after 3 lines */
export const MaxRows: Story = {
  render: () => (
    <ChatComposer
      onSubmit={v => alert(v)}
      input={
        <ChatComposerInput
          maxRows={3}
          placeholder="Type a long message — scrolls after 3 lines..."
        />
      }
    />
  ),
};

/** Message history — submit a few messages, then ArrowUp/Down to recall */
export const MessageHistory: Story = {
  render: () => {
    const [log, setLog] = useState<string[]>([]);
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
        <ChatComposer
          onSubmit={v => setLog(prev => [...prev, v])}
          input={
            <ChatComposerInput placeholder="Submit messages, then ArrowUp to recall..." />
          }
        />
        {log.length > 0 && (
          <div
            style={{
              fontSize: 12,
              fontFamily: 'monospace',
              color: 'var(--color-text-secondary)',
            }}>
            {log.map((msg, i) => (
              <div key={i}>→ {msg}</div>
            ))}
          </div>
        )}
      </div>
    );
  },
};

/** File paste handler */
export const FilePaste: Story = {
  render: () => {
    const [files, setFiles] = useState<string[]>([]);
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
        <ChatComposer
          onSubmit={v => alert(v)}
          input={
            <ChatComposerInput
              onFiles={f => setFiles(prev => [...prev, ...f.map(x => x.name)])}
              placeholder="Paste files here (Ctrl+V)..."
            />
          }
        />
        {files.length > 0 && (
          <div style={{fontSize: 12, color: 'var(--color-text-secondary)'}}>
            Files: {files.join(', ')}
          </div>
        )}
      </div>
    );
  },
};

/** Programmatic text follows the same observable draft path as typing. */
export const ImperativeInsertion: Story = {
  render: () => {
    const inputRef = useRef<ChatComposerInputHandle>(null);
    const [value, setValue] = useState('');
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
        <ChatComposer
          value={value}
          onChange={setValue}
          onSubmit={() => {}}
          input={
            <ChatComposerInput
              handleRef={inputRef}
              placeholder="Waiting for dictated text"
            />
          }
        />
        <button
          type="button"
          onClick={() => {
            inputRef.current?.focus();
            inputRef.current?.insertText('Dictated text');
          }}>
          Insert dictated text
        </button>
        <output aria-label="Serialized draft">{value || 'Empty'}</output>
      </div>
    );
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', {name: 'Insert dictated text'}),
    );
    await expect(canvas.getByRole('textbox')).toHaveTextContent(
      'Dictated text',
    );
    await expect(
      canvas.getByRole('status', {name: 'Serialized draft'}),
    ).toHaveTextContent('Dictated text');
    await expect(
      canvas.queryByText('Waiting for dictated text'),
    ).not.toBeInTheDocument();
  },
};

/** Dropped files reach the same attachment callback as pasted files. */
export const FileDrop: Story = {
  render: () => {
    const [files, setFiles] = useState<string[]>([]);
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
        <ChatComposer
          onSubmit={() => {}}
          input={
            <ChatComposerInput
              onFiles={next => setFiles(next.map(file => file.name))}
              placeholder="Drop a file here"
            />
          }
        />
        <output aria-label="Received files">
          {files.length === 0 ? 'No files' : files.join(', ')}
        </output>
      </div>
    );
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    const textbox = canvas.getByRole('textbox');
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(['audit'], 'dropped.txt', {type: 'text/plain'}),
    );

    fireEvent.dragOver(textbox, {dataTransfer: transfer});
    fireEvent.drop(textbox, {dataTransfer: transfer});

    await expect(
      canvas.getByRole('status', {name: 'Received files'}),
    ).toHaveTextContent('dropped.txt');
  },
};

// =============================================================================
// Trigger stories
// =============================================================================

/** Static @ mentions — type @ to see the menu */
export const MentionTrigger: Story = {
  render: () => {
    const [value, setValue] = useState('');
    const [log, setLog] = useState<string[]>([]);
    const mentionTrigger: ChatComposerTrigger = {
      character: '@',
      searchSource: userSource,
      hasMultiWordQuery: true,
      renderItem: item => (
        <TypeaheadItem
          item={item}
          description={(item.auxiliaryData as {role: string})?.role}
        />
      ),
      onSelect: item => ({
        value: `@${item.id}`,
        label: item.label,
        variant: 'blue' as const,
      }),
    };

    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <ChatComposer
          onSubmit={v => {
            setLog(prev => [...prev, v]);
            setValue('');
          }}
          input={
            <ChatComposerInput
              value={value}
              onChange={setValue}
              triggers={[mentionTrigger]}
              placeholder="Type @ to mention someone..."
            />
          }
        />
        <div
          style={{
            fontSize: 12,
            fontFamily: 'monospace',
            color: 'var(--color-text-secondary)',
          }}>
          Value: {JSON.stringify(value)}
        </div>
        {log.length > 0 && (
          <div
            style={{
              fontSize: 12,
              fontFamily: 'monospace',
              color: 'var(--color-text-secondary)',
            }}>
            {log.map((msg, i) => (
              <div key={i}>→ {msg}</div>
            ))}
          </div>
        )}
      </div>
    );
  },
};

/** Static / commands — type / to see commands */
export const SlashCommands: Story = {
  render: () => {
    const commandTrigger: ChatComposerTrigger = {
      character: '/',
      searchSource: commandSource,
      renderItem: item => (
        <TypeaheadItem
          item={item}
          description={
            (item.auxiliaryData as {description: string})?.description
          }
        />
      ),
      onSelect: item => ({
        value: `/${item.label}`,
        label: `/${item.label}`,
        variant: 'yellow' as const,
      }),
    };

    return (
      <ChatComposer
        onSubmit={value => alert(`Sent: ${value}`)}
        input={
          <ChatComposerInput
            triggers={[commandTrigger]}
            placeholder="Type / for commands..."
          />
        }
      />
    );
  },
};

/** Async search source — type @ to trigger a simulated API search */
export const AsyncSearch: Story = {
  render: () => {
    const asyncTrigger: ChatComposerTrigger = {
      character: '@',
      searchSource: asyncUserSource,
      onSelect: item => ({
        value: `@${item.id}`,
        label: item.label,
        variant: 'blue' as const,
      }),
      loadingText: 'Searching users…',
      emptySearchText: 'No users found',
    };

    return (
      <ChatComposer
        onSubmit={value => alert(`Sent: ${value}`)}
        input={
          <ChatComposerInput
            triggers={[asyncTrigger]}
            placeholder="Type @ for async user search (300ms delay)..."
          />
        }
      />
    );
  },
};

/** Multiple triggers — @ for mentions, / for commands */
export const MultipleTriggers: Story = {
  render: () => {
    const [value, setValue] = useState('');
    const mentionTrigger: ChatComposerTrigger = {
      character: '@',
      searchSource: userSource,
      hasMultiWordQuery: true,
      onSelect: item => ({
        value: `@${item.id}`,
        label: item.label,
        variant: 'blue' as const,
      }),
    };
    const commandTrigger: ChatComposerTrigger = {
      character: '/',
      searchSource: commandSource,
      onSelect: item => ({
        value: `/${item.label}`,
        label: `/${item.label}`,
        variant: 'yellow' as const,
      }),
    };

    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
        <ChatComposer
          onSubmit={v => {
            alert(`Sent: ${v}`);
            setValue('');
          }}
          input={
            <ChatComposerInput
              value={value}
              onChange={setValue}
              triggers={[mentionTrigger, commandTrigger]}
              placeholder="Type @ or / ..."
            />
          }
        />
        <div
          style={{
            fontSize: 12,
            fontFamily: 'monospace',
            color: 'var(--color-text-secondary)',
          }}>
          Value: {JSON.stringify(value)}
        </div>
      </div>
    );
  },
};

/** Custom item rendering in the trigger menu */
export const CustomRenderItem: Story = {
  render: () => {
    const mentionTrigger: ChatComposerTrigger = {
      character: '@',
      searchSource: userSource,
      renderItem: item => (
        <TypeaheadItem
          item={item}
          description={(item.auxiliaryData as {role: string})?.role}
          icon={
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: '#e8d5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                color: '#7c3aed',
              }}>
              {item.label.charAt(0)}
            </div>
          }
        />
      ),
      onSelect: item => ({
        value: `@${item.id}`,
        label: item.label,
        variant: 'purple' as const,
        icon: (
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: '#e8d5f5',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 8,
              fontWeight: 700,
              color: '#7c3aed',
            }}>
            {item.label.charAt(0)}
          </span>
        ),
      }),
    };

    return (
      <ChatComposer
        onSubmit={value => alert(`Sent: ${value}`)}
        input={
          <ChatComposerInput
            triggers={[mentionTrigger]}
            placeholder="Type @ — tokens have icons via badge config..."
          />
        }
      />
    );
  },
};

/** Token color variants — different badge colors per trigger */
export const TokenVariants: Story = {
  render: () => {
    const mentionTrigger: ChatComposerTrigger = {
      character: '@',
      searchSource: userSource,
      onSelect: item => ({
        value: `@${item.id}`,
        label: item.label,
        variant: 'blue' as const,
      }),
    };
    const commandTrigger: ChatComposerTrigger = {
      character: '/',
      searchSource: commandSource,
      onSelect: item => ({
        value: `/${item.label}`,
        label: `/${item.label}`,
        variant: 'purple' as const,
      }),
    };

    return (
      <ChatComposer
        onSubmit={value => alert(`Sent: ${value}`)}
        input={
          <ChatComposerInput
            triggers={[mentionTrigger, commandTrigger]}
            placeholder="@ for blue mentions, / for purple commands..."
          />
        }
      />
    );
  },
};

/** Custom render — full control via render() for rich token content */
export const CustomRender: Story = {
  render: () => {
    const mentionTrigger: ChatComposerTrigger = {
      character: '@',
      searchSource: userSource,
      renderItem: item => (
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: '#e0e0e0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 600,
            }}>
            {item.label.charAt(0)}
          </div>
          <span>{item.label}</span>
        </div>
      ),
      onSelect: item => ({
        value: `@${item.id}`,
        render: () => (
          <span
            title={`Click to view ${item.label}'s profile`}
            style={{cursor: 'pointer'}}
            onClick={() => alert(`Profile: ${item.label}`)}>
            <Badge
              variant="blue"
              label={item.label}
              icon={
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    backgroundColor: '#c4d4f0',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 8,
                    fontWeight: 700,
                  }}>
                  {item.label.charAt(0)}
                </span>
              }
            />
          </span>
        ),
      }),
    };

    return (
      <ChatComposer
        onSubmit={value => alert(`Sent: ${value}`)}
        input={
          <ChatComposerInput
            triggers={[mentionTrigger]}
            placeholder="Type @ — tokens are clickable with avatars..."
          />
        }
      />
    );
  },
};

/** Grouped menu items — items with auxiliaryData.group render under headings */
export const GroupedItems: Story = {
  render: () => {
    const groupedUsers = createStaticSource([
      {
        id: 'cindy',
        label: 'Cindy Zhang',
        auxiliaryData: {group: 'Design', role: 'Design Systems'},
      },
      {
        id: 'taylor',
        label: 'Taylor Kim',
        auxiliaryData: {group: 'Design', role: 'Product Design'},
      },
      {
        id: 'alex',
        label: 'Alex Johnson',
        auxiliaryData: {group: 'Engineering', role: 'Frontend'},
      },
      {
        id: 'sam',
        label: 'Sam Rivera',
        auxiliaryData: {group: 'Engineering', role: 'Backend'},
      },
      {
        id: 'morgan',
        label: 'Morgan Chen',
        auxiliaryData: {group: 'Engineering', role: 'Infrastructure'},
      },
      {
        id: 'jordan',
        label: 'Jordan Lee',
        auxiliaryData: {group: 'Product', role: 'Product Manager'},
      },
    ] as SearchableItem[]);

    const mentionTrigger: ChatComposerTrigger = {
      character: '@',
      searchSource: groupedUsers,
      renderItem: item => (
        <TypeaheadItem
          item={item}
          description={(item.auxiliaryData as {role?: string})?.role}
        />
      ),
      onSelect: item => ({
        value: `@${item.id}`,
        label: item.label,
        variant: 'blue' as const,
      }),
    };

    return (
      <ChatComposer
        onSubmit={value => alert(`Sent: ${value}`)}
        input={
          <ChatComposerInput
            triggers={[mentionTrigger]}
            placeholder="Type @ to see grouped mentions..."
          />
        }
      />
    );
  },
};

/** Punctuation trigger (e.g. emoji picker) — type : to see the menu */
export const PunctuationTrigger: Story = {
  render: () => {
    const emojiTrigger: ChatComposerTrigger = {
      character: ':',
      searchSource: emojiSource,
      renderItem: item => <TypeaheadItem item={item} />,
      onSelect: item => `:${item.id}: `,
    };

    return (
      <ChatComposer
        onSubmit={value => alert(`Sent: ${value}`)}
        input={
          <ChatComposerInput
            triggers={[emojiTrigger]}
            placeholder="Type : to see emoji suggestions..."
          />
        }
      />
    );
  },
};
