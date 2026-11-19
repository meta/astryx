// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme targets of parts that paint inside another component's
 *   target: each key badge, the calendar's range bands, the alert dialog's
 *   title and description, a toggle inside a group, and the container a
 *   Layout header, content region or footer sits in.
 * @input Kbd, Calendar, AlertDialog, ToggleButton(Group), Card, Dialog and
 *   Layout rendered in jsdom; a theme built with defineTheme().
 * @output Failures naming a part that lost its target or reflection, or a
 *   container rule that reaches another container's header or content region.
 * @position Beside themingTargets.test.ts, which checks the documented
 *   targets against the source; this checks what each part renders.
 */

import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {AlertDialog} from '../AlertDialog/AlertDialog';
import {Calendar} from '../Calendar/Calendar';
import {Card} from '../Card/Card';
import {Dialog} from '../Dialog/Dialog';
import {Kbd} from '../Kbd/Kbd';
import {Layout} from '../Layout/Layout';
import {LayoutHeader} from '../Layout/LayoutHeader';
import {LayoutFooter} from '../Layout/LayoutFooter';
import {LayoutContent} from '../Layout/LayoutContent';
import {ToggleButton} from '../ToggleButton/ToggleButton';
import {ToggleButtonGroup} from '../ToggleButton/ToggleButtonGroup';
import {defineTheme} from './defineTheme';
import {generateThemeCSS} from './generateThemeRules';

describe('parts inside a component carry their own target', () => {
  it('gives each key badge kbd-key', () => {
    const {container} = render(<Kbd keys="mod+shift+k" />);
    expect(container.querySelectorAll('kbd.astryx-kbd-key')).toHaveLength(3);
  });

  it('marks the range bands, with the first and last day', () => {
    const {container} = render(
      <Calendar
        mode="range"
        defaultValue={{start: '2026-01-10', end: '2026-01-12'}}
        focusDate="2026-01-01"
      />,
    );
    const bands = container.querySelectorAll('.astryx-calendar-range');
    expect(bands).toHaveLength(3);
    expect(bands[0].getAttribute('data-start')).toBe('start');
    expect(bands[2].getAttribute('data-end')).toBe('end');
    expect(bands[1].hasAttribute('data-start')).toBe(false);
  });

  it('gives the alert dialog title and description their own targets', () => {
    render(
      <AlertDialog
        isOpen
        isInline
        onOpenChange={vi.fn()}
        title="Delete item?"
        description="This action cannot be undone."
        actionLabel="Delete"
        onAction={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Delete item?').closest('.astryx-alert-dialog-title'),
    ).not.toBeNull();
    expect(
      screen
        .getByText('This action cannot be undone.')
        .closest('.astryx-alert-dialog-description'),
    ).not.toBeNull();
  });

  it('keeps every heading and text rule off the alert dialog title and description', () => {
    render(
      <AlertDialog
        isOpen
        isInline
        onOpenChange={vi.fn()}
        title="Delete item?"
        description="This action cannot be undone."
        actionLabel="Delete"
        onAction={vi.fn()}
      />,
    );
    const title = screen.getByRole('heading', {name: 'Delete item?'});
    const description = screen.getByText('This action cannot be undone.');
    const {component} = generateThemeCSS(
      defineTheme({
        name: 'title-over-heading',
        components: {
          heading: {base: {color: 'red'}, 'level:2': {color: 'red'}},
          text: {
            base: {color: 'red'},
            'color:secondary': {color: 'red'},
            'type:body': {color: 'red'},
          },
          'alert-dialog-title': {base: {color: 'blue'}},
          'alert-dialog-description': {base: {color: 'blue'}},
        },
      }),
    );
    // Each rule's selector, as the theme writes it.
    const selectors = [...component.matchAll(/([^{};]+)\{[^{}]*color:/g)].map(
      m => m[1].trim(),
    );
    const reaches = (el: Element, part: string) =>
      selectors
        .filter(sel => sel.includes(`.astryx-${part}`))
        .some(sel => el.matches(sel));
    expect(reaches(title, 'alert-dialog-title')).toBe(true);
    expect(reaches(description, 'alert-dialog-description')).toBe(true);
    expect(reaches(title, 'heading')).toBe(false);
    expect(reaches(description, 'text')).toBe(false);
  });

  it('marks a toggle inside a group as grouped, and a lone toggle not', () => {
    render(
      <>
        <ToggleButtonGroup
          type="single"
          value={null}
          onChange={vi.fn()}
          label="Align">
          <ToggleButton label="Left" value="left" />
        </ToggleButtonGroup>
        <ToggleButton label="Bold" />
      </>,
    );
    expect(
      screen.getByRole('button', {name: 'Left'}).getAttribute('data-grouped'),
    ).toBe('grouped');
    expect(
      screen.getByRole('button', {name: 'Bold'}).hasAttribute('data-grouped'),
    ).toBe(false);
  });
});

describe('a Layout header, content region and footer name their container', () => {
  const layout = (
    <Layout
      header={<LayoutHeader>Title</LayoutHeader>}
      content={<LayoutContent>Body</LayoutContent>}
      footer={<LayoutFooter>Actions</LayoutFooter>}
    />
  );

  it('reflects the card, the dialog, and nothing outside one', () => {
    const {container} = render(
      <>
        <Card data-testid="card">{layout}</Card>
        <Dialog isOpen isInline onOpenChange={vi.fn()} aria-label="Edit">
          {layout}
        </Dialog>
        <div data-testid="bare">{layout}</div>
      </>,
    );
    const headers = container.querySelectorAll('.astryx-layout-header');
    const footers = container.querySelectorAll('.astryx-layout-footer');
    expect([...headers].map(h => h.getAttribute('data-container'))).toEqual([
      'card',
      'dialog',
      null,
    ]);
    expect([...footers].map(f => f.getAttribute('data-container'))).toEqual([
      'card',
      'dialog',
      null,
    ]);
    const contents = container.querySelectorAll('.astryx-layout-content');
    expect([...contents].map(c => c.getAttribute('data-container'))).toEqual([
      'card',
      'dialog',
      null,
    ]);
  });

  it("lets a theme pad a dialog's body without a card's", () => {
    const {component} = generateThemeCSS(
      defineTheme({
        name: 'dialog-body-only',
        components: {
          'layout-content': {'container:dialog': {padding: '10px'}},
        },
      }),
    );
    expect(component).toContain(
      '.astryx-layout-content[data-container="dialog"]',
    );
    expect(component).not.toContain('[data-container="card"]');
  });

  it("lets a theme style a dialog's header without a card's", () => {
    const {component} = generateThemeCSS(
      defineTheme({
        name: 'dialog-header-only',
        components: {
          'layout-header': {'container:dialog': {backgroundColor: 'red'}},
        },
      }),
    );
    expect(component).toContain(
      '.astryx-layout-header[data-container="dialog"]',
    );
    expect(component).not.toContain('[data-container="card"]');
  });
});
