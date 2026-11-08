// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {ReactNode} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MetadataList} from './MetadataList';
import {MetadataListItem} from './MetadataListItem';
import {InternationalizationProvider} from '../i18n';

describe('MetadataList', () => {
  it('renders a description list with items', () => {
    render(
      <MetadataList>
        <MetadataListItem label="Name">Alice</MetadataListItem>
        <MetadataListItem label="Role">Engineer</MetadataListItem>
      </MetadataList>,
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
  });

  it('renders a semantic dl element', () => {
    const {container} = render(
      <MetadataList>
        <MetadataListItem label="Key">Value</MetadataListItem>
      </MetadataList>,
    );

    expect(container.querySelector('dl')).toBeInTheDocument();
    expect(container.querySelector('dt')).toBeInTheDocument();
    expect(container.querySelector('dd')).toBeInTheDocument();
  });

  it('renders a title when provided', () => {
    render(
      <MetadataList title={<h3>Details</h3>}>
        <MetadataListItem label="Key">Value</MetadataListItem>
      </MetadataList>,
    );

    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('supports data-testid', () => {
    render(
      <MetadataList data-testid="my-list">
        <MetadataListItem label="Key">Value</MetadataListItem>
      </MetadataList>,
    );

    expect(screen.getByTestId('my-list')).toBeInTheDocument();
  });

  it('shows "Show more" button when items exceed maxNumOfItems', () => {
    render(
      <MetadataList maxNumOfItems={2}>
        <MetadataListItem label="A">1</MetadataListItem>
        <MetadataListItem label="B">2</MetadataListItem>
        <MetadataListItem label="C">3</MetadataListItem>
      </MetadataList>,
    );

    expect(screen.getByText('Show more')).toBeInTheDocument();
    // Third item should be hidden
    expect(screen.queryByText('C')).not.toBeInTheDocument();
  });

  it('toggles show more / show less', async () => {
    const user = userEvent.setup();

    render(
      <MetadataList maxNumOfItems={1}>
        <MetadataListItem label="A">1</MetadataListItem>
        <MetadataListItem label="B">2</MetadataListItem>
      </MetadataList>,
    );

    expect(screen.queryByText('B')).not.toBeInTheDocument();

    await user.click(screen.getByText('Show more'));
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('Show less')).toBeInTheDocument();

    await user.click(screen.getByText('Show less'));
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });

  it('localizes the show more / show less labels through the i18n catalog', async () => {
    const user = userEvent.setup();

    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{
          fr: {
            '@astryx.metadataList.showMore': 'Afficher plus',
            '@astryx.metadataList.showLess': 'Afficher moins',
          },
        }}>
        <MetadataList maxNumOfItems={1}>
          <MetadataListItem label="A">1</MetadataListItem>
          <MetadataListItem label="B">2</MetadataListItem>
        </MetadataList>
      </InternationalizationProvider>,
    );

    await user.click(screen.getByText('Afficher plus'));
    expect(screen.getByText('Afficher moins')).toBeInTheDocument();
  });

  it('does not show toggle in horizontal mode even with maxNumOfItems', () => {
    render(
      <MetadataList orientation="horizontal" maxNumOfItems={1}>
        <MetadataListItem label="A">1</MetadataListItem>
        <MetadataListItem label="B">2</MetadataListItem>
      </MetadataList>,
    );

    expect(screen.queryByText('Show more')).not.toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('uses top labels in horizontal orientation even when position is start', () => {
    render(
      <MetadataList orientation="horizontal" label={{position: 'start'}}>
        <MetadataListItem label="A">1</MetadataListItem>
      </MetadataList>,
    );

    const item = screen.getByRole('term').closest('.astryx-metadata-list-item');
    expect(item).toContainElement(screen.getByRole('definition'));
  });

  it('defaults to side labels and preserves width when position is omitted', () => {
    const {container} = render(
      <MetadataList label={{width: 120}}>
        <MetadataListItem label="A">1</MetadataListItem>
      </MetadataList>,
    );

    const list = container.querySelector('dl');
    expect(list?.getAttribute('style')).toContain('120px minmax(0, 1fr)');
    expect(screen.getByRole('term').parentElement).toBe(list);
    expect(screen.getByRole('definition').parentElement).toBe(list);
  });

  describe('numeric columns', () => {
    // A fixed column count is a runtime value, so it arrives as a StyleX
    // dynamic style: the template lands in the element's inline style (as the
    // generated custom property) rather than in a static class rule.
    const gridTemplateOf = (container: HTMLElement) =>
      container.querySelector('dl')?.getAttribute('style') ?? '';

    it('renders the requested number of columns with stacked labels', () => {
      const {container} = render(
        <MetadataList columns={3}>
          <MetadataListItem label="A">1</MetadataListItem>
        </MetadataList>,
      );

      expect(gridTemplateOf(container)).toContain('repeat(3, 1fr)');
    });

    it('renders label and value tracks per column with side labels', () => {
      const {container} = render(
        <MetadataList columns={3} label={{position: 'start'}}>
          <MetadataListItem label="A">1</MetadataListItem>
        </MetadataList>,
      );

      expect(gridTemplateOf(container)).toContain(
        'repeat(3, auto minmax(0, 1fr))',
      );
    });

    it('leaves the grid to the static rule for columns="multi"', () => {
      const {container} = render(
        <MetadataList columns="multi">
          <MetadataListItem label="A">1</MetadataListItem>
        </MetadataList>,
      );

      expect(gridTemplateOf(container)).not.toContain('repeat(');
    });

    it('defaults to top labels for columns={2} with a width-only label config', () => {
      const {container} = render(
        <MetadataList columns={2} label={{width: 260}}>
          <MetadataListItem label="A">1</MetadataListItem>
        </MetadataList>,
      );

      expect(gridTemplateOf(container)).toContain('repeat(2, 1fr)');
      const item = screen
        .getByRole('term')
        .closest('.astryx-metadata-list-item');
      expect(item).toContainElement(screen.getByRole('definition'));
    });

    it('ignores numeric columns in horizontal orientation', () => {
      const {container} = render(
        <MetadataList columns={3} orientation="horizontal">
          <MetadataListItem label="A">1</MetadataListItem>
        </MetadataList>,
      );

      expect(gridTemplateOf(container)).not.toContain('repeat(');
    });

    it('still applies a custom label width with side labels', () => {
      const {container} = render(
        <MetadataList label={{position: 'start', width: 120}}>
          <MetadataListItem label="A">1</MetadataListItem>
        </MetadataList>,
      );

      expect(gridTemplateOf(container)).toContain('120px minmax(0, 1fr)');
    });
  });
});

describe('MetadataListItem', () => {
  it('renders label and children', () => {
    render(
      <MetadataList>
        <MetadataListItem label="Status">Active</MetadataListItem>
      </MetadataList>,
    );

    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders an icon when provided', () => {
    render(
      <MetadataList>
        <MetadataListItem
          label="Info"
          icon={<span data-testid="test-icon">*</span>}>
          Details
        </MetadataListItem>
      </MetadataList>,
    );

    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('renders in stacked mode when label position is top', () => {
    const {container} = render(
      <MetadataList label={{position: 'top'}}>
        <MetadataListItem label="Key">Value</MetadataListItem>
      </MetadataList>,
    );

    // In stacked mode, dt and dd are inside a wrapper div
    const wrapper = container.querySelector('.astryx-metadata-list-item');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper?.querySelector('dt')).toBeInTheDocument();
    expect(wrapper?.querySelector('dd')).toBeInTheDocument();
  });
});

describe('MetadataListItem pass-through props', () => {
  it('forwards pass-through props to the item element', () => {
    render(
      <MetadataList>
        <MetadataListItem
          label="Owner"
          aria-label="Owner field"
          id="owner"
          data-source="crm"
          data-testid="item">
          Alice
        </MetadataListItem>
      </MetadataList>,
    );
    const item = screen.getByTestId('item-label');
    expect(item).toHaveAttribute('aria-label', 'Owner field');
    expect(item).toHaveAttribute('id', 'owner');
    expect(item).toHaveAttribute('data-source', 'crm');
  });

  it('forwards pass-through props in the stacked layout', () => {
    render(
      <MetadataList orientation="horizontal">
        <MetadataListItem label="Owner" id="owner-stacked" data-testid="item">
          Alice
        </MetadataListItem>
      </MetadataList>,
    );
    expect(screen.getByTestId('item')).toHaveAttribute('id', 'owner-stacked');
  });
});

describe('MetadataListItem pass-through target', () => {
  it('lands pass-through props on the <dt> in the inline layout, where the ref also goes', () => {
    const handleClick = vi.fn();
    render(
      <MetadataList>
        <MetadataListItem
          label="Owner"
          onClick={handleClick}
          data-testid="item">
          Alice
        </MetadataListItem>
      </MetadataList>,
    );

    const label = screen.getByTestId('item-label');
    expect(label.tagName).toBe('DT');
    fireEvent.click(label);
    expect(handleClick).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId('item-value'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('lands them on the wrapper in the stacked layout, so both halves are covered', () => {
    const handleClick = vi.fn();
    render(
      <MetadataList orientation="horizontal">
        <MetadataListItem
          label="Owner"
          onClick={handleClick}
          data-testid="item">
          Alice
        </MetadataListItem>
      </MetadataList>,
    );

    fireEvent.click(screen.getByText('Alice'));
    expect(handleClick).toHaveBeenCalledOnce();
  });
});

describe('MetadataList pass-through props', () => {
  it('forwards pass-through props to the root element', () => {
    render(
      <MetadataList
        aria-label="Record details"
        id="record-meta"
        data-source="crm"
        data-testid="list">
        <MetadataListItem label="Owner">Alice</MetadataListItem>
      </MetadataList>,
    );
    const rootEl = screen.getByTestId('list');
    expect(rootEl).toHaveAttribute('aria-label', 'Record details');
    expect(rootEl).toHaveAttribute('id', 'record-meta');
    expect(rootEl).toHaveAttribute('data-source', 'crm');
  });

  it('forwards event handlers to the root element', () => {
    const handleClick = vi.fn();
    render(
      <MetadataList onClick={handleClick} data-testid="list">
        <MetadataListItem label="Owner">Alice</MetadataListItem>
      </MetadataList>,
    );
    fireEvent.click(screen.getByTestId('list'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('keeps component-owned theme metadata over colliding pass-throughs', () => {
    render(
      <MetadataList
        columns={2}
        orientation="horizontal"
        data-columns="99"
        data-orientation="vertical"
        data-testid="list">
        <MetadataListItem label="Owner">Alice</MetadataListItem>
      </MetadataList>,
    );
    const rootEl = screen.getByTestId('list');
    expect(rootEl).toHaveAttribute('data-columns', '2');
    expect(rootEl).toHaveAttribute('data-orientation', 'horizontal');
  });

  it.each([
    ['an empty string', ''],
    ['false', false],
    ['true', true],
    ['null', null],
  ])('renders no title wrapper for %s', (_name, title) => {
    const {container: withTitle} = render(
      <MetadataList title={title as ReactNode}>
        <MetadataListItem label="Owner">Ana</MetadataListItem>
      </MetadataList>,
    );
    const {container: without} = render(
      <MetadataList>
        <MetadataListItem label="Owner">Ana</MetadataListItem>
      </MetadataList>,
    );
    // The list's generated id differs between the two renders.
    const html = (element: HTMLElement) =>
      element.innerHTML.replace(/id="[^"]*"/g, 'id');
    expect(html(withTitle)).toBe(html(without));
  });

  it.each([
    ['an empty string', ''],
    ['false', false],
    ['true', true],
    ['null', null],
  ])('renders no item icon wrapper for %s', (_name, icon) => {
    const {container: withIcon} = render(
      <MetadataListItem label="Owner" icon={icon as ReactNode}>
        Ana
      </MetadataListItem>,
    );
    const {container: without} = render(
      <MetadataListItem label="Owner">Ana</MetadataListItem>,
    );
    expect(withIcon.innerHTML).toBe(without.innerHTML);
  });

  it('renders 0 as a title and as an item icon, as React does', () => {
    render(
      <MetadataList title={0}>
        <MetadataListItem label="Owner" icon={0}>
          Ana
        </MetadataListItem>
      </MetadataList>,
    );
    expect(screen.getAllByText('0')).toHaveLength(2);
  });
});
