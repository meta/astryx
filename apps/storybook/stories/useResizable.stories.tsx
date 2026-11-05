// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {useResizable, ResizeHandle} from '@astryxdesign/core/Resizable';
import {percent, pixel} from '@astryxdesign/core/Resizable/utils';
import {Layout, LayoutContent, LayoutPanel} from '@astryxdesign/core/Layout';
import {observeResize} from '@astryxdesign/core/utils';

const s = stylex.create({
  shell: {
    height: 300,
    width: '100%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    overflow: 'hidden',
  },
  muted: {backgroundColor: colorVars['--color-background-muted']},
  card: {
    backgroundColor: colorVars['--color-background-card'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    margin: spacingVars['--spacing-2'],
  },
  structuredStack: {
    display: 'grid',
    gap: spacingVars['--spacing-4'],
  },
  structuredFrame: {height: 180},
  structuredLayout: {height: 80},
});

function HookDemo({children}: {children: React.ReactNode}) {
  return <div>{children}</div>;
}

function StructuredPercentProbe({
  kind,
  width,
}: {
  kind: 'default-wide' | 'default-narrow' | 'minimum' | 'maximum';
  width: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isContentScrollable, setIsContentScrollable] = useState(false);
  const isDefault = kind.startsWith('default');
  const isMinimum = kind === 'minimum';
  const storageKey = `storybook-structured-percent-${kind}`;
  const region = useResizable({
    ...(isDefault
      ? {defaultSize: percent(40, {min: pixel(333)})}
      : isMinimum
        ? {defaultSize: 0, minSize: percent(40, {min: pixel(333)})}
        : {defaultSize: 500, maxSize: percent(10, {max: pixel(400)})}),
    containerRef: frameRef,
    direction: 'horizontal',
    autoSaveId: storageKey,
  });
  const resolvedBound = isDefault
    ? null
    : isMinimum
      ? region.props._minSizePx
      : region.props._maxSizePx;
  const label = isDefault
    ? `defaultSize: percent(40, {min: pixel(333)})`
    : isMinimum
      ? `minSize: percent(40, {min: pixel(333)})`
      : `maxSize: percent(10, {max: pixel(400)})`;
  const measureContentOverflow = useCallback(() => {
    const content = contentRef.current;
    if (content == null) {
      return;
    }
    const overflowY = getComputedStyle(content).overflowY;
    const isScrollable =
      ['auto', 'scroll', 'overlay'].includes(overflowY) &&
      content.scrollHeight > content.clientHeight + 1;
    setIsContentScrollable(current =>
      current === isScrollable ? current : isScrollable,
    );
  }, []);
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (content == null) {
      return;
    }
    return observeResize(content, measureContentOverflow);
  }, [measureContentOverflow]);

  return (
    <div
      ref={frameRef}
      data-testid={`structured-percent-${kind}-frame`}
      data-width={width}
      data-size={region.size}
      data-resolved-bound={resolvedBound ?? undefined}
      data-storage-key={`astryx-resizable:${storageKey}`}
      {...stylex.props(s.shell, s.structuredFrame)}
      style={{width}}>
      <div {...stylex.props(s.card)}>
        <strong>
          {width}px outer / {width - 2}px content
        </strong>
        <div>
          <code>{label}</code>
        </div>
        <div>
          {Math.round(region.size)}px selected
          {resolvedBound == null
            ? ' initially'
            : ` · ${Math.round(resolvedBound)}px resolved bound`}
        </div>
      </div>
      <div {...stylex.props(s.structuredLayout)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel
                width={region.size}
                hasDivider={false}
                isScrollable={false}
                data-testid={`structured-percent-${kind}-panel`}>
                {Math.round(region.size)}px
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                label={`Resize structured percent ${kind} example`}
                resizable={region.props}
              />
            </>
          }
          content={
            <LayoutContent
              ref={contentRef}
              data-testid={`structured-percent-${kind}-content`}
              role={isContentScrollable ? 'region' : undefined}
              label={
                isContentScrollable
                  ? `Structured percent ${kind.replaceAll('-', ' ')} details`
                  : undefined
              }
              tabIndex={isContentScrollable ? 0 : -1}>
              {isDefault
                ? 'Later basis changes do not rescale this selected pixel size.'
                : 'The percentage bound follows later basis changes.'}
            </LayoutContent>
          }
        />
      </div>
    </div>
  );
}

