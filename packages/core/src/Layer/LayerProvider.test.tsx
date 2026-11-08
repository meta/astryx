// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerProvider.test.tsx
 * @input LayerProvider, useLayer, ToastViewport
 * @output Proves the provider-declared inset reaches anchored layers and the
 *   toast viewport by inheritance, and that the default is no declaration
 *   (spec:AST-059 FR6, DEC-5)
 */

import {useEffect} from 'react';
import {describe, expect, it} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {LayerProvider} from './LayerProvider';
// The toast viewport these cases read registers itself as its module loads.
import '../Toast/ToastViewport';
import {useLayer} from './useLayer';
import {layerInsetProperties} from './layerInset';
import {useToast} from '../Toast/useToast';

function AnchoredLayer() {
  const layer = useLayer({mode: 'context'});
  return (
    <>
      <button type="button" ref={layer.ref} onClick={layer.show}>
        Open
      </button>
      {layer.render(<span>Layer</span>, {placement: 'below'})}
    </>
  );
}

function PortaledLayer() {
  const layer = useLayer({mode: 'context'});
  // A <p> cannot contain the layer's <div>, so the layer portals out of it.
  return (
    <p>
      <button type="button" ref={layer.ref} onClick={layer.show}>
        Open
      </button>
      {layer.render(<span>Layer</span>, {placement: 'below'})}
    </p>
  );
}

function ShowsThree() {
  const showToast = useToast();
  useEffect(() => {
    for (const body of ['One', 'Two', 'Three']) {
      showToast({body, isAutoHide: false});
    }
  }, [showToast]);
  return null;
}

describe('LayerProvider inset (spec:AST-059 FR6)', () => {
  it('declares nothing by default, so a default provider matches no provider', () => {
    expect(layerInsetProperties(undefined)).toEqual({});
    expect(layerInsetProperties({})).toEqual({});
    const {container} = render(
      <LayerProvider>
        <AnchoredLayer />
      </LayerProvider>,
    );
    fireEvent.click(container.querySelector('button')!);
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
      expect(el.getAttribute('style') ?? '').not.toContain(
        '--astryx-layer-inset',
      );
    }
  });

  it('writes one custom property per declared edge, pixels for numbers and lengths as written', () => {
    expect(
      layerInsetProperties({blockEnd: 56, inlineStart: 'var(--rail, 0px)'}),
    ).toEqual({
      '--astryx-layer-inset-block-end': '56px',
      '--astryx-layer-inset-inline-start': 'var(--rail, 0px)',
    });
  });

  it('writes the declared inset inline on the anchored layer and on the toast viewport', () => {
    const {container} = render(
      <LayerProvider inset={{blockEnd: 56}}>
        <AnchoredLayer />
      </LayerProvider>,
    );
    fireEvent.click(container.querySelector('button')!);
    const popovers = Array.from(
      container.querySelectorAll<HTMLElement>('[popover]'),
    );
    expect(popovers.length).toBe(2);
    for (const el of popovers) {
      expect(el.style.getPropertyValue('--astryx-layer-inset-block-end')).toBe(
        '56px',
      );
    }
  });

  it('reaches a layer that portals out of an unsafe host, because the value travels by context, not inheritance', () => {
    const {container} = render(
      <LayerProvider inset={{inlineEnd: 24}}>
        <PortaledLayer />
      </LayerProvider>,
    );
    fireEvent.click(container.querySelector('button')!);
    const layer = container.querySelector<HTMLElement>(
      '[popover="manual"][id]',
    );
    expect(layer?.closest('p')).toBeNull();
    expect(
      layer?.style.getPropertyValue('--astryx-layer-inset-inline-end'),
    ).toBe('24px');
  });

  it('lets a nested provider narrow the inset for the layers in its subtree', () => {
    const {container} = render(
      <LayerProvider inset={{blockEnd: 56}}>
        <LayerProvider inset={{blockEnd: 120}}>
          <AnchoredLayer />
        </LayerProvider>
      </LayerProvider>,
    );
    fireEvent.click(container.querySelector('button')!);
    const layer = container.querySelector<HTMLElement>(
      '[popover="manual"][id]',
    );
    expect(
      layer?.style.getPropertyValue('--astryx-layer-inset-block-end'),
    ).toBe('120px');
    // One toast viewport, the root's, at the root's declaration.
    const viewports = Array.from(
      container.querySelectorAll<HTMLElement>('[popover="manual"]:not([id])'),
    );
    expect(viewports.length).toBe(1);
    expect(
      viewports[0].style.getPropertyValue('--astryx-layer-inset-block-end'),
    ).toBe('56px');
  });

  it('lets toast.inset replace the provider value for the toast viewport on the edges it sets', () => {
    const {container} = render(
      <LayerProvider inset={{blockEnd: 56}} toast={{inset: {bottom: 120}}}>
        <span>app</span>
      </LayerProvider>,
    );
    const viewport = container.querySelector(
      '[popover="manual"]',
    ) as HTMLElement;
    // The inline override wins over the class that reads the provider value.
    expect(viewport.style.bottom).toBe('120px');
    expect(
      viewport.style.getPropertyValue('--astryx-layer-inset-block-end'),
    ).toBe('56px');
    expect(viewport.style.insetInlineStart).toBe('');
  });
});

describe('LayerProvider toast configuration', () => {
  it('passes toast.maxVisible to the toast viewport', async () => {
    render(
      <LayerProvider toast={{maxVisible: 2}}>
        <ShowsThree />
      </LayerProvider>,
    );
    expect(await screen.findByText('Three')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
    expect(screen.queryByText('One')).not.toBeInTheDocument();
  });

  it('keeps one toast viewport and the outer toast configuration under a nested provider without inset', async () => {
    const {container} = render(
      <LayerProvider toast={{maxVisible: 1}}>
        <span data-testid="outer">outer</span>
        <LayerProvider toast={{maxVisible: 5}}>
          <span data-testid="app">app</span>
          <ShowsThree />
        </LayerProvider>
      </LayerProvider>,
    );
    expect(await screen.findByText('Three')).toBeInTheDocument();
    expect(screen.queryByText('Two')).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('[popover="manual"]:not([id])'),
    ).toHaveLength(1);
    // The nested provider adds no element around its children.
    expect(screen.getByTestId('app').parentElement).toBe(
      screen.getByTestId('outer').parentElement,
    );
  });
});
