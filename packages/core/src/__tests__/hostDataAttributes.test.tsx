// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hostDataAttributes.test.tsx
 * @input Uses vitest, @testing-library/react, every public export of index.ts
 * @output Conformance test: a `data-*` attribute on a component reaches the DOM
 * @position Testing; guards the documented host-attribute contract
 *
 * Every exported component that renders an element of its own passes a
 * `data-*` attribute through to that element, so tools and tests can tag it.
 * A component that renders no element of its own is listed in
 * BOX_LESS_COMPONENTS with the reason.
 */

import {
  Component,
  createElement,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render} from '@testing-library/react';

import * as Core from '../index';

const PROBE = 'data-host-probe';

type Probe = {[PROBE]: string};

/**
 * Exports that render no element of their own. Each one forwards its
 * children, or renders its content into another component's element.
 */
const BOX_LESS_COMPONENTS: ReadonlyMap<string, string> = new Map([
  // Providers: they set context or theme values and render only children.
  ['InternationalizationProvider', 'provider; renders only its children'],
  ['LayerProvider', 'provider; renders only its children'],
  ['LinkProvider', 'provider; renders only its children'],
  ['MediaTheme', 'provider; renders only its children'],
  ['SyntaxTheme', 'provider; renders only its children'],
  ['Theme', 'provider; renders only its children'],
  // Layers attach to a trigger the caller renders; the surface opens later.
  ['HoverCard', 'wraps its trigger; the surface is a layer'],
  ['Popover', 'wraps its trigger; the surface is a layer'],
  ['Tooltip', 'wraps its trigger; the surface is a layer'],
  // A data entry for Selector; Selector renders the option element.
  ['SelectorOption', 'declares an option; Selector renders it'],
]);

const noop = () => {};

const searchSource = {search: () => [], bootstrap: () => []} as never;

const dictation = {
  isSupported: true,
  isListening: false,
  isSpeaking: false,
  volume: 0,
  bands: [],
  rawBands: [],
  interimTranscript: '',
  start: noop,
  stop: noop,
  abort: noop,
} as never;

const mobileShell = {
  isMobile: true,
  isMobileNavOpen: false,
  toggleMobileNav: noop,
  openMobileNav: noop,
  closeMobileNav: noop,
  isMobileNavEnabled: true,
  hasAutoToggle: true,
};

const isOperator: Core.PowerSearchOperator = {
  key: 'is',
  label: 'is',
  value: {type: 'string'},
};

const nameField: Core.PowerSearchField = {
  key: 'name',
  label: 'Name',
  operators: [isOperator],
};

const powerSearchConfig: Core.PowerSearchConfig = {
  name: 'Search',
  fields: [nameField],
};

/**
 * Components that need props, a parent, or an open state to render their
 * element. Every other component renders with the probe alone.
 */