function StructuredPercentSizingStory() {
  const [storageReady, setStorageReady] = useState(false);
  const [resized, setResized] = useState(false);

  useEffect(() => {
    for (const kind of [
      'default-wide',
      'default-narrow',
      'minimum',
      'maximum',
    ]) {
      localStorage.removeItem(
        `astryx-resizable:storybook-structured-percent-${kind}`,
      );
    }
    setStorageReady(true);
  }, []);

  if (!storageReady) {
    return null;
  }

  return (
    <div
      data-testid="structured-percent-sizing"
      {...stylex.props(s.structuredStack)}>
      <button
        type="button"
        data-testid="structured-percent-toggle-bases"
        onClick={() => setResized(value => !value)}>
        {resized ? 'Restore initial bases' : 'Change bases'}
      </button>
      <StructuredPercentProbe
        kind="default-wide"
        width={resized ? 500 : 1000}
      />
      <StructuredPercentProbe
        kind="default-narrow"
        width={resized ? 1000 : 500}
      />
      <StructuredPercentProbe kind="minimum" width={resized ? 1000 : 500} />
      <StructuredPercentProbe kind="maximum" width={resized ? 500 : 1000} />
    </div>
  );
}

const meta: Meta<typeof HookDemo> = {
  title: 'Core/Hooks/useResizable',
  component: HookDemo,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Hook that manages resize state for panel regions. ' +
          'Pair with ResizeHandle for interactive resizing.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof HookDemo>;

/** Two side-by-side panels with a divider handle. */
export const Horizontal: Story = {
  render: () => {
    const sidebar = useResizable({
      defaultSize: 200,
      minSize: 100,
      maxSize: 500,
    });
    return (
      <div {...stylex.props(s.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={sidebar.size} hasDivider={false}>
                Sidebar
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={sidebar.props}
              />
            </>
          }
          content={<LayoutContent>Content</LayoutContent>}
        />
      </div>
    );
  },
};

/** Vertical layout — top and bottom panels. */
export const Vertical: Story = {
  render: () => {
    const top = useResizable({
      defaultSize: 150,
      minSize: 60,
      maxSize: 250,
      direction: 'vertical',
    });
    return (
      <div {...stylex.props(s.shell)}>
        <Layout
          height="fill"
          header={
            <>
              <LayoutPanel width="100%" padding={4}>
                <div style={{height: top.size}}>Header</div>
              </LayoutPanel>
              <ResizeHandle
                direction="vertical"
                hasDivider
                resizable={top.props}
              />
            </>
          }
          content={<LayoutContent>Content</LayoutContent>}
        />
      </div>
    );
  },
};

/** Three panels with two handles — mail client layout. */
export const ThreePanel: Story = {
  render: () => {
    const left = useResizable({
      defaultSize: 180,
      minSize: 120,
      maxSize: 300,
    });
    const right = useResizable({
      defaultSize: 220,
      minSize: 150,
      maxSize: 400,
    });
    return (
      <div {...stylex.props(s.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={left.size} hasDivider={false}>
                Folders
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={left.props}
              />
            </>
          }
          content={<LayoutContent>Inbox</LayoutContent>}
          end={
            <>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                isReversed
                resizable={right.props}
              />
              <LayoutPanel width={right.size} hasDivider={false}>
                Preview
              </LayoutPanel>
            </>
          }
        />
      </div>
    );
  },
};

/** Nested — horizontal split with a vertical split inside. */
export const Nested: Story = {
  render: () => {
    const sidebar = useResizable({
      defaultSize: 200,
      minSize: 120,
      maxSize: 350,
    });
    const editor = useResizable({
      defaultSize: 200,
      minSize: 80,
      maxSize: 250,
      direction: 'vertical',
    });
    return (
      <div {...stylex.props(s.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={sidebar.size} hasDivider={false}>
                Explorer
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={sidebar.props}
              />
            </>
          }
          content={
            <LayoutContent padding={0}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                }}>
                <div
                  style={{
                    height: editor.size,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  Editor
                </div>
                <ResizeHandle
                  direction="vertical"
                  hasDivider
                  resizable={editor.props}
                />
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  Terminal
                </div>
              </div>
            </LayoutContent>
          }
        />
      </div>
    );
  },
};

/** Always-visible pill grip with divider line. */
export const AlwaysVisible: Story = {
  render: () => {
    const sidebar = useResizable({
      defaultSize: 250,
      minSize: 100,
      maxSize: 500,
    });
    return (
      <div {...stylex.props(s.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={sidebar.size} hasDivider={false}>
                Sidebar
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={sidebar.props}
              />
            </>
          }
          content={<LayoutContent>Content</LayoutContent>}
        />
      </div>
    );
  },
};

/** Mixed container styles — no divider lines, relying on background contrast. */
export const MixedContainers: Story = {
  render: () => {
    const sidebar = useResizable({
      defaultSize: 200,
      minSize: 120,
      maxSize: 350,
    });
    const editor = useResizable({
      defaultSize: 200,
      minSize: 80,
      maxSize: 250,
      direction: 'vertical',
    });
    return (
      <div {...stylex.props(s.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel
                width={sidebar.size}
                hasDivider={false}
                xstyle={s.muted}>
                Explorer
              </LayoutPanel>
              <ResizeHandle direction="horizontal" resizable={sidebar.props} />
            </>
          }
          content={
            <LayoutContent padding={0}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                }}>
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  Editor
                </div>
                <ResizeHandle direction="vertical" resizable={editor.props} />
                <div
                  {...stylex.props(s.card)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  Terminal
                </div>
              </div>
            </LayoutContent>
          }
        />
      </div>
    );
  },
};

/**
 * Percentage configuration, resolved against a container.
 *
 * `containerRef` marks what a percentage is a share of. The panel starts at 40%
 * of the frame's content box and cannot be dragged past 60% of it. Narrow the
 * frame and the BOUNDS follow — but the size you dragged to stays the pixel
 * size you chose, clamped rather than rescaled. That is the whole contract:
 * percentages configure pixels, they do not create a responsive mode.
 */
export const PercentageSizing: Story = {
  render: () => {
    const frameRef = useRef<HTMLDivElement>(null);
    const region = useResizable({
      defaultSize: '40%',
      minSize: '15%',
      maxSize: '60%',
      containerRef: frameRef,
    });
    return (
      <div ref={frameRef} {...stylex.props(s.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={region.size} hasDivider={false}>
                <div {...stylex.props(s.card)}>{Math.round(region.size)}px</div>
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={region.props}
              />
            </>
          }
          content={<LayoutContent>Content</LayoutContent>}
        />
      </div>
    );
  },
};

/**
 * Structured percentages support one explicit pixel floor or ceiling.
 *
 * `defaultSize: percent(40, {min: pixel(333)})` is an initial choice only. The same
 * value on `minSize` remains a live floor, while `percent(10, {max: pixel(400)})` on
 * `maxSize` remains a live ceiling. Numbers and exact `Npx` remain pixels; state,
 * storage, callbacks, panel geometry, and ARIA all use resolved pixel values.
 */
export const StructuredPercentSizing: Story = {
  render: () => <StructuredPercentSizingStory />,
};

/**
 * The compatibility path: a percentage with no `containerRef`.
 *
 * This is what shipped before percentages could name a container, and it is
 * unchanged — `'25%'` resolves once against `window.innerWidth` (1200px on the
 * server), then behaves as pixels. Resize the window and the panel stays where
 * it is; only a percentage BOUND would follow.
 */
export const ViewportPercentage: Story = {
  render: () => {
    const region = useResizable({defaultSize: '25%', minSize: 80});
    return (
      <div {...stylex.props(s.shell)} data-testid="viewport-pct">
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={region.size} hasDivider={false}>
                <div {...stylex.props(s.card)}>{Math.round(region.size)}px</div>
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={region.props}
              />
            </>
          }
          content={<LayoutContent>Content</LayoutContent>}
        />
      </div>
    );
  },
};
