// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatComposer.tsx
 * @input Uses React, StyleX, BaseProps
 * @output Exports ChatComposer layout shell component
 * @position Core implementation; consumed by index.ts
 *
 * Layout shell for a chat composer. Arranges slots (drawer, header,
 * input, footer actions, send button, status) in a vertical stack with
 * page-radius container, hover/focus shadows, and concentric inner radius.
 *
 * Component CSS vars (themeable via defineTheme):
 * - `--_chat-composer-radius` (default: --radius-chat) — outer border radius
 * - `--_chat-composer-padding` (default: --spacing-3) — body padding
 * - Inner element radius = calc(--_chat-composer-radius - --_chat-composer-padding)
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Chat/Chat.doc.mjs
 * - /apps/storybook/stories/ChatComposer.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/ChatComposer/ (block examples)
 */

import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
  type MouseEvent,
  type FocusEvent,
} from 'react';
import type {BaseProps} from '../BaseProps';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  shadowVars,
  durationVars,
  easeVars,
  borderVars,
  typeScaleVars,
  typographyVars,
} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import {Icon} from '../Icon';
import {ChatComposerInput} from './ChatComposerInput';
import {ChatComposerContext} from './ChatContext';
import type {ChatComposerInputControl} from './ChatContext';
import {ChatSendButton} from './ChatSendButton';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';
import {useAnnounceRenderedText} from '../hooks/useAnnounceRenderedText';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {
  getInteractionModality,
  useInteractionModalityTracking,
} from '../utils/interactionModality';

// =============================================================================
// Types
// =============================================================================

export type ChatComposerStatus = {
  type: 'error' | 'warning';
  message?: string;
};

export type ChatComposerDensity = 'compact' | 'balanced' | 'spacious';

