// Copyright (c) Meta Platforms, Inc. and affiliates.

import {Profiler, useState} from 'react';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {act, render, screen, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Avatar} from './Avatar';
import {AvatarStatusDot} from './AvatarStatusDot';
import {AvatarGroup} from '../AvatarGroup';

describe('Avatar', () => {
  it('exposes role="img" with the name as accessible name', () => {
    render(<Avatar name="Ada Lovelace" data-testid="a" />);
    expect(screen.getByRole('img', {name: 'Ada Lovelace'})).toBeInTheDocument();
  });

  it('uses alt over name for the accessible name', () => {
    render(<Avatar name="Ada" alt="Ada Lovelace, profile photo" />);
    expect(
      screen.getByRole('img', {name: 'Ada Lovelace, profile photo'}),
    ).toBeInTheDocument();
  });

  it('is decorative (presentation + aria-hidden) when it has no name or alt (obs-9)', () => {
    render(<Avatar data-testid="a" />);
    const el = screen.getByTestId('a');
    // No meaningful name → not announced as a generic "Avatar".
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).not.toHaveAttribute('aria-label');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('does not double-announce: the inner img is decorative when the wrapper is named', () => {
    render(<Avatar name="Ada" src="https://example.com/ada.jpg" />);
    const wrapper = screen.getByRole('img', {name: 'Ada'});
    const innerImg = wrapper.querySelector('img');
    expect(innerImg).not.toBeNull();
    // The inner <img> carries an empty alt so it isn't announced separately.
    expect(innerImg).toHaveAttribute('alt', '');
  });

  it('renders a named size at its type-scale-aligned font size, not the raw proportional ratio', () => {
    // sm's raw `24 × 0.4` ratio is 9.6px, which lands between real type-scale
    // steps (#6470) — the named tier reads the nearest step (10px) instead.
    render(<Avatar name="Ada Lovelace" size="sm" data-testid="a" />);
    const initials = screen.getByText('AL');
    const style = initials.getAttribute('style') ?? '';
    expect(style).not.toMatch(/9\.6\d*px/);
    // Regression guard: the seam must NOT reintroduce the removed internal var.
    expect(style).not.toContain('--_avatar-fallback-font-size');
  });

  it('renders a custom numeric size at the proportional ratio via a StyleX class, not an inline property', () => {
    render(<Avatar name="Ada Lovelace" size={24} data-testid="a" />);
    const initials = screen.getByText('AL');
    // A numeric size outside the named tiers has no type-scale step to snap
    // to, so it keeps the proportional `size × ratio` fallback (24 × 0.4 =
    // 9.6px), fed to StyleX as a dynamic value: StyleX applies `font-size`
    // through a class and sets only the computed value inline (as a custom
    // property). Because the property lands via a class, a theme's
    // `.astryx-avatar-fallback.<size>` rule in the theme layer overrides it
    // per size tier — no internal var seam needed.
    const style = initials.getAttribute('style') ?? '';
    expect(style).toMatch(/9\.6\d*px/);
    expect(style).not.toContain('--_avatar-fallback-font-size');
  });

  it.each(['xsm', 'sm', 'md', 'lg', 'xl'] as const)(
    'size %s takes the type-scale-aligned static style, not the proportional dynamic one (#6470)',
    size => {
      render(<Avatar name="Ada Lovelace" size={size} />);
      const initials = screen.getByText('AL');
      // The named tiers no longer go through the dynamic ratio style at all,
      // so none of their font sizes are set as an inline custom property —
      // only the numeric-size fallback (tested above) still does that.
      const style = initials.getAttribute('style') ?? '';
      expect(style).not.toMatch(/font-size/i);
    },
  );

  it('marks the fallback surface with the stable theming class (initials and icon)', () => {
    // The background is themed directly on `.astryx-avatar-fallback`, so both
    // the initials and the default-icon fallback must carry the class.
    const {rerender} = render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByText('AL').className).toContain(
      'astryx-avatar-fallback',
    );

    rerender(<Avatar />);
    const icon = document.querySelector('.astryx-avatar-fallback');
    expect(icon).not.toBeNull();
    expect(icon?.querySelector('svg')).not.toBeNull();
  });

  it('puts the avatar box on the element that carries the theme target', () => {
    // T7: `.astryx-avatar` documents a `size` visual prop, so the width and
    // height that prop selects on must live on the targeted element — a theme
    // rule that resizes the target has to resize the whole avatar, not leave a
    // fixed-size circle inside a grown box.
    render(<Avatar name="Ada Lovelace" size="lg" data-testid="a" />);
    const root = screen.getByTestId('a');
    expect(root.className).toContain('astryx-avatar');
    const rootStyle = root.getAttribute('style') ?? '';
    expect(rootStyle).toContain('48px');

    const content = root.firstElementChild as HTMLElement;
    expect(content.getAttribute('style') ?? '').not.toContain('48px');
  });

  it('keeps the box on the root for an interactive avatar too', () => {
    render(<Avatar name="Ada" size="lg" href="/ada" />);
    const link = screen.getByRole('link', {name: 'Ada'});
    expect(link.getAttribute('style') ?? '').toContain('48px');
  });

  it('does not split an emoji surrogate pair when generating initials', () => {
    render(<Avatar name="😀 Ada" data-testid="avatar" />);
    expect(screen.getByTestId('avatar')).toHaveTextContent('😀A');
  });

  it('preserves a complete character when generating initials', () => {
    render(<Avatar name="🇬🇧 Ada" data-testid="avatar" />);
    expect(screen.getByTestId('avatar')).toHaveTextContent('🇬🇧A');
  });

  it('keeps a ZWJ family emoji intact when generating initials', () => {
    render(<Avatar name="👨‍👩‍👧‍👦 Ada" data-testid="avatar" />);
    expect(screen.getByTestId('avatar')).toHaveTextContent('👨‍👩‍👧‍👦A');
  });

  describe('initials come from letters, digits and emoji, not punctuation', () => {
    it.each([
      ['Northwind Workbench (automation)', 'NA'],
      ['Ada "The Countess" Lovelace', 'AL'],
      ['“Ada” Lovelace', 'AL'],
      ['Ada - Lovelace', 'AL'],
      ['Ada Lovelace —', 'AL'],
      ['Mary-Jane Watson', 'MW'],
      ['(Ada)', 'A'],
      ['Alice', 'A'],
      ['R2 D2', 'RD'],
      ['3M', '3'],
      ['émile zola', 'ÉZ'],
      ['😀 Ada', '😀A'],
      ['Ada (😀)', 'A😀'],
    ])('%s renders %s', (name, expected) => {
      render(<Avatar name={name} data-testid="avatar" />);
      expect(screen.getByTestId('avatar').textContent).toBe(expected);
    });

    it('falls through to the default icon when no word yields an initial', () => {
      render(<Avatar name="- ()" data-testid="a" />);
      const el = screen.getByTestId('a');
      expect(el.querySelector('svg')).not.toBeNull();
      expect(el).toHaveTextContent('');
      // The name still names the avatar.
      expect(screen.getByRole('img', {name: '- ()'})).toBeInTheDocument();
    });
  });

  it('retries a new src after a previous src failed to load', () => {
    const {rerender} = render(
      <Avatar name="Ada" src="https://example.com/broken.jpg" />,
    );
    const wrapper = screen.getByRole('img', {name: 'Ada'});
    fireEvent.error(wrapper.querySelector('img')!);
    // Broken image falls back to initials.
    expect(wrapper.querySelector('img')).toBeNull();
    expect(wrapper).toHaveTextContent('A');

    // A different src must get a fresh load attempt, not the stale error.
    rerender(<Avatar name="Ada" src="https://example.com/ada.jpg" />);
    const img = wrapper.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://example.com/ada.jpg');
  });

  describe('status in the accessible name (WCAG 4.1.2)', () => {
    // The avatar root is role="img", which prunes descendant semantics —
    // a label inside the status subtree is never announced on its own.
    // Avatar composes the status element's `label` into its own name.
    it('composes the status label into the accessible name for image avatars', () => {
      render(
        <Avatar
          name="Ada Lovelace"
          src="https://example.com/ada.jpg"
          status={<AvatarStatusDot variant="success" label="Online" />}
        />,
      );
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace, Online'}),
      ).toBeInTheDocument();
    });

    it('composes the status label into the accessible name for initials avatars', () => {
      render(
        <Avatar
          name="Ada Lovelace"
          status={<AvatarStatusDot variant="error" label="Busy" />}
        />,
      );
      const avatar = screen.getByRole('img', {name: 'Ada Lovelace, Busy'});
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveTextContent('AL');
    });

    it('composes the status label with alt when alt overrides name', () => {
      render(
        <Avatar
          name="Ada"
          alt="Ada Lovelace, profile photo"
          status={<AvatarStatusDot label="Online" />}
        />,
      );
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace, profile photo, Online'}),
      ).toBeInTheDocument();
    });

    it('keeps the plain name when there is no status', () => {
      render(<Avatar name="Ada Lovelace" data-testid="a" />);
      expect(screen.getByTestId('a')).toHaveAttribute(
        'aria-label',
        'Ada Lovelace',
      );
    });

    it('keeps the plain name when the status dot has no label', () => {
      render(
        <Avatar
          name="Ada Lovelace"
          data-testid="a"
          status={<AvatarStatusDot variant="success" />}
        />,
      );
      expect(screen.getByTestId('a')).toHaveAttribute(
        'aria-label',
        'Ada Lovelace',
      );
    });

    it('keeps the plain name for custom status nodes without a label prop', () => {
      render(<Avatar name="Ada Lovelace" data-testid="a" status={<span />} />);
      expect(screen.getByTestId('a')).toHaveAttribute(
        'aria-label',
        'Ada Lovelace',
      );
    });

    it('announces a labelled status even on an otherwise decorative avatar', () => {
      // A labelled status is meaningful information on its own — the avatar
      // must not stay aria-hidden and swallow it.
      render(
        <Avatar data-testid="a" status={<AvatarStatusDot label="Online" />} />,
      );
      const el = screen.getByTestId('a');
      expect(el).toHaveAttribute('role', 'img');
      expect(el).toHaveAttribute('aria-label', 'Online');
      expect(el).not.toHaveAttribute('aria-hidden');
    });

    it('stays decorative with an unlabelled status and no name', () => {
      render(<Avatar data-testid="a" status={<AvatarStatusDot />} />);
      const el = screen.getByTestId('a');
      expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(el).not.toHaveAttribute('aria-label');
    });
  });

  describe('status label through a consumer wrapper (P14)', () => {
    // A consumer's own component around AvatarStatusDot. Its prop is
    // deliberately not called `label`, so `status.props.label` introspection
    // has nothing to read; the dot's own report through context reaches it.
    function PresenceDot({presence = 'Online'}: {presence?: string}) {
      return <AvatarStatusDot variant="success" label={presence} />;
    }

    it('composes a label reported from inside a wrapper component', () => {
      render(<Avatar name="Ada Lovelace" status={<PresenceDot />} />);
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace, Online'}),
      ).toBeInTheDocument();
    });

    it('composes a label reported at any nesting depth', () => {
      function Outer() {
        return (
          <span>
            <PresenceDot presence="Away" />
          </span>
        );
      }
      render(<Avatar name="Ada Lovelace" status={<Outer />} />);
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace, Away'}),
      ).toBeInTheDocument();
    });

    it('follows a label that changes after mount', () => {
      const {rerender} = render(
        <Avatar
          name="Ada Lovelace"
          status={<PresenceDot presence="Online" />}
        />,
      );
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace, Online'}),
      ).toBeInTheDocument();

      rerender(
        <Avatar name="Ada Lovelace" status={<PresenceDot presence="Busy" />} />,
      );
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace, Busy'}),
      ).toBeInTheDocument();
    });

    it('drops the label when the status element unmounts', () => {
      const {rerender} = render(
        <Avatar name="Ada Lovelace" status={<PresenceDot />} data-testid="a" />,
      );
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace, Online'}),
      ).toBeInTheDocument();

      rerender(<Avatar name="Ada Lovelace" data-testid="a" />);
      expect(screen.getByTestId('a')).toHaveAttribute(
        'aria-label',
        'Ada Lovelace',
      );
    });

    it('announces a wrapped status on an otherwise decorative avatar', () => {
      render(<Avatar data-testid="a" status={<PresenceDot />} />);
      const el = screen.getByTestId('a');
      expect(el).toHaveAttribute('role', 'img');
      expect(el).toHaveAttribute('aria-label', 'Online');
      expect(el).not.toHaveAttribute('aria-hidden');
    });

    it('lets a reported label win over introspection', () => {
      // The wrapper's own `label` prop is not the string the dot renders with,
      // so introspection and the dot's report disagree here.
      function TranslatedDot({label}: {label: string}) {
        return <AvatarStatusDot label={label === 'busy' ? 'Busy' : label} />;
      }
      render(
        <Avatar name="Ada Lovelace" status={<TranslatedDot label="busy" />} />,
      );
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace, Busy'}),
      ).toBeInTheDocument();
    });

    it('costs no extra render and does not loop', () => {
      // The label arrives in the commit phase, after this render composed the
      // name. It lands on the root element directly, so a wrapped status is
      // named without a second render. `tooltip={false}` keeps the tooltip's
      // own mount commit out of the count.
      const commits: number[] = [];
      render(
        <Profiler id="avatar" onRender={() => commits.push(1)}>
          <Avatar
            name="Ada Lovelace"
            tooltip={false}
            status={<PresenceDot />}
          />
        </Profiler>,
      );
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace, Online'}),
      ).toBeInTheDocument();
      expect(commits).toHaveLength(1);
    });

    it('names a directly-passed dot on the first render, before any report', () => {
      // Introspection answers render one; the dot's report then lands on the
      // same name, still without a second render.
      const commits: number[] = [];
      render(
        <Profiler id="avatar" onRender={() => commits.push(1)}>
          <Avatar
            name="Ada Lovelace"
            tooltip={false}
            status={<AvatarStatusDot label="Online" />}
          />
        </Profiler>,
      );
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace, Online'}),
      ).toBeInTheDocument();
      expect(commits).toHaveLength(1);
    });

    it('follows a label that changes without re-rendering the avatar', () => {
      // State inside the consumer's wrapper: the dot re-renders alone, so the
      // avatar never gets the chance to recompose during render.
      let setPresence: (presence: string) => void = () => {};
      function SelfUpdatingDot() {
        const [presence, setter] = useState('Online');
        setPresence = setter;
        return <AvatarStatusDot label={presence} />;
      }
      render(<Avatar name="Ada Lovelace" status={<SelfUpdatingDot />} />);
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace, Online'}),
      ).toBeInTheDocument();

      act(() => setPresence('Busy'));
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace, Busy'}),
      ).toBeInTheDocument();
    });

    it('leaves a consumer aria-label alone when a wrapped status reports', () => {
      render(
        <Avatar
          name="Ada Lovelace"
          aria-label="Ada Lovelace, first programmer"
          data-testid="a"
          status={<PresenceDot />}
        />,
      );
      expect(screen.getByTestId('a')).toHaveAttribute(
        'aria-label',
        'Ada Lovelace, first programmer',
      );
    });
  });

  describe('a whitespace-only name carries no identity', () => {
    it('falls through to the default icon instead of an empty plate', () => {
      render(<Avatar name="   " data-testid="a" />);
      const el = screen.getByTestId('a');
      expect(el.querySelector('svg')).not.toBeNull();
      expect(el).toHaveTextContent('');
    });

    it('is decorative rather than a role="img" with a blank name', () => {
      render(<Avatar name="   " data-testid="a" />);
      const el = screen.getByTestId('a');
      expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(el).not.toHaveAttribute('aria-label');
    });

    it('keeps a meaningful alt as the accessible name and still shows the icon', () => {
      render(<Avatar name="   " alt="Profile photo" data-testid="a" />);
      const el = screen.getByRole('img', {name: 'Profile photo'});
      expect(el).toBe(screen.getByTestId('a'));
      expect(el.querySelector('svg')).not.toBeNull();
    });

    it('treats a whitespace-only alt the same way', () => {
      render(<Avatar alt="  " name="Ada Lovelace" data-testid="a" />);
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace'}),
      ).toBeInTheDocument();
    });
  });

  it('retries a new fallbackSrc after a previous fallbackSrc failed to load', () => {
    const {rerender} = render(
      <Avatar name="Ada" fallbackSrc="https://example.com/broken.jpg" />,
    );
    const wrapper = screen.getByRole('img', {name: 'Ada'});
    fireEvent.error(wrapper.querySelector('img')!);
    expect(wrapper.querySelector('img')).toBeNull();

    rerender(<Avatar name="Ada" fallbackSrc="https://example.com/ada.jpg" />);
    const img = wrapper.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://example.com/ada.jpg');
  });

  it('renders without error for all shape variants', () => {
    const shapes = ['circle', 'rounded', 'square'] as const;
    for (const shape of shapes) {
      const {unmount} = render(
        <Avatar
          name="Ana Thomas"
          shape={shape}
          data-testid={`avatar-${shape}`}
        />,
      );
      expect(screen.getByTestId(`avatar-${shape}`)).toBeInTheDocument();
      unmount();
    }
  });

  it('defaults to circle shape (no shape prop)', () => {
    render(<Avatar name="Lee" data-testid="avatar-default" />);
    // Should still render with role="img" using the name as the accessible label.
    expect(screen.getByRole('img', {name: 'Lee'})).toBeInTheDocument();
  });

  it('renders status dot for all shape variants', () => {
    const shapes = ['circle', 'rounded', 'square'] as const;
    const StatusDot = () => <span data-testid="status-dot" />;
    for (const shape of shapes) {
      const {unmount} = render(
        <Avatar
          name="Ana"
          shape={shape}
          status={<StatusDot />}
          data-testid={`avatar-${shape}-status`}
        />,
      );
      expect(screen.getByTestId('status-dot')).toBeInTheDocument();
      unmount();
    }
  });

  it('applies shapeStyles to wrapper when rendered inside AvatarGroup', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" shape="rounded" data-testid="group-avatar" />
      </AvatarGroup>,
    );
    expect(screen.getByTestId('group-avatar')).toBeInTheDocument();
  });

  it("an AvatarGroup's shape overrides an individual Avatar's own shape prop, matching how size already works", () => {
    render(
      <AvatarGroup shape="square">
        <Avatar name="Alice" shape="rounded" data-testid="group-avatar" />
      </AvatarGroup>,
    );
    expect(screen.getByTestId('group-avatar')).toHaveAttribute(
      'data-shape',
      'square',
    );
  });

  it("an Avatar's own shape prop applies outside any AvatarGroup", () => {
    render(<Avatar name="Ana" shape="rounded" data-testid="solo-avatar" />);
    expect(screen.getByTestId('solo-avatar')).toHaveAttribute(
      'data-shape',
      'rounded',
    );
  });

  it('defaults to circle shape inside an AvatarGroup with no explicit shape', () => {
    render(
      <AvatarGroup>
        <Avatar name="Alice" shape="square" data-testid="group-avatar" />
      </AvatarGroup>,
    );
    expect(screen.getByTestId('group-avatar')).toHaveAttribute(
      'data-shape',
      'circle',
    );
  });

  // --- Name tooltip (tooltip?: string | boolean) ---
  describe('name tooltip', () => {
    const originalShowPopover = HTMLElement.prototype.showPopover;
    const originalHidePopover = HTMLElement.prototype.hidePopover;

    beforeEach(() => {
      // jsdom does not implement the Popover API the tooltip layer uses.
      HTMLElement.prototype.showPopover = vi.fn();
      HTMLElement.prototype.hidePopover = vi.fn();
    });

    afterEach(() => {
      HTMLElement.prototype.showPopover = originalShowPopover;
      HTMLElement.prototype.hidePopover = originalHidePopover;
    });

    it('shows the name in a tooltip by default', () => {
      render(<Avatar name="Ada Lovelace" />);
      const tooltip = screen.getByRole('tooltip', {hidden: true});
      expect(tooltip).toHaveTextContent('Ada Lovelace');
    });

    it('shows a custom string tooltip instead of the name', () => {
      render(<Avatar name="alovelace" tooltip="Ada Lovelace, Mathematician" />);
      const tooltip = screen.getByRole('tooltip', {hidden: true});
      expect(tooltip).toHaveTextContent('Ada Lovelace, Mathematician');
      expect(tooltip).not.toHaveTextContent('alovelace');
    });

    it('renders no tooltip when tooltip={false}', () => {
      render(<Avatar name="Ada Lovelace" tooltip={false} />);
      expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    });

    it('renders no tooltip for a decorative avatar (no name/alt)', () => {
      render(<Avatar src="https://example.com/x.jpg" />);
      expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    });

    it('renders no tooltip when tooltip is true/default but name is empty', () => {
      render(<Avatar name="   " alt="Profile photo" data-testid="a" />);
      // A whitespace-only name yields nothing to show, and the default tooltip
      // uses `name` (not `alt`), so there is no tooltip.
      expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
      // The accessible name still comes from alt, unaffected.
      expect(
        screen.getByRole('img', {name: 'Profile photo'}),
      ).toBeInTheDocument();
    });

    it('still shows a custom string tooltip when there is no name', () => {
      render(<Avatar tooltip="Anonymous user" data-testid="a" />);
      const tooltip = screen.getByRole('tooltip', {hidden: true});
      expect(tooltip).toHaveTextContent('Anonymous user');
    });

    it('makes the root focusable while a tooltip is attached', () => {
      render(<Avatar name="Ada Lovelace" data-testid="a" />);
      expect(screen.getByTestId('a')).toHaveAttribute('tabindex', '0');
    });

    it('does not add a tab stop when the tooltip is disabled', () => {
      render(<Avatar name="Ada Lovelace" tooltip={false} data-testid="a" />);
      expect(screen.getByTestId('a')).not.toHaveAttribute('tabindex');
    });

    it('keeps the accessible name on the root regardless of the tooltip', () => {
      const {rerender} = render(<Avatar name="Ada Lovelace" />);
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace'}),
      ).toBeInTheDocument();

      rerender(<Avatar name="Ada Lovelace" tooltip={false} />);
      expect(
        screen.getByRole('img', {name: 'Ada Lovelace'}),
      ).toBeInTheDocument();

      rerender(<Avatar name="alovelace" tooltip="Ada Lovelace, Eng" />);
      // alt||name still drives the accessible name — not the custom tooltip.
      expect(screen.getByRole('img', {name: 'alovelace'})).toBeInTheDocument();

      rerender(<Avatar name="alovelace" alt="Ada's profile photo" />);
      expect(
        screen.getByRole('img', {name: "Ada's profile photo"}),
      ).toBeInTheDocument();
    });

    it('does not describe the root with the default name tooltip (no double-announce)', () => {
      render(<Avatar name="Ada Lovelace" data-testid="a" />);
      // The default name tooltip is visual-only: its text duplicates the root
      // aria-label, so we deliberately do NOT wire aria-describedby (OQ-4).
      expect(screen.getByTestId('a')).not.toHaveAttribute('aria-describedby');
    });

    it('describes the root with a custom string tooltip (matches Button)', () => {
      render(
        <Avatar
          name="alovelace"
          tooltip="Ada Lovelace, Mathematician"
          data-testid="a"
        />,
      );
      const root = screen.getByTestId('a');
      const describedBy = root.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      // aria-describedby points at the rendered tooltip layer.
      const tooltip = screen.getByRole('tooltip', {hidden: true});
      expect(tooltip.id).toBeTruthy();
      expect(describedBy).toContain(tooltip.id);
    });

    it('composes a consumer aria-describedby with the custom tooltip description', () => {
      render(
        <>
          <span id="extra-desc">extra description</span>
          <Avatar
            name="alovelace"
            tooltip="Ada Lovelace, Eng"
            aria-describedby="extra-desc"
            data-testid="a"
          />
        </>,
      );
      const describedBy = screen
        .getByTestId('a')
        .getAttribute('aria-describedby');
      expect(describedBy).toContain('extra-desc');
    });

    it('preserves a consumer aria-describedby with the default name tooltip', () => {
      render(
        <>
          <span id="extra-desc">extra description</span>
          <Avatar
            name="Ada Lovelace"
            aria-describedby="extra-desc"
            data-testid="a"
          />
        </>,
      );
      // Default name tooltip does not touch aria-describedby, so the consumer
      // value passes through untouched.
      expect(screen.getByTestId('a')).toHaveAttribute(
        'aria-describedby',
        'extra-desc',
      );
    });

    it('forwards the consumer ref to the root while a tooltip is attached', () => {
      const ref = {current: null as HTMLDivElement | null};
      render(<Avatar name="Ada Lovelace" ref={ref} data-testid="a" />);
      expect(ref.current).toBe(screen.getByTestId('a'));
    });

    it('keeps its merged ref attached across unrelated rerenders', () => {
      const ref = vi.fn();
      const {rerender} = render(
        <Avatar name="Ada Lovelace" size="sm" tooltip={false} ref={ref} />,
      );
      const avatar = screen.getByRole('img', {name: 'Ada Lovelace'});
      expect(ref).toHaveBeenLastCalledWith(avatar);
      ref.mockClear();

      rerender(
        <Avatar name="Ada Lovelace" size="lg" tooltip={false} ref={ref} />,
      );

      expect(ref).not.toHaveBeenCalled();
      expect(screen.getByRole('img', {name: 'Ada Lovelace'})).toBe(avatar);
    });
  });
});