const FIXTURES: Readonly<Record<string, (probe: Probe) => ReactElement>> = {
  BaseTypeahead: probe => (
    <Core.BaseTypeahead
      searchSource={searchSource}
      value={null}
      onChange={noop}
      {...probe}
    />
  ),
  ChatDictationButton: probe => (
    <Core.ChatDictationButton dictation={dictation} {...probe} />
  ),
  ChatMessageMetadata: probe => (
    <Core.ChatMessageMetadata timestamp="Now" {...probe} />
  ),
  MobileNavToggle: probe => (
    <Core.AppShellMobileContext value={mobileShell}>
      <Core.MobileNavToggle {...probe} />
    </Core.AppShellMobileContext>
  ),
  PowerSearchFilterEditor: probe => (
    <Core.PowerSearchFilterEditor
      config={powerSearchConfig}
      filter={{field: 'name', operator: 'is'}}
      mode="create"
      onSave={noop}
      onCancel={noop}
      {...probe}
    />
  ),
  PowerSearchToken: probe => (
    <Core.PowerSearchToken
      config={powerSearchConfig}
      filter={{
        field: 'name',
        operator: 'is',
        value: {type: 'string', value: 'a'},
      }}
      field={nameField}
      operator={isOperator}
      maxLength={40}
      {...probe}
    />
  ),
  SideNavCollapseButton: probe => (
    <Core.SideNavCollapseButton
      collapsible={{isCollapsed: false, onCollapsedChange: noop}}
      {...probe}
    />
  ),
  TableSelectionToolbar: probe => (
    <Core.TableSelectionToolbar
      selection={{
        selectedKeys: new Set(['a']),
        selectedCount: 1,
        hasSelection: true,
        clearSelection: noop,
      }}
      {...probe}
    />
  ),
  Typeahead: probe => (
    <Core.Typeahead
      label="Search"
      searchSource={searchSource}
      value={null}
      onChange={noop}
      {...probe}
    />
  ),
  TypeaheadItem: probe => (
    <Core.TypeaheadItem item={{id: 'a', label: 'A'} as never} {...probe} />
  ),
  BottomSheetSwitcher: probe => (
    <Core.BottomSheetSwitcher
      activeSheet="a"
      onActiveSheetChange={noop}
      {...probe}>
      <Core.BottomSheet sheetId="a" label="Sheet">
        Content
      </Core.BottomSheet>
    </Core.BottomSheetSwitcher>
  ),
  BreadcrumbMenuRadioItem: probe => (
    <Core.BreadcrumbMenuRadioGroup label="Pick" value="a" onChange={noop}>
      <Core.BreadcrumbMenuRadioItem value="a" label="A" {...probe} />
    </Core.BreadcrumbMenuRadioGroup>
  ),
  ChatComposerTokenElement: probe => (
    <Core.ChatComposerTokenElement
      token={{id: 't', label: 'Token'} as never}
      {...probe}
    />
  ),
  ChatToolCalls: probe => (
    <Core.ChatToolCalls
      calls={[{id: 'c', name: 'search', status: 'complete'}] as never}
      {...probe}
    />
  ),
  CheckIndicator: probe => <Core.CheckIndicator state="checked" {...probe} />,
  Citation: probe => (
    <Core.Citation
      source={{title: 'Source', url: 'https://example.com'}}
      number={1}
      {...probe}
    />
  ),
  CodeBlock: probe => <Core.CodeBlock code="const a = 1;" {...probe} />,
  CollapsibleGroup: probe => (
    <Core.CollapsibleGroup hasDividers {...probe}>
      <Core.Collapsible trigger="Section">Body</Core.Collapsible>
    </Core.CollapsibleGroup>
  ),
  ComplexSelector: probe => (
    <Core.ComplexSelector label="Pick" value="a" {...probe}>
      {() => null}
    </Core.ComplexSelector>
  ),
  ContextMenuRadioItem: probe => (
    <Core.ContextMenuRadioGroup label="Pick" value="a" onChange={noop}>
      <Core.ContextMenuRadioItem value="a" label="A" {...probe} />
    </Core.ContextMenuRadioGroup>
  ),
  DropdownMenuRadioItem: probe => (
    <Core.DropdownMenuRadioGroup label="Pick" value="a" onChange={noop}>
      <Core.DropdownMenuRadioItem value="a" label="A" {...probe} />
    </Core.DropdownMenuRadioGroup>
  ),
  Heading: probe => (
    <Core.Heading level={2} {...probe}>
      Title
    </Core.Heading>
  ),
  Icon: probe => <Core.Icon icon="info" {...probe} />,
  InfoTip: probe => <Core.InfoTip content="Help" {...probe} />,
  InputClearButton: probe => (
    <Core.InputClearButton label="Clear" onClick={noop} {...probe} />
  ),
  Kbd: probe => <Core.Kbd keys="mod+k" {...probe} />,
  Lightbox: probe => (
    <Core.Lightbox
      isOpen
      onOpenChange={noop}
      media={{type: 'image', src: 'https://example.com/a.png', alt: 'A'}}
      {...probe}
    />
  ),
  Markdown: probe => <Core.Markdown {...probe}>Text</Core.Markdown>,
  MoreMenu: probe => (
    <Core.MoreMenu items={[{label: 'Edit', onClick: noop}]} {...probe} />
  ),
  MultiSelector: probe => (
    <Core.MultiSelector
      label="Pick"
      options={[{value: 'a', label: 'A'}]}
      value={[]}
      onChange={noop}
      {...probe}
    />
  ),
  Outline: probe => (
    <Core.Outline
      items={[{id: 'a', label: 'A', level: 1}] as never}
      {...probe}
    />
  ),
  PowerSearch: probe => (
    <Core.PowerSearch
      config={powerSearchConfig}
      filters={[]}
      onChange={noop}
      {...probe}
    />
  ),
  RadioListItem: probe => (
    <Core.RadioList label="Pick" value="a" onChange={noop}>
      <Core.RadioListItem label="A" value="a" {...probe} />
    </Core.RadioList>
  ),
  SegmentedControlItem: probe => (
    <Core.SegmentedControl label="Pick" value="a" onChange={noop}>
      <Core.SegmentedControlItem value="a" label="A" {...probe} />
    </Core.SegmentedControl>
  ),
  Selector: probe => (
    <Core.Selector
      label="Pick"
      options={[{value: 'a', label: 'A'}]}
      value="a"
      onChange={noop}
      {...probe}
    />
  ),
  Step: probe => (
    <Core.Stepper activeStep={1}>
      <Core.Step step={1} label="One" {...probe} />
    </Core.Stepper>
  ),
  Tab: probe => (
    <Core.TabList value="a" onChange={noop}>
      <Core.Tab value="a" label="A" {...probe} />
    </Core.TabList>
  ),
  TabMenu: probe => (
    <Core.TabList value="a" onChange={noop}>
      <Core.TabMenu
        label="More"
        options={[{value: 'b', label: 'B'}]}
        {...probe}
      />
    </Core.TabList>
  ),
  Timestamp: probe => <Core.Timestamp value={0} {...probe} />,
  Toast: probe => (
    <Core.Toast
      type="info"
      body="Saved"
      isAutoHide={false}
      autoHideDuration={5000}
      onDismiss={noop}
      {...probe}
    />
  ),
  Tokenizer: probe => (
    <Core.Tokenizer
      label="Pick"
      searchSource={{search: () => []} as never}
      value={[]}
      onChange={noop}
      {...probe}
    />
  ),
  TopNavMenu: probe => (
    <Core.TopNavMenu
      label="Menu"
      items={[{title: 'A', href: '#a'}]}
      {...probe}
    />
  ),
  TreeList: probe => (
    <Core.TreeList items={[{id: 'a', label: 'A'}] as never} {...probe} />
  ),
};

