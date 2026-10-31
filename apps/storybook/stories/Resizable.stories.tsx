// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useRef} from 'react';
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
    const sidebarHandleRef = useRef<HTMLDivElement>(null);
    const sidebar = useResizable(sidebarHandleRef, {
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
              <LayoutPanel width={sidebar.size} hasDivider={false}>
                <Stack gap={2}>
                  <Heading level={4}>Sidebar</Heading>
                  <Text>
                    <span {...stylex.props(ps.sz)}>{sidebar.size}px</span>
                  </Text>
                  <Text>
                    Drag the handle to resize. Arrow keys when focused.
                  </Text>
                </Stack>
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                ref={sidebarHandleRef}
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
    const topHandleRef = useRef<HTMLDivElement>(null);
    const top = useResizable(topHandleRef, {
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
            <div style={{height: top.size}}>
              <LayoutPanel padding={4} width="100%">
                <Stack gap={2}>
                  <Heading level={4}>Editor</Heading>
                  <Text>
                    <span {...stylex.props(ps.sz)}>{top.size}px</span>
                  </Text>
                </Stack>
              </LayoutPanel>
              <ResizeHandle
                direction="vertical"
                hasDivider
                ref={topHandleRef}
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

/** Collapsible sidebar — drag past threshold or double-click to collapse. */
export const Collapsible: Story = {
  render: () => {
    const sidebarHandleRef = useRef<HTMLDivElement>(null);
    const sidebar = useResizable(sidebarHandleRef, {
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
              {!sidebar.isCollapsed && (
                <LayoutPanel width={sidebar.size} hasDivider={false}>
                  <Stack gap={2}>
                    <Heading level={4}>Sidebar</Heading>
                    <Text>
                      <span {...stylex.props(ps.sz)}>{sidebar.size}px</span>
                    </Text>
                    <Text>Double-click handle or press Enter to collapse.</Text>
                  </Stack>
                </LayoutPanel>
              )}
              <ResizeHandle
                direction="horizontal"
                hasDivider
                ref={sidebarHandleRef}
                label="Resize sidebar"
              />
            </>
          }
          content={
            <LayoutContent>
              <Stack gap={2}>
                <Heading level={4}>Content</Heading>
                <Text>
                  Sidebar is {sidebar.isCollapsed ? 'collapsed' : 'expanded'}.
                  {sidebar.isCollapsed && (
                    <button
                      onClick={() => sidebar.expand()}
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
    const explorerHandleRef = useRef<HTMLDivElement>(null);
    const explorer = useResizable(explorerHandleRef, {
      defaultSize: 220,
      minSize: 150,
      maxSize: 400,
    });
    const editorHandleRef = useRef<HTMLDivElement>(null);
    const editor = useResizable(editorHandleRef, {
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
                ref={explorerHandleRef}
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
                  ref={editorHandleRef}
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
    const sidebarHandleRef = useRef<HTMLDivElement>(null);
    const sidebar = useResizable(sidebarHandleRef, {
      defaultSize: 260,
      minSize: 56,
      maxSize: 600,
      snaps: [56, 160, 260, 400],
    });
    const isRail = sidebar.size <= 60;
    return (
      <div {...stylex.props(ps.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={sidebar.size} hasDivider={false}>
                {isRail ? (
                  <Text>{'\u2630'}</Text>
                ) : (
                  <Stack gap={2}>
                    <Heading level={4}>Sidebar</Heading>
                    <Text>
                      <span {...stylex.props(ps.sz)}>{sidebar.size}px</span>
                    </Text>
                    <Text>Snaps to 56 \u00b7 160 \u00b7 260 \u00b7 400px.</Text>
                  </Stack>
                )}
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                ref={sidebarHandleRef}
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
    const sidebarHandleRef = useRef<HTMLDivElement>(null);
    const sidebar = useResizable(sidebarHandleRef, {
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
              <LayoutPanel width={sidebar.size} hasDivider={false}>
                <Stack gap={2}>
                  <Heading level={4}>Sidebar</Heading>
                  <Text>
                    <span {...stylex.props(ps.sz)}>{sidebar.size}px</span>
                  </Text>
                  <Text>Pill only appears on hover.</Text>
                </Stack>
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                isAlwaysVisible={false}
                ref={sidebarHandleRef}
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
    const sidebarHandleRef = useRef<HTMLDivElement>(null);
    const sidebar = useResizable(sidebarHandleRef, {
      defaultSize: 250,
      minSize: 150,
    });
    return (
      <div {...stylex.props(ps.shell)}>
        <Layout
          height="fill"
          start={
            <>
              <LayoutPanel width={sidebar.size} hasDivider={false}>
                <Heading level={4}>Sidebar (locked)</Heading>
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                ref={sidebarHandleRef}
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
    const sidebarHandleRef = useRef<HTMLDivElement>(null);
    const sidebar = useResizable(sidebarHandleRef, {
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
              {!sidebar.isCollapsed && (
                <LayoutPanel
                  width={sidebar.size}
                  hasDivider={false}
                  role="navigation"
                  label="Sidebar">
                  <Stack gap={2}>
                    <Heading level={4}>Navigation</Heading>
                    <Text>
                      <span {...stylex.props(ps.sz)}>{sidebar.size}px</span>
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
                ref={sidebarHandleRef}
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
                    {sidebar.isCollapsed ? 'collapsed' : 'expanded'}
                  </strong>
                  {sidebar.isCollapsed && (
                    <button
                      onClick={() => sidebar.expand()}
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
    const navHandleRef = useRef<HTMLDivElement>(null);
    const nav = useResizable(navHandleRef, {
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
              {!nav.isCollapsed && (
                <LayoutPanel width={nav.size} hasDivider={false} padding={0}>
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
                ref={navHandleRef}
                label="Resize navigation"
              />
            </>
          }
          content={
            <LayoutContent>
              <Stack gap={3}>
                <Heading level={3}>Dashboard</Heading>
                <Text>
                  <span {...stylex.props(ps.sz)}>{nav.size}px</span>
                  {' \u2014 '}
                  {nav.isCollapsed ? 'Collapsed' : 'Expanded'}
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
    const sidebarHandleRef = useRef<HTMLDivElement>(null);
    const sidebar = useResizable(sidebarHandleRef, {
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
              <LayoutPanel width={sidebar.size} hasDivider={false}>
                <Stack gap={2}>
                  <Heading level={4}>Sidebar</Heading>
                  <Text>
                    <span {...stylex.props(ps.sz)}>{sidebar.size}px</span>
                  </Text>
                  <Text>Drag right, across the preview, and back.</Text>
                </Stack>
              </LayoutPanel>
              <ResizeHandle
                direction="horizontal"
                hasDivider
                ref={sidebarHandleRef}
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
