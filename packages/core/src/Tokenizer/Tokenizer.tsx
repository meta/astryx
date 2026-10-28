// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Tokenizer.tsx
 * @input Uses React, BaseTypeahead, Field, Token, useAnnounce,
 *   useAdaptivePresentation, and TokenizerBottomSheet (lazy)
 * @output Exports Tokenizer multi-select typeahead component, and the
 *   internal TokenizerWithPresentation signature the `internal/tokenizer-presentation`
 *   entry re-exports
 * @position Composed component; forwards DOM ref and exposes focus control via
 *   handleRef. The sheet presentation — a trigger that opens
 *   TokenizerBottomSheet — is implemented but not exposed: `TokenizerProps`
 *   offers no `experimental.presentation` while its user experience is being
 *   finished (`component:Tokenizer` DEC-3, implementation gap), and only
 *   Astryx's own packages reach it through the internal entry
 *   (`architecture:react-component-runtime` INV13).
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Tokenizer/index.ts
 * - /packages/core/src/Tokenizer/TokenizerBottomSheet.tsx (sheet presentation)
 * - /apps/storybook/stories/Tokenizer.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Tokenizer/ (showcase blocks)
 */

import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  BusyIndicatorLaneProvider,
  createBusyIndicatorLane,
  useIsBusy,
  type BusyIndicatorLane,
} from '../Typeahead/busyIndicatorLane';
import {TrailingKeyDownContext} from '../Typeahead/trailingKeyDown';
import {
  type FieldInputBaseProps,
  useFieldInputStyling,
} from '../Field/fieldParts';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {useAdaptivePresentation} from '../hooks/useAdaptivePresentation';
import {useIsHydrating} from '../hooks/useIsHydrating';
import {VisuallyHidden} from '../VisuallyHidden';
import {warnOnce} from '../utils/devWarning';
import type {SizeValue} from '../utils/types';
import {BaseTypeahead} from '../Typeahead/BaseTypeahead';
import {useSize} from '../SizeContext/SizeContext';
import {
  Field,
  InputClearButton,
  type InputStatus,
  inputWrapperStyles,
  inputStatusBorderStyles,
  inputStatusHoverShadowStyles,
  inputStatusFocusWithinStyles,
  type FieldStatusVariant,
} from '../Field';
import {Token} from '../Token';
import {Spinner} from '../Spinner';
import {useEndLaneReserve} from './useEndLaneReserve';
import {renderIconSlot, type IconType} from '../Icon';
import {OverflowList} from '../OverflowList';
import {useLayer} from '../Layer/useLayer';
import {useTooltip} from '../Tooltip';
import {useAnnounce} from '../hooks/useAnnounce';
import {
  colorVars,
  spacingVars,
  sizeVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import type {SearchableItem, SearchSource} from '../Typeahead/types';
import {composeEventHandlers, mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';
import type {TokenizerBottomSheetProps} from './TokenizerBottomSheet';

// Re-export status types for convenience
export type {
  InputStatus as TokenizerStatus,
  InputStatusType as TokenizerStatusType,
} from '../Field';

// =============================================================================
// Types
// =============================================================================

/**
 * Change metadata for onChange callback.
 */
export type TokenizerChange<T extends SearchableItem> =
  | {item: T; type: 'add'}
  | {item: T; type: 'create'}
  | {item: T; type: 'remove'}
  | {type: 'reorder'};

export type TokenizerSize = 'sm' | 'md' | 'lg';

/**
 * Controls overflow behavior when tokens exceed the available width.
 * - `'none'`: All tokens wrap normally (default).
 * - `'unfocusedInline'`: Shows a single line with "+ N more" when unfocused, expands inline on focus.
 * - `'unfocusedLayer'`: Shows a single line with "+ N more" when unfocused, expands as an overlay on focus.
 */
export type TokenizerOverflowBehavior =
  'none' | 'unfocusedInline' | 'unfocusedLayer';

/**
 * Imperative handle for Tokenizer handleRef.
 */
export interface TokenizerHandle {
  /** Focus the typeahead input. */
  focus(): void;
  /** Blur the typeahead input. */
  blur(): void;
}

/**
 * The presentation options the sheet-capable signature admits. Not public:
 * `TokenizerProps` has no `experimental` while the sheet's user experience is
 * being finished; Astryx's own packages reach the sheet through
 * `@astryxdesign/core/internal/tokenizer-presentation`.
 */
export interface TokenizerPresentationOptions {
  /**
   * How the field presents its choices.
   * - `'popover'`: the inline combobox with its anchored suggestion menu —
   *   the stable behavior.
   * - `'bottom-sheet'`: a trigger showing the selected tokens that opens one
   *   tall modal sheet: a search row on top, full-width checkbox rows that
   *   keep their place while the sheet is open, a create row with
   *   `hasCreate`, and a footer with a confirmed Clear all and Done. Suited
   *   to compact touch screens, where the inline combobox competes with the
   *   software keyboard.
   * - `'adaptive'`: the bottom sheet on compact coarse-pointer screens,
   *   otherwise the popover — the same resolution Selector uses.
   *
   * In the sheet presentation the trigger is the control: `ref`, `id`,
   * `aria-*`, and `data-*` reach it. `renderItem`, `renderToken`,
   * `endContent`, `hasClear`, `hasEntriesOnFocus`, `menuWidth`,
   * `tokenOverflowBehavior`, and `hasAutoFocus` have no surface to act on
   * and warn once in development.
   * @default 'popover'
   */
  presentation?: 'popover' | 'bottom-sheet' | 'adaptive';
}

export interface TokenizerProps<T extends SearchableItem> extends Omit<
  FieldInputBaseProps<HTMLInputElement>,
  'onChange' | 'onFocus' | 'onBlur' | 'onKeyDown'
> {
  /**
   * Key handler. Runs after the built-in key handling, so it observes every key
   * and cannot cancel navigation, selection, or token editing. It receives keys
   * on the combobox input and on the field's other controls (the clear button
   * and tokens).
   */
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  /** Accessible label (required). */
  label: string;
  /** Visually hide the label. @default false */
  isLabelHidden?: boolean;
  /** Helper text. */
  description?: string;
  /** Required field. @default false */
  isRequired?: boolean;
  /** Optional field. @default false */
  isOptional?: boolean;
  /** Validation status. */
  status?: InputStatus;
  /**
   * How the status message is placed relative to the input.
   * - 'attached': message overlaps directly below the input (bordered treatment)
   * - 'detached': message floats below as a separate element with spacing
   * - 'tooltip': no message box; the status icon becomes a focusable info-tip button that reveals the message on hover, keyboard focus, or tap
   * @default 'attached'
   */
  statusVariant?: FieldStatusVariant;
  /**
   * Icon to display at the start of the input.
   * Accepts a ReactNode (e.g. `<Icon icon={SearchIcon} />`) or an SVG icon component directly.
   */
  startIcon?: ReactNode | IconType;
  /**
   * Width of the field. Numbers are treated as pixels, strings are used as-is
   * (e.g. `'100%'`). Sizes the whole field (label, control, and status) so they
   * stay aligned, unlike setting width via `xstyle`/`className`/`style`.
   */
  width?: SizeValue;
  /** Label tooltip. */
  labelTooltip?: string;
  /** Search source providing items. */
  searchSource: SearchSource<T>;
  /** Currently selected items. */
  value: T[];

  /**
   * The HTML name attribute for form submissions. When set, hidden inputs
   * carry one entry per selected item's id under this name.
   */
  htmlName?: string;
  /** Callback when selection changes. Includes change metadata. */
  onChange: (items: T[], change: TokenizerChange<T>) => void;
  /** Render function for dropdown items. Default: TypeaheadItem. */
  renderItem?: (item: T) => ReactNode;
  /** Render function for selected tokens. Default: Token with label + onRemove. */
  renderToken?: (item: T, onRemove: () => void) => ReactNode;
  /** Max number of selections. */
  maxEntries?: number;
  /** Placeholder text (shown when no tokens selected). */
  placeholder?: string;
  /** Show results on focus before typing. @default false */
  hasEntriesOnFocus?: boolean;
  /** Max dropdown items. @default 10 */
  maxMenuItems?: number;
  /** Fixed dropdown width in pixels. Never shrinks below the input width. */
  menuWidth?: number;
  /**
   * Minimum query length before the search source is queried. Below it no
   * search runs and the menu stays closed — useful for remote sources where
   * one or two characters match too much to be worth fetching.
   *
   * With `hasCreate`, the "Create" entry rides on the search results, so it
   * also waits for the threshold.
   *
   * @default 1
   */
  minQueryLength?: number;
  /**
   * Content shown when the query matched nothing (`spec:AST-056` FR1).
   * Takes a `ReactNode`, so a dead end can carry a link or a create row.
   *
   * The message is announced in a polite live region as the text it renders,
   * read from the DOM, so an element is announced as written and anything
   * marked `aria-hidden` is left out of both. Content that renders no text
   * announces nothing, matching the screen.
   *
   * `null` means "not given", exactly as `undefined` does, so it falls
   * through to the default. Pass an empty string to render nothing.
   *
   * @default 'No results found'
   */
  emptySearchText?: ReactNode;
  /** Whether the input is disabled. @default false */
  isDisabled?: boolean;
  /**
   * Explains why the tokenizer is disabled. When set together with
   * `isDisabled`, the tokenizer shows a tooltip with this text on hover and
   * keyboard focus, and the input stays focusable (via `aria-disabled`) so the
   * reason is discoverable by keyboard and assistive technology. Input stays
   * blocked.
   *
   * Use this instead of wrapping a disabled tokenizer in `Tooltip` — disabled
   * controls don't emit the pointer events an external tooltip needs.
   */
  disabledMessage?: string;
  /** Show clear button (clears all tokens). @default false */
  hasClear?: boolean;
  /**
   * Content to display at the end of the input row.
   * Useful for buttons, result counts, or other controls.
   */
  endContent?: ReactNode;
  /** Auto-focus on mount. @default false */
  hasAutoFocus?: boolean;
  /** Input size. @default 'md' */
  size?: TokenizerSize;
  /**
   * Controls how tokens overflow when the container is too narrow.
   * - `'none'`: Tokens wrap to multiple lines (default).
   * - `'unfocusedInline'`: Single line with "+ N more" when unfocused; expands inline on focus.
   * - `'unfocusedLayer'`: Single line with "+ N more" when unfocused; expands as overlay on focus.
   * @default 'none'
   */
  tokenOverflowBehavior?: TokenizerOverflowBehavior;
  /**
   * Debounce delay in ms before triggering search after typing.
   * Set to 0 for synchronous/local search sources that don't need debouncing.
   * @default 150
   */
  debounceMs?: number;
  /**
   * Allow users to create new tokens from free-text input.
   * When true, pressing Enter with text in the input commits the typed value
   * as a new token — even if the search source returned no results.
   * @default false
   */
  hasCreate?: boolean;
  /** Query change callback. */
  onChangeQuery?: (query: string) => void;
  /** Fires when focus enters the tokenizer from outside. */
  onFocus?: (e: React.FocusEvent) => void;
  /** Fires when focus leaves the tokenizer entirely. */
  onBlur?: (e: React.FocusEvent) => void;
  /** Ref forwarded to the combobox input. */
  ref?: React.Ref<HTMLInputElement>;
  /** Imperative handle ref for focus/blur control. */
  handleRef?: React.Ref<TokenizerHandle>;
}

/**
 * The props of the sheet-capable signature: `TokenizerProps` plus the
 * presentation options and a `ref` that also accepts the sheet presentation's
 * trigger button, the control it stands for there. Not public: reached only
 * as `TokenizerWithPresentation` through the internal entry, so the released
 * `TokenizerProps` — an interface, so `interface X extends TokenizerProps<T>`,
 * `Omit<TokenizerProps<T>, …>` and `ComponentProps<typeof Tokenizer>` keep
 * their released shapes — names no presentation.
 */
export type TokenizerWithPresentationProps<T extends SearchableItem> = Omit<
  TokenizerProps<T>,
  'ref'
> & {
  /** How the field presents its choices; see `TokenizerPresentationOptions`. */
  experimental?: TokenizerPresentationOptions;
  /**
   * Ref forwarded to the control: the combobox input in the popover
   * presentation, the trigger button in the sheet presentation.
   */
  ref?: React.Ref<HTMLInputElement | HTMLButtonElement>;
};

// =============================================================================
// Styles
// =============================================================================

// How far the end lane sits from the field's inline-end border, named once
// because the input's reserve is derived from the same value.
const END_LANE_INSET = spacingVars['--spacing-2'];
const TOKEN_ROW_INSET = `calc(${spacingVars['--spacing-1']} - 1px)`;
// Kept in sync with useEndLaneReserve: wrapperWithTokens reads the custom
// property directly, to keep token rows and the input short of the lane.
const END_LANE_RESERVE_VAR = '--_tokenizer-end-lane-reserve';

const styles = stylex.create({
  wrapper: {
    position: 'relative',
    flexWrap: 'wrap',
    gap: spacingVars['--spacing-1'],
    cursor: {
      default: 'text',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    height: 'auto',
  },
  wrapperWithTokens: {
    // Override padding for border concentricity: token border-radius
    // (radius-1: 4px) sits concentric with wrapper border-radius
    // (radius-2: 8px) when inset = radius-2 - radius-1 - border
    // = 8 - 4 - 1 = 3px.
    paddingBlock: TOKEN_ROW_INSET,
    paddingInline: TOKEN_ROW_INSET,
    // The end lane is out of flow, so tokens would wrap under it. Every row
    // stops short of the measured lane instead; with no lane up the variable
    // is absent and this is the ordinary inset.
    paddingInlineEnd: `calc(${TOKEN_ROW_INSET} + var(${END_LANE_RESERVE_VAR}, 0px))`,
    // Row gap must match paddingBlock so wrapped rows look evenly spaced.
    rowGap: TOKEN_ROW_INSET,
  },
  startIconWithTokens: {
    // Restore the default 8px inline-start inset when tokens are present,
    // since wrapperWithTokens reduces padding to 3px for border concentricity.
    marginInlineStart: `calc(${spacingVars['--spacing-2']} - ${spacingVars['--spacing-1']} + 1px)`,
    position: 'relative',
    zIndex: 1,
  },
  token: {
    display: 'flex',
    flexShrink: 0,
    // A renderToken wrapper sizes to its content; cap it at the row so the
    // pill inside truncates instead of running past the field.
    maxWidth: '100%',
    position: 'relative',
    zIndex: 1,
  },
  endSection: {
    position: 'absolute',
    // Match the field's inline padding (inputWrapperStyles.base uses
    // spacing-2) so end content (clear button, resultCount) lines up with
    // the text/start-icon inset instead of hugging the border at ~3px.
    insetInlineEnd: END_LANE_INSET,
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    flexShrink: 0,
    zIndex: 1,
  },
  idleSpinner: {
    // Hides the Spinner's own box too, which a theme may paint, and covers
    // engines without content-visibility. Both keep the box's size.
    visibility: 'hidden',
    // Skips the ring's rendering, and with it the infinite arc animation,
    // while the root keeps its own explicit, themed width and height.
    contentVisibility: 'hidden',
  },
  inputAtMax: {
    width: 0,
    minWidth: 0,
    flex: '0 0 0',
    padding: 0,
    opacity: 0,
    position: 'absolute',
  },
  inputCompact: {
    position: 'relative',
    boxSizing: 'border-box',
    zIndex: 0,
    // The input follows the last token in flow, so a focused empty input's
    // caret sits where typed text will start. Empty, it asks only for that
    // inset, and only while focused and editable: blurred or read-only (a
    // disabled field with a disabledMessage stays focusable), it claims no
    // room at all, not even the column gap, so it never grows the field a
    // blank row. Typing restores the full editing width, which may wrap.
    minWidth: {
      default: '40px',
      ':placeholder-shown': 0,
    },
    flex: {
      default: '1 1 40px',
      ':placeholder-shown': '1 1 0px',
    },
    width: 0,
    marginInlineStart: {
      default: 0,
      ':placeholder-shown:is(:not(:focus), :read-only)': `calc(-1 * ${spacingVars['--spacing-1']})`,
    },
    // Restore normal text inset when input follows tokens, since the
    // wrapper padding is reduced for border concentricity.
    paddingInlineStart: {
      default: `calc(${spacingVars['--spacing-2']} - ${spacingVars['--spacing-1']} + 1px)`,
      ':placeholder-shown:is(:not(:focus), :read-only)': 0,
    },
    // wrapperWithTokens already keeps the in-flow input short of the lane.
    paddingInlineEnd: 0,
  },
  truncatedWrapper: {
    flexWrap: 'nowrap',
    overflow: 'hidden',
  },
  layerPopover: {
    // Top-layer popover: match the anchor width exactly so the expanded
    // tokenizer looks like an in-place expansion, overlapping the
    // placeholder from its top edge.
    width: 'anchor-size(width)',
  },
  overflowText: {
    flexShrink: 0,
    whiteSpace: 'nowrap',
    fontSize: typeScaleVars['--text-supporting-size'],
    color: colorVars['--color-text-secondary'],
    paddingInline: spacingVars['--spacing-1'],
  },
  // The sheet presentation's trigger: the field's own control box, as a
  // button. It wraps tokens like the inline field, but there is no input to
  // type into, so the cursor says "press".
  sheetTrigger: {
    width: '100%',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    color: 'inherit',
    textAlign: 'start',
    appearance: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // An aria-disabled button gets no system disabled paint in forced colors;
  // GrayText is the platform's disabled affordance there. Defaults repeat the
  // base values, since StyleX merges per property.
  sheetTriggerDisabled: {
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      '@media (forced-colors: active)': 'GrayText',
    },
    color: {
      default: null,
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  sheetTriggerPlaceholder: {
    color: colorVars['--color-text-secondary'],
    // Match the input's text inset so the placeholder sits where the typed
    // query would.
    paddingInline: spacingVars['--spacing-1'],
  },
  sheetTriggerPlaceholderDisabled: {
    color: {
      default: colorVars['--color-text-secondary'],
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  // A Token authors its own color, which forced colors replace with
  // CanvasText; GrayText marks the tokens of a disabled trigger as disabled.
  // The default repeats Token's own default color.
  sheetTokenDisabled: {
    color: {
      default: colorVars['--color-text-primary'],
      '@media (forced-colors: active)': 'GrayText',
    },
  },
});

const sizeStyles = stylex.create({
  sm: {minHeight: sizeVars['--size-element-sm']},
  md: {minHeight: sizeVars['--size-element-md']},
  lg: {minHeight: sizeVars['--size-element-lg']},
});

const endSectionSizeStyles = stylex.create({
  sm: {
    top: `calc(${sizeVars['--size-element-sm']} / 2 - 1px)`,
    transform: 'translateY(-50%)',
  },
  md: {
    top: `calc(${sizeVars['--size-element-md']} / 2 - 1px)`,
    transform: 'translateY(-50%)',
  },
  lg: {
    top: `calc(${sizeVars['--size-element-lg']} / 2 - 1px)`,
    transform: 'translateY(-50%)',
  },
});

const truncatedSizeStyles = stylex.create({
  sm: {height: sizeVars['--size-element-sm']},
  md: {height: sizeVars['--size-element-md']},
  lg: {height: sizeVars['--size-element-lg']},
});

const layerPlaceholderSizeStyles = stylex.create({
  sm: {height: sizeVars['--size-element-sm']},
  md: {height: sizeVars['--size-element-md']},
  lg: {height: sizeVars['--size-element-lg']},
});

// =============================================================================
// Component
// =============================================================================

// Sentinel prefix for creatable items — used to distinguish
// "Create: X" suggestions from real search results.
const CREATABLE_ID_PREFIX = '__xds_create__';

// The touch sheet (BottomSheet, its gestures, the confirmation dialog, and
// the empty state) only renders for the bottom-sheet presentation. Loading it
// on demand keeps it out of pages whose tokenizers stay inline combobox fields
// (`component:Tokenizer` PR6).
// One import promise, shared by the preload and the lazy element: the sheet
// presentation loads its chunk as soon as it is active, so the first press
// does not wait for the network, while nothing of the sheet is rendered until
// a press (`architecture:component-style-authoring` INV7).
const loadTokenizerBottomSheet = async () => import('./TokenizerBottomSheet');
const LazyTokenizerBottomSheet = lazy(async () =>
  loadTokenizerBottomSheet().then(module => ({
    default: module.TokenizerBottomSheet,
  })),
);

/**
 * Hosts the lazily loaded sheet. Renders nothing on the server or in the
 * render that hydrates server HTML: a lazy component that has not loaded yet
 * would leave server markup incomplete and abort hydration. The closed sheet
 * has no visible markup, so it first renders right after hydration.
 */
function TokenizerSheetHost<T extends SearchableItem>(
  props: TokenizerBottomSheetProps<T>,
) {
  const isHydrating = useIsHydrating();
  if (isHydrating) {
    return null;
  }
  // `lazy` erases the component's type parameter; the module exports the
  // generic component this props type belongs to.
  const Sheet = LazyTokenizerBottomSheet as unknown as ComponentType<
    TokenizerBottomSheetProps<T>
  >;
  return (
    <Suspense fallback={null}>
      <Sheet {...props} />
    </Suspense>
  );
}

/**
 * Multi-select input with token chips and typeahead search.
 *
 * Composes BaseTypeahead for search and Token for selected items.
 * Tokens render inline before the text input. Selecting an item adds a token
 * and clears the query. Backspace on empty input removes the last token.
 *
 * @example
 * ```
 * const [members, setMembers] = useState<UserItem[]>([]);
 * <Tokenizer
 *   label="Team members"
 *   searchSource={userSource}
 *   value={members}
 *   onChange={(items, change) => {
 *     setMembers(items);
 *     if (change.type === 'add') {
 *       console.log('Added:', change.item.label);
 *     }
 *   }}
 *   placeholder="Search people..."
 * />
 * <Tokenizer
 *   label="Tags"
 *   searchSource={tagSource}
 *   value={tags}
 *   onChange={(items) => setTags(items)}
 *   renderToken={(item, onRemove) => (
 *     <Token
 *       label={item.label}
 *       color={item.auxiliaryData.color}
 *       onRemove={onRemove}
 *     />
 *   )}
 *   maxEntries={5}
 * />
 * ```
 */
/**
 * The field's inline-end lane: the busy Spinner, then `endContent`, then the
 * clear button — pinned to the field's first row while tokens wrap below it.
 *
 * A separate component so that subscribing to the busy state re-renders THIS
 * and nothing else. Subscribed from `Tokenizer`, a search transition
 * re-rendered every selected token twice — twenty tokens meant forty renders
 * per search for one glyph none of them contain.
 *
 * Renders nothing when the lane would be empty, so `useEndLaneReserve` sees no
 * element, publishes no width, and the input keeps its full content box.
 *
 * With `hasBusySlot` the Spinner stays mounted while idle, unrendered, not
 * animating and out of the accessibility tree, so its box keeps the themed
 * Spinner's own size.
 * Token rows reserve the lane's measured width, so a Spinner that came and
 * went with the search would re-wrap them, and widen a content-sized field,
 * on every search.
 */
function EndLane({
  lane,
  laneRef,
  laneXStyle,
  loadingLabel,
  anchorRef,
  hasStaticContent,
  hasBusySlot,
  children,
}: {
  lane: BusyIndicatorLane;
  laneRef: (node: HTMLElement | null) => void;
  laneXStyle: stylex.StyleXStyles[];
  loadingLabel: string;
  anchorRef: RefObject<Element | null>;
  hasStaticContent: boolean;
  hasBusySlot: boolean;
  children: ReactNode;
}) {
  const isBusy = useIsBusy(lane);
  // The search Spinner stays named (family:input-fields FR7) but is not a
  // live region; the field announces each search's busy start instead
  // (spec:AST-086 FR8).
  useBusyAnnouncement(isBusy, loadingLabel, anchorRef);
  if (!isBusy && !hasStaticContent && !hasBusySlot) {
    return null;
  }
  return (
    <div ref={laneRef} {...stylex.props(laneXStyle)}>
      {(isBusy || hasBusySlot) && (
        <Spinner
          // Remounts when a search starts, so the ring syncs its phase on
          // mount exactly as a newly shown Spinner did before.
          key={isBusy ? 'busy' : 'idle'}
          size="sm"
          aria-label={loadingLabel}
          role="img"
          aria-hidden={isBusy ? undefined : true}
          xstyle={isBusy ? undefined : styles.idleSpinner}
        />
      )}
      {children}
    </div>
  );
}

// The public signature names no presentation: `ComponentProps<typeof
// Tokenizer>` and every public call resolve against `TokenizerProps`. The
// implementation also reads the presentation options, reached only through
// `TokenizerWithPresentation` below.
export function Tokenizer<T extends SearchableItem>(
  props: TokenizerProps<T>,
): React.JSX.Element;
export function Tokenizer<T extends SearchableItem>({
  label,
  isLabelHidden = false,
  description,
  isRequired = false,
  isOptional = false,
  status,
  statusVariant = 'attached',
  startIcon,
  labelTooltip,
  searchSource,
  value,
  onChange,
  renderItem,
  renderToken,
  maxEntries,
  placeholder,
  hasEntriesOnFocus,
  maxMenuItems,
  menuWidth,
  minQueryLength,
  emptySearchText,
  isDisabled = false,
  htmlName,
  disabledMessage,
  hasClear = false,
  endContent,
  hasAutoFocus,
  size: sizeProp,
  tokenOverflowBehavior = 'none',
  debounceMs,
  hasCreate = false,
  onChangeQuery,
  onFocus,
  onBlur,
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  ref,
  handleRef,
  onKeyDown,
  experimental,
  id: idProp,
  'aria-describedby': ariaDescribedByProp,
  ...restProps
}: TokenizerWithPresentationProps<T>): React.JSX.Element {
  const {rest, container} = useFieldInputStyling('Tokenizer', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  // A caller's onClick arrives through the base props; the sheet trigger
  // composes it with its own open handler rather than letting either win.
  const {onClick: callerOnClick, ...restWithoutClick} = rest;
  const t = useTranslator();
  const size = useSize(sizeProp, 'md');
  const generatedInputId = useId();
  const inputId = idProp ?? generatedInputId;
  const descriptionId = useId();
  const statusMessageId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Experimental presentation (`component:Tokenizer` DEC-3). `adaptive`
  // resolves through the policy the selection controls share; an open sheet
  // keeps its presentation until it closes, so a resolution change mid-task
  // cannot pull the surface out from under the person.
  const presentation = experimental?.presentation ?? 'popover';
  const resolvedPresentation = useAdaptivePresentation(presentation);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // Latched for the sheet's lifetime: a sheet stays presented after it closes
  // until BottomSheet has run its exit and handed focus back to the trigger.
  // Without the latch, `adaptive` resolving to `popover` mid-session (a phone
  // turned to landscape) would unmount the sheet and the trigger it returns
  // focus to in the same render, dropping focus to the page body
  // (`component:Tokenizer` FR16).
  const [isSheetPresented, setIsSheetPresented] = useState(false);
  const isSheetPresentation =
    isSheetOpen || isSheetPresented || resolvedPresentation === 'bottom-sheet';
  // Preload the sheet's chunk while the sheet presentation is active, so the
  // first press opens without waiting for the network; nothing renders.
  useEffect(() => {
    if (isSheetPresentation) {
      void loadTokenizerBottomSheet();
    }
  }, [isSheetPresentation]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The sheet's query between presentations: the sheet is in the DOM only
  // from a press until its exit completes, and a close the field forces
  // keeps the query (FR18). The ref follows every report; the press
  // snapshots it into the state the next presentation starts from.
  const sheetQueryRef = useRef('');
  const [sheetInitialQuery, setSheetInitialQuery] = useState('');
  const handleSheetQueryChange = useCallback(
    (query: string) => {
      sheetQueryRef.current = query;
      onChangeQuery?.(query);
    },
    [onChangeQuery],
  );
  // Whether the field's control — the inline input or the trigger — holds
  // focus. Kept in a ref by the focus and blur handlers of both, because a
  // control unmounted while focused fires no blur: when a presentation swap
  // removes the focused control (the latch releasing into the popover, or
  // `adaptive` changing while the sheet is closed), the new presentation's
  // control takes the focus over once it has mounted, so focus never lands on
  // the page body (`component:Tokenizer` FR16, `spec:AST-085` FR4).
  const isControlFocusedRef = useRef(false);
  // Set around a focus move the field makes itself — a presentation swap
  // handing focus from one control to the other — so the receiving control
  // does not report it as focus entering from outside.
  const isHandingOffFocusRef = useRef(false);
  // Whether the caller has been told focus entered the field in this visit,
  // so `onBlur` is never reported without its `onFocus`: in Safari a click
  // or tap does not focus a button, so a pointer-opened sheet reports no
  // entry, and the one focus the trigger then gets — BottomSheet's return
  // focus — is the entry to report.
  const hasReportedFocusRef = useRef(false);
  // A control can hold focus without the field having seen a focus event:
  // the inline input server-rendered with `autofocus` (`hasAutoFocus`) is
  // focused before hydration, and the swap to the trigger in the first
  // render after it removes that input. React detaches the old control
  // before any effect of the swapping commit runs, so the live focus is
  // read during that render, while the control is still in the document —
  // a read of `document.activeElement` only, with no update made in render.
  const previousPresentationRef = useRef(isSheetPresentation);
  if (previousPresentationRef.current !== isSheetPresentation) {
    previousPresentationRef.current = isSheetPresentation;
    if (typeof document !== 'undefined') {
      const active = document.activeElement;
      if (
        active != null &&
        (active === inputRef.current || active === triggerRef.current)
      ) {
        isControlFocusedRef.current = true;
      }
    }
  }
  useEffect(() => {
    if (!isControlFocusedRef.current) {
      return;
    }
    const active = document.activeElement;
    if (active != null && active !== document.body) {
      return;
    }
    isHandingOffFocusRef.current = true;
    (isSheetPresentation ? triggerRef.current : inputRef.current)?.focus();
    isHandingOffFocusRef.current = false;
  }, [isSheetPresentation]);
  // The trigger's accessible description names the selected tokens: the
  // button's children are tokens whose own content assistive technology
  // leaves out of a button's name (`spec:AST-020` FR1).
  const triggerTokensId = useId();
  // Each rendered token's id, for the trigger's description; the item id is
  // an arbitrary string, so it is encoded rather than used as is.
  const tokenElementId = (itemId: string) =>
    `${triggerTokensId}-${encodeURIComponent(itemId)}`;
  // Props that describe the inline combobox have no surface in the sheet
  // presentation. Say so once in development rather than dropping them
  // silently (`architecture:public-component-api` INV3).
  const inertSheetProps = isSheetPresentation
    ? (
        [
          ['renderItem', renderItem],
          ['renderToken', renderToken],
          ['endContent', endContent],
          ['hasClear', hasClear || undefined],
          ['hasEntriesOnFocus', hasEntriesOnFocus || undefined],
          ['menuWidth', menuWidth],
          ['tokenOverflowBehavior', tokenOverflowBehavior],
          ['hasAutoFocus', hasAutoFocus || undefined],
        ] as const
      )
        .filter(([, v]) => v !== undefined && v !== 'none')
        .map(([name]) => name)
    : [];
  const inertSheetPropsKey = inertSheetProps.join(',');
  useEffect(() => {
    if (inertSheetPropsKey === '') {
      return;
    }
    warnOnce(
      `tokenizer:sheet-inert:${inertSheetPropsKey}`,
      'Tokenizer',
      `\`${inertSheetProps.join('`, `')}\` ${
        inertSheetProps.length === 1 ? 'has' : 'have'
      } no surface in the bottom-sheet presentation and ${
        inertSheetProps.length === 1 ? 'is' : 'are'
      } not rendered there.`,
    );
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- keyed by the joined names
  }, [inertSheetPropsKey]);
  // A field that becomes disabled cannot keep its sheet open, and must not
  // reopen it when re-enabled (`component:Tokenizer` FR17). Adjusted in the
  // render that sees the change, not an effect, so no frame shows both.
  const [wasDisabled, setWasDisabled] = useState(isDisabled);
  // A sheet that was open when the field became disabled stays mounted,
  // closed, so it runs its exit and hands focus back to the trigger; a field
  // that is disabled from the start mounts no sheet.
  const [keepsSheetWhileDisabled, setKeepsSheetWhileDisabled] = useState(false);
  if (isDisabled !== wasDisabled) {
    setWasDisabled(isDisabled);
    if (isDisabled && isSheetOpen) {
      setIsSheetOpen(false);
      setKeepsSheetWhileDisabled(true);
    }
    if (!isDisabled) {
      setKeepsSheetWhileDisabled(false);
    }
  }

  // Disabled-reason tooltip. The tooltip listeners attach to the input wrapper
  // and the typeahead input stays perceivable via aria-disabled instead of the
  // disabled attribute. Input is blocked by the isDisabled guards in
  // BaseTypeahead and handleWrapperClick.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The wrapper is not naturally focusable; focusin bubbles up from the
    // input, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  // The sheet presentation has no input; the public ref reaches the trigger,
  // the control it stands for (`family:input-fields` FR10).
  const triggerMergedRef = useMergedRefs<HTMLButtonElement>(
    triggerRef,
    ref as React.Ref<HTMLButtonElement> | undefined,
    disabledMessageTooltip.ref,
  );

  useImperativeHandle(handleRef, () => ({
    focus() {
      (isSheetPresentation ? triggerRef : inputRef).current?.focus();
    },
    blur() {
      (isSheetPresentation ? triggerRef : inputRef).current?.blur();
    },
  }));

  // Focus-within state for overflow truncation
  // Reported by BaseTypeahead so the indicator can live in this field's own
  // end lane, beside endContent and the clear button.
  // The base owns the busy state; this field only paints it. Held in a store
  // rather than this component's state — held here, a search transition
  // re-rendered every selected token twice, for a glyph no token contains.
  // See busyIndicatorLane.tsx.
  const busyLane = useMemo(() => createBusyIndicatorLane(), []);
  // What sits in the end lane varies most here — a spinner, arbitrary
  // `endContent`, a clear button, or all three — so its width is measured
  // rather than assumed, and the input reserves it.
  const [laneRef, laneReserve] = useEndLaneReserve(END_LANE_INSET);
  // The half of the lane's contents this component knows about. The busy half
  // is the leaf's own business — folding it in here would mean reading the
  // busy state during this render, which is exactly the re-render the store
  // exists to avoid.
  const hasClearButton = hasClear && value.length > 0 && !isDisabled;
  const hasStaticEndLane = Boolean(endContent || hasClearButton);
  const [isFocusedWithin, setIsFocusedWithin] = useState(false);
  const isTruncated =
    !isFocusedWithin && tokenOverflowBehavior !== 'none' && value.length > 0;

  // Layer for unfocusedLayer mode — promotes expanded content to the top layer
  // so it isn't clipped by ancestor overflow.
  const isLayerMode = tokenOverflowBehavior === 'unfocusedLayer';
  const layer = useLayer({mode: 'context'});
  const layerContentRef = useRef<HTMLDivElement>(null);

  // Anchor the layer to the placeholder element
  const placeholderRef = useCallback(
    (el: HTMLElement | null) => {
      if (isLayerMode) {
        layer.ref(el);
      }
    },
    [isLayerMode, layer],
  );

  // For the layer variant, focus can be in either the placeholder or the
  // popover content. We track both to decide when focus has truly left.
  const isFocusInTokenizer = useCallback(
    (target: Node | null): boolean => {
      if (!target) {
        return false;
      }
      if (wrapperRef.current?.contains(target)) {
        return true;
      }
      if (layerContentRef.current?.contains(target)) {
        return true;
      }
      // Also check the popover element itself (the layer wrapper)
      const popoverEl = document.getElementById(layer.id);
      if (popoverEl?.contains(target)) {
        return true;
      }
      return false;
    },
    [layer.id],
  );

  const handleFocusCapture = useCallback(
    (e: React.FocusEvent) => {
      const comingFromOutside = !isFocusInTokenizer(e.relatedTarget);
      setIsFocusedWithin(true);
      if (isLayerMode) {
        layer.show();
      }
      if (comingFromOutside) {
        isControlFocusedRef.current = true;
        if (!isHandingOffFocusRef.current) {
          hasReportedFocusRef.current = true;
          onFocus?.(e);
        }
        // Redirect to the input so the user doesn't have to tab through
        // every token remove button.
        if (e.target !== inputRef.current) {
          inputRef.current?.focus();
        }
      }
    },
    [isLayerMode, layer, isFocusInTokenizer, onFocus],
  );

  const handleBlurCapture = useCallback(
    (e: React.FocusEvent) => {
      if (!isFocusInTokenizer(e.relatedTarget)) {
        isControlFocusedRef.current = false;
        hasReportedFocusRef.current = false;
        setIsFocusedWithin(false);
        onBlur?.(e);
        if (isLayerMode) {
          layer.hide();
        }
      }
    },
    [isLayerMode, layer, isFocusInTokenizer, onBlur],
  );

  const isAtMax = maxEntries != null && value.length >= maxEntries;

  // Filter out already-selected items from search results
  const selectedIds = useMemo(
    () => new Set(value.map(item => item.id)),
    [value],
  );

  // Selected labels, lowercased, for the Create entry's duplicate check. The
  // typed text is a label, not an id: real selections usually carry an opaque
  // id (`usr_123` under the label "Alice"), so comparing the text against ids
  // alone misses an already-tokenized label — and the search results cannot
  // catch it either, because filteredSource has already removed the selected
  // item from them. The result was a "Create Alice" entry that, when picked,
  // added a second "Alice" token under a different id.
  const selectedLabels = useMemo(
    () => new Set(value.map(item => item.label.toLowerCase())),
    [value],
  );

  const filteredSource: SearchSource<T> = useMemo(
    () => ({
      search: async (query: string) => {
        const results = await searchSource.search(query);
        return results.filter(item => !selectedIds.has(item.id));
      },
      bootstrap: async () => {
        const results = await searchSource.bootstrap();
        return results.filter(item => !selectedIds.has(item.id));
      },
    }),
    [searchSource, selectedIds],
  );

  /**
   * The "Create X" entry. It is derived from the typed text, not fetched for
   * it, so it is offered through `__queryEntries` rather than appended to the
   * search results — which is what keeps it available when the query is too
   * short to search. `minQueryLength` is there to avoid a fetch too broad to
   * be worth making; creating `QA` costs no fetch, and a field that can
   * create it should not stop being able to.
   */
  const createEntries = useCallback(
    (query: string, results: T[]): T[] => {
      const trimmed = query.trim();
      if (!hasCreate || trimmed === '') {
        return [];
      }
      const alreadyExists =
        selectedIds.has(trimmed) ||
        selectedLabels.has(trimmed.toLowerCase()) ||
        results.some(
          item => item.label.toLowerCase() === trimmed.toLowerCase(),
        );
      if (alreadyExists) {
        return [];
      }
      return [
        {
          id: `${CREATABLE_ID_PREFIX}${trimmed}`,
          label: `Create "${trimmed}"`,
          auxiliaryData: {__createdValue: trimmed},
        } as unknown as T,
      ];
    },
    [hasCreate, selectedIds, selectedLabels],
  );

  const emptySource: SearchSource<T> = useMemo(
    () => ({
      search: async () => [],
      bootstrap: async () => [],
    }),
    [],
  );

  // Announce token add/remove politely via a persistent live region.
  // Announce token add/remove politely. `useAnnounce` follows where this
  // call is made (`spec:AST-086` FR14): the inline field's words go to the
  // shared channel, or into the modal that encloses the field. The sheet's
  // own changes are announced from inside the sheet, where FR14 routes them
  // into the sheet's dialog; the handlers below stay silent for those.
  const announce = useAnnounce();

  // Handle adding an item — detect creatable synthetic items
  const handleAdd = useCallback(
    (item: T | null, options?: {silent?: boolean}): boolean => {
      if (isDisabled || !item) {
        return false;
      }
      if (isAtMax) {
        return false;
      }

      // Detect "Create: X" synthetic items from the creatable source
      if (
        hasCreate &&
        typeof item.id === 'string' &&
        item.id.startsWith(CREATABLE_ID_PREFIX)
      ) {
        const createdValue = item.id.slice(CREATABLE_ID_PREFIX.length);
        // Same domain fix as createEntries: the created value names itself by
        // label, so a selection carrying an opaque id with that label is also a
        // duplicate, not just one whose id happens to equal the text.
        if (
          selectedIds.has(createdValue) ||
          selectedLabels.has(createdValue.toLowerCase())
        ) {
          return false;
        }
        const base = {id: createdValue, label: createdValue};
        const realItem = base as T;
        const newItems = [...value, realItem];
        onChange(newItems, {item: realItem, type: 'create'});
        if (!options?.silent) {
          announce(t('@astryx.tokenizer.tokenAdded', {label: createdValue}));
        }
        return true;
      }

      if (selectedIds.has(item.id)) {
        return false;
      }
      const newItems = [...value, item];
      onChange(newItems, {item, type: 'add'});
      if (!options?.silent) {
        announce(t('@astryx.tokenizer.tokenAdded', {label: item.label}));
      }
      return true;
    },
    [
      value,
      onChange,
      isDisabled,
      isAtMax,
      selectedIds,
      selectedLabels,
      hasCreate,
      announce,
      t,
    ],
  );

  // Handle removing an item. Single removal path: both Backspace on an empty
  // input and the per-token remove buttons route through here, so the
  // announcement covers both.
  const handleRemove = useCallback(
    (item: T, options?: {silent?: boolean}): boolean => {
      if (isDisabled) {
        return false;
      }
      const newItems = value.filter(v => v.id !== item.id);
      onChange(newItems, {item, type: 'remove'});
      if (!options?.silent) {
        announce(t('@astryx.tokenizer.tokenRemoved', {label: item.label}));
      }
      inputRef.current?.focus();
      return true;
    },
    [value, onChange, isDisabled, announce, t],
  );

  // Handle clearing all items
  const handleClearAll = useCallback(() => {
    if (isDisabled || value.length === 0) {
      return;
    }
    // Report the last item as removed (convention)
    const lastItem = value[value.length - 1];
    onChange([], {item: lastItem, type: 'remove'});
    inputRef.current?.focus();
  }, [value, onChange, isDisabled]);

  // Handle backspace on empty input — remove last token
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        e.key === 'Backspace' &&
        e.currentTarget.value === '' &&
        value.length > 0
      ) {
        e.preventDefault();
        const lastItem = value[value.length - 1];
        handleRemove(lastItem);
      }
    },
    [value, handleRemove],
  );

  // Click wrapper to focus input
  const handleWrapperClick = useCallback(() => {
    if (!isDisabled) {
      if (isLayerMode) {
        // The input always lives in the popover. Show it and focus.
        layer.show();
        setIsFocusedWithin(true);
        // The input is already mounted in the popover (not conditional),
        // so we can focus it directly.
        inputRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    }
  }, [isDisabled, isLayerMode, layer]);

  const ariaDescribedBy =
    [
      description ? descriptionId : null,
      status?.message ? statusMessageId : null,
      showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  const sizeStyle = sizeStyles[size];

  // Render tokens
  const tokens = value.map(item => {
    const onRemoveItem = () => handleRemove(item);

    if (renderToken) {
      return (
        <span key={item.id} {...stylex.props(styles.token)}>
          {renderToken(item, onRemoveItem)}
        </span>
      );
    }

    return (
      <Token
        key={item.id}
        label={item.label}
        size={size}
        onRemove={isDisabled ? undefined : onRemoveItem}
        isDisabled={isDisabled}
        xstyle={styles.token}
      />
    );
  });

  // Self-authored position styles (positioning: 'custom' below): explicit
  // anchor() insets pin the expanded layer over the field itself.
  // `left` is physical, so this popover does not yet mirror in RTL —
  // known follow-up from #3389.
  const popoverOverrideStyle: React.CSSProperties = {
    top: 'anchor(top)',
    left: 'anchor(start)',
  };

  const wrapperContent = (
    <div
      ref={el => {
        wrapperRef.current = el;
        // Anchor + hover/focus listeners for the disabled-message tooltip.
        // Handlers are gated internally by isEnabled, so attaching
        // unconditionally is safe.
        disabledMessageTooltip.ref(el);
      }}
      role="group"
      aria-label={label}
      onClick={handleWrapperClick}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
      // Keys on the field's other controls (clear button, tokens) reach a
      // consumer onKeyDown here; keys on the input reach it through
      // TrailingKeyDownContext after the built-in handling.
      onKeyDown={event => {
        if (event.target !== inputRef.current) {
          onKeyDown?.(event);
        }
      }}
      {...mergeProps(
        themeProps('tokenizer', {
          size,
          status: status?.type,
          disabled: isDisabled ? 'disabled' : null,
        }),
        stylex.props(
          inputWrapperStyles.base,
          styles.wrapper,
          value.length > 0 && styles.wrapperWithTokens,
          isTruncated ? truncatedSizeStyles[size] : sizeStyle,
          isTruncated && styles.truncatedWrapper,
          isDisabled && inputWrapperStyles.disabled,
          status && inputStatusBorderStyles[status.type],
          status && !isDisabled && inputStatusHoverShadowStyles[status.type],
          status && inputStatusFocusWithinStyles[status.type],
          controlXstyle,
        ),
        controlClassName,
        controlStyle,
      )}>
      {startIcon && (
        <span {...stylex.props(value.length > 0 && styles.startIconWithTokens)}>
          {renderIconSlot(startIcon, {size: 'sm', color: 'secondary'})}
        </span>
      )}
      {isTruncated ? (
        <OverflowList
          gap={1}
          behavior="observeParent"
          overflowRenderer={items => (
            <span {...stylex.props(styles.overflowText)}>
              +{items.length} more
            </span>
          )}>
          {tokens}
        </OverflowList>
      ) : (
        tokens
      )}
      {/* The base reports its busy state through this lane, so the
          indicator lands in the end controls below beside the clear
          button rather than as a second one inside the base. */}
      <BusyIndicatorLaneProvider value={busyLane}>
        <TrailingKeyDownContext value={onKeyDown}>
          <BaseTypeahead
            {...rest}
            ref={useMergedRefs(
              inputRef,
              // With `experimental`, the ref type admits the trigger too; in
              // this presentation it receives the input.
              ref as React.Ref<HTMLInputElement> | undefined,
            )}
            searchSource={isAtMax ? emptySource : filteredSource}
            value={null}
            onChange={handleAdd}
            renderItem={renderItem}
            // A space keeps :placeholder-shown available as the CSS-only empty
            // query signal without painting placeholder text beside tokens.
            placeholder={value.length === 0 ? placeholder : ' '}
            hasEntriesOnFocus={isAtMax ? false : hasEntriesOnFocus}
            maxMenuItems={maxMenuItems}
            menuWidth={menuWidth}
            minQueryLength={minQueryLength}
            emptySearchText={emptySearchText}
            isDisabled={isDisabled}
            isFocusableDisabled={showsDisabledMessage}
            hasAutoFocus={hasAutoFocus}
            inputId={inputId}
            ariaDescribedBy={
              [ariaDescribedByProp, ariaDescribedBy]
                .filter(Boolean)
                .join(' ') || undefined
            }
            onChangeQuery={onChangeQuery}
            __queryEntries={createEntries}
            debounceMs={debounceMs}
            onKeyDown={handleKeyDown}
            anchorRef={wrapperRef}
            size={size}
            inputXStyle={[
              isAtMax || isTruncated
                ? styles.inputAtMax
                : value.length > 0
                  ? styles.inputCompact
                  : undefined,
              // With tokens, wrapperWithTokens reserves the lane for every row.
              // This rule is only for an empty Tokenizer; it still resolves to
              // zero until the lane publishes a width.
              !(isAtMax || isTruncated || value.length > 0) && laneReserve,
            ]}
          />
        </TrailingKeyDownContext>
      </BusyIndicatorLaneProvider>
      {htmlName != null &&
        !isDisabled &&
        value.map(item => (
          <input key={item.id} type="hidden" name={htmlName} value={item.id} />
        ))}
      <EndLane
        lane={busyLane}
        laneRef={laneRef}
        laneXStyle={[styles.endSection, endSectionSizeStyles[size]]}
        loadingLabel={t('@astryx.typeahead.loading')}
        anchorRef={wrapperRef}
        hasStaticContent={hasStaticEndLane}
        // Wherever a search can run beside tokens: enabled and below
        // maxEntries. A collapsed overflow row keeps it too, since a search
        // started while focused can settle after focus leaves.
        hasBusySlot={value.length > 0 && !isDisabled && !isAtMax}>
        {endContent}
        {hasClearButton && (
          <InputClearButton
            label={t('@astryx.tokenizer.clearAll')}
            onClick={e => {
              e.stopPropagation();
              handleClearAll();
            }}
          />
        )}
      </EndLane>
    </div>
  );

  let tokenizerContent: ReactNode;
  if (isSheetPresentation) {
    tokenizerContent = (
      <>
        <button
          // The field-level pass-through props (`data-*`, `aria-*`) were typed
          // for the inline input; here the control is a button.
          {...(restWithoutClick as React.ButtonHTMLAttributes<HTMLButtonElement>)}
          ref={triggerMergedRef}
          type="button"
          id={inputId}
          aria-haspopup="dialog"
          aria-expanded={isSheetOpen}
          aria-disabled={isDisabled || undefined}
          // The description is what the inline input's is, in its order —
          // the caller's ids, the field description, the status message, the
          // disabled reason (`spec:AST-085` FR5: a disabled control exposes
          // its description and reason on itself) — then the hidden count and
          // the rendered tokens themselves, each by id: the
          // accessible-description algorithm reads the referenced elements in
          // order and separates them, so every label renders once
          // (`architecture:component-style-authoring` INV7) and no locale's
          // list punctuation is written here (AR6).
          aria-describedby={
            [
              ariaDescribedByProp,
              ariaDescribedBy,
              value.length > 0 ? triggerTokensId : null,
              ...value.map(item => tokenElementId(item.id)),
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          // The open runs first and the caller's onClick after it, as the
          // inline input composes its click: a caller observes the click but
          // cannot cancel the field's own handling
          // (`family:input-fields` FR10).
          onClick={composeEventHandlers<React.MouseEvent<HTMLButtonElement>>(
            () => {
              if (isDisabled) {
                return;
              }
              setIsSheetPresented(true);
              setSheetInitialQuery(sheetQueryRef.current);
              setIsSheetOpen(true);
            },
            // Typed for the input by the base props; here the control is the
            // trigger button, and the handler only reads the event.
            callerOnClick as unknown as
              React.MouseEventHandler<HTMLButtonElement> | undefined,
          )}
          onFocus={event => {
            isControlFocusedRef.current = true;
            // BottomSheet focuses the trigger only after its exit completes;
            // that focus is the signal that the retained sheet can leave. If
            // the resolution moved to the popover meanwhile, the inline input
            // takes the focus over once it mounts. The field's own sheet is
            // part of the field: focus coming back from it, or handed over by
            // a presentation swap, is not focus entering from outside, so the
            // caller's onFocus — "when focus enters the tokenizer from
            // outside" — stays quiet for it (`family:input-fields` FR10).
            const isReturningFromSheet = !isSheetOpen && isSheetPresented;
            if (isReturningFromSheet) {
              setIsSheetPresented(false);
            }
            const isInsideTheField =
              (isReturningFromSheet && hasReportedFocusRef.current) ||
              isHandingOffFocusRef.current;
            if (!isInsideTheField) {
              hasReportedFocusRef.current = true;
              onFocus?.(event);
            }
          }}
          onBlur={event => {
            // Focus moving into the sheet is still the field's: the flag
            // stays, and the caller's onBlur — "when focus leaves the
            // tokenizer entirely" — stays quiet. Only a blur to somewhere
            // else reports.
            if (isSheetOpen) {
              return;
            }
            isControlFocusedRef.current = false;
            hasReportedFocusRef.current = false;
            onBlur?.(event);
          }}
          onKeyDown={onKeyDown}
          {...mergeProps(
            themeProps('tokenizer', {
              size,
              status: status?.type,
              disabled: isDisabled ? 'disabled' : null,
            }),
            stylex.props(
              inputWrapperStyles.base,
              styles.wrapper,
              styles.sheetTrigger,
              // The trigger keeps the inline field's height for its size step,
              // as Selector's bottom-sheet trigger does; the sheet's own rows
              // and search field carry the touch-sized targets.
              sizeStyles[size],
              value.length > 0 && styles.wrapperWithTokens,
              isDisabled && inputWrapperStyles.disabled,
              isDisabled && styles.sheetTriggerDisabled,
              status && inputStatusBorderStyles[status.type],
              status &&
                !isDisabled &&
                inputStatusHoverShadowStyles[status.type],
              status && inputStatusFocusWithinStyles[status.type],
              controlXstyle,
            ),
            controlClassName,
            controlStyle,
          )}>
          {startIcon && (
            <span
              {...stylex.props(value.length > 0 && styles.startIconWithTokens)}>
              {renderIconSlot(startIcon, {size: 'sm', color: 'secondary'})}
            </span>
          )}
          {value.length > 0 ? (
            value.map(item => (
              <Token
                key={item.id}
                id={tokenElementId(item.id)}
                label={item.label}
                size={size}
                isDisabled={isDisabled}
                xstyle={isDisabled ? styles.sheetTokenDisabled : undefined}
              />
            ))
          ) : (
            <span
              {...stylex.props(
                styles.sheetTriggerPlaceholder,
                isDisabled && styles.sheetTriggerPlaceholderDisabled,
              )}>
              {placeholder ?? ''}
            </span>
          )}
        </button>
        {value.length > 0 && (
          <VisuallyHidden id={triggerTokensId}>
            {t('@astryx.tokenizer.selectedCount', {count: value.length})}
          </VisuallyHidden>
        )}
        {/* Form carriers, gated exactly as the inline branch gates its own: a
            disabled field submits nothing. */}
        {htmlName != null &&
          !isDisabled &&
          value.map(item => (
            <input
              key={item.id}
              type="hidden"
              name={htmlName}
              value={item.id}
            />
          ))}
        {/* Mounted from the press until the sheet's exit has completed and
            focus is back on the trigger (`isSheetPresented`): at rest the
            field renders its trigger alone — no closed dialog, rows, search
            field or confirmation in the DOM (INV7). */}
        {(isSheetOpen || isSheetPresented) &&
          (!isDisabled || keepsSheetWhileDisabled) && (
            <TokenizerSheetHost
              isOpen={isSheetOpen}
              onOpenChange={setIsSheetOpen}
              finalFocusRef={triggerRef}
              initialQuery={sheetInitialQuery}
              label={label}
              searchSource={searchSource}
              value={value}
              isAtMax={isAtMax}
              hasCreate={hasCreate}
              maxMenuItems={maxMenuItems ?? 10}
              minQueryLength={minQueryLength ?? 1}
              debounceMs={debounceMs ?? 150}
              emptySearchText={emptySearchText}
              onAdd={handleAdd}
              onRemove={handleRemove}
              onClearAll={handleClearAll}
              onChangeQuery={handleSheetQueryChange}
            />
          )}
      </>
    );
  } else if (isLayerMode) {
    const placeholderSizeStyle = layerPlaceholderSizeStyles[size];
    tokenizerContent = (
      <>
        <div
          ref={placeholderRef}
          onClick={handleWrapperClick}
          {...mergeProps(
            themeProps('tokenizer', {
              size,
              status: status?.type,
              disabled: isDisabled ? 'disabled' : null,
            }),
            stylex.props(
              inputWrapperStyles.base,
              styles.wrapper,
              value.length > 0 && styles.wrapperWithTokens,
              placeholderSizeStyle,
              isTruncated && styles.truncatedWrapper,
              isDisabled && inputWrapperStyles.disabled,
              status && inputStatusBorderStyles[status.type],
              status &&
                !isDisabled &&
                inputStatusHoverShadowStyles[status.type],
              status && inputStatusFocusWithinStyles[status.type],
              controlXstyle,
            ),
            controlClassName,
            controlStyle,
          )}>
          {isTruncated && (
            <>
              {startIcon &&
                renderIconSlot(startIcon, {
                  size: 'sm',
                  color: 'secondary',
                })}
              <OverflowList
                gap={1}
                behavior="observeParent"
                overflowRenderer={items => (
                  <span {...stylex.props(styles.overflowText)}>
                    +{items.length} more
                  </span>
                )}>
                {tokens}
              </OverflowList>
            </>
          )}
        </div>
        {layer.render(
          <div
            ref={layerContentRef}
            onFocusCapture={handleFocusCapture}
            onBlurCapture={handleBlurCapture}>
            {wrapperContent}
          </div>,
          {
            positioning: 'custom',
            xstyle: styles.layerPopover,
            style: popoverOverrideStyle,
          },
        )}
      </>
    );
  } else {
    tokenizerContent = wrapperContent;
  }

  return (
    <Field
      {...container}
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={inputId}
      descriptionID={description ? descriptionId : undefined}
      isOptional={isOptional}
      isRequired={isRequired}
      isDisabled={isDisabled}
      status={
        status
          ? {
              type: status.type,
              message: status.message,
              messageID: status.message ? statusMessageId : undefined,
            }
          : undefined
      }
      statusVariant={statusVariant}
      labelTooltip={labelTooltip}
      width={width}>
      {tokenizerContent}
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </Field>
  );
}

Tokenizer.displayName = 'Tokenizer';

/**
 * The same component with the sheet presentation reachable: `experimental`
 * (`presentation: 'popover' | 'bottom-sheet' | 'adaptive'`) and a `ref` that
 * also takes the trigger button. Not public — re-exported only by
 * `@astryxdesign/core/internal/tokenizer-presentation`, the entry reserved
 * for Astryx's own packages (`architecture:react-component-runtime` INV13),
 * while the sheet's user experience is being finished (`component:Tokenizer`
 * DEC-3). The public `Tokenizer` renders the popover presentation for every
 * field.
 */
export const TokenizerWithPresentation = Tokenizer as <
  T extends SearchableItem,
>(
  props: TokenizerWithPresentationProps<T>,
) => React.JSX.Element;
