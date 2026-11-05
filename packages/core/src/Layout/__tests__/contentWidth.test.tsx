// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contentWidth.test.tsx
 * @input Uses vitest, @testing-library/react
 * @output Unit tests for Layout contentWidth prop
 */

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Layout} from '../Layout';
import {LayoutHeader} from '../LayoutHeader';
import {LayoutFooter} from '../LayoutFooter';
import {LayoutContent} from '../LayoutContent';
import {LayoutPanel} from '../LayoutPanel';

describe('Layout contentWidth', () => {
  describe('Layout', () => {
    it('keeps panel-free LayoutContent full width and constrains its content internally', () => {
      const {rerender} = render(
        <Layout
          contentWidth={640}
          content={
            <LayoutContent data-testid="content-region">
              <span data-testid="body">Body</span>
            </LayoutContent>
          }
        />,
      );

      const contentRegion = screen.getByTestId('content-region');
      const contentLane = contentRegion.parentElement!;
      const middleRow = contentLane.parentElement!;
      const constrainedLaneClassName = contentLane.className;
      const constrainedContentClassName = contentRegion.className;

      expect(getComputedStyle(contentRegion).overflow).toBe('auto');
      expect(screen.getByTestId('body').parentElement).toBe(contentRegion);
      expect(middleRow.getAttribute('style') ?? '').not.toContain('640px');

      rerender(
        <Layout
          content={
            <LayoutContent data-testid="content-region">
              <span data-testid="body">Body</span>
            </LayoutContent>
          }
        />,
      );

      expect(
        screen.getByTestId('content-region').parentElement!.className,
      ).not.toBe(constrainedLaneClassName);
      expect(screen.getByTestId('content-region').className).toBe(
        constrainedContentClassName,
      );
    });

    it.each([
      {
        name: 'start',
        start: <LayoutPanel>Navigation</LayoutPanel>,
        end: undefined,
        openPadding: 'paddingInlineEnd',
      },
      {
        name: 'end',
        start: undefined,
        end: <LayoutPanel>Details</LayoutPanel>,
        openPadding: 'paddingInlineStart',
      },
    ] as const)(
      'lets $name-only content span to the opposite open edge',
      ({start, end, openPadding}) => {
        render(
          <Layout
            contentWidth={640}
            start={start}
            content={
              <LayoutContent data-testid="content-region">Body</LayoutContent>
            }
            end={end}
          />,
        );

        const contentRegion = screen.getByTestId('content-region');
        const middleRow = contentRegion.parentElement!.parentElement!;

        expect(getComputedStyle(contentRegion).overflow).toBe('auto');
        expect(middleRow.getAttribute('style') ?? '').not.toContain('640px');
        expect(getComputedStyle(contentRegion)[openPadding]).toContain(
          '100cqi',
        );
      },
    );

    it('keeps the complete middle composition constrained with both panels', () => {
      render(
        <Layout
          contentWidth={640}
          start={<LayoutPanel>Navigation</LayoutPanel>}
          content={
            <LayoutContent data-testid="content-region">Body</LayoutContent>
          }
          end={<LayoutPanel>Details</LayoutPanel>}
        />,
      );

      const contentRegion = screen.getByTestId('content-region');
      const middleRow = contentRegion.parentElement!.parentElement!;

      expect(getComputedStyle(contentRegion).overflow).toBe('auto');
      expect(middleRow.getAttribute('style') ?? '').toContain('640px');
    });

    it('keeps zero padding full-bleed with arithmetic contentWidth', () => {
      render(
        <Layout
          contentWidth={640}
          content={
            <LayoutContent padding={0} data-testid="content-region">
              Body
            </LayoutContent>
          }
        />,
      );

      const contentRegion = screen.getByTestId('content-region');
      expect(getComputedStyle(contentRegion).paddingInlineStart).toContain(
        '--spacing-0',
      );
      expect(getComputedStyle(contentRegion).paddingInlineEnd).toContain(
        '--spacing-0',
      );
    });

    it.each([
      '50%',
      'calc(50%)',
      'min(400px, 80%)',
      'fit-content',
      'var(--probe-width)',
    ])('keeps %s on the constrained composition path', contentWidth => {
      render(
        <>
          <Layout
            contentWidth={contentWidth}
            content={
              <LayoutContent data-testid="content-region">Body</LayoutContent>
            }
          />
          <Layout
            contentWidth={contentWidth}
            content={<div data-testid="arbitrary-region">Body</div>}
          />
        </>,
      );

      const regionMiddle =
        screen.getByTestId('content-region').parentElement!.parentElement!;
      const arbitraryMiddle =
        screen.getByTestId('arbitrary-region').parentElement!.parentElement!;
      expect(regionMiddle.className).toBe(arbitraryMiddle.className);
    });

    it('resets inherited contentWidth for a nested Layout without one', () => {
      const {container} = render(
        <Layout
          contentWidth={640}
          content={
            <LayoutContent>
              <Layout
                content={
                  <LayoutContent data-testid="nested-content">
                    Nested
                  </LayoutContent>
                }
              />
            </LayoutContent>
          }
        />,
      );

      const nestedRoot = screen
        .getByTestId('nested-content')
        .closest('.astryx-layout') as HTMLElement;
      const nestedInner = nestedRoot.firstElementChild as HTMLElement;
      expect(
        getComputedStyle(nestedInner).getPropertyValue(
          '--layout-content-width',
        ),
      ).toBe('100cqi');
      expect(container).toHaveTextContent('Nested');
    });

    it('keeps arbitrary panel-free content constrained', () => {
      const {rerender} = render(
        <Layout contentWidth={640} content={<div>Body</div>} />,
      );
      const constrainedClassName =
        screen.getByText('Body').parentElement!.className;

      rerender(<Layout content={<div>Body</div>} />);

      expect(screen.getByText('Body').parentElement!.className).not.toBe(
        constrainedClassName,
      );
    });

    it('does not crash when contentWidth is not set', () => {
      render(
        <Layout
          content={
            <LayoutContent>
              <span data-testid="body">Body</span>
            </LayoutContent>
          }
        />,
      );
      expect(screen.getByTestId('body')).toBeInTheDocument();
    });
  });

  describe('LayoutHeader', () => {
    it('always renders contentWidth inner wrapper', () => {
      render(
        <Layout
          header={
            <LayoutHeader>
              <span data-testid="header-child">Header</span>
            </LayoutHeader>
          }
          content={<LayoutContent>Body</LayoutContent>}
        />,
      );
      const headerChild = screen.getByTestId('header-child');
      const innerWrapper = headerChild.parentElement!;
      const headerDiv = innerWrapper.parentElement!;
      expect(headerDiv.className).toContain('astryx-layout-header');
      expect(innerWrapper).not.toBe(headerDiv);
    });

    it('keeps divider on outer element', () => {
      render(
        <Layout
          contentWidth={640}
          defaultHasDividers
          header={
            <LayoutHeader>
              <span data-testid="header-child">Header</span>
            </LayoutHeader>
          }
          content={<LayoutContent>Body</LayoutContent>}
        />,
      );
      const headerChild = screen.getByTestId('header-child');
      const innerWrapper = headerChild.parentElement!;
      const headerDiv = innerWrapper.parentElement!;
      expect(headerDiv).toHaveAttribute('data-divider');
      expect(innerWrapper).not.toHaveAttribute('data-divider');
    });
  });

  describe('LayoutFooter', () => {
    it('always renders contentWidth inner wrapper', () => {
      render(
        <Layout
          content={<LayoutContent>Body</LayoutContent>}
          footer={
            <LayoutFooter>
              <span data-testid="footer-child">Footer</span>
            </LayoutFooter>
          }
        />,
      );
      const footerChild = screen.getByTestId('footer-child');
      const innerWrapper = footerChild.parentElement!;
      const footerDiv = innerWrapper.parentElement!;
      expect(footerDiv.className).toContain('astryx-layout-footer');
      expect(innerWrapper).not.toBe(footerDiv);
    });

    it('keeps divider on outer element', () => {
      render(
        <Layout
          contentWidth={640}
          defaultHasDividers
          content={<LayoutContent>Body</LayoutContent>}
          footer={
            <LayoutFooter>
              <span data-testid="footer-child">Footer</span>
            </LayoutFooter>
          }
        />,
      );
      const footerChild = screen.getByTestId('footer-child');
      const innerWrapper = footerChild.parentElement!;
      const footerDiv = innerWrapper.parentElement!;
      expect(footerDiv).toHaveAttribute('data-divider');
      expect(innerWrapper).not.toHaveAttribute('data-divider');
    });
  });
});
