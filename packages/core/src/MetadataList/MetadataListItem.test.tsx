// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRef} from 'react';
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {MetadataList} from './MetadataList';
import {MetadataListItem} from './MetadataListItem';

describe('MetadataListItem side by side', () => {
  it('attaches the ref to the dt', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <MetadataList>
        <MetadataListItem ref={ref} label="Owner" data-testid="item">
          Alice
        </MetadataListItem>
      </MetadataList>,
    );

    expect(ref.current).toBe(screen.getByTestId('item-label'));
    expect(ref.current?.tagName).toBe('DT');
  });

  it('puts the item target on the dt and not on the dd', () => {
    render(
      <MetadataList>
        <MetadataListItem label="Owner" data-testid="item">
          Alice
        </MetadataListItem>
      </MetadataList>,
    );

    expect(screen.getByTestId('item-label')).toHaveClass(
      'astryx-metadata-list-item',
    );
    expect(screen.getByTestId('item-value')).not.toHaveClass(
      'astryx-metadata-list-item',
    );
  });

  it('adds className and style to the dt with the item target', () => {
    render(
      <MetadataList>
        <MetadataListItem
          label="Owner"
          className="caller-class"
          style={{outlineWidth: 3}}
          data-testid="item">
          Alice
        </MetadataListItem>
      </MetadataList>,
    );

    const label = screen.getByTestId('item-label');
    expect(label).toHaveClass('caller-class', 'astryx-metadata-list-item');
    expect(label).toHaveStyle({outlineWidth: '3px'});
    expect(screen.getByTestId('item-value')).not.toHaveClass('caller-class');
  });

  it('renders the icon before the label text inside the dt', () => {
    render(
      <MetadataList>
        <MetadataListItem
          label="Created"
          icon={<span data-testid="icon">*</span>}
          data-testid="item">
          Today
        </MetadataListItem>
      </MetadataList>,
    );

    const label = screen.getByTestId('item-label');
    expect(label).toContainElement(screen.getByTestId('icon'));
    expect(label.textContent).toBe('*Created');
  });

  it('renders a dt and dd pair outside a MetadataList', () => {
    render(
      <dl>
        <MetadataListItem label="Owner" data-testid="item">
          Alice
        </MetadataListItem>
      </dl>,
    );

    expect(screen.getByTestId('item-label').tagName).toBe('DT');
    expect(screen.getByTestId('item-value').tagName).toBe('DD');
  });
});

describe('MetadataListItem stacked', () => {
  it('attaches the ref to the wrapper', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <MetadataList label={{position: 'top'}}>
        <MetadataListItem ref={ref} label="Owner" data-testid="item">
          Alice
        </MetadataListItem>
      </MetadataList>,
    );

    const wrapper = screen.getByTestId('item');
    expect(ref.current).toBe(wrapper);
    expect(wrapper.tagName).toBe('DIV');
    expect(wrapper.querySelector(':scope > dt')).toHaveTextContent('Owner');
    expect(wrapper.querySelector(':scope > dd')).toHaveTextContent('Alice');
  });

  it('adds className and style to the wrapper with the item target', () => {
    render(
      <MetadataList orientation="horizontal">
        <MetadataListItem
          label="Owner"
          className="caller-class"
          style={{outlineWidth: 3}}
          data-testid="item">
          Alice
        </MetadataListItem>
      </MetadataList>,
    );

    const wrapper = screen.getByTestId('item');
    expect(wrapper).toHaveClass('caller-class', 'astryx-metadata-list-item');
    expect(wrapper).toHaveStyle({outlineWidth: '3px'});
    expect(wrapper.querySelector('dt')).not.toHaveClass('caller-class');
  });
});
