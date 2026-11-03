// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SearchField.tsx
 * @input React, StyleX, Core's theme tokens, Icon, the search table
 *   (internal/searchMotion.ts) and the touch layer (SearchFieldTouch.ts)
 * @output SearchField, the phone search field of iOS 26's
 *   UISearchController, and the SearchFieldHandle type
 * @position Lab component. A navigation bar, a tab bar's search tab, a page
 *   header or a bottom toolbar holds it.
 *
 * SYNC: When modified, update SearchFieldTouch.ts, SearchField.doc.mjs,
 * SearchField.test.tsx, searchFieldModel.ts and
 * __tests__/SearchField.interaction.browser.spec.ts.
 */

import {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {Icon} from '@astryxdesign/core/Icon';
import {useMergedRefs} from '@astryxdesign/core/hooks';
import {useTranslator} from '@astryxdesign/core/i18n';
import {
  colorVars,
  radiusVars,
  shadowVars,
  textSizeVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {mergeProps, themeProps} from '@astryxdesign/core/utils';
import {
  useSearchFieldMotion,
  type SearchFieldPlacement,
} from './SearchFieldTouch';
import {bottomEdges} from './searchFieldModel';
import {search} from '../internal/searchMotion';

const {bottom} = search;

// =============================================================================
// Types
// =============================================================================

/** What `handleRef` exposes: focus, blur and cancel the field. */
export interface SearchFieldHandle {
  /**
   * Focuses the input. Called inside a tap, it raises the touch keyboard
   * and activates the field. At the bottom of the screen (`bottom`, `tab`)
   * it does not let Safari scroll the field into view.
   */
  focus(): void;
  /** Ends editing; the field stays active. */
  blur(): void;
  /**
   * Cancels search as the close button does: clears the query, ends
   * editing and reports `onActiveChange(false)`. For a host that draws its
   * own cancel button (a tab bar's search tab).
   */
  cancel(): void;
}

export interface SearchFieldProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange' | 'onSubmit'
> {
  /** The field's accessible name; also its placeholder by default. */
  label: string;
  /** Placeholder text. Defaults to `label`. */
  placeholder?: string;
  /** The query (controlled). */
  value?: string;
  /** The initial query (uncontrolled). */
  defaultValue?: string;
  /** Called with the new query on every edit, and with '' on clear or cancel. */
  onChange?: (value: string) => void;
  /** Whether search is active (controlled). */
  isActive?: boolean;
  /** Whether search starts active (uncontrolled). */
  defaultIsActive?: boolean;
  /** Called when the field activates (it gains focus) or is cancelled. */
  onActiveChange?: (isActive: boolean) => void;
  /** Called with the query when the keyboard's Search key (Enter) is used. */
  onSubmit?: (value: string) => void;
  /**
   * Focus, blur and cancel, for a host that activates the field from its own
   * tap or draws its own cancel button.
   */
  handleRef?: Ref<SearchFieldHandle>;
  /**
   * How far the active field rises into its host's bar, px. The host knows
   * the distance: a navigation bar lifts the field from under its large
   * title to the bar's row. The default, 0, keeps it in place.
   */
  lift?: number;
  /**
   * Where the field lives. `stacked` (default) sits in a page header or under
   * a navigation bar's title. `bottom` is iOS 26's toolbar field, in a bar
   * the app keeps at the bottom of the viewport, above the software keyboard.
   * `lift` applies to `stacked` only. `tab` is the field inside a tab bar's
   * search tab. There the tab bar draws the glass, the cancel button and
   * every motion. The field draws only its content, sized to its box.
   */
  placement?: SearchFieldPlacement;
  /** The close button's accessible name (default: "Cancel", translated). */
  cancelLabel?: string;
  /** The clear button's accessible name (default: "Clear text", translated). */
  clearLabel?: string;
  /** The root element (the `search` landmark). */
  ref?: Ref<HTMLDivElement>;
}

// =============================================================================
// Styles
// =============================================================================

const px = (value: number) => `${value}px`;

const styles = stylex.create({
  root: {
    position: 'relative',
    boxSizing: 'border-box',
    width: '100%',
    // The inactive close button waits past the field's end and slides in
    // from there, as UIKit's does from beyond the screen's edge. Clipping the
    // inline overflow keeps it from widening the page, which would otherwise
    // scroll sideways on a phone.
    overflowX: 'clip',
    // No browser tap highlight over the field or its buttons: UIKit's has
    // none, and Chromium's fades on the main thread, painting every frame.
    WebkitTapHighlightColor: 'transparent',
  },
  rootInset: (inset: string) => ({paddingInline: inset}),
  // Above the software keyboard, by layout (SearchFieldTouch.ts's
  // `keyboardLift`); physical, as the keyboard is.
  keyboardLift: (lift: string) => ({bottom: lift}),
  // Inside a tab bar's search tab the field fills the box the tab bar gives
  // it; the tab bar's glass is its background.
  tabFill: {
    height: '100%',
  },
  field: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    // The background pseudo-elements paint under the magnifier and the
    // text, inside the field's own stacking context.
    isolation: 'isolate',
  },
  fieldHeight: (height: string) => ({height}),
  // The background: two rounded ends and a middle that scales, so the field
  // narrows on the compositor without re-laying out. They are decoration
  // with no role and no theme target, so they are pseudo-elements. The
  // leading end is the field's ::before, and the middle is its ::after. The
  // trailing end is the trailing part's ::before (endCap), which moves with
  // it.
  background: (cap: string) => ({
    '::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      bottom: 0,
      insetInlineStart: 0,
      zIndex: -1,
      width: cap,
      borderStartStartRadius: cap,
      borderEndStartRadius: cap,
      backgroundColor: colorVars['--color-background-muted'],
      pointerEvents: 'none',
      // The leading end moves under a bottom field's gel: promoted by the
      // animator while it moves (motion/animator.ts, "Promotion").
      willChange: 'var(--astryx-motion-will-change-before, auto)',
    },
    '::after': {
      content: '""',
      position: 'absolute',
      top: 0,
      bottom: 0,
      insetInlineStart: cap,
      insetInlineEnd: cap,
      zIndex: -1,
      backgroundColor: colorVars['--color-background-muted'],
      pointerEvents: 'none',
      transformOrigin: {
        default: 'left center',
        ':is([dir="rtl"] *)': 'right center',
      },
      // The animator promotes the scaling middle through this property on
      // the field while it moves (motion/animator.ts, "Promotion").
      willChange: 'var(--astryx-motion-will-change-after, auto)',
    },
  }),
  end: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    insetInlineEnd: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    pointerEvents: 'none',
  },
  // The trailing end's ::before is one px wider than the rounded end. It
  // reaches under the middle, so the two show no antialiased seam as they
  // move.
  endCap: (cap: string) => ({
    '::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      bottom: 0,
      insetInlineEnd: 0,
      width: `calc(${cap} + 1px)`,
      borderStartEndRadius: cap,
      borderEndEndRadius: cap,
      backgroundColor: colorVars['--color-background-muted'],
      // The cap scales under a bottom field's gel: promoted by the animator
      // while it moves (motion/animator.ts, "Promotion").
      willChange: 'var(--astryx-motion-will-change-before, auto)',
    },
  }),
  // A bottom field's magnifier and text, carried together with its leading
  // edge through the gel.
  content: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flexGrow: 1,
    minWidth: 0,
    height: '100%',
  },
  magnifier: {
    position: 'relative',
    display: 'flex',
    flexShrink: 0,
    marginInlineStart: 12,
    color: colorVars['--color-text-secondary'],
    pointerEvents: 'none',
  },
  input: {
    position: 'relative',
    flexGrow: 1,
    minWidth: 0,
    height: '100%',
    margin: 0,
    paddingBlock: 0,
    paddingInlineStart: 8,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: colorVars['--color-text-primary'],
    // 17 px, iOS's body size; at least 16 px also keeps iOS from zooming
    // into the field on focus.
    fontSize: textSizeVars['--font-size-lg'],
    fontFamily: 'inherit',
    outline: 'none',
    '::placeholder': {
      color: colorVars['--color-text-secondary'],
    },
  },
  inputEnd: (end: string) => ({paddingInlineEnd: end}),
  clear: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-text-secondary'],
    color: colorVars['--color-background-body'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    pointerEvents: 'auto',
    WebkitTapHighlightColor: 'transparent',
  },
  clearGeometry: (size: string, inset: string) => ({
    width: size,
    height: size,
    marginInlineEnd: inset,
  }),
  close: {
    position: 'absolute',
    top: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    borderWidth: 0,
    borderRadius: radiusVars['--radius-full'],
    // Glass under a finger (TOUCH_QUERY, spelled as touchPresentation.ts
    // does); under a mouse a plain round button in the field's own fill.
    backgroundColor: {
      default: colorVars['--color-background-muted'],
      '@media (pointer: coarse)': `color-mix(in srgb, ${colorVars['--color-background-popover']} 78%, transparent)`,
    },
    backdropFilter: {
      default: 'none',
      '@media (pointer: coarse)': 'blur(16px) saturate(180%)',
    },
    boxShadow: {
      default: 'none',
      '@media (pointer: coarse)': shadowVars['--shadow-med'],
    },
    color: colorVars['--color-text-primary'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
  },
  closeGeometry: (size: string, inset: string) => ({
    width: size,
    height: size,
    insetInlineEnd: inset,
  }),
  // The active pose before the touch layer places the parts, as in a server
  // render or the first paint before hydration. The trailing end is already
  // in by the close button and its gap. The middle (the field's ::after) is
  // short by the same 55 px (`search.stacked.closeGap + closeSize`, kept
  // equal by a test). The touch layer marks the root placed in its first
  // layout. It sets the parts' held values in the same task, and they take
  // over.
  beforePlacement: {
    marginInlineEnd: {
      default: null,
      ':is([data-search-field-active]:not([data-search-field-placed]) *)': 55,
    },
  },
  middleBeforePlacement: {
    '::after': {
      marginInlineEnd: {
        default: null,
        ':is([data-search-field-active]:not([data-search-field-placed]) *)': 55,
      },
    },
  },
  // The resting (inactive) close button, in CSS: 44 px toward the trailing
  // end (`search.stacked.closeTravel`, kept equal by a test). A
  // server-rendered page then paints it transparent and out of place until
  // the animator's held values take over.
  closeInert: {
    pointerEvents: 'none',
    opacity: 0,
    translate: {
      default: '44px 0',
      ':is([dir="rtl"] *)': '-44px 0',
    },
  },
  // The resting bottom close button, in CSS too. It hides inside the field's
  // trailing end at a fifth of its size, 16.67 px toward the field. The
  // values match `search.bottom.closeEnterFrames`' first row, and a test
  // keeps them equal.
  closeInertBottom: {
    pointerEvents: 'none',
    opacity: 0,
    scale: 0.2,
    translate: {
      default: '-16.67px 0',
      ':is([dir="rtl"] *)': '16.67px 0',
    },
  },
});

