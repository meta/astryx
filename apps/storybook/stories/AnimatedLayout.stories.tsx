// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useRef, type ReactNode} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {TreeList} from '@astryxdesign/core/TreeList';
import type {TreeListItemData} from '@astryxdesign/core/TreeList';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {useAnimatedLayout} from '@astryxdesign/core/hooks';

const meta: Meta = {
  title: 'Core/Animated layout',
  parameters: {layout: 'padded'},
};

export default meta;

type Story = StoryObj;

const card = {
  padding: 12,
  margin: '0 0 8px',
  borderRadius: 12,
  border: '1px solid var(--color-border)',
  background: 'var(--color-background-surface)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-family-body)',
  fontSize: 14,
} as const;

const plain = {
  ...card,
  borderStyle: 'dashed',
  background: 'var(--color-background-muted)',
} as const;

const label = {
  margin: '0 0 6px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  fontFamily: 'var(--font-family-body)',
} as const;

const TREE: TreeListItemData[] = [
  {
    id: 'photos',
    label: 'Photos',
    children: [
      {id: 'beach', label: 'Beach.jpg'},
      {
        id: 'trips',
        label: 'Trips',
        children: [
          {id: 'snow', label: 'Snow.jpg'},
          {id: 'lake', label: 'Lake.jpg'},
        ],
      },
      {id: 'party', label: 'Party.jpg'},
    ],
  },
  {
    id: 'docs',
    label: 'Documents',
    children: [
      {id: 'cv', label: 'Resume.pdf'},
      {id: 'tax', label: 'Taxes.pdf'},
    ],
  },
  {id: 'notes', label: 'Notes.txt'},
];

function Section({title, children}: {title: string; children: ReactNode}) {
  return (
    <section style={{margin: '0 0 12px'}}>
      <p style={label}>{title}</p>
      {children}
    </section>
  );
}

/**
 * The sticky header and the absolute badge stay put; the `display: contents`
 * wrapper's children move on their own.
 */
function Demo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animatedLayout = useAnimatedLayout({containerRef});
  return (
    <div style={{maxWidth: 520}}>
      <ScrollableArea
        ref={containerRef}
        height={560}
        label="Animated layout demo">
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            padding: '10px 12px',
            fontWeight: 600,
            background: 'var(--color-background-surface)',
            borderBottom: '1px solid var(--color-border)',
            fontFamily: 'var(--font-family-body)',
          }}>
          Sticky header (stays put)
        </div>
        <div style={{padding: 12}}>
          <Section title="A nested tree (TreeList adopts the module)">
            <div style={card}>
              <TreeList
                aria-label="Files"
                items={TREE}
                animatedLayout={animatedLayout}
              />
            </div>
          </Section>
          <Section title="A Collapsible (adopts the module)">
            <div style={card}>
              <Collapsible
                trigger="Shipping details"
                defaultIsOpen={false}
                animatedLayout={animatedLayout}>
                <p style={{margin: '4px 0'}}>Ships in 2 business days.</p>
                <p style={{margin: '4px 0'}}>Free returns for 30 days.</p>
                <p style={{margin: '4px 0'}}>Tracking arrives by email.</p>
              </Collapsible>
            </div>
          </Section>
          <div style={{...plain, position: 'relative'}}>
            A plain app div with an absolute badge (the badge rides with it)
            <span
              style={{
                position: 'absolute',
                top: -8,
                insetInlineEnd: -8,
                padding: '2px 8px',
                borderRadius: 9999,
                background: 'var(--color-background-inverted)',
                color: 'var(--color-background-body)',
                fontSize: 12,
              }}>
              New
            </span>
          </div>
          <div style={{display: 'contents'}}>
            <div style={plain}>Inside a display: contents wrapper (1)</div>
            <div style={plain}>Inside a display: contents wrapper (2)</div>
          </div>
          {Array.from({length: 8}, (_, i) => (
            <div key={i} style={plain}>
              Plain app content after the changes ({i + 1})
            </div>
          ))}
        </div>
      </ScrollableArea>
    </div>
  );
}

/**
 * The ScrollableArea is the container: `useAnimatedLayout({containerRef})`
 * returns a handle, and each component that changes size takes it.
 */
export const AnimatedLayout: Story = {
  name: 'Animated layout',
  render: () => <Demo />,
};

function PanelDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animatedLayout = useAnimatedLayout({containerRef});
  return (
    <div
      ref={containerRef}
      style={{
        maxWidth: 520,
        padding: 12,
        border: '2px dashed var(--color-border-emphasized)',
        borderRadius: 16,
      }}>
      <div style={card}>
        <Collapsible
          trigger="Advanced settings"
          defaultIsOpen={false}
          animatedLayout={animatedLayout}>
          <p style={{margin: '4px 0'}}>Cache size, retries and timeouts.</p>
          <p style={{margin: '4px 0'}}>Changes apply on the next sync.</p>
        </Collapsible>
      </div>
      <div style={plain}>Content after, in an app panel</div>
      <div style={plain}>More content</div>
    </div>
  );
}

/** An app's own panel as the container. */
export const AppPanel: Story = {
  name: 'App panel',
  render: () => <PanelDemo />,
};

const COMPARE_TREE: TreeListItemData[] = [
  {
    id: 'src',
    label: 'src',
    children: [
      {id: 'app', label: 'App.tsx'},
      {id: 'index', label: 'index.ts'},
      {id: 'styles', label: 'styles.css'},
    ],
  },
  {id: 'readme', label: 'README.md'},
];

function CompareColumn({
  title,
  isAnimated,
}: {
  title: string;
  isAnimated: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handle = useAnimatedLayout({containerRef});
  const animatedLayout = isAnimated ? handle : undefined;
  return (
    <div style={{flex: '1 1 0', minWidth: 0}}>
      <div style={{fontWeight: 600, marginBottom: 8}}>{title}</div>
      <div
        ref={containerRef}
        data-compare={isAnimated ? 'after' : 'before'}
        style={{
          padding: 12,
          border: '2px dashed var(--color-border-emphasized)',
          borderRadius: 16,
        }}>
        <div style={card}>
          <Collapsible
            trigger="Advanced settings"
            defaultIsOpen={false}
            animatedLayout={animatedLayout}>
            <p style={{margin: '4px 0'}}>Cache size, retries and timeouts.</p>
            <p style={{margin: '4px 0'}}>Changes apply on the next sync.</p>
          </Collapsible>
        </div>
        <div style={plain}>Content after the Collapsible</div>
        <div style={card}>
          <TreeList items={COMPARE_TREE} animatedLayout={animatedLayout} />
        </div>
        <div style={plain}>Content after the tree</div>
        <div style={plain}>More content</div>
      </div>
    </div>
  );
}

/**
 * The same Collapsible and TreeList without a handle (content after them
 * jumps) and with one (it glides), side by side, for any pointer.
 */
export const BeforeAndAfter: Story = {
  name: 'Before and after',
  render: () => (
    <div style={{display: 'flex', gap: 24, maxWidth: 880}}>
      <CompareColumn title="Without animatedLayout" isAnimated={false} />
      <CompareColumn title="With animatedLayout" isAnimated />
    </div>
  ),
};