class RenderBoundary extends Component<
  {children: ReactNode; onError: (error: unknown) => void},
  {failed: boolean}
> {
  state = {failed: false};
  static getDerivedStateFromError() {
    return {failed: true};
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function isReactContext(value: object): boolean {
  return (
    (value as {$$typeof?: symbol}).$$typeof === Symbol.for('react.context')
  );
}

function exportedComponents(): [string, ComponentType<Probe>][] {
  return Object.entries(Core).flatMap(([name, value]) => {
    if (!/^[A-Z]/.test(name)) {
      return [];
    }
    if (typeof value === 'function') {
      return [[name, value as ComponentType<Probe>]];
    }
    if (typeof value === 'object' && value !== null && '$$typeof' in value) {
      return isReactContext(value) ? [] : [[name, value as never]];
    }
    return [];
  });
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

afterEach(cleanup);

describe('host data attributes', () => {
  const components = exportedComponents();

  it('lists only exported components as box-less', () => {
    const names = new Set(components.map(([name]) => name));
    expect([...BOX_LESS_COMPONENTS.keys()].filter(n => !names.has(n))).toEqual(
      [],
    );
    expect(Object.keys(FIXTURES).filter(n => !names.has(n))).toEqual([]);
  });

  it.each(components.filter(([name]) => !BOX_LESS_COMPONENTS.has(name)))(
    '%s passes a data-* attribute to its element',
    (name, Element) => {
      const errors: unknown[] = [];
      const probe = {[PROBE]: name};
      const element = FIXTURES[name]?.(probe) ?? createElement(Element, probe);
      render(
        <RenderBoundary onError={error => errors.push(error)}>
          {element}
        </RenderBoundary>,
      );
      expect(errors).toEqual([]);
      expect(
        document.body.querySelector(`[${PROBE}="${name}"]`),
      ).not.toBeNull();
    },
  );
});
