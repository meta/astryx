// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DialogHeroHeader.test.tsx
 * @input Uses vitest, @testing-library/react, DialogHeroHeader, core Dialog
 * @output Tests for header rendering, modal focus ownership, accessible naming,
 *   and close-button identity across media changes
 * @position Lab testing; validates DialogHeroHeader.tsx implementation
 *
 * SYNC: When DialogHeroHeader.tsx changes, update tests to match new behavior
 */

import {useEffect, useState} from 'react';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Heading} from '@astryxdesign/core/Heading';
import {LayoutDividerContext} from '@astryxdesign/core/Layout';
import {DialogHeroHeader} from './DialogHeroHeader';

// Mock dialog methods since they're not fully implemented in jsdom
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

describe('DialogHeroHeader', () => {
  it('renders a string title as an h2 heading', () => {
    render(
      <DialogHeroHeader title="Welcome aboard" media={<div>media</div>} />,
    );
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Welcome aboard',
    });
    expect(heading.tagName).toBe('H2');
  });

  it('renders a caller-provided Heading element as-is', () => {
    render(
      <DialogHeroHeader
        title={<Heading level={3}>Custom heading</Heading>}
        media={<div>media</div>}
      />,
    );
    expect(
      screen.getByRole('heading', {level: 3, name: 'Custom heading'}),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', {level: 2})).not.toBeInTheDocument();
  });

  it('renders the media slot', () => {
    render(
      <DialogHeroHeader
        title="Title"
        media={<img alt="Illustration" src="hero.png" />}
      />,
    );
    expect(screen.getByRole('img', {name: 'Illustration'})).toBeInTheDocument();
  });

  it('renders startContent before the title', () => {
    render(
      <DialogHeroHeader
        title="Title"
        media={<div>media</div>}
        startContent={<span>start</span>}
      />,
    );
    expect(screen.getByText('start')).toBeInTheDocument();
  });

  it('does not move page focus when rendered outside a Dialog', () => {
    render(<DialogHeroHeader title="Title" media={<div>media</div>} />);
    expect(document.activeElement).toBe(document.body);
  });

  describe('close button', () => {
    it('renders when onOpenChange is provided', () => {
      render(
        <DialogHeroHeader
          title="Title"
          media={<div>media</div>}
          onOpenChange={() => {}}
        />,
      );
      expect(screen.getByRole('button', {name: /close/i})).toBeInTheDocument();
    });

    it('does not render when onOpenChange is not provided', () => {
      render(<DialogHeroHeader title="Title" media={<div>media</div>} />);
      expect(
        screen.queryByRole('button', {name: /close/i}),
      ).not.toBeInTheDocument();
    });

    it('calls onOpenChange(false) when clicked', async () => {
      const user = userEvent.setup();
      const handleOpenChange = vi.fn();
      render(
        <DialogHeroHeader
          title="Title"
          media={<div>media</div>}
          onOpenChange={handleOpenChange}
        />,
      );
      await user.click(screen.getByRole('button', {name: /close/i}));
      expect(handleOpenChange).toHaveBeenCalledTimes(1);
      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('mediaMode', () => {
    it('preserves the focused close button across media-mode changes', () => {
      const props = {
        title: 'Title',
        media: <div>media</div>,
        onOpenChange: vi.fn(),
      };
      const {rerender} = render(<DialogHeroHeader {...props} />);
      const button = screen.getByRole('button', {name: /close/i});
      button.focus();
      for (const mediaMode of ['dark', 'light', undefined] as const) {
        rerender(<DialogHeroHeader {...props} mediaMode={mediaMode} />);
        expect(screen.getByRole('button', {name: /close/i})).toBe(button);
        expect(button).toHaveFocus();
      }
    });

    it('wraps the close button in a MediaTheme surface', () => {
      const {container} = render(
        <DialogHeroHeader
          title="Title"
          media={<div>media</div>}
          mediaMode="dark"
          onOpenChange={() => {}}
        />,
      );
      const surface = container.querySelector('[data-astryx-media="dark"]');
      expect(surface).not.toBeNull();
      expect(surface).toContainElement(
        screen.getByRole('button', {name: /close/i}),
      );
    });

    it('applies no MediaTheme surface when omitted', () => {
      const {container} = render(
        <DialogHeroHeader
          title="Title"
          media={<div>media</div>}
          onOpenChange={() => {}}
        />,
      );
      expect(container.querySelector('[data-astryx-media]')).toBeNull();
    });
  });

  describe('isTitleHidden', () => {
    it('keeps the title in the accessibility tree', () => {
      render(
        <DialogHeroHeader
          title="Title"
          media={<div>media</div>}
          isTitleHidden
        />,
      );
      expect(
        screen.getByRole('heading', {level: 2, name: 'Title'}),
      ).toBeInTheDocument();
    });

    it('changes the title row presentation', () => {
      const {container: hidden} = render(
        <DialogHeroHeader
          title="Same title"
          media={<div>media</div>}
          isTitleHidden
        />,
      );
      const {container: visible} = render(
        <DialogHeroHeader title="Same title" media={<div>media</div>} />,
      );
      const hiddenRow = hidden.querySelector('h2')?.parentElement;
      const visibleRow = visible.querySelector('h2')?.parentElement;
      // The hidden variant nests the row inside a VisuallyHidden container.
      expect(hiddenRow?.parentElement?.className).not.toBe(
        visibleRow?.parentElement?.className,
      );
    });
  });

  describe('inside Dialog', () => {
    it('focuses the visible title only after opening and restores the invoker on close', () => {
      const trigger = document.createElement('button');
      document.body.append(trigger);
      trigger.focus();
      const focusStates: boolean[] = [];
      const recordFocus = (event: FocusEvent) => {
        const target = event.target as HTMLElement;
        const dialog = target.closest('dialog');
        if (dialog) {
          focusStates.push(dialog.open);
        }
      };
      document.addEventListener('focusin', recordFocus);
      try {
        const {rerender} = render(
          <Dialog isOpen onOpenChange={() => {}}>
            <DialogHeroHeader title="Welcome" media={<div>media</div>} />
          </Dialog>,
        );
        expect(screen.getByRole('heading', {name: 'Welcome'})).toHaveFocus();
        expect(focusStates.length).toBeGreaterThan(0);
        expect(focusStates.every(Boolean)).toBe(true);
        rerender(
          <Dialog isOpen={false} onOpenChange={() => {}}>
            {null}
          </Dialog>,
        );
        expect(trigger).toHaveFocus();
      } finally {
        document.removeEventListener('focusin', recordFocus);
        trigger.remove();
      }
    });

    it('uses the title alone as the accessible name, including custom headings', () => {
      const {rerender} = render(
        <Dialog isOpen onOpenChange={() => {}}>
          <DialogHeroHeader
            title="Welcome"
            startContent={<span>New</span>}
            media={<div>media</div>}
          />
        </Dialog>,
      );
      expect(screen.getByRole('dialog')).toHaveAccessibleName('Welcome');
      rerender(
        <Dialog isOpen onOpenChange={() => {}}>
          <DialogHeroHeader
            title={<Heading level={3}>Custom</Heading>}
            startContent={<span>New</span>}
            media={<div>media</div>}
          />
        </Dialog>,
      );
      expect(screen.getByRole('dialog')).toHaveAccessibleName('Custom');
      expect(screen.getByRole('heading', {level: 3})).toHaveTextContent(
        'Custom',
      );
    });

    it('focuses and labels a custom heading element itself after opening', () => {
      render(
        <Dialog isOpen onOpenChange={() => {}}>
          <DialogHeroHeader
            title={<Heading level={1}>Custom</Heading>}
            startContent={<span>New</span>}
            media={<div>media</div>}
          />
        </Dialog>,
      );
      const heading = screen.getByRole('heading', {level: 1, name: 'Custom'});
      // Post-open focus lands on the heading, so it keeps its role and name.
      expect(document.activeElement).toBe(heading);
      expect(screen.getByRole('dialog')).toHaveAttribute(
        'aria-labelledby',
        heading.id,
      );
      expect(screen.getByRole('dialog')).toHaveAccessibleName('Custom');
      // The layout slot around the heading takes no part in the handshake.
      const slot = heading.parentElement as HTMLElement;
      expect(slot).not.toHaveAttribute('id');
      expect(slot).not.toHaveAttribute('tabindex');
      expect(slot).not.toHaveAttribute('data-autofocus');
    });

    it("keeps a custom heading's own id and tabIndex", () => {
      render(
        <Dialog isOpen onOpenChange={() => {}} aria-labelledby="own-title">
          <DialogHeroHeader
            title={
              <Heading level={2} id="own-title" tabIndex={0}>
                Own
              </Heading>
            }
            media={<div>media</div>}
          />
        </Dialog>,
      );
      const heading = screen.getByRole('heading', {name: 'Own'});
      expect(heading).toHaveAttribute('id', 'own-title');
      expect(heading).toHaveAttribute('tabindex', '0');
      expect(heading).toHaveFocus();
      expect(screen.getByRole('dialog')).toHaveAccessibleName('Own');
    });

    it.each([
      ['inline', {isInline: true}, {}],
      ['hidden', {}, {isTitleHidden: true}],
    ] as const)(
      'does not request focus for a custom heading when %s',
      (_, dialogProps, headerProps) => {
        render(
          <Dialog isOpen onOpenChange={() => {}} {...dialogProps}>
            <DialogHeroHeader
              title={<Heading level={3}>Custom</Heading>}
              media={<div>media</div>}
              {...headerProps}
            />
          </Dialog>,
        );
        const heading = screen.getByRole('heading', {level: 3});
        expect(heading).not.toHaveFocus();
        expect(heading).not.toHaveAttribute('tabindex');
        expect(heading).not.toHaveAttribute('data-autofocus');
        expect(heading).toHaveAttribute('id');
      },
    );

    it('moves the handshake to a replacement custom heading', () => {
      const {rerender} = render(
        <Dialog isOpen onOpenChange={() => {}}>
          <DialogHeroHeader
            title={<Heading level={3}>First</Heading>}
            media={<div>media</div>}
          />
        </Dialog>,
      );
      const first = screen.getByRole('heading', {name: 'First'});
      rerender(
        <Dialog isOpen onOpenChange={() => {}}>
          <DialogHeroHeader
            title={<Heading level={2}>Second</Heading>}
            media={<div>media</div>}
          />
        </Dialog>,
      );
      const second = screen.getByRole('heading', {name: 'Second'});
      expect(second).not.toBe(first);
      expect(second).toHaveAttribute('tabindex', '-1');
      expect(second).toHaveAttribute('data-autofocus', 'dialog-title');
      expect(screen.getByRole('dialog')).toHaveAccessibleName('Second');
    });

    it('leaves the custom heading handshake in place when the header re-renders', () => {
      const renderHeader = (caption: string) => (
        <Dialog isOpen onOpenChange={() => {}}>
          <DialogHeroHeader
            title={<Heading level={1}>Custom</Heading>}
            media={<div>{caption}</div>}
          />
        </Dialog>
      );
      const {rerender} = render(renderHeader('first'));
      const heading = screen.getByRole('heading', {level: 1, name: 'Custom'});
      expect(heading).toHaveFocus();
      // Chromium blurs a focused element whose tabindex is removed, so a
      // re-render with a new title element must not remove and add the
      // handshake attributes again.
      const observer = new MutationObserver(() => {});
      observer.observe(heading, {attributes: true});
      rerender(renderHeader('second'));
      const changed = observer
        .takeRecords()
        .map(record => record.attributeName);
      observer.disconnect();
      expect(changed).toEqual([]);
      expect(heading).toHaveFocus();
      expect(screen.getByRole('dialog')).toHaveAccessibleName('Custom');
    });

    it('names the dialog by a custom heading that renders after the header mounts', async () => {
      function LateHeading() {
        const [isReady, setIsReady] = useState(false);
        useEffect(() => {
          setIsReady(true);
        }, []);
        return isReady ? <Heading level={2}>Late</Heading> : null;
      }
      render(
        <Dialog isOpen onOpenChange={() => {}}>
          <DialogHeroHeader title={<LateHeading />} media={<div>media</div>} />
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog');
      await waitFor(() => expect(dialog).toHaveAccessibleName('Late'));
      const heading = screen.getByRole('heading', {name: 'Late'});
      expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
      expect(heading.parentElement).not.toHaveAttribute('id');
    });

    it('moves the handshake when a custom heading replaces its own element', async () => {
      function SwappingHeading() {
        const [level, setLevel] = useState<2 | 3>(2);
        useEffect(() => {
          setLevel(3);
        }, []);
        return <Heading level={level}>Swapped</Heading>;
      }
      render(
        <Dialog isOpen onOpenChange={() => {}}>
          <DialogHeroHeader
            title={<SwappingHeading />}
            media={<div>media</div>}
          />
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog');
      await waitFor(() =>
        expect(screen.getByRole('heading', {level: 3})).toHaveAttribute('id'),
      );
      const heading = screen.getByRole('heading', {level: 3, name: 'Swapped'});
      expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
      expect(dialog).toHaveAccessibleName('Swapped');
    });

    it('honors an explicit descendant focus request before the default title', () => {
      render(
        <Dialog isOpen onOpenChange={() => {}}>
          <DialogHeroHeader title="Welcome" media={<div>media</div>} />
          <button data-autofocus>Continue</button>
        </Dialog>,
      );
      expect(screen.getByRole('button', {name: 'Continue'})).toHaveFocus();
    });

    it.each(['disabled', 'hidden', 'inert'] as const)(
      'falls back to the title when the explicit request is %s',
      unavailable => {
        render(
          <Dialog isOpen onOpenChange={() => {}}>
            <DialogHeroHeader title="Welcome" media={<div>media</div>} />
            <div
              hidden={unavailable === 'hidden'}
              inert={unavailable === 'inert'}>
              <button data-autofocus disabled={unavailable === 'disabled'}>
                Continue
              </button>
            </div>
          </Dialog>,
        );
        expect(screen.getByRole('heading', {name: 'Welcome'})).toHaveFocus();
      },
    );

    it('does not request focus for a visually hidden title', () => {
      render(
        <Dialog isOpen onOpenChange={() => {}}>
          <DialogHeroHeader
            title="Hidden"
            media={<div>media</div>}
            isTitleHidden
            onOpenChange={() => {}}
          />
        </Dialog>,
      );
      const heading = screen.getByRole('heading', {name: 'Hidden'});
      expect(heading).not.toHaveFocus();
      expect(heading.parentElement).not.toHaveFocus();
      expect(screen.getByRole('dialog')).toHaveAccessibleName('Hidden');
    });

    it('names the open dialog via aria-labelledby', () => {
      render(
        <Dialog isOpen onOpenChange={() => {}}>
          <DialogHeroHeader title="Welcome aboard" media={<div>media</div>} />
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog');
      const labelledBy = dialog.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(document.getElementById(labelledBy as string)).toHaveTextContent(
        'Welcome aboard',
      );
    });

    it('still names the dialog when the title is hidden', () => {
      render(
        <Dialog isOpen onOpenChange={() => {}}>
          <DialogHeroHeader
            title="Hidden name"
            media={<div>media</div>}
            isTitleHidden
          />
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog');
      const labelledBy = dialog.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(document.getElementById(labelledBy as string)).toHaveTextContent(
        'Hidden name',
      );
    });

    it('does not auto-focus the title in inline dialogs', () => {
      render(
        <Dialog isOpen isInline onOpenChange={() => {}}>
          <DialogHeroHeader title="Inline title" media={<div>media</div>} />
        </Dialog>,
      );
      expect(document.activeElement).toBe(document.body);
    });
  });

  describe('divider', () => {
    it('renders without divider by default (no context)', () => {
      const {container: noCtx} = render(
        <DialogHeroHeader title="No ctx" media={<div>media</div>} />,
      );
      const {container: explicitFalse} = render(
        <DialogHeroHeader
          title="Explicit false"
          media={<div>media</div>}
          hasDivider={false}
        />,
      );
      expect((noCtx.firstChild as HTMLElement).className).toBe(
        (explicitFalse.firstChild as HTMLElement).className,
      );
    });

    it('inherits divider from Layout context and allows explicit override', () => {
      const {container: ctxTrue} = render(
        <LayoutDividerContext value={{defaultHasDividers: true}}>
          <DialogHeroHeader title="Ctx true" media={<div>media</div>} />
        </LayoutDividerContext>,
      );
      const {container: explicitTrue} = render(
        <DialogHeroHeader
          title="Explicit true"
          media={<div>media</div>}
          hasDivider
        />,
      );
      const {container: overridden} = render(
        <LayoutDividerContext value={{defaultHasDividers: true}}>
          <DialogHeroHeader
            title="Overridden"
            media={<div>media</div>}
            hasDivider={false}
          />
        </LayoutDividerContext>,
      );
      const ctxClass = (ctxTrue.firstChild as HTMLElement).className;
      const explicitClass = (explicitTrue.firstChild as HTMLElement).className;
      const overriddenClass = (overridden.firstChild as HTMLElement).className;
      expect(ctxClass).toBe(explicitClass);
      expect(overriddenClass).not.toBe(ctxClass);
    });
  });

  it('forwards ref, data-testid, and className to the root element', () => {
    const ref = vi.fn();
    render(
      <DialogHeroHeader
        ref={ref}
        title="Title"
        media={<div>media</div>}
        data-testid="hero-header"
        className="custom-class"
      />,
    );
    const root = screen.getByTestId('hero-header');
    expect(root.className).toContain('custom-class');
    expect(ref).toHaveBeenCalledWith(root);
  });
});
