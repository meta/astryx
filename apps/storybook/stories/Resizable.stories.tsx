// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {colorVars, radiusVars} from '@astryxdesign/core/theme/tokens.stylex';
import {ResizeHandle, useResizable} from '@astryxdesign/core/Resizable';
import {Text, Heading} from '@astryxdesign/core/Text';
import {
  Layout,
  LayoutContent,
  LayoutPanel,
  Stack,
} from '@astryxdesign/core/Layout';
import {SideNav, SideNavItem} from '@astryxdesign/core/SideNav';
import {Divider} from '@astryxdesign/core/Divider';
import {Button} from '@astryxdesign/core/Button';

const ps = stylex.create({
  shell: {
    height: 400,
    width: '100%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    overflow: 'hidden',
  },
  sz: {opacity: 0.6, fontSize: 12, fontFamily: 'monospace'},
});

const meta: Meta<typeof ResizeHandle> = {
  title: 'Core/Resizable',
  component: ResizeHandle,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Hook-based resizable panel system. useResizable() manages size state; ' +
          'ResizeHandle provides the interactive pill-grip separator with optional divider line.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof ResizeHandle>;
/** Basic horizontal split with divider line. */
export const HorizontalSplit: Story = {
  render: () => {
    const resizable = useResizable({
      defaultSize: 250,
      minSize: 150,
      maxSize: 500,
    });
    return (
      <div {...stylex.props(ps.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={resizable.size} hasDivider={false}>
                <Stack gap={2}>
                  <Heading level={4}>Sidebar</Heading>
                  <Text>
                    <span {...stylex.props(ps.sz)}>{resizable.size}px</span>
                  </Text>
                  <Text>
                    Drag the handle to resize. Arrow keys when focused.
                  </Text>
                </Stack>
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={resizable}
                label="Resize sidebar"
              />
            </>
          }
          content={
            <LayoutContent>
              <Stack gap={2}>
                <Heading level={4}>Content</Heading>
                <Text>Main content area fills remaining space.</Text>
              </Stack>
            </LayoutContent>
          }
        />
      </div>
    );
  },
};

/** Vertical split with divider line. */
export const VerticalSplit: Story = {
  render: () => {
    const resizable = useResizable({
      defaultSize: 250,
      minSize: 100,
      maxSize: 350,
      direction: 'vertical',
    });
    return (
      <div {...stylex.props(ps.shell)}>
        <Layout
          height="fill"
          header={
            <div style={{height: resizable.size}}>
              <LayoutPanel padding={4} width="100%">
                <Stack gap={2}>
                  <Heading level={4}>Editor</Heading>
                  <Text>
                    <span {...stylex.props(ps.sz)}>{resizable.size}px</span>
                  </Text>
                </Stack>
              </LayoutPanel>
              <ResizeHandle
                direction="vertical"
                hasDivider
                resizable={resizable}
                label="Resize editor"
              />
            </div>
          }
          content={
            <LayoutContent>
              <Stack gap={2}>
                <Heading level={4}>Terminal</Heading>
                <Text>Bottom panel fills remaining space.</Text>
              </Stack>
            </LayoutContent>
          }
        />
      </div>
    );
  },
};

/** Collapsible sidebar: a lift or a key step past the threshold, or a double-click, collapses it. */
export const Collapsible: Story = {
  render: () => {
    const resizable = useResizable({
      defaultSize: 260,
      minSize: 180,
      collapsible: true,
      collapsedSize: 60,
    });
    return (
      <div {...stylex.props(ps.shell)}>
        <Layout
          height="fill"
          start={
            <>
              {!resizable.isCollapsed && (
                <LayoutPanel width={resizable.size} hasDivider={false}>
                  <Stack gap={2}>
                    <Heading level={4}>Sidebar</Heading>
                    <Text>
                      <span {...stylex.props(ps.sz)}>{resizable.size}px</span>
                    </Text>
                    <Text>Double-click handle or press Enter to collapse.</Text>
                  </Stack>
                </LayoutPanel>
              )}
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={resizable}
                label="Resize sidebar"
              />
            </>
          }
          content={
            <LayoutContent>
              <Stack gap={2}>
                <Heading level={4}>Content</Heading>
                <Text>
                  Sidebar is {resizable.isCollapsed ? 'collapsed' : 'expanded'}.
                  {resizable.isCollapsed && (
                    <button
                      onClick={() => resizable.expand()}
                      style={{marginLeft: 8}}>
                      Expand
                    </button>
                  )}
                </Text>
              </Stack>
            </LayoutContent>
          }
        />
      </div>
    );
  },
};

/** Three-panel IDE layout with nested horizontal + vertical splits. */
export const ThreePanelIDE: Story = {
  render: () => {
    const explorer = useResizable({
      defaultSize: 220,
      minSize: 150,
      maxSize: 400,
    });
    const editor = useResizable({
      defaultSize: 280,
      minSize: 100,
      maxSize: 350,
      direction: 'vertical',
    });
    return (
      <div {...stylex.props(ps.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={explorer.size} hasDivider={false}>
                <Stack gap={2}>
                  <Heading level={4}>Explorer</Heading>
                  <Text>
                    <span {...stylex.props(ps.sz)}>{explorer.size}px</span>
                  </Text>
                </Stack>
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={explorer}
                label="Resize explorer"
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
                <div style={{flex: 'none', height: editor.size, padding: 16}}>
                  <Stack gap={2}>
                    <Heading level={4}>Editor</Heading>
                    <Text>
                      <span {...stylex.props(ps.sz)}>{editor.size}px</span>
                    </Text>
                  </Stack>
                </div>
                <ResizeHandle
                  direction="vertical"
                  hasDivider
                  resizable={editor}
                  label="Resize editor"
                />
                <div style={{flex: 1, padding: 16}}>
                  <Heading level={4}>Terminal</Heading>
                </div>
              </div>
            </LayoutContent>
          }
        />
      </div>
    );
  },
};

/** Snap points — sidebar snaps to predefined widths. */
export const SnapPoints: Story = {
  render: () => {
    const resizable = useResizable({
      defaultSize: 260,
      minSize: 56,
      maxSize: 600,
      snaps: [56, 160, 260, 400],
    });
    const isRail = resizable.size <= 60;
    return (
      <div {...stylex.props(ps.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={resizable.size} hasDivider={false}>
                {isRail ? (
                  <Text>{'\u2630'}</Text>
                ) : (
                  <Stack gap={2}>
                    <Heading level={4}>Sidebar</Heading>
                    <Text>
                      <span {...stylex.props(ps.sz)}>{resizable.size}px</span>
                    </Text>
                    <Text>Snaps to 56 \u00b7 160 \u00b7 260 \u00b7 400px.</Text>
                  </Stack>
                )}
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={resizable}
                label="Resize sidebar"
              />
            </>
          }
          content={
            <LayoutContent>
              <Heading level={4}>Content</Heading>
            </LayoutContent>
          }
        />
      </div>
    );
  },
};

/** Pill hidden at rest — only appears on hover/focus. */
export const HiddenPill: Story = {
  render: () => {
    const resizable = useResizable({
      defaultSize: 250,
      minSize: 150,
      maxSize: 500,
    });
    return (
      <div {...stylex.props(ps.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={resizable.size} hasDivider={false}>
                <Stack gap={2}>
                  <Heading level={4}>Sidebar</Heading>
                  <Text>
                    <span {...stylex.props(ps.sz)}>{resizable.size}px</span>
                  </Text>
                  <Text>Pill only appears on hover.</Text>
                </Stack>
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                isAlwaysVisible={false}
                resizable={resizable}
                label="Resize sidebar"
              />
            </>
          }
          content={
            <LayoutContent>
              <Heading level={4}>Content</Heading>
            </LayoutContent>
          }
        />
      </div>
    );
  },
};

/** Disabled handle — divider visible but non-interactive. */
export const Disabled: Story = {
  render: () => {
    const resizable = useResizable({defaultSize: 250, minSize: 150});
    return (
      <div {...stylex.props(ps.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={resizable.size} hasDivider={false}>
                <Heading level={4}>Sidebar (locked)</Heading>
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={resizable}
                isDisabled
                label="Locked"
              />
            </>
          }
          content={
            <LayoutContent>
              <Heading level={4}>Content</Heading>
            </LayoutContent>
          }
        />
      </div>
    );
  },
};

/** Integration with Layout — resizable sidebar with collapsible. */
export const WithLayout: Story = {
  render: () => {
    const resizable = useResizable({
      defaultSize: 260,
      minSize: 180,
      maxSize: 450,
      collapsible: true,
      collapsedSize: 50,
    });
    return (
      <div {...stylex.props(ps.shell)} style={{height: 500}}>
        <Layout
          height="fill"
          start={
            <>
              {!resizable.isCollapsed && (
                <LayoutPanel
                  resizable={resizable}
                  hasDivider={false}
                  role="navigation"
                  label="Sidebar">
                  <Stack gap={2}>
                    <Heading level={4}>Navigation</Heading>
                    <Text>
                      <span {...stylex.props(ps.sz)}>{resizable.size}px</span>
                    </Text>
                    <Divider />
                    <Text>Drag the handle to resize.</Text>
                    <Text>Double-click or press Enter to collapse.</Text>
                  </Stack>
                </LayoutPanel>
              )}
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={resizable}
                label="Resize navigation"
              />
            </>
          }
          content={
            <LayoutContent>
              <Stack gap={3}>
                <Heading level={3}>Main Content</Heading>
                <Text>
                  LayoutPanel with resizable prop + ResizeHandle with
                  hasDivider.
                </Text>
                <Text>
                  Sidebar is{' '}
                  <strong>
                    {resizable.isCollapsed ? 'collapsed' : 'expanded'}
                  </strong>
                  {resizable.isCollapsed && (
                    <button
                      onClick={() => resizable.expand()}
                      style={{marginLeft: 8}}>
                      Expand
                    </button>
                  )}
                </Text>
              </Stack>
            </LayoutContent>
          }
        />
      </div>
    );
  },
};

/** AppShell with resizable SideNav. */
export const WithAppShell: Story = {
  render: () => {
    const resizable = useResizable({
      defaultSize: 260,
      minSize: 200,
      maxSize: 400,
      collapsible: true,
      collapsedSize: 50,
      snaps: [56, 260],
    });
    return (
      <div {...stylex.props(ps.shell)} style={{height: 500}}>
        <Layout
          height="fill"
          start={
            <>
              {!resizable.isCollapsed && (
                <LayoutPanel
                  width={resizable.size}
                  hasDivider={false}
                  padding={0}>
                  <SideNav>
                    <SideNavItem label="Home" isSelected />
                    <SideNavItem label="Dashboard" />
                    <SideNavItem label="Settings" />
                  </SideNav>
                </LayoutPanel>
              )}
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={resizable}
                label="Resize navigation"
              />
            </>
          }
          content={
            <LayoutContent>
              <Stack gap={3}>
                <Heading level={3}>Dashboard</Heading>
                <Text>
                  <span {...stylex.props(ps.sz)}>{resizable.size}px</span>
                  {' \u2014 '}
                  {resizable.isCollapsed ? 'Collapsed' : 'Expanded'}
                </Text>
                <Text>
                  SideNav width driven by useResizable. Double-click handle to
                  collapse.
                </Text>
              </Stack>
            </LayoutContent>
          }
        />
      </div>
    );
  },
};

/**
 * Panel whose content is an embedded frame. The drag must survive the cursor
 * crossing the frame: pointer events over a frame are dispatched into the
 * guest document, so a drag that stays armed only while the host keeps
 * receiving them dies mid-gesture here.
 */
export const WithEmbeddedFrame: Story = {
  render: () => {
    const resizable = useResizable({
      defaultSize: 200,
      minSize: 120,
      maxSize: 520,
    });
    return (
      <div {...stylex.props(ps.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={resizable.size} hasDivider={false}>
                <Stack gap={2}>
                  <Heading level={4}>Sidebar</Heading>
                  <Text>
                    <span {...stylex.props(ps.sz)}>{resizable.size}px</span>
                  </Text>
                  <Text>Drag right, across the preview, and back.</Text>
                </Stack>
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                resizable={resizable}
                label="Resize sidebar"
              />
            </>
          }
          content={
            <LayoutContent padding={0}>
              <iframe
                title="Preview"
                srcDoc="<!doctype html><body style='margin:0;font:14px system-ui;display:grid;place-items:center;height:100vh;background:#eef'>Embedded preview</body>"
                style={{width: '100%', height: '100%', border: 0}}
              />
            </LayoutContent>
          }
        />
      </div>
    );
  },
};

const cal = stylex.create({
  column: {
    position: 'relative',
    width: 240,
    height: 192,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
  },
  // A calendar event: its body moves it, and the Handle on its bottom edge
  // changes how long it lasts.
  event: (top: number, height: number) => ({
    position: 'absolute',
    insetInlineStart: 8,
    insetInlineEnd: 8,
    top,
    height,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'visible',
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-muted'],
  }),
  eventBody: {
    flexGrow: 1,
    minHeight: 0,
    cursor: 'move',
    touchAction: 'none',
  },
});

/** At 48px an hour, as a day view draws it. */
const PX_PER_HOUR = 48;

/**
 * One event of a calendar column: dragging its body moves it, and its
 * ResizeHandle changes its length. The event keeps its own drag however short
 * it is: the Grab zone stays on the Handle, whatever `pillPlacement` says, and
 * takes at most half the event (component:Resizable FR1).
 */
function CalendarEvent({
  testId,
  minutes,
  initialTop,
  pillPlacement,
  position,
}: {
  testId: string;
  minutes: number;
  initialTop: number;
  pillPlacement: 'auto' | 'start' | 'center' | 'end';
  position: 'inline' | 'overlay';
}) {
  const resizable = useResizable({
    defaultSize: (minutes / 60) * PX_PER_HOUR,
    minSize: PX_PER_HOUR / 8,
    direction: 'vertical',
  });
  const [top, setTop] = useState(initialTop);
  const moveRef = useRef<{y: number; top: number} | null>(null);
  return (
    <div
      data-testid={testId}
      data-top={top}
      {...stylex.props(cal.event(top, resizable.size))}>
      <div
        data-testid={`${testId}-body`}
        {...stylex.props(cal.eventBody)}
        onPointerDown={event => {
          moveRef.current = {y: event.clientY, top};
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const move = moveRef.current;
          if (move != null) {
            setTop(move.top + event.clientY - move.y);
          }
        }}
        onPointerUp={() => {
          moveRef.current = null;
        }}>
        <Text type="supporting">{minutes} min</Text>
      </div>
      <ResizeHandle
        direction="vertical"
        position={position}
        pillPlacement={pillPlacement}
        resizable={resizable}
        label={`Resize the ${minutes}-minute event`}
      />
    </div>
  );
}

/**
 * Browser fixture for the Grab zone on a short item: a 30-minute and a
 * 15-minute event, each resized from its bottom edge.
 */
function ShortItems({
  pillPlacement,
  position,
}: {
  pillPlacement: 'auto' | 'start' | 'center' | 'end';
  position: 'inline' | 'overlay';
}) {
  return (
    <div {...stylex.props(cal.column)}>
      <CalendarEvent
        testId="thirty"
        minutes={30}
        initialTop={24}
        pillPlacement={pillPlacement}
        position={position}
      />
      <CalendarEvent
        testId="fifteen"
        minutes={15}
        initialTop={120}
        pillPlacement={pillPlacement}
        position={position}
      />
    </div>
  );
}

export const GrabZoneOnShortItems: StoryObj<typeof ShortItems> = {
  tags: ['!autodocs', 'no-visual'],
  args: {pillPlacement: 'auto', position: 'inline'},
  render: args => <ShortItems {...args} />,
};

/**
 * Browser fixture for a pill that shows on hover beside an overlay Handle.
 * The pill can sit outside the Grab zone, so the pointer crosses a gap to
 * reach it.
 */
function HoverPillOnOverlay({
  pillPlacement,
  dir,
}: {
  pillPlacement: 'start' | 'end';
  dir: 'ltr' | 'rtl';
}) {
  const resizable = useResizable({
    defaultSize: 250,
    minSize: 150,
    maxSize: 500,
  });
  return (
    <div dir={dir} {...stylex.props(ps.shell)}>
      <Layout
        height="fill"
        start={
          <>
            <LayoutPanel width={resizable.size} hasDivider={false}>
              <Text>{resizable.size}px</Text>
            </LayoutPanel>
            <ResizeHandle
              direction="horizontal"
              position="overlay"
              pillPlacement={pillPlacement}
              isAlwaysVisible={false}
              resizable={resizable}
              label="Resize sidebar"
            />
          </>
        }
        content={
          <LayoutContent>
            <Heading level={4}>Content</Heading>
          </LayoutContent>
        }
      />
    </div>
  );
}

export const HoverPillOnOverlayHandle: StoryObj<typeof HoverPillOnOverlay> = {
  tags: ['!autodocs', 'no-visual'],
  args: {pillPlacement: 'start', dir: 'ltr'},
  render: args => <HoverPillOnOverlay {...args} />,
};

/**
 * Browser fixture for LayoutPanel at width 0. The start panel takes a
 * collapsed region's props and has no divider. The end panel has
 * `width={0}` and a divider. Neither takes space or shows its children.
 */
function CollapsedPanels() {
  const sidebar = useResizable({
    defaultSize: 200,
    collapsible: true,
    defaultIsCollapsed: true,
  });
  return (
    <div {...stylex.props(ps.shell)}>
      <Layout
        height="fill"
        start={
          <>
            <LayoutPanel
              resizable={sidebar.props}
              hasDivider={false}
              data-testid="collapsed-start">
              <Heading level={4}>Panel</Heading>
              <Text>Collapsed with its region.</Text>
            </LayoutPanel>
            <ResizeHandle resizable={sidebar.props} label="Resize panel" />
          </>
        }
        content={
          <LayoutContent data-testid="collapsed-content">
            <Text>The content starts at the handle.</Text>
          </LayoutContent>
        }
        end={
          <LayoutPanel width={0} hasDivider data-testid="collapsed-end">
            <Heading level={4}>Details</Heading>
          </LayoutPanel>
        }
      />
    </div>
  );
}

export const CollapsedPanelFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  render: () => <CollapsedPanels />,
};

/**
 * Browser fixture for a scrolling LayoutPanel that collapses to width 0. Its
 * content overflows while it is open, and a button collapses and opens it.
 * The lines are buttons, so a keyboard reaches the scrolling content without
 * a tab stop on the panel.
 */
function CollapsingScrollPanel() {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div {...stylex.props(ps.shell)}>
      <Layout
        height="fill"
        content={
          <LayoutContent>
            <Button
              label={isOpen ? 'Collapse details' : 'Open details'}
              onClick={() => setIsOpen(open => !open)}
            />
          </LayoutContent>
        }
        end={
          <LayoutPanel
            width={isOpen ? 240 : 0}
            hasDivider
            data-testid="collapsing-end">
            {Array.from({length: 40}, (_, index) => (
              <Button key={index} label={`Detail line ${index + 1}`} />
            ))}
          </LayoutPanel>
        }
      />
    </div>
  );
}

export const CollapsingScrollPanelFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  render: () => <CollapsingScrollPanel />,
};

/**
 * A LayoutPanel that takes a `useResizable` region slides closed and open
 * from the edge facing its ResizeHandle. The content beside it moves on
 * the same motion. "Close panel" collapses it from inside, so focus moves to
 * the handle and the collapsed panel is inert. Enter on the handle, a
 * double-click or "Open panel" opens it again.
 */
function SlidingPanelSplit({
  side,
  lineCount = 0,
  minSize = 120,
}: {
  side: 'start' | 'end';
  lineCount?: number;
  minSize?: number;
}) {
  const resizable = useResizable({
    defaultSize: 200,
    minSize,
    maxSize: 320,
    collapsible: true,
  });
  const pane = (
    <LayoutPanel resizable={resizable} data-testid="sliding-panel">
      <Stack gap={2}>
        <Heading level={4}>Panel</Heading>
        <Button label="Close panel" onClick={resizable.collapse} />
        {Array.from({length: lineCount}, (_, index) => (
          <Text key={index}>Line {index + 1}</Text>
        ))}
      </Stack>
    </LayoutPanel>
  );
  const handle = (
    <ResizeHandle
      resizable={resizable}
      isReversed={side === 'end'}
      hasDivider
      label="Resize panel"
    />
  );
  return (
    <div {...stylex.props(ps.shell)}>
      <Layout
        height="fill"
        start={
          side === 'start' ? (
            <>
              {pane}
              {handle}
            </>
          ) : undefined
        }
        content={
          <LayoutContent data-testid="sliding-content">
            <Stack gap={2}>
              <Text>The content glides with the panel's edge.</Text>
              <Button label="Open panel" onClick={resizable.expand} />
              <Button
                label="Toggle panel"
                onClick={
                  resizable.isCollapsed ? resizable.expand : resizable.collapse
                }
              />
            </Stack>
          </LayoutContent>
        }
        end={
          side === 'end' ? (
            <>
              {handle}
              {pane}
            </>
          ) : undefined
        }
      />
    </div>
  );
}

export const SlidingStartPanel: Story = {
  render: () => <SlidingPanelSplit side="start" />,
};

export const SlidingEndPanel: Story = {
  render: () => <SlidingPanelSplit side="end" />,
};

/** A sliding start panel with more lines than fit, for a scrolled slide. */
export const SlidingScrolledPanelFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  render: () => <SlidingPanelSplit side="start" lineCount={40} />,
};

/**
 * A sliding start panel at the hook's default minimum (50 px), so a key step
 * from it ends under the collapsed size.
 */
export const SlidingPanelAtDefaultMinimumFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  render: () => <SlidingPanelSplit side="start" minSize={50} />,
};

/**
 * A start LayoutPanel whose collapse state its parent owns: `isCollapsed`
 * with `onCollapseChange`, and a toggle that flips the parent's state. The
 * panel slides on each controlled change too.
 */
function ControlledSlidingPanel() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const resizable = useResizable({
    defaultSize: 200,
    minSize: 120,
    maxSize: 320,
    collapsible: true,
    isCollapsed,
    onCollapseChange: setIsCollapsed,
  });
  return (
    <div {...stylex.props(ps.shell)}>
      <Layout
        height="fill"
        start={
          <>
            <LayoutPanel resizable={resizable} data-testid="sliding-panel">
              <Stack gap={2}>
                <Heading level={4}>Panel</Heading>
                <Button label="Close panel" onClick={resizable.collapse} />
              </Stack>
            </LayoutPanel>
            <ResizeHandle
              resizable={resizable}
              hasDivider
              label="Resize panel"
            />
          </>
        }
        content={
          <LayoutContent data-testid="sliding-content">
            <Stack gap={2}>
              <Text>The parent owns whether the panel is collapsed.</Text>
              <Button
                label="Toggle panel"
                onClick={() => {
                  setIsCollapsed(!isCollapsed);
                }}
              />
            </Stack>
          </LayoutContent>
        }
      />
    </div>
  );
}

export const SlidingControlledPanel: Story = {
  render: () => <ControlledSlidingPanel />,
};

/**
 * Browser fixtures for two start panels. One takes the hook's own `props`
 * and slides. The other takes a hand-built `ResizableProps` object, with the same
 * fields in an object the hook did not return, and collapses without a slide.
 * Both move focus inside them to the handle and go inert while collapsed.
 */
function PropsPanelSplit({isHandBuilt}: {isHandBuilt: boolean}) {
  const resizable = useResizable({
    defaultSize: 200,
    minSize: 120,
    maxSize: 320,
    collapsible: true,
  });
  const panelValue = isHandBuilt ? {...resizable.props} : resizable.props;
  return (
    <div {...stylex.props(ps.shell)}>
      <Layout
        height="fill"
        start={
          <>
            <LayoutPanel resizable={panelValue} data-testid="sliding-panel">
              <Stack gap={2}>
                <Heading level={4}>Panel</Heading>
                <Button label="Close panel" onClick={resizable.collapse} />
              </Stack>
            </LayoutPanel>
            <ResizeHandle
              resizable={resizable}
              hasDivider
              label="Resize panel"
            />
          </>
        }
        content={
          <LayoutContent data-testid="sliding-content">
            <Stack gap={2}>
              <Text>The content glides with the panel's edge.</Text>
              <Button label="Open panel" onClick={resizable.expand} />
            </Stack>
          </LayoutContent>
        }
      />
    </div>
  );
}

export const SlidingPanelWithHookProps: Story = {
  tags: ['!autodocs', 'no-visual'],
  render: () => <PropsPanelSplit isHandBuilt={false} />,
};

export const PanelWithHandBuiltProps: Story = {
  tags: ['!autodocs', 'no-visual'],
  render: () => <PropsPanelSplit isHandBuilt />,
};
