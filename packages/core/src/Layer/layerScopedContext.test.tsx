// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerScopedContext.test.tsx
 * @input Scoped context boundaries and grouped controls
 * @output Whole membership, local ownership, and state preservation regressions
 * @position Behavior coverage for AST-038 provider boundaries
 */

import {createContext, use, useState, type ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {
  createLayerScopedContext,
  LayerContentBoundary,
} from './layerScopedContext';
import {Dialog} from '../Dialog';
import {useLayer} from './useLayer';
import {Button} from '../Button';
import {ButtonGroup} from '../ButtonGroup';
import {InputGroup} from '../InputGroup';
import {TextInput} from '../TextInput';
import {Avatar} from '../Avatar';
import {AvatarGroup} from '../AvatarGroup';
import {
  IconDefaultSizeProvider,
  useIconSize,
} from '../Icon/IconDefaultSizeContext';
import {ToggleButton, ToggleButtonGroup} from '../ToggleButton';
import {FormLayoutContext} from '../FormLayout';
import {LayoutAreaContext} from '../Layout/LayoutAreaContext';
import {TabListContext, useTabListContext} from '../TabList/TabListContext';
import {
  SegmentedControlContext,
  useSegmentedControlContext,
} from '../SegmentedControl/SegmentedControlContext';
import {
  RadioListContext,
  type RadioListContextValue,
} from '../RadioList/RadioList';
import {RadioListItem} from '../RadioList';
import {CheckboxListContext} from '../CheckboxList/CheckboxListContext';
import {
  DropdownMenuContext,
  DropdownMenuRadioGroupContext,
} from '../DropdownMenu/DropdownMenuContext';
import {LayerDepthContext, LayerDepthProvider} from './LayerDepthContext';
import {Stepper, Step} from '../Stepper';
import {
  StepperContext,
  StepperInternalContext,
} from '../Stepper/StepperContext';

const noop = () => {};
const Scoped = createLayerScopedContext('default');
const ServiceContext = createContext('service');
ServiceContext.displayName = 'ServiceContext';

function ReadScope({id}: {id: string}) {
  return (
    <output data-testid={id}>
      {use(Scoped)}:{use(ServiceContext)}
    </output>
  );
}
function Fixed({children}: {children: ReactNode}) {
  const layer = useLayer({mode: 'fixed'});
  // jsdom does not paint :popover-open; this exercises context, not visibility.
  return <>{layer.render(children, {x: 0, y: 0, style: {display: 'block'}})}</>;
}
const boundaries = [
  ['fixed Layer', (content: ReactNode) => <Fixed>{content}</Fixed>],
  [
    'inline Dialog',
    (content: ReactNode) => (
      <Dialog isOpen isInline onOpenChange={noop}>
        {content}
      </Dialog>
    ),
  ],
] as const;

afterEach(cleanup);

describe('layer-scoped context', () => {
  it('uses the complete default value rather than retaining ancestor fields', () => {
    const fallback = {
      isDisabled: false,
      selected: new Set<string>(),
      onChange: vi.fn(),
    };
    const Membership = createLayerScopedContext(fallback);
    const outer = {
      isDisabled: true,
      selected: new Set(['outer']),
      onChange: vi.fn(),
    };
    function Probe() {
      expect(use(Membership)).toBe(fallback);
      return null;
    }
    const tree = (value: typeof outer) => (
      <Membership value={value}>
        <LayerContentBoundary>
          <Probe />
        </LayerContentBoundary>
      </Membership>
    );
    const {rerender} = render(tree(outer));
    rerender(tree({...outer, selected: new Set(['updated'])}));
  });

  it('keeps the public depth provider limited to depth', () => {
    const Membership = createLayerScopedContext('default');
    function Probe() {
      expect(use(Membership)).toBe('outer');
      expect(use(LayerDepthContext)).toBe(3);
      return null;
    }
    render(
      <Membership value="outer">
        <LayerDepthContext value={2}>
          <LayerDepthProvider>
            <Probe />
          </LayerDepthProvider>
        </LayerDepthContext>
      </Membership>,
    );
  });

  it('isolates future scoped providers, not unrelated application services', () => {
    render(
      <ServiceContext value="live service">
        <Scoped value="outer">
          <ReadScope id="outside" />
          <LayerContentBoundary>
            <ReadScope id="isolated" />
            <Scoped value="content">
              <ReadScope id="local" />
              <LayerContentBoundary>
                <ReadScope id="nested" />
              </LayerContentBoundary>
            </Scoped>
          </LayerContentBoundary>
        </Scoped>
      </ServiceContext>,
    );
    expect(screen.getByTestId('outside')).toHaveTextContent(
      'outer:live service',
    );
    expect(screen.getByTestId('isolated')).toHaveTextContent(
      'default:live service',
    );
    expect(screen.getByTestId('local')).toHaveTextContent(
      'content:live service',
    );
    expect(screen.getByTestId('nested')).toHaveTextContent(
      'default:live service',
    );
  });

  it('preserves content state and focus when another module registers a context', () => {
    function Content() {
      const [value, setValue] = useState('');
      return (
        <input
          aria-label="Draft"
          value={value}
          onChange={e => setValue(e.target.value)}
        />
      );
    }
    const {rerender} = render(
      <LayerContentBoundary>
        <Content />
      </LayerContentBoundary>,
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, {target: {value: 'keep me'}});
    input.focus();
    const Late = createLayerScopedContext('late default');
    rerender(
      <LayerContentBoundary>
        <Content />
      </LayerContentBoundary>,
    );
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('keep me');
    expect(input).toHaveFocus();
    function ReadLate() {
      return <output>{use(Late)}</output>;
    }
    render(
      <Late value="outer late">
        <LayerContentBoundary>
          <ReadLate />
        </LayerContentBoundary>
      </Late>,
    );
    expect(screen.getByText('late default')).toBeInTheDocument();
  });

  it('keeps explicit content-provider updates live', () => {
    const content = (value: string) => (
      <LayerContentBoundary>
        <Scoped value={value}>
          <ReadScope id="content" />
        </Scoped>
      </LayerContentBoundary>
    );
    const {rerender} = render(content('first'));
    rerender(content('second'));
    expect(screen.getByTestId('content')).toHaveTextContent('second:service');
  });
});

describe.each(boundaries)('%s provider boundary', (name, boundary) => {
  it('preserves unrelated collection protocols and semantic layout ownership', () => {
    const callback = vi.fn();
    const radio = {value: 'one', onChange: callback, hasCloseOnSelect: false};
    function Probe() {
      expect(use(DropdownMenuRadioGroupContext)).toBe(radio);
      expect(use(LayoutAreaContext)).toBe('header');
      return null;
    }
    render(
      <DropdownMenuRadioGroupContext value={radio}>
        <LayoutAreaContext value="header">
          {boundary(<Probe />)}
        </LayoutAreaContext>
      </DropdownMenuRadioGroupContext>,
    );
  });

  it('ends CheckboxList membership and preserves a complete local owner', () => {
    const outer = {
      value: ['outer'],
      onChange: vi.fn(),
      isDisabled: true,
      isReadOnly: true,
    };
    const local = {
      value: ['local'],
      onChange: vi.fn(),
      isDisabled: false,
      isReadOnly: false,
    };
    function Probe({expected}: {expected: typeof outer | null}) {
      expect(use(CheckboxListContext)).toBe(expected);
      return null;
    }
    render(
      <CheckboxListContext value={outer}>
        {boundary(
          <>
            <Probe expected={null} />
            <CheckboxListContext value={local}>
              <Probe expected={local} />
            </CheckboxListContext>
          </>,
        )}
      </CheckboxListContext>,
    );
  });

  it('ends ancestor membership and preserves complete content-local providers', () => {
    const outerChange = vi.fn();
    const localChange = vi.fn();
    const tabs = {
      value: 'outer',
      onChange: outerChange,
      size: 'lg',
      layout: 'fill',
      pattern: 'tabs',
    } as const;
    const segments = {
      value: 'outer',
      onChange: outerChange,
      size: 'lg',
      layout: 'fill',
      isDisabled: true,
    } as const;
    const radios: RadioListContextValue = {
      name: 'outer',
      value: 'outer',
      onChange: outerChange,
      isDisabled: true,
      hasDisabledMessage: false,
      isRequired: false,
      size: 'md',
    };
    const menu = {closeMenu: outerChange, menuSize: 'lg'} as const;
    const localTabs = {...tabs, value: 'inner', onChange: localChange};
    const localSegments = {
      ...segments,
      value: 'inner',
      onChange: localChange,
      isDisabled: false,
    };
    const localRadios = {
      ...radios,
      name: 'inner',
      value: 'inner',
      onChange: localChange,
      isDisabled: false,
    };
    const localMenu = {...menu, closeMenu: localChange};
    function OutsideLocalProvider() {
      expect(use(TabListContext)).toBeNull();
      expect(use(SegmentedControlContext)).toBeNull();
      expect(use(RadioListContext)).toBeNull();
      expect(use(DropdownMenuContext)).toBeNull();
      expect(use(FormLayoutContext).defaultOptionality).toBeUndefined();
      return null;
    }
    function InsideLocalProvider() {
      expect(useTabListContext()).toBe(localTabs);
      expect(useSegmentedControlContext()).toBe(localSegments);
      expect(use(RadioListContext)).toBe(localRadios);
      expect(use(DropdownMenuContext)).toBe(localMenu);
      return <RadioListItem label="Local option" value="inner" />;
    }
    render(
      <TabListContext value={tabs}>
        <SegmentedControlContext value={segments}>
          <RadioListContext value={radios}>
            <DropdownMenuContext value={menu}>
              <FormLayoutContext
                value={{
                  direction: 'horizontal-labels',
                  defaultOptionality: 'required',
                }}>
                {boundary(
                  <>
                    <OutsideLocalProvider />
                    <TabListContext value={localTabs}>
                      <SegmentedControlContext value={localSegments}>
                        <RadioListContext value={localRadios}>
                          <DropdownMenuContext value={localMenu}>
                            <InsideLocalProvider />
                          </DropdownMenuContext>
                        </RadioListContext>
                      </SegmentedControlContext>
                    </TabListContext>
                  </>,
                )}
              </FormLayoutContext>
            </DropdownMenuContext>
          </RadioListContext>
        </SegmentedControlContext>
      </TabListContext>,
    );
    expect(screen.getByRole('radio', {name: 'Local option'})).toBeChecked();
    expect(screen.getByRole('radio', {name: 'Local option'})).toBeEnabled();
    expect(outerChange).not.toHaveBeenCalled();
  });

  it('uses standalone icon sizing while retaining outer and explicit inner owners', () => {
    function IconSize({id}: {id: string}) {
      return <output data-testid={id}>{useIconSize(undefined)}</output>;
    }
    render(
      <>
        <IconSize id="standalone-size" />
        <IconDefaultSizeProvider value="sm">
          <IconSize id="outer-size" />
          {boundary(
            <>
              <IconSize id="layer-size" />
              <IconDefaultSizeProvider value="lg">
                <IconSize id="local-size" />
              </IconDefaultSizeProvider>
            </>,
          )}
        </IconDefaultSizeProvider>
      </>,
    );
    expect(screen.getByTestId('standalone-size')).toHaveTextContent('md');
    expect(screen.getByTestId('outer-size')).toHaveTextContent('sm');
    expect(screen.getByTestId('layer-size').textContent).toBe(
      screen.getByTestId('standalone-size').textContent,
    );
    expect(screen.getByTestId('local-size')).toHaveTextContent('lg');
  });

  it('ends stepper membership while a complete inner stepper owns its actions', () => {
    const outerChange = vi.fn();
    const localChange = vi.fn();
    function Independent() {
      expect(use(StepperContext)).toBeNull();
      expect(use(StepperInternalContext)).toBeNull();
      return (
        <Stepper activeStep={0} onStepClick={localChange}>
          <Step step={0} label="Local first" />
          <Step step={1} label="Local second" />
        </Stepper>
      );
    }
    render(
      <Stepper activeStep={1} onStepClick={outerChange}>
        <Step step={0} label="Outer first" />
        <Step step={1} label="Outer second" />
        {boundary(<Independent />)}
      </Stepper>,
    );
    fireEvent.click(screen.getByRole('button', {name: /Local second/}));
    expect(localChange).toHaveBeenCalledWith(1);
    expect(outerChange).not.toHaveBeenCalled();
  });

  it('keeps existing layer-depth semantics', () => {
    function Depth() {
      return <output>{use(LayerDepthContext)}</output>;
    }
    render(
      <LayerDepthContext value={4}>{boundary(<Depth />)}</LayerDepthContext>,
    );
    expect(
      screen.getByText(name === 'fixed Layer' ? '4' : '5'),
    ).toBeInTheDocument();
  });

  it('ends group-owned disabled state while preserving explicit and inner-group state', () => {
    const press = vi.fn();
    render(
      <ButtonGroup label="Outer" isDisabled>
        <Button label="Outer member" />
        {boundary(
          <>
            <Button label="Independent" onClick={press} />
            <Button label="Explicit disabled" isDisabled />
            <ButtonGroup label="Inner" isDisabled>
              <Button label="Inner member" />
            </ButtonGroup>
          </>,
        )}
      </ButtonGroup>,
    );
    expect(screen.getByRole('button', {name: 'Outer member'})).toBeDisabled();
    const independent = screen.getByRole('button', {name: 'Independent'});
    expect(independent).toBeEnabled();
    fireEvent.click(independent);
    expect(press).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', {name: 'Explicit disabled'}),
    ).toBeDisabled();
    expect(screen.getByRole('button', {name: 'Inner member'})).toBeDisabled();
  });

  it('ends group-owned labels without changing the content input label', () => {
    render(
      <InputGroup label="Outer label">
        {boundary(<TextInput label="Inner label" value="" onChange={noop} />)}
      </InputGroup>,
    );
    expect(
      screen.getByRole('textbox', {name: 'Inner label'}),
    ).toHaveAccessibleName('Inner label');
  });

  it('ends ancestor selection and callbacks while honoring explicit toggle props', () => {
    const outerChange = vi.fn();
    const localChange = vi.fn();
    render(
      <ToggleButtonGroup label="Outer" value="x" onChange={outerChange}>
        {boundary(
          <ToggleButton
            value="x"
            label="Independent"
            isPressed={false}
            onPressedChange={localChange}
          />,
        )}
      </ToggleButtonGroup>,
    );
    const toggle = screen.getByRole('button', {name: 'Independent'});
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(localChange).toHaveBeenCalledWith(true, expect.anything());
    expect(outerChange).not.toHaveBeenCalled();
  });

  it('restores standalone tooltip focusability while preserving an inner avatar group', () => {
    render(
      <AvatarGroup>
        {boundary(
          <>
            <Avatar name="Independent" data-testid="avatar" />
            <AvatarGroup>
              <Avatar name="Inner" data-testid="inner-avatar" />
            </AvatarGroup>
          </>,
        )}
      </AvatarGroup>,
    );
    expect(screen.getByTestId('avatar')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('inner-avatar')).not.toHaveAttribute('tabindex');
  });
});
