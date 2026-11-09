// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Kbd.test.tsx
 * @input Uses React Testing Library, Kbd
 * @output Tests for Kbd component
 *
 * Note: Tests run in jsdom which reports a non-Mac platform,
 * so `mod` resolves to "Ctrl" rather than "\u2318" after the layout effect.
 */

import {act, render, screen, within} from '@testing-library/react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {describe, it, expect, afterEach, vi} from 'vitest';
import {Kbd} from './Kbd';
import {InternationalizationProvider} from '../i18n';

describe('Kbd', () => {
  const originalPlatform = navigator.platform;

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore platform after any test that spoofs it \u2014 ensures no
    // test pollution even if an assertion fails mid-test.
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('renders a single key', () => {
    render(<Kbd keys="k" />);
    const kbd = screen.getByText('K');
    expect(kbd.tagName).toBe('KBD');
  });

  it('renders multiple keys separated by +', () => {
    render(<Kbd keys="mod+k" />);
    // In jsdom (non-Mac), mod renders as "Ctrl"
    expect(screen.getByText('Ctrl')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('renders mod as Ctrl on non-Mac platforms', () => {
    // jsdom is a non-Mac environment, so mod \u2192 Ctrl
    render(<Kbd keys="mod" />);
    expect(screen.getByText('Ctrl')).toBeInTheDocument();
  });

  it('renders mod as \u2318 on Mac platforms', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });

    render(<Kbd keys="mod" />);
    expect(screen.getByText('\u2318')).toBeInTheDocument(); // \u2318
  });

  it('shows ⌘ for meta on Apple platforms', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
    render(<Kbd keys="meta+k" />);
    expect(screen.getByText('\u2318')).toBeInTheDocument();
    expect(screen.queryByText('META')).not.toBeInTheDocument();
    expect(screen.queryByText('Win')).not.toBeInTheDocument();
  });

  it('shows Apple modifier symbols for ctrl, alt and shift on Apple platforms', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
    render(<Kbd keys="ctrl+alt+shift+k" />);
    expect(screen.getByText('\u2303')).toBeInTheDocument(); // ⌃
    expect(screen.getByText('\u2325')).toBeInTheDocument(); // ⌥
    expect(screen.getByText('\u21E7')).toBeInTheDocument(); // ⇧
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it.each(['Win32', 'Linux x86_64'])(
    'shows the catalog text for ctrl, alt, shift and meta on %s',
    platform => {
      Object.defineProperty(navigator, 'platform', {
        value: platform,
        configurable: true,
      });
      render(<Kbd keys="ctrl+alt+shift+meta+k" />);
      for (const text of ['Ctrl', 'Alt', 'Shift', 'Win', 'K']) {
        expect(screen.getByText(text)).toBeInTheDocument();
      }
      for (const glyph of ['\u2303', '\u2325', '\u21E7', 'META']) {
        expect(screen.queryByText(glyph)).not.toBeInTheDocument();
      }
      // Spoken names are unchanged.
      expect(screen.getByRole('img')).toHaveAccessibleName(
        'Control + Alt + Shift + META + K',
      );
    },
  );

  it('shows the catalog text for ctrl, alt, shift and meta on the server, even on a Mac', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Kbd keys="ctrl+alt+shift+meta+k" />);
    document.body.appendChild(container);
    try {
      for (const text of ['Ctrl', 'Alt', 'Shift', 'Win']) {
        expect(within(container).getByText(text)).toBeInTheDocument();
      }
      expect(within(container).queryByText('\u2325')).not.toBeInTheDocument();
    } finally {
      container.remove();
    }
  });

  it('hydrates a server render on a Mac without a mismatch, then shows the symbols', async () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Kbd keys="ctrl+alt+shift+meta+k" />);
    document.body.appendChild(container);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];
    try {
      expect(within(container).getByText('Win')).toBeInTheDocument();
      await act(async () => {
        hydrateRoot(container, <Kbd keys="ctrl+alt+shift+meta+k" />, {
          onRecoverableError: error => recoverableErrors.push(error),
        });
      });
      expect(recoverableErrors).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
      for (const glyph of ['\u2303', '\u2325', '\u21E7']) {
        expect(within(container).getByText(glyph)).toBeInTheDocument();
      }
    } finally {
      container.remove();
    }
  });

  it('localizes the modifiers short text', () => {
    render(
      <InternationalizationProvider
        locale="de"
        overrides={{
          de: {
            '@astryx.kbd.key.controlShort': 'Strg',
            '@astryx.kbd.key.altShort': 'Alt Gr',
            '@astryx.kbd.key.shiftShort': 'Umschalt',
            '@astryx.kbd.key.windowsShort': 'Windows',
          },
        }}>
        <Kbd keys="ctrl+alt+shift+meta" />
      </InternationalizationProvider>,
    );
    for (const text of ['Strg', 'Alt Gr', 'Umschalt', 'Windows']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it('maps special keys', () => {
    render(<Kbd keys="enter" />);
    expect(screen.getByText('\u21B5')).toBeInTheDocument(); // \u21B5
  });

  it.each([
    {key: 'backspace', glyph: '\u232B', label: 'Backspace'},
    {key: 'tab', glyph: '\u21E5', label: 'Tab'},
    {key: 'up', glyph: '\u2191', label: 'Up arrow'},
    {key: 'down', glyph: '\u2193', label: 'Down arrow'},
    {key: 'left', glyph: '\u2190', label: 'Left arrow'},
    {key: 'right', glyph: '\u2192', label: 'Right arrow'},
  ])('shows the $key symbol and speaks its name', ({key, glyph, label}) => {
    render(<Kbd keys={key} />);
    expect(screen.getByText(glyph)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(label);
  });

  it('renders Ctrl and the Control name on the server, even on a Mac', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Kbd keys="mod+k" />);
    document.body.appendChild(container);
    try {
      expect(within(container).getByText('Ctrl')).toBeInTheDocument();
      expect(within(container).queryByText('\u2318')).not.toBeInTheDocument();
      expect(within(container).getByRole('img')).toHaveAccessibleName(
        'Control + K',
      );
    } finally {
      container.remove();
    }
  });

  it('puts the kbd theme target on the shortcut only, not on a key badge', () => {
    render(<Kbd keys="mod+shift+k" />);
    const shortcut = screen.getByRole('img');
    expect(shortcut).toHaveClass('astryx-kbd');
    const badges = Array.from(shortcut.querySelectorAll('kbd'));
    expect(badges).toHaveLength(3);
    badges.forEach(badge =>
      expect(
        Array.from(badge.classList).filter(name => name.startsWith('astryx-')),
      ).toEqual([]),
    );
  });

  it('renders escape as text', () => {
    render(<Kbd keys="escape" />);
    expect(screen.getByText('Esc')).toBeInTheDocument();
  });

  it.each([
    {alias: 'esc', display: 'Esc', label: 'Escape'},
    {alias: 'return', display: '\u21B5', label: 'Enter'},
  ])('normalizes the $alias key alias', ({alias, display, label}) => {
    render(<Kbd keys={alias} />);
    expect(screen.getByText(display)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', label);
  });

  it.each([
    {alias: 'esc', canonical: 'escape'},
    {alias: 'return', canonical: 'enter'},
  ])('$alias renders identically to $canonical', ({alias, canonical}) => {
    const {container, rerender} = render(<Kbd keys={canonical} />);
    const text = container.textContent;
    const label = screen.getByRole('img').getAttribute('aria-label');
    rerender(<Kbd keys={alias} />);
    expect(container.textContent).toBe(text);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(label);
  });

  it.each([
    {keys: 'ctrl + ESC', display: 'Esc', label: 'Control + Escape'},
    {keys: 'shift + RETURN', display: '\u21B5', label: 'Shift + Enter'},
  ])('normalizes aliases inside the $keys combo', ({keys, display, label}) => {
    render(<Kbd keys={keys} />);
    expect(screen.getByText(display)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', label);
  });

  it('keeps child keys unique after alias normalization', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const {container} = render(
      <Kbd keys="escape+esc+ESC+enter+return+return" />,
    );
    expect(consoleError).not.toHaveBeenCalled();
    expect(
      Array.from(container.querySelectorAll('kbd'), key => key.textContent),
    ).toEqual(['Esc', 'Esc', 'Esc', '↵', '↵', '↵']);
  });

  it.each(['constructor', '__proto__'])(
    'renders the unknown %s key without consulting object prototypes',
    key => {
      render(<Kbd keys={key} />);
      expect(screen.getByText(key.toUpperCase())).toBeInTheDocument();
      expect(screen.getByRole('img')).toHaveAttribute(
        'aria-label',
        key.toUpperCase(),
      );
    },
  );

  it('exposes a spoken accessible name and hides the glyphs (obs-1)', () => {
    render(<Kbd keys="mod+shift+k" />);
    // The wrapper carries a screen-reader name built from spoken key labels
    // (jsdom is non-Mac, so mod → "Control").
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('aria-label', 'Control + Shift + K');
    // The visual glyph elements are hidden from assistive tech.
    const glyphs = img.querySelectorAll('kbd');
    glyphs.forEach(g => expect(g).toHaveAttribute('aria-hidden', 'true'));
    expect(img).not.toHaveAttribute('aria-hidden');
  });

  it('uses "Command" in the accessible name for mod on Mac', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
    render(<Kbd keys="mod+k" />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Command + K',
    );
  });

  it('uppercases unknown keys', () => {
    render(<Kbd keys="f1" />);
    expect(screen.getByText('F1')).toBeInTheDocument();
  });

  it('handles whitespace around keys', () => {
    render(<Kbd keys="mod + k" />);
    // In jsdom (non-Mac), mod renders as "Ctrl"
    expect(screen.getByText('Ctrl')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('renders astryx-* class names for theme targeting', () => {
    const {container} = render(<Kbd keys="k" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('astryx-kbd');
  });

  it('renders "plus" as a literal + key', () => {
    render(<Kbd keys="shift+plus" />);
    expect(screen.getByText('Shift')).toBeInTheDocument();
    expect(screen.getByText('+')).toBeInTheDocument();
  });

  it('keeps the computed role and aria-label when unrelated rest props are spread', () => {
    render(<Kbd keys="mod+k" data-testid="kbd" id="shortcut" />);
    const el = screen.getByTestId('kbd');
    // Pass-through attributes land on the wrapper...
    expect(el).toHaveAttribute('id', 'shortcut');
    // ...without disturbing the computed accessibility contract.
    expect(el).toHaveAttribute('role', 'img');
    expect(el).toHaveAttribute('aria-label', 'Control + K');
  });

  it.each([
    {
      platform: 'Linux',
      key: 'control',
      expectedGlyph: 'Ctrl',
      shiftGlyph: 'Shift',
    },
    {platform: 'MacIntel', key: 'command', expectedGlyph: '⌘', shiftGlyph: '⇧'},
  ])(
    'localizes modifier labels on $platform without changing the glyph',
    ({platform, key, expectedGlyph, shiftGlyph}) => {
      Object.defineProperty(navigator, 'platform', {
        value: platform,
        configurable: true,
      });
      const overrides = {
        fr: {
          [`@astryx.kbd.key.${key}`]: 'Modificateur',
          '@astryx.kbd.key.shift': 'Majuscule',
        },
      };
      const {rerender} = render(
        <InternationalizationProvider locale="fr" overrides={overrides}>
          <Kbd keys="mod+shift+k" />
        </InternationalizationProvider>,
      );
      expect(screen.getByRole('img')).toHaveAccessibleName(
        'Modificateur + Majuscule + K',
      );
      expect(screen.getByText(expectedGlyph)).toBeInTheDocument();
      expect(screen.getByText(shiftGlyph)).toBeInTheDocument();
      rerender(
        <InternationalizationProvider locale="en" overrides={overrides}>
          <Kbd keys="mod+shift+k" />
        </InternationalizationProvider>,
      );
      expect(screen.getByRole('img')).toHaveAccessibleName(
        `${key === 'command' ? 'Command' : 'Control'} + Shift + K`,
      );
    },
  );

  it.each([
    'ctrl',
    'alt',
    'shift',
    'enter',
    'backspace',
    'escape',
    'tab',
    'up',
    'down',
    'left',
    'right',
    'plus',
    'esc',
    'return',
  ])('uses a catalog entry for the %s spoken key', key => {
    const canonical =
      key === 'ctrl'
        ? 'control'
        : key === 'esc'
          ? 'escape'
          : key === 'return'
            ? 'enter'
            : key;
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{fr: {[`@astryx.kbd.key.${canonical}`]: 'Touche traduite'}}}>
        <Kbd keys={key} />
      </InternationalizationProvider>,
    );
    expect(screen.getByRole('img')).toHaveAccessibleName('Touche traduite');
  });

  it('localizes visible key text and the spoken shortcut combination', () => {
    render(
      <InternationalizationProvider
        locale="de"
        overrides={{
          de: {
            '@astryx.kbd.key.controlShort': 'Strg',
            '@astryx.kbd.key.escapeShort': 'Abbr',
            '@astryx.kbd.key.control': 'Steuerung',
            '@astryx.kbd.key.escape': 'Abbrechen',
            '@astryx.kbd.shortcut': '{key} mit {shortcut}',
          },
        }}>
        <Kbd keys="mod+esc" />
      </InternationalizationProvider>,
    );
    expect(screen.getByText('Strg')).toBeInTheDocument();
    expect(screen.getByText('Abbr')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Abbrechen mit Steuerung',
    );
  });

  it('computed role and aria-label win over consumer-passed overrides', () => {
    // Contract props the component computes must not be clobbered by
    // pass-through attributes: {...rest} is spread before role/aria-label.
    render(
      <Kbd
        keys="mod+k"
        role="presentation"
        aria-label="custom"
        data-testid="kbd"
      />,
    );
    const el = screen.getByTestId('kbd');
    expect(el).toHaveAttribute('role', 'img');
    expect(el).toHaveAttribute('aria-label', 'Control + K');
  });
});
