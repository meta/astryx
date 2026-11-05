// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayoutSlots.test.tsx
 * @input Uses vitest, @testing-library/react, Layout slot components
 * @output Characterization tests for LayoutHeader, LayoutFooter,
 *   LayoutContent and LayoutPanel
 * @position Testing; validates the slot primitives' rendering, landmark roles,
 *   divider reflection, sizing and context-driven behavior
 *
 * SYNC: When LayoutHeader/LayoutFooter/LayoutContent/LayoutPanel change,
 * update tests to match new behavior
 */

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {createRef} from 'react';
import {Layout} from './Layout';
import {LayoutHeader} from './LayoutHeader';
import {LayoutFooter} from './LayoutFooter';
import {LayoutContent} from './LayoutContent';
import {LayoutPanel} from './LayoutPanel';
import {LayoutDividerContext} from './LayoutDividerContext';
import {useResizable} from '../Resizable/useResizable';

// =============================================================================
// LayoutHeader
// =============================================================================

describe('LayoutHeader', () => {
  it('renders its children', () => {
    render(<LayoutHeader>Page title</LayoutHeader>);
    expect(screen.getByText('Page title')).toBeInTheDocument();
  });

  it('carries the astryx-layout-header class', () => {
    const {container} = render(<LayoutHeader>H</LayoutHeader>);
    expect(
      container.querySelector('.astryx-layout-header'),
    ).toBeInTheDocument();
  });

  it('exposes a landmark role and accessible name', () => {
    render(
      <LayoutHeader role="banner" label="Site header">
        H
      </LayoutHeader>,
    );
    expect(
      screen.getByRole('banner', {name: 'Site header'}),
    ).toBeInTheDocument();
  });

  it('omits data-divider by default', () => {
    const {container} = render(<LayoutHeader>H</LayoutHeader>);
    expect(
      container
        .querySelector('.astryx-layout-header')
        ?.hasAttribute('data-divider'),
    ).toBe(false);
  });

  it('reflects hasDivider as data-divider="true"', () => {
    const {container} = render(<LayoutHeader hasDivider>H</LayoutHeader>);
    expect(
      container
        .querySelector('.astryx-layout-header')
        ?.getAttribute('data-divider'),
    ).toBe('true');
  });

  it('inherits the divider default from LayoutDividerContext', () => {
    const {container} = render(
      <LayoutDividerContext value={{defaultHasDividers: true}}>
        <LayoutHeader>H</LayoutHeader>
      </LayoutDividerContext>,
    );
    expect(
      container
        .querySelector('.astryx-layout-header')
        ?.getAttribute('data-divider'),
    ).toBe('true');
  });

  it('an explicit hasDivider={false} overrides an inherited true default', () => {
    const {container} = render(
      <LayoutDividerContext value={{defaultHasDividers: true}}>
        <LayoutHeader hasDivider={false}>H</LayoutHeader>
      </LayoutDividerContext>,
    );
    expect(
      container
        .querySelector('.astryx-layout-header')
        ?.hasAttribute('data-divider'),
    ).toBe(false);
  });

  it('applies a numeric height to the element style', () => {
    const {container} = render(<LayoutHeader height={64}>H</LayoutHeader>);
    const el = container.querySelector('.astryx-layout-header') as HTMLElement;
    expect(el.getAttribute('style') ?? '').toContain('64px');
  });

  it('forwards ref to the outer element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<LayoutHeader ref={ref}>H</LayoutHeader>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.className).toContain('astryx-layout-header');
  });

  it('merges a caller className', () => {
    const {container} = render(
      <LayoutHeader className="hdr-custom">H</LayoutHeader>,
    );
    const el = container.querySelector('.astryx-layout-header') as HTMLElement;
    expect(el.className).toContain('hdr-custom');
  });

  it('renders children in an inner wrapper (padding owner), not directly on the root', () => {
    const {container} = render(<LayoutHeader>Inner</LayoutHeader>);
    const root = container.querySelector(
      '.astryx-layout-header',
    ) as HTMLElement;
    // Children live in a nested inner wrapper (the padding owner), not on the
    // divider-owning root itself.
    const inner = screen.getByText('Inner');
    expect(inner).not.toBe(root);
    expect(inner.parentElement).toBe(root);
    expect(root).toContainElement(inner);
  });
});

// =============================================================================
// LayoutFooter
// =============================================================================

