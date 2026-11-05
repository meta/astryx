// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file InteractivePreview tests.
 * @input InteractivePreviewStage with radio-item, radio-group and Tokenizer
 *   playground previews
 * @output Regression coverage for wrapper-owned selection and open state and
 *   for the controlled-value change bridge.
 */

import {
  createContext,
  createElement,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import {describe, expect, it, vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {InteractivePreviewStage} from '../components/component-detail/InteractivePreview';
import {pickPrimaryProps} from '../components/component-detail/interactiveState';

vi.mock('@stylexjs/stylex', () => ({
  create: (styles: unknown) => styles,
  props: () => ({}),
}));
vi.mock('@astryxdesign/core/theme/syntax', () => ({allSyntaxPresets: []}));
vi.mock('../generated/themeRegistry', () => ({themeObjectsFull: {}}));
vi.mock('../components/component-detail/ComponentPreviewTheme', () => ({
  ComponentPreviewTheme: ({children}: {children: ReactNode}) =>
    createElement('div', null, children),
}));
vi.mock('../components/CodeExampleBlock', () => ({
  CodeExampleBlock: () => null,
}));

function Box({children}: {children?: ReactNode}) {
  return createElement('div', null, children);
}

function MockButton({label, onClick}: {label: string; onClick?: () => void}) {
  return createElement('button', {onClick}, label);
}

const MenuContext = createContext<{close: () => void}>({close: () => {}});

// Controlled like the real menu: renders its children only while open and
// reports every open/close through `onOpenChange`.
function MockDropdownMenu({
  button,
  isMenuOpen = false,
  onOpenChange,
  children,
}: {
  button: {label: string};
  isMenuOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  children?: ReactNode;
}) {
  return createElement(
    MenuContext.Provider,
    {value: {close: () => onOpenChange?.(false)}},
    createElement(
      'div',
      null,
      createElement(
        'button',
        {onClick: () => onOpenChange?.(!isMenuOpen)},
        button.label,
      ),
      isMenuOpen ? children : null,
    ),
  );
}

const RadioContext = createContext<{
  value?: string;
  onChange: (value: string) => void;
}>({onChange: () => {}});

// Selecting closes the enclosing menu, as `hasCloseOnSelect` does by default.
function MockRadioGroup({
  value,
  onChange,
  label,
  children,
}: {
  value?: string;
  onChange: (value: string) => void;
  label: string;
  children?: ReactNode;
}) {
  const menu = useContext(MenuContext);
  return createElement(
    RadioContext.Provider,
    {
      value: {
        value,
        onChange: (next: string) => {
          onChange(next);
          menu.close();
        },
      },
    },
    createElement('div', {'aria-label': label, role: 'group'}, children),
  );
}

function MockRadioItem({value, label}: {value: string; label: string}) {
  const group = useContext(RadioContext);
  return createElement(
    'div',
    {
      'aria-checked': String(group.value === value),
      onClick: () => group.onChange(value),
      role: 'menuitemradio',
    },
    label,
  );
}

type TokenItem = {id: string; label: string};

function MockTokenizer({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TokenItem[];
  onChange: (items: TokenItem[], change: unknown) => void;
}) {
  return createElement(
    'div',
    {'aria-label': label, role: 'group'},
    value.map(item =>
      createElement(
        'span',
        {key: item.id},
        createElement('span', null, item.label),
        createElement(
          'button',
          {
            onClick: () =>
              onChange(
                value.filter(entry => entry.id !== item.id),
                {item, type: 'remove'},
              ),
          },
          `Remove ${item.label}`,
        ),
      ),
    ),
  );
}

vi.mock('@astryxdesign/core', () => ({
  Button: MockButton,
  Card: Box,
  Center: Box,
  DropdownMenu: MockDropdownMenu,
  DropdownMenuRadioGroup: MockRadioGroup,
  DropdownMenuRadioItem: MockRadioItem,
  Text: Box,
  Tokenizer: MockTokenizer,
  VStack: Box,
}));

describe('InteractivePreviewStage', () => {
  it('keeps a radio item unchecked after its value changes until activation', async () => {
    const user = userEvent.setup();

    function PreviewHarness() {
      const [value, setValue] = useState('option-1');
      return createElement(
        'div',
        null,
        createElement(
          'button',
          {onClick: () => setValue('option-2')},
          'Change value',
        ),
        createElement(InteractivePreviewStage, {
          name: 'DropdownMenuRadioItem',
          state: {value, label: 'Option 2'},
          knobs: [],
          playground: {
            wrapper: {
              component: 'DropdownMenuRadioGroup',
              props: {value: 'option-1', label: 'Radio group'},
            },
          },
          onPropChange: (_propName: string, nextValue: unknown) =>
            setValue(nextValue as string),
        }),
      );
    }

    render(createElement(PreviewHarness));
    const item = screen.getByRole('menuitemradio', {name: 'Option 2'});
    expect(item).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('button', {name: 'Change value'}));
    expect(item).toHaveAttribute('aria-checked', 'false');

    await user.click(item);
    expect(item).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the radio choices on first load and keeps the menu interactive (#5888)', async () => {
    const user = userEvent.setup();
    const knobs = pickPrimaryProps('DropdownMenuRadioGroup', [
      {name: 'value', type: 'string | undefined', description: ''},
      {name: 'onChange', type: '(value: string) => void', description: ''},
      {name: 'label', type: 'string', description: ''},
    ]);

    function PreviewHarness() {
      const [value, setValue] = useState('newest');
      return createElement(InteractivePreviewStage, {
        name: 'DropdownMenuRadioGroup',
        state: {
          value,
          label: 'Sort by',
          children: [
            {
              __element: 'DropdownMenuRadioItem',
              props: {value: 'newest', label: 'Newest'},
            },
            {
              __element: 'DropdownMenuRadioItem',
              props: {value: 'oldest', label: 'Oldest'},
            },
          ],
        },
        knobs,
        playground: {
          wrapper: {
            component: 'DropdownMenu',
            props: {button: {label: 'Sort'}, isMenuOpen: true},
          },
        },
        onPropChange: (_propName: string, nextValue: unknown) =>
          setValue(nextValue as string),
      });
    }

    render(createElement(PreviewHarness));

    // Both choices are visible without opening the menu first.
    expect(screen.getByRole('menuitemradio', {name: 'Newest'})).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const oldest = screen.getByRole('menuitemradio', {name: 'Oldest'});
    expect(oldest).toHaveAttribute('aria-checked', 'false');

    // Selecting commits the value and closes the menu through the wrapper's
    // bridged `onOpenChange`; the trigger reopens it on the new selection.
    await user.click(oldest);
    expect(
      screen.queryByRole('menuitemradio', {name: 'Oldest'}),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Sort'}));
    expect(screen.getByRole('menuitemradio', {name: 'Oldest'})).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('drops a removed Tokenizer token from the rendered preview (#5981)', async () => {
    const user = userEvent.setup();
    const knobs = pickPrimaryProps('Tokenizer', [
      {name: 'label', type: 'string', description: '', required: true},
      {name: 'value', type: 'T[]', description: '', required: true},
      {
        name: 'onChange',
        type: '(items: T[], change: TokenizerChange<T>) => void',
        description: '',
        required: true,
      },
    ]);

    function PreviewHarness() {
      const [value, setValue] = useState<TokenItem[]>([
        {id: '1', label: 'Design'},
        {id: '2', label: 'Engineering'},
      ]);
      return createElement(InteractivePreviewStage, {
        name: 'Tokenizer',
        state: {label: 'Tags', value},
        knobs,
        onPropChange: (_propName: string, nextValue: unknown) =>
          setValue(nextValue as TokenItem[]),
      });
    }

    render(createElement(PreviewHarness));
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Remove Design'}));

    expect(screen.queryByText('Design')).not.toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
  });
});