export interface ChatComposerProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange' | 'onSubmit'
> {
  ref?: React.Ref<HTMLDivElement>;
  /** Called when the user submits the message */
  onSubmit: (value: string) => void;
  /** Called when the user clicks the stop button */
  onStop?: () => void;
  /** Whether the stop button is shown instead of the send button. @default false */
  isStopShown?: boolean;
  /** Controlled value of the input */
  value?: string;
  /** Called when the input value changes */
  onChange?: (value: string) => void;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Whether the composer is disabled */
  isDisabled?: boolean;
  /** Density variant */
  density?: ChatComposerDensity;
  /**
   * Resting elevation of the composer body. `low` (the default) keeps today's
   * raised look — low at rest, bumping to med on hover / focus. `none` flattens
   * it and draws a border. Keyboard focus in the editor adds the shared focus
   * ring in either presentation; pointer focus does not add that ring.
   * @default 'low'
   */
  elevation?: 'none' | 'low';

  // --- Slot props ---

  /** Collapsible drawer rendered above the input — attachments, context chips, etc. Use ChatComposerDrawer. */
  drawer?: ReactNode;
  /** Actions rendered on the left side of the header (e.g. attach, mention buttons). Use icon-only `size="sm"` buttons. */
  headerActions?: ReactNode;
  /** Contextual info rendered on the right side of the header (e.g. context window usage, ProgressBar). */
  headerContext?: ReactNode;
  /** Custom input element — replaces the default textarea */
  input?: ReactNode;
  /** Actions rendered on the left side of the footer. Use `size="md"` buttons to match the send button height. */
  footerActions?: ReactNode;
  /** Actions rendered to the left of the send button. Use `size="md"` buttons to match the send button height. */
  sendActions?: ReactNode;
  /** Custom send button — replaces the default */
  sendButton?: ReactNode;
  /** Status message rendered below (or above) the composer body */
  status?: ChatComposerStatus;
  /** Where to render the status. @default 'bottom' */
  statusPosition?: 'top' | 'bottom';
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    position: 'relative',
    zIndex: 0,
    isolation: 'isolate',
    display: 'flex',
    flexDirection: 'column',
    // Component CSS vars — themeable via defineTheme({ components: { 'chat-composer': { base: {...} } } })
    // Uses the dedicated chat radius (28px) rather than --radius-page, so chat
    // rounding is decoupled from page-level containers but unchanged today. #2072
    '--_chat-composer-radius': radiusVars['--radius-chat'],
    '--_chat-composer-padding': spacingVars['--spacing-3'],
    // Concentric radius: buttons follow the outer shell's curvature.
    // Sets --_button-radius (not --radius-element) so only buttons are
    // affected — other components in slots keep their own radius.
    // Default: 28px - 12px = 16px (fully rounds a 32px button).
    '--_button-radius': `max(${radiusVars['--radius-element']}, calc(var(--_chat-composer-radius) - var(--_chat-composer-padding)))`,
  },

  rootDisabled: {
    opacity: 0.6,
    pointerEvents: 'none' as const,
  },
  body: {
    position: 'relative',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    padding: 'var(--_chat-composer-padding)',
    gap: spacingVars['--spacing-2'],
    borderRadius: 'var(--_chat-composer-radius)',
    backgroundColor: colorVars['--color-background-popover'],
    cursor: {
      default: 'text',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    transition: `box-shadow ${durationVars['--duration-fast']} ${easeVars['--ease-standard']}, border-color ${durationVars['--duration-fast']} ${easeVars['--ease-standard']}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    minHeight: '28px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    marginInlineStart: 'auto',
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
  },
  inputArea: {
    display: 'flex',
    flexDirection: 'column',
  },
  textarea: {
    width: '100%',
    resize: 'none' as const,
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    fontFamily: typographyVars['--font-family-body'],
    color: colorVars['--color-text-primary'],
    backgroundColor: 'transparent',
    caretColor: colorVars['--color-accent'],
    overflowY: 'auto' as const,
    maxHeight: '176px',
    '::placeholder': {
      color: colorVars['--color-text-disabled'],
    },
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    // Footer buttons should use size="md" to match 32px send button height
    minHeight: '32px',
  },
  footerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  footerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  interruptibleFooter: {
    // The composer may disable editing while a response is streaming. Restore
    // pointer hit-testing for the footer so its Stop action stays reachable.
    pointerEvents: 'auto',
  },
  statusBar: {
    position: 'relative',
    zIndex: 0,
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-4'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontFamily: typographyVars['--font-family-body'],
  },
  statusTop: {
    paddingBlockStart: 'var(--_chat-composer-padding)',
    paddingBlockEnd:
      'calc(var(--_chat-composer-padding) + var(--_chat-composer-radius))',
    marginBlockEnd: 'calc(-1 * var(--_chat-composer-radius))',
    borderStartStartRadius: 'var(--_chat-composer-radius)',
    borderStartEndRadius: 'var(--_chat-composer-radius)',
  },
  statusBottom: {
    paddingBlockStart:
      'calc(var(--_chat-composer-padding) + var(--_chat-composer-radius))',
    paddingBlockEnd: 'var(--_chat-composer-padding)',
    marginBlockStart: 'calc(-1 * var(--_chat-composer-radius))',
    borderEndStartRadius: 'var(--_chat-composer-radius)',
    borderEndEndRadius: 'var(--_chat-composer-radius)',
  },
  statusError: {
    backgroundColor: colorVars['--color-error-muted'],
    color: colorVars['--color-on-error-muted'],
    // Forced colors replace status fills with Canvas; this boundary keeps the
    // fill's shape visible (architecture:theme-tokens INV11).
    outlineWidth: {default: null, '@media (forced-colors: active)': '1px'},
    outlineStyle: {default: null, '@media (forced-colors: active)': 'solid'},
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
    outlineOffset: {default: null, '@media (forced-colors: active)': '-1px'},
  },
  statusWarning: {
    backgroundColor: colorVars['--color-warning-muted'],
    color: colorVars['--color-on-warning-muted'],
    // Forced colors replace status fills with Canvas; this boundary keeps the
    // fill's shape visible (architecture:theme-tokens INV11).
    outlineWidth: {default: null, '@media (forced-colors: active)': '1px'},
    outlineStyle: {default: null, '@media (forced-colors: active)': 'solid'},
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
    outlineOffset: {default: null, '@media (forced-colors: active)': '-1px'},
  },
  compact: {
    // Override the padding var (not the `padding` property) so both the base
    // body padding and the border-inset calc in elevationStyles.none pick up
    // the compact value. Scoped to the body element, so the status bar (which
    // reads the var from root) keeps its own padding.
    '--_chat-composer-padding': spacingVars['--spacing-2'],
    gap: spacingVars['--spacing-1'],
  },
});

// Resting elevation for the composer body, narrowed to two steps.
// - `low` (default) preserves today's look: low at rest, bumping to med on
//   hover / focus-within. The WCAG focus indicator is a separate shared ring,
//   gated to keyboard focus in the editor; the shadow change remains depth.
// - `none` is flat; depth comes from a border + inset rings instead. The
//   border is drawn *inside* the padding — its width is subtracted from every
//   side (like Card) so total inset (border + padding) equals the elevated
//   case and content geometry is unchanged. Border color, hover, and focus
//   states mirror TextInput (shared `inputWrapperStyles.base` treatment):
//   emphasized border at rest → accent on focus-within, with the same inset
//   shadow rings on hover and focus.
const elevationStyles = stylex.create({
  low: {
    boxShadow: {
      default: shadowVars['--shadow-low'],
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': shadowVars['--shadow-med'],
      },
    },
    ':focus-within': {
      boxShadow: shadowVars['--shadow-med'],
    },
  },
  none: {
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      ':focus-within': colorVars['--color-accent'],
    },
    // Draw the border *inside* the padding — subtract its width from the body
    // padding (like Card's withBorder) so total inset (border + padding) equals
    // the elevated case and content geometry is unchanged.
    padding: `calc(var(--_chat-composer-padding) - ${borderVars['--border-width']})`,
    boxShadow: {
      default: 'none',
      ':hover:not(:focus-within):where(:not(:disabled,[aria-disabled="true"]))':
        {
          '@media (hover: hover)': `inset 0px 0px 0px 2px color-mix(in srgb, ${colorVars['--color-border-emphasized']} 30%, transparent)`,
        },
      ':focus-within': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
    },
  },
});

function isComposerEditor(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    target.matches(
      'textarea, [contenteditable="true"], [role="textbox"], input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"]',
    )
  );
}

// =============================================================================
// Component
// =============================================================================

/**
 * Layout shell for a chat composer with slots for drawer, input,
 * actions, and a send button.
 *
 * @example
 * ```
 * <ChatComposer
 *   onSubmit={(value) => console.log(value)}
 *   placeholder="Type a message..."
 * />
 * ```
 */
export function ChatComposer(props: ChatComposerProps) {
  const t = useTranslator();
  const {
    ref,
    onSubmit,
    onStop,
    isStopShown = false,
    value: controlledValue,
    onChange,
    placeholder: placeholderFromProps,
    isDisabled = false,
    density = 'balanced',
    elevation = 'low',
    drawer,
    headerActions,
    headerContext,
    input,
    footerActions,
    sendActions,
    sendButton,
    status,
    statusPosition = 'bottom',
    xstyle,
    className,
    style,
    ...rest
  } = props;
  const placeholder =
    placeholderFromProps ?? t('@astryx.chat.composer.placeholder');

  const [internalValue, setInternalValue] = useState('');
  const [hasKeyboardEditorFocus, setHasKeyboardEditorFocus] = useState(false);

  useInteractionModalityTracking();

  const isControlled = controlledValue !== undefined;
  const currentValue = isControlled ? controlledValue : internalValue;

  const updateValue = useCallback(
    (newValue: string) => {
      if (!isControlled) {
        setInternalValue(newValue);
      }
      onChange?.(newValue);
    },
    [isControlled, onChange],
  );

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || isDisabled) {
        return;
      }
      onSubmit(trimmed);
      updateValue('');
    },
    [isDisabled, onSubmit, updateValue],
  );

  const canSend = currentValue.trim().length > 0 && !isDisabled;

  const bodyRef = useRef<HTMLDivElement>(null);

  // Input slot registers its focus (and future) control here so the shell can
  // drive it without knowing its DOM shape. Stable ref — safe in the memoized
  // context value.
  const inputControlRef = useRef<ChatComposerInputControl | null>(null);

  const handleBodyClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    // Focus the input when clicking empty space in the body.
    // Skip if the click target is a button, link, or interactive element.
    const target = e.target as HTMLElement;
    if (
      target.closest(
        'button, a, [role="button"], [contenteditable="true"], [data-astryx-token]',
      )
    ) {
      return;
    }
    // Prefer the input's registered control (works for any input shape,
    // including editors whose focusable node isn't a bare
    // contenteditable/textarea). Fall back to a DOM query so uninstrumented
    // custom inputs still get click-to-focus.
    if (inputControlRef.current) {
      inputControlRef.current.focus();
      return;
    }
    const editable = bodyRef.current?.querySelector<HTMLElement>(
      '[contenteditable="true"], textarea',
    );
    editable?.focus();
  }, []);

  const handleBodyFocusCapture = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      setHasKeyboardEditorFocus(
        isComposerEditor(event.target) &&
          getInteractionModality() === 'keyboard',
      );
    },
    [],
  );

  const handleBodyBlurCapture = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setHasKeyboardEditorFocus(false);
      }
    },
    [],
  );

  // The status bar mounts together with its message, and a live region born
  // holding its text is not reliably announced, so the shared own-content
  // module announces what the bar renders: errors assertively, warnings
  // politely, once per occasion, silent for a status already shown when the
  // page loads (spec:AST-086 FR2, FR5, FR6, FR11; react-component-runtime
  // INV10). Changing the status type is a new occasion; clearing it re-arms.
  const statusRef = useRef<HTMLDivElement>(null);
  useAnnounceRenderedText(
    statusRef,
    Boolean(status?.message),
    status?.type ?? '',
    {
      skipFirstRender: true,
      politeness: status?.type === 'error' ? 'assertive' : 'polite',
    },
  );

  const statusEl = status ? (
    <div
      ref={statusRef}
      {...stylex.props(
        styles.statusBar,
        statusPosition === 'top' ? styles.statusTop : styles.statusBottom,
        status.type === 'error' && styles.statusError,
        status.type === 'warning' && styles.statusWarning,
      )}>
      <Icon
        icon={status.type === 'error' ? 'error' : 'warning'}
        size="md"
        // The glyph sits on the pale status fill, so it takes the bar's
        // on-muted content colour, as Banner and FieldStatus glyphs do.
        color="inherit"
      />
      {status.message}
    </div>
  ) : null;

  const composerContext = useMemo(
    () => ({
      value: currentValue,
      onChange: updateValue,
      onSubmit: handleSubmit,
      placeholder,
      isDisabled,
      isStopShown,
      canSend,
      onStop,
      inputControlRef,
    }),
    [
      currentValue,
      updateValue,
      handleSubmit,
      placeholder,
      isDisabled,
      isStopShown,
      canSend,
      onStop,
    ],
  );

  return (
    <ChatComposerContext value={composerContext}>
      <div
        ref={ref}
        {...mergeProps(
          themeProps('chat-composer', {density}),
          stylex.props(styles.root, isDisabled && styles.rootDisabled),
          className,
          style,
        )}
        {...rest}>
        {statusPosition === 'top' && statusEl}
        {drawer}

        <div
          ref={bodyRef}
          onClick={handleBodyClick}
          onPointerDownCapture={() => setHasKeyboardEditorFocus(false)}
          onFocusCapture={handleBodyFocusCapture}
          onBlurCapture={handleBodyBlurCapture}
          {...stylex.props(
            styles.body,
            elevationStyles[elevation],
            hasKeyboardEditorFocus && focusOutlineStyles.focusWithin,
            density === 'compact' && styles.compact,
            xstyle,
          )}>
          {(headerActions || headerContext) && (
            <div {...stylex.props(styles.header)}>
              <div {...stylex.props(styles.headerLeft)}>{headerActions}</div>
              <div {...stylex.props(styles.headerRight)}>{headerContext}</div>
            </div>
          )}

          <div {...stylex.props(styles.inputArea)}>
            {input ?? <ChatComposerInput />}
          </div>

          <div {...stylex.props(styles.footer)}>
            <div {...stylex.props(styles.footerLeft)}>{footerActions}</div>
            <div
              {...stylex.props(
                styles.footerRight,
                isDisabled && isStopShown && styles.interruptibleFooter,
              )}>
              {sendActions}
              {sendButton ?? <ChatSendButton />}
            </div>
          </div>
        </div>

        {statusPosition === 'bottom' && statusEl}
      </div>
    </ChatComposerContext>
  );
}

ChatComposer.displayName = 'ChatComposer';