describe('LayoutFooter', () => {
  it('renders its children', () => {
    render(<LayoutFooter>Actions</LayoutFooter>);
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('carries the astryx-layout-footer class', () => {
    const {container} = render(<LayoutFooter>F</LayoutFooter>);
    expect(
      container.querySelector('.astryx-layout-footer'),
    ).toBeInTheDocument();
  });

  it('exposes a landmark role and accessible name', () => {
    render(
      <LayoutFooter role="contentinfo" label="Page footer">
        F
      </LayoutFooter>,
    );
    expect(
      screen.getByRole('contentinfo', {name: 'Page footer'}),
    ).toBeInTheDocument();
  });

  it('omits data-divider by default and reflects hasDivider when set', () => {
    const {container, rerender} = render(<LayoutFooter>F</LayoutFooter>);
    const sel = '.astryx-layout-footer';
    expect(container.querySelector(sel)?.hasAttribute('data-divider')).toBe(
      false,
    );
    rerender(<LayoutFooter hasDivider>F</LayoutFooter>);
    expect(container.querySelector(sel)?.getAttribute('data-divider')).toBe(
      'true',
    );
  });

  it('inherits the divider default from context', () => {
    const {container} = render(
      <LayoutDividerContext value={{defaultHasDividers: true}}>
        <LayoutFooter>F</LayoutFooter>
      </LayoutDividerContext>,
    );
    expect(
      container
        .querySelector('.astryx-layout-footer')
        ?.getAttribute('data-divider'),
    ).toBe('true');
  });

  it('forwards ref to the outer element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<LayoutFooter ref={ref}>F</LayoutFooter>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.className).toContain('astryx-layout-footer');
  });
});

// =============================================================================
// LayoutContent
// =============================================================================

describe('LayoutContent', () => {
  it('renders its children', () => {
    render(<LayoutContent>Body</LayoutContent>);
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('carries the astryx-layout-content class', () => {
    const {container} = render(<LayoutContent>C</LayoutContent>);
    expect(
      container.querySelector('.astryx-layout-content'),
    ).toBeInTheDocument();
  });

  it('keeps the public root as the scroll and direct-child owner', () => {
    const {container} = render(<LayoutContent>Body</LayoutContent>);
    const root = container.querySelector(
      '.astryx-layout-content',
    ) as HTMLElement;

    expect(getComputedStyle(root).overflow).toBe('auto');
    expect(root).toHaveTextContent('Body');
    expect(root.childNodes).toHaveLength(1);
    expect(root.querySelector('[data-layout-content-inner]')).toBeNull();
  });

  it('exposes the main landmark role with an accessible name', () => {
    render(
      <LayoutContent role="main" label="Main content">
        C
      </LayoutContent>,
    );
    expect(
      screen.getByRole('main', {name: 'Main content'}),
    ).toBeInTheDocument();
  });

  it('forwards ref to the element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<LayoutContent ref={ref}>C</LayoutContent>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.className).toContain('astryx-layout-content');
  });

  it('merges caller className and inline style', () => {
    const {container} = render(
      <LayoutContent className="body-custom" style={{color: 'rgb(1, 2, 3)'}}>
        C
      </LayoutContent>,
    );
    const el = container.querySelector('.astryx-layout-content') as HTMLElement;
    expect(el.className).toContain('body-custom');
    expect(el.style.color).toBe('rgb(1, 2, 3)');
  });

  it('renders correctly as the content slot of a Layout (reads slot context)', () => {
    render(
      <Layout
        header={<LayoutHeader>H</LayoutHeader>}
        content={<LayoutContent role="main">Main</LayoutContent>}
      />,
    );
    expect(screen.getByRole('main')).toHaveTextContent('Main');
  });

  it('accepts padding={0} (full bleed) and a numeric padding without crashing', () => {
    const {rerender, container} = render(
      <LayoutContent padding={0}>C</LayoutContent>,
    );
    expect(
      container.querySelector('.astryx-layout-content'),
    ).toBeInTheDocument();
    rerender(<LayoutContent padding={6}>C</LayoutContent>);
    expect(
      container.querySelector('.astryx-layout-content'),
    ).toBeInTheDocument();
  });
});

// =============================================================================
// LayoutPanel
// =============================================================================

describe('LayoutPanel', () => {
  it('renders its children', () => {
    render(<LayoutPanel>Nav</LayoutPanel>);
    expect(screen.getByText('Nav')).toBeInTheDocument();
  });

  it('carries the astryx-layout-panel class', () => {
    const {container} = render(<LayoutPanel>P</LayoutPanel>);
    expect(container.querySelector('.astryx-layout-panel')).toBeInTheDocument();
  });

  it('exposes a navigation landmark with an accessible name', () => {
    render(
      <LayoutPanel role="navigation" label="Primary">
        P
      </LayoutPanel>,
    );
    expect(
      screen.getByRole('navigation', {name: 'Primary'}),
    ).toBeInTheDocument();
  });

  it('applies a numeric width to the element style', () => {
    const {container} = render(<LayoutPanel width={240}>P</LayoutPanel>);
    const el = container.querySelector('.astryx-layout-panel') as HTMLElement;
    expect(el.getAttribute('style') ?? '').toContain('240px');
  });

  it('applies a string width to the element style', () => {
    const {container} = render(<LayoutPanel width="18rem">P</LayoutPanel>);
    const el = container.querySelector('.astryx-layout-panel') as HTMLElement;
    expect(el.getAttribute('style') ?? '').toContain('18rem');
  });

  it('resizable._size overrides the width prop', () => {
    function Harness() {
      const region = useResizable({defaultSize: 300});
      return (
        <LayoutPanel width={100} resizable={region.props}>
          P
        </LayoutPanel>
      );
    }
    const {container} = render(<Harness />);
    const el = container.querySelector('.astryx-layout-panel') as HTMLElement;
    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('300px');
    expect(style).not.toContain('100px');
  });

  it('forwards ref to the element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<LayoutPanel ref={ref}>P</LayoutPanel>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.className).toContain('astryx-layout-panel');
  });

  it('renders as a start-slot panel inside a Layout without crashing', () => {
    render(
      <Layout
        start={
          <LayoutPanel hasDivider role="navigation" label="Side">
            Sidebar
          </LayoutPanel>
        }
        content={<LayoutContent>Main</LayoutContent>}
      />,
    );
    expect(screen.getByRole('navigation', {name: 'Side'})).toHaveTextContent(
      'Sidebar',
    );
  });

  it('renders as an end-slot panel inside a Layout without crashing', () => {
    render(
      <Layout
        end={
          <LayoutPanel hasDivider role="complementary" label="Inspector">
            Details
          </LayoutPanel>
        }
        content={<LayoutContent>Main</LayoutContent>}
      />,
    );
    expect(
      screen.getByRole('complementary', {name: 'Inspector'}),
    ).toHaveTextContent('Details');
  });

  it('merges a caller className', () => {
    const {container} = render(
      <LayoutPanel className="panel-custom">P</LayoutPanel>,
    );
    const el = container.querySelector('.astryx-layout-panel') as HTMLElement;
    expect(el.className).toContain('panel-custom');
  });
});
