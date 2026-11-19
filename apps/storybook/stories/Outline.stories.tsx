// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useRef, useState, type ReactNode} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  Outline,
  useOutlineFromDOM,
  useOutlineFromMarkdown,
} from '@astryxdesign/core/Outline';
import type {OutlineItem} from '@astryxdesign/core/Outline';
import {Badge} from '@astryxdesign/core/Badge';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Heading, Text} from '@astryxdesign/core/Text';

const meta: Meta<typeof Outline> = {
  title: 'Core/Outline',
  component: Outline,
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Accessible label for the nav landmark',
    },
    activeId: {
      control: 'text',
      description: 'Controlled active item id',
    },
    density: {
      control: 'radio',
      options: ['default', 'compact'],
      description: 'Density variant',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Outline>;

const outlineItems: OutlineItem[] = [
  {id: 'overview', label: 'Overview', level: 2},
  {id: 'installation', label: 'Installation', level: 2},
  {id: 'theming', label: 'Theming', level: 2},
  {id: 'tokens', label: 'Tokens', level: 3},
  {id: 'component-overrides', label: 'Component overrides', level: 3},
  {id: 'accessibility', label: 'Accessibility', level: 2},
];

/** Height of the ScrollSpy story's sticky header — fed straight to `offset`. */
const STICKY_HEADER_HEIGHT = 48;

const markdownContent = [
  '## Overview',
  '',
  'Astryx gives teams a consistent foundation for internal product surfaces.',
  '',
  '## Installation',
  '',
  'Install the package and wrap the app in an Theme provider.',
  '',
  '### Package setup',
  '',
  'Import components from their component subpaths for clear ownership.',
  '',
  '### Theme setup',
  '',
  'Use a built theme in production so component overrides are present at first paint.',
  '',
  '## Accessibility',
  '',
  'Components include semantic roles, labels, and focus behavior where applicable.',
].join('\n');

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(nodeText).join('');
  }
  return '';
}

function storySlug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/['\u201C\u201D"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

export const Basic: Story = {
  args: {
    items: outlineItems,
  },
};

export const Controlled: Story = {
  args: {
    items: outlineItems,
    activeId: 'tokens',
  },
};

/** Compact density variant — reduced spacing for dense UIs */
export const Compact: Story = {
  args: {
    items: outlineItems,
    activeId: 'installation',
    density: 'compact',
  },
};

export const WithDocument: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 220px',
        gap: 32,
        maxWidth: 960,
      }}>
      <article style={{display: 'grid', gap: 24}}>
        <section>
          <h2 id="overview">Overview</h2>
          <p>
            Astryx components provide consistent interaction, styling, and theme
            behavior for internal tools.
          </p>
        </section>
        <section>
          <h2 id="installation">Installation</h2>
          <p>
            Install the package, wrap the app with Theme, and import components
            from their subpaths.
          </p>
        </section>
        <section>
          <h2 id="theming">Theming</h2>
          <p>
            Themes define semantic tokens and component overrides without
            changing app code.
          </p>
          <h3 id="tokens">Tokens</h3>
          <p>
            Use semantic color, spacing, typography, radius, elevation, and
            motion tokens.
          </p>
          <h3 id="component-overrides">Component overrides</h3>
          <p>
            Component overrides target the stable Astryx selector surface
            emitted by each component: astryx-* classes plus data-* prop
            reflections.
          </p>
        </section>
        <section>
          <h2 id="accessibility">Accessibility</h2>
          <p>
            Components include landmark, keyboard, focus, and ARIA behavior
            where applicable.
          </p>
        </section>
      </article>
      <aside style={{position: 'sticky', top: 24, alignSelf: 'start'}}>
        <Outline items={outlineItems} />
      </aside>
    </div>
  ),
};

export const ExtractFromMarkdown: Story = {
  render: () => {
    const items = useOutlineFromMarkdown(markdownContent);

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 220px',
          gap: 32,
          maxWidth: 960,
        }}>
        <Markdown
          components={{
            heading: ({level, children}) => {
              const Tag = `h${level}` as
                'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
              return <Tag id={storySlug(nodeText(children))}>{children}</Tag>;
            },
          }}>
          {markdownContent}
        </Markdown>
        <aside style={{position: 'sticky', top: 24, alignSelf: 'start'}}>
          <Outline items={items} />
        </aside>
      </div>
    );
  },
};

export const ExtractFromHTML: Story = {
  render: () => {
    const contentRef = useRef<HTMLElement | null>(null);
    const items = useOutlineFromDOM(contentRef);

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 220px',
          gap: 32,
          maxWidth: 960,
        }}>
        <article ref={contentRef} style={{display: 'grid', gap: 24}}>
          <section>
            <Heading id="account-settings" level={2}>
              Account settings
            </Heading>
            <Text type="body">
              Manage profile, authentication, and workspace preferences.
            </Text>
            <div style={{display: 'flex', gap: 8, marginTop: 12}}>
              <Badge variant="success" label="Active" />
              <Badge variant="neutral" label="Workspace" />
            </div>
          </section>
          <section>
            <Heading id="notifications" level={2}>
              Notifications
            </Heading>
            <Text type="body">
              Choose which product events should notify the team.
            </Text>
            <Heading id="email-alerts" level={3}>
              Email alerts
            </Heading>
            <Text type="body">
              Use email for low-frequency summaries and approvals.
            </Text>
            <Heading id="push-alerts" level={3}>
              Push alerts
            </Heading>
            <Text type="body">
              Use push for time-sensitive updates and incidents.
            </Text>
          </section>
          <section>
            <Heading id="billing" level={2}>
              Billing
            </Heading>
            <Text type="body">
              Review invoices, payment methods, and usage limits.
            </Text>
          </section>
        </article>
        <aside style={{position: 'sticky', top: 24, alignSelf: 'start'}}>
          <Outline items={items} />
        </aside>
      </div>
    );
  },
};