describe('Avatar — interactivity (Button trichotomy)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a link when `href` is set (default LinkComponent is <a>)', () => {
    render(<Avatar name="Ada Lovelace" href="/users/ada" />);
    const link = screen.getByRole('link', {name: 'Ada Lovelace'});
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/users/ada');
    // The static img semantics are gone — it's a control now.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('forwards target/rel on the link', () => {
    render(
      <Avatar
        name="Ada"
        href="https://example.com"
        target="_blank"
        rel="noopener noreferrer"
      />,
    );
    const link = screen.getByRole('link', {name: 'Ada'});
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders a <button type="button"> when `onClick` is set (no href)', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Avatar name="Ada" onClick={handleClick} />);
    const button = screen.getByRole('button', {name: 'Ada'});
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('href wins over onClick (link, not button)', () => {
    render(<Avatar name="Ada" href="/ada" onClick={() => {}} />);
    expect(screen.getByRole('link', {name: 'Ada'})).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('stays a static element (no href, no onClick) — non-breaking default', () => {
    render(<Avatar name="Ada" />);
    expect(screen.getByRole('img', {name: 'Ada'})).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('stamps the data-avatar-item marker on the interactive link', () => {
    render(<Avatar name="Ada" href="/ada" />);
    expect(screen.getByRole('link', {name: 'Ada'})).toHaveAttribute(
      'data-avatar-item',
    );
  });

  it('stamps the data-avatar-item marker on the interactive button', () => {
    render(<Avatar name="Ada" onClick={() => {}} />);
    expect(screen.getByRole('button', {name: 'Ada'})).toHaveAttribute(
      'data-avatar-item',
    );
  });

  it('does not stamp data-avatar-item on a static avatar', () => {
    render(<Avatar name="Ada" data-testid="a" />);
    expect(screen.getByTestId('a')).not.toHaveAttribute('data-avatar-item');
  });

  it('carries a focus-visible ring class on the interactive element', () => {
    // The interactive element applies the shared focus-visible accent ring via
    // its StyleX class. We assert the element is focusable and receives focus.
    render(<Avatar name="Ada" onClick={() => {}} />);
    const button = screen.getByRole('button', {name: 'Ada'});
    button.focus();
    expect(button).toHaveFocus();
    // className carries the avatar theming target so themes can style it.
    expect(button.className).toContain('astryx-avatar');
  });

  it('warns in dev when interactive without an accessible name (href)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Avatar href="/somewhere" />);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('interactive avatar'),
    );
  });

  it('warns in dev when interactive without an accessible name (onClick)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Avatar onClick={() => {}} />);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('interactive avatar'),
    );
  });

  it('does not warn when interactive with a name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Avatar name="Ada" href="/ada" />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn for a static avatar without a name (decorative is fine)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Avatar data-testid="a" />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when the only accessible name is a status label', () => {
    // A status is not an identity: "Online" alone is a worse control name than
    // none, because it reads as a legitimate one.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Avatar
        href="/somewhere"
        src="https://example.com/ada.jpg"
        status={<AvatarStatusDot label="Online" />}
      />,
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('interactive avatar'),
    );
  });

  it('warns when interactive with an empty-string name and alt', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Avatar href="/ada" name="" alt="" />);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('interactive avatar'),
    );
  });

  it('does not warn when the consumer names the control with aria-label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Avatar href="/ada" aria-label="Ada Lovelace" />);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('Avatar — consumer ARIA overrides win (Icon labelling pattern)', () => {
  it('lets a consumer aria-label override the derived name on the static root', () => {
    render(<Avatar name="Ada" aria-label="Ada Lovelace, on leave" />);
    expect(
      screen.getByRole('img', {name: 'Ada Lovelace, on leave'}),
    ).toBeInTheDocument();
  });

  it('lets a consumer role override the derived role', () => {
    render(<Avatar name="Ada" role="presentation" data-testid="a" />);
    expect(screen.getByTestId('a')).toHaveAttribute('role', 'presentation');
  });

  it('lets a consumer hide a named avatar with aria-hidden', () => {
    render(<Avatar name="Ada" aria-hidden="true" data-testid="a" />);
    expect(screen.getByTestId('a')).toHaveAttribute('aria-hidden', 'true');
  });

  it('lets a consumer aria-label override the derived name on an interactive root', () => {
    render(<Avatar name="Ada" href="/ada" aria-label="Ada Lovelace profile" />);
    expect(
      screen.getByRole('link', {name: 'Ada Lovelace profile'}),
    ).toBeInTheDocument();
  });
});
