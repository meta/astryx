// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useEffect, useRef} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {createResizable} from '@astryxdesign/core/Resizable';

const s = stylex.create({
  shell: {
    display: 'flex',
    height: 300,
    width: '100%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    overflow: 'hidden',
  },
  // The width the region reports is the sidebar's whole width, so the
  // padding sits on an inner element: a sidebar collapsed to 0 leaves no
  // strip.
  sidebar: {
    flexShrink: 0,
    backgroundColor: colorVars['--color-background-muted'],
    overflow: 'hidden',
  },
  sidebarContent: {
    padding: spacingVars['--spacing-3'],
    whiteSpace: 'nowrap',
  },
  divider: {
    flexShrink: 0,
    width: 8,
    cursor: 'col-resize',
    backgroundColor: colorVars['--color-border'],
    outline: {
      default: 'none',
      ':focus-visible': `2px solid ${colorVars['--color-accent']}`,
    },
    touchAction: 'none',
  },
  preview: {
    flexGrow: 1,
    minWidth: 0,
    borderWidth: 0,
  },
});

/**
 * A split view whose divider is a plain element: createResizable makes it a
 * window splitter, and the sidebar's width follows `size` through
 * `subscribe`. React renders the elements once and holds no resize state.
 * The preview is an embedded frame: a drag across it keeps going, because the
 * divider holds its pointer for the whole drag.
 */
function PlainSplit() {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<HTMLSpanElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sidebar = sidebarRef.current;
    const size = sizeRef.current;
    const divider = dividerRef.current;
    if (sidebar == null || size == null || divider == null) {
      return;
    }
    const resizable = createResizable(divider, {
      defaultSize: 160,
      minSize: 120,
      maxSize: 320,
      collapsible: true,
      label: 'Resize sidebar',
    });
    const paint = () => {
      sidebar.style.width = `${resizable.size}px`;
      size.textContent = `${Math.round(resizable.size)}px`;
    };
    paint();
    const stop = resizable.subscribe(paint);
    return () => {
      stop();
      resizable.destroy();
    };
  }, []);
  return (
    <div {...stylex.props(s.shell)}>
      <div ref={sidebarRef} data-testid="sidebar" {...stylex.props(s.sidebar)}>
        <div {...stylex.props(s.sidebarContent)}>
          Sidebar <span ref={sizeRef} data-testid="sidebar-size" />
        </div>
      </div>
      <div ref={dividerRef} {...stylex.props(s.divider)} />
      <iframe
        title="Preview"
        srcDoc="<!doctype html><body style='margin:0;font:14px system-ui;display:grid;place-items:center;height:100vh'>Embedded preview</body>"
        {...stylex.props(s.preview)}
      />
    </div>
  );
}

const meta: Meta<typeof PlainSplit> = {
  title: 'Core/Hooks/createResizable',
  component: PlainSplit,
  parameters: {
    docs: {
      description: {
        component:
          'createResizable(handle, options) makes a plain element a window splitter, without React. It reports the size; the caller sizes the panel. In React, use useResizable(handleRef, options) with ResizeHandle.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof PlainSplit>;

/** Drag the divider right, across the preview, and back; or focus it and use the arrow keys, Home, End and Enter. */
export const WithEmbeddedFrame: Story = {};