/** Deep nesting with multiple indent levels */
export const DeepNesting: Story = {
  render: () => {
    const items: OutlineItem[] = [
      {id: 'chapter-1', label: 'Chapter 1', level: 1},
      {id: 'section-1-1', label: 'Section 1.1', level: 2},
      {id: 'subsection-1-1-1', label: 'Subsection 1.1.1', level: 3},
      {id: 'subsection-1-1-2', label: 'Subsection 1.1.2', level: 3},
      {id: 'section-1-2', label: 'Section 1.2', level: 2},
      {id: 'chapter-2', label: 'Chapter 2', level: 1},
      {id: 'section-2-1', label: 'Section 2.1', level: 2},
    ];

    return (
      <div style={{width: 240}}>
        <Outline items={items} activeId="subsection-1-1-1" />
      </div>
    );
  },
};

/**
 * Scroll-spy scoped to a custom scroll container, under a sticky header.
 *
 * The content scrolls inside the pane, not the viewport — so the outline would
 * auto-detect the wrong scroll root and its highlight would never move.
 * `scrollContainerRef` scopes tracking to the pane.
 *
 * `offset` is the height of the sticky header covering the top of that pane.
 * It moves the activation line *and* the scroll landing together, so clicking
 * an item parks its heading just below the header instead of hidden underneath
 * it — and the heading activates at the same line it lands on. The heading's
 * own `scroll-margin-top` adds the breathing room below the header (8px here),
 * so the two compose: 48 + 8 = 56px.
 */
export const ScrollSpy: Story = {
  render: () => {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 220px',
          gap: 32,
          maxWidth: 960,
        }}>
        <div
          ref={scrollContainerRef}
          // The pane scrolls but contains nothing focusable, so it needs a
          // tab stop and a name for keyboard scrolling (axe:
          // scrollable-region-focusable).
          tabIndex={0}
          role="region"
          aria-label="Article content"
          style={{
            overflowY: 'auto',
            height: 360,
            border: '1px solid rgba(128,128,128,0.3)',
            borderRadius: 8,
            position: 'relative',
          }}>
          <div
            style={{
              position: 'sticky',
              top: 0,
              height: STICKY_HEADER_HEIGHT,
              boxSizing: 'border-box',
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              background: 'var(--color-surface, #fff)',
              borderBottom: '1px solid rgba(128,128,128,0.3)',
              zIndex: 1,
            }}>
            <Badge label={`Sticky header (${STICKY_HEADER_HEIGHT}px)`} />
          </div>
          <div style={{padding: '0 16px 16px'}}>
            {outlineItems.map(item => (
              <section key={item.id}>
                {/* scroll-margin-top must sit on the element the outline
                    targets — the heading carries the id, so the browser reads
                    it from there, not from a wrapper. */}
                <Heading
                  id={item.id}
                  level={item.level === 2 ? 2 : 3}
                  style={{scrollMarginTop: 8}}>
                  {item.label}
                </Heading>
                <Text>
                  Scroll the pane. The outline tracks the pane&apos;s scroll
                  position, not the window&apos;s.
                </Text>
                <div style={{height: 160}} />
              </section>
            ))}
          </div>
        </div>
        <aside style={{alignSelf: 'start'}}>
          <Outline
            items={outlineItems}
            scrollContainerRef={scrollContainerRef}
            offset={STICKY_HEADER_HEIGHT}
          />
        </aside>
      </div>
    );
  },
};

/**
 * Navigate callbacks. `onNavigateStart` fires before the smooth scroll begins
 * and `onNavigateEnd` once it settles — here it flashes the heading on arrival.
 *
 * `onNavigateEnd` fires exactly once for every `onNavigateStart`, including
 * when the user scrolls away mid-jump, so the flash state can never get stuck.
 */
export const NavigateCallbacks: Story = {
  render: () => {
    const [status, setStatus] = useState('idle');
    const [flashId, setFlashId] = useState<string | null>(null);

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 220px',
          gap: 32,
          maxWidth: 960,
        }}>
        <article>
          {outlineItems.map(item => (
            <section key={item.id}>
              {/* scroll-margin-top belongs on the heading (it carries the id
                  the outline scrolls to), not on the section wrapper. */}
              <Heading
                id={item.id}
                level={item.level === 2 ? 2 : 3}
                style={{
                  scrollMarginTop: 16,
                  transition: 'background-color 600ms',
                  backgroundColor:
                    flashId === item.id
                      ? 'var(--color-overlay-hover, rgba(128,128,128,0.2))'
                      : 'transparent',
                }}>
                {item.label}
              </Heading>
              <div style={{height: 320}} />
            </section>
          ))}
        </article>
        <aside style={{position: 'sticky', top: 24, alignSelf: 'start'}}>
          <Badge label={status} />
          <Outline
            items={outlineItems}
            onNavigateStart={id => {
              setFlashId(null);
              setStatus(`scrolling to ${id}`);
            }}
            onNavigateEnd={id => {
              setFlashId(id);
              setStatus(`arrived at ${id}`);
            }}
          />
        </aside>
      </div>
    );
  },
};

/**
 * Keyboard navigation. Each link is in the normal Tab order: Tab moves from
 * link to link and leaves the outline after the last one, and Enter or Space
 * activates. There is no arrow, Home, or End movement between links.
 */
export const KeyboardNavigation: Story = {
  render: () => (
    <div
      style={{display: 'flex', flexDirection: 'column', gap: 16, width: 240}}>
      <button type="button">Focus me, then press Tab</button>
      <Outline items={outlineItems} />
      <button type="button">After the outline</button>
    </div>
  ),
};