const CLEAR_INSET_PX = 10;

const PREVENT_SCROLL: FocusOptions = {preventScroll: true};

/**
 * How the field's own focus calls focus its input: at the bottom or in a
 * tab, without the browser's reveal, which would pan the page.
 */
function focusOptionsFor(
  placement: SearchFieldPlacement,
): FocusOptions | undefined {
  return placement === 'stacked' ? undefined : PREVENT_SCROLL;
}

// =============================================================================
// Component
// =============================================================================

/**
 * The search field of iOS 26's UISearchController for a phone: it
 * activates into its host's bar with a glass close button, on UIKit's
 * clock.
 *
 * @example
 * ```
 * const [query, setQuery] = useState('');
 * <SearchField label="Search" value={query} onChange={setQuery} />
 * ```
 */
export function SearchField({
  label,
  placeholder,
  value: valueProp,
  defaultValue = '',
  onChange,
  isActive: isActiveProp,
  defaultIsActive = false,
  onActiveChange,
  onSubmit,
  handleRef,
  lift = 0,
  placement = 'stacked',
  cancelLabel,
  clearLabel,
  xstyle,
  className,
  style,
  ref,
  ...rest
}: SearchFieldProps) {
  const [valueState, setValueState] = useState(defaultValue);
  const value = valueProp ?? valueState;
  const [isActiveState, setIsActiveState] = useState(defaultIsActive);
  const isActive = isActiveProp ?? isActiveState;

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const t = useTranslator();
  const resolvedCancelLabel = cancelLabel ?? t('@astryx.searchField.cancel');
  const resolvedClearLabel = clearLabel ?? t('@astryx.searchField.clear');
  const fieldRef = useRef<HTMLDivElement>(null);
  const isBottom = placement === 'bottom';
  const isTab = placement === 'tab';
  const motion = useSearchFieldMotion({
    fieldRef,
    inputRef,
    isActive,
    lift,
    placement,
  });
  // The field box hosts the leading end (::before) and the middle
  // (::after); the trailing part hosts the trailing end's cap (::before).
  const fieldRefs = useMergedRefs(fieldRef, motion.startRef, motion.middleRef);
  const endRefs = useMergedRefs(motion.endRef, motion.endCapRef);
  const fieldHeight = isBottom
    ? bottom.fieldHeight
    : search.stacked.fieldHeight;

  const setValue = useCallback(
    (next: string) => {
      if (valueProp === undefined) {
        setValueState(next);
      }
      onChange?.(next);
    },
    [valueProp, onChange],
  );
  const setActive = useCallback(
    (next: boolean) => {
      if (isActiveProp === undefined) {
        setIsActiveState(next);
      }
      onActiveChange?.(next);
    },
    [isActiveProp, onActiveChange],
  );

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  const handleFocus = useCallback(() => {
    if (!isActive) {
      setActive(true);
    }
  }, [isActive, setActive]);

  const cancel = useCallback(() => {
    setValue('');
    inputRef.current?.blur();
    setActive(false);
  }, [setValue, setActive]);
  useImperativeHandle(
    handleRef,
    () => ({
      focus() {
        inputRef.current?.focus(focusOptionsFor(placement));
      },
      blur() {
        inputRef.current?.blur();
      },
      cancel,
    }),
    [placement, cancel],
  );

  // A cancel from the keyboard (Escape in the field, or the close button
  // with focus) leaves focus on the search landmark. The close button turns
  // `aria-hidden` and transparent at once, and the field would activate
  // again if it took focus. The landmark takes focus only for this. It lets
  // focus go once focus moves on, so Tab continues from the field.
  const keepFocusOnLandmark = useCallback(() => {
    const root = rootRef.current;
    if (root == null) {
      return;
    }
    root.tabIndex = -1;
    root.addEventListener('blur', () => root.removeAttribute('tabindex'), {
      once: true,
    });
    root.focus({preventScroll: true});
  }, []);
  const handleClose = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const button = event.currentTarget;
      const hadFocus = button.ownerDocument.activeElement === button;
      cancel();
      if (hadFocus) {
        keepFocusOnLandmark();
      }
    },
    [cancel, keepFocusOnLandmark],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        onSubmit?.(value);
      } else if (event.key === 'Escape' && isActive) {
        event.preventDefault();
        cancel();
        keepFocusOnLandmark();
      }
    },
    [onSubmit, value, isActive, cancel, keepFocusOnLandmark],
  );

  // The clear button keeps the input's focus, because its press never takes
  // it. Tapped while not editing, it focuses the input inside the tap, so the
  // keyboard rises. UIKit's clear button also makes its field first
  // responder.
  const handleClear = useCallback(() => {
    setValue('');
    inputRef.current?.focus(focusOptionsFor(placement));
  }, [setValue, placement]);

  const cap = px(fieldHeight / 2);
  const showsClear = value !== '';
  // Text stops before the clear button. While active, it also stops before
  // the space the narrowed field gives up to the close button. At the bottom,
  // that space is less the leading edge's own move, which carries the text.
  const edges = bottomEdges(0);
  const activeGiveUp = isTab
    ? 0
    : isBottom
      ? edges.restTrailing -
        edges.activeTrailing -
        (edges.restLeading - edges.activeLeading)
      : search.stacked.closeGap + search.stacked.closeSize;
  const inputEnd =
    (showsClear ? search.clear.size + CLEAR_INSET_PX : 0) +
    (isActive ? activeGiveUp : 0) +
    (showsClear ? 0 : CLEAR_INSET_PX);
  const closeSize = isBottom ? bottom.closeSize : search.stacked.closeSize;
  const closeInset = isBottom ? bottom.activeInset : search.stacked.fieldInset;
  const magnifier = (
    <Icon icon="search" size="sm" color="inherit" xstyle={styles.magnifier} />
  );
  const input = (
    <input
      ref={inputRef}
      type="text"
      role="searchbox"
      aria-label={label}
      placeholder={placeholder ?? label}
      value={value}
      onChange={(event: ChangeEvent<HTMLInputElement>) =>
        setValue(event.target.value)
      }
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      // A UIKit search field's text field: the `.search` return key and
      // `autocorrectionType = .no` (measured on iOS 26.2).
      enterKeyHint="search"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      {...stylex.props(styles.input, styles.inputEnd(px(inputEnd)))}
    />
  );

  return (
    <div
      {...rest}
      ref={useMergedRefs(ref, motion.rootRef, rootRef)}
      role="search"
      data-search-field-active={isActive || undefined}
      {...mergeProps(
        themeProps('search-field'),
        stylex.props(
          styles.root,
          isTab
            ? styles.tabFill
            : styles.rootInset(
                px(isBottom ? bottom.restInset : search.stacked.fieldInset),
              ),
          isBottom && styles.keyboardLift(px(motion.keyboardLift)),
          xstyle,
        ),
        className,
        style,
      )}>
      <div
        ref={fieldRefs}
        {...stylex.props(
          styles.field,
          isTab ? styles.tabFill : styles.fieldHeight(px(fieldHeight)),
          !isTab && styles.background(cap),
          placement === 'stacked' && styles.middleBeforePlacement,
        )}>
        {isBottom ? (
          <div
            ref={motion.contentRef}
            data-search-field-content=""
            {...stylex.props(styles.content)}>
            {magnifier}
            {input}
          </div>
        ) : (
          <>
            {magnifier}
            {input}
          </>
        )}
        <div
          ref={endRefs}
          data-search-field-end=""
          {...stylex.props(
            styles.end,
            !isTab && styles.endCap(cap),
            placement === 'stacked' && styles.beforePlacement,
          )}>
          {showsClear ? (
            <button
              type="button"
              aria-label={resolvedClearLabel}
              onMouseDown={event => event.preventDefault()}
              onClick={handleClear}
              {...stylex.props(
                styles.clear,
                styles.clearGeometry(px(search.clear.size), px(CLEAR_INSET_PX)),
              )}>
              <Icon icon="close" size="xsm" color="inherit" />
            </button>
          ) : null}
        </div>
      </div>
      {isTab ? null : (
        <button
          ref={motion.closeRef}
          type="button"
          aria-label={resolvedCancelLabel}
          tabIndex={isActive ? undefined : -1}
          aria-hidden={isActive ? undefined : true}
          data-search-field-close=""
          onClick={handleClose}
          {...stylex.props(
            styles.close,
            styles.closeGeometry(px(closeSize), px(closeInset)),
            !isActive &&
              (isBottom ? styles.closeInertBottom : styles.closeInert),
          )}>
          <Icon icon="close" size="sm" color="inherit" />
        </button>
      )}
    </div>
  );
}

SearchField.displayName = 'SearchField';
