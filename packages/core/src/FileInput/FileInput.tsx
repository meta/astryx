// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file FileInput.tsx
 * @input Uses React, useId, Field, Icon, Spinner, VisuallyHidden, provider-bound translator
 * @output Exports FileInput component, public types, and its root/icon theme targets
 * @position Core implementation; consumed by index.ts, tested by FileInput.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/FileInput/FileInput.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/FileInput/FileInput.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/FileInput/index.ts (exports if types change)
 * - /apps/storybook/stories/FileInput.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/FileInput/ (showcase blocks)
 */

import {
  useId,
  useCallback,
  useRef,
  useState,
  useOptimistic,
  useTransition,
  type DragEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  sizeVars,
  spacingVars,
  radiusVars,
  typographyVars,
  typeScaleVars,
  borderVars,
  durationVars,
  easeVars,
} from '../theme/tokens.stylex';
import {
  Field,
  InputClearButton,
  type InputStatus,
  type FieldStatusVariant,
} from '../Field';
import {Icon} from '../Icon';
import {Spinner} from '../Spinner';
import {VisuallyHidden} from '../VisuallyHidden';
import {useAnnounce} from '../hooks/useAnnounce';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {useInputStatusIcon} from '../hooks/useInputStatusIcon';
import {useClickableContainer} from '../hooks/useClickableContainer';
import {useTooltip} from '../Tooltip';

export type {
  InputStatus as FileInputStatus,
  InputStatusType as FileInputStatusType,
} from '../Field';
import {mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {
  type FieldInputBaseProps,
  useFieldInputStyling,
} from '../Field/fieldParts';
import type {SizeValue} from '../utils/types';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';
import type {TranslatorFn} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
function formatFileSize(bytes: number, t: TranslatorFn): string {
  if (bytes < 1024) {
    return t('@astryx.fileInput.fileSize.bytes', {size: bytes});
  }
  if (bytes < 1024 * 1024) {
    return t('@astryx.fileInput.fileSize.kilobytes', {size: bytes / 1024});
  }
  return t('@astryx.fileInput.fileSize.megabytes', {
    size: bytes / (1024 * 1024),
  });
}

function validateFiles(
  files: File[],
  accept: string | undefined,
  maxSize: number | undefined,
  maxFiles: number | undefined,
  isMultiple: boolean,
  t: TranslatorFn,
): {valid: File[]; errors: string[]} {
  const errors: string[] = [];
  let valid = files;

  if (accept) {
    const acceptedTypes = accept.split(',').map(s => s.trim().toLowerCase());
    valid = valid.filter(file => {
      const matches = acceptedTypes.some(type => {
        if (type.startsWith('.')) {
          return file.name.toLowerCase().endsWith(type);
        }
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.slice(0, -1));
        }
        return file.type.toLowerCase() === type;
      });
      if (!matches) {
        errors.push(
          t('@astryx.fileInput.errorInvalidType', {fileName: file.name}),
        );
      }
      return matches;
    });
  }

  if (maxSize != null) {
    valid = valid.filter(file => {
      if (file.size > maxSize) {
        errors.push(
          t('@astryx.fileInput.errorMaxSize', {
            fileName: file.name,
            maxSize: formatFileSize(maxSize, t),
          }),
        );
        return false;
      }
      return true;
    });
  }

  if (isMultiple && maxFiles != null && valid.length > maxFiles) {
    errors.push(t('@astryx.fileInput.errorMaxFiles', {maxFiles}));
    valid = valid.slice(0, maxFiles);
  }

  return {valid, errors};
}

const styles = stylex.create({
  dropzone: {
    boxSizing: 'border-box',
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-6'],
    paddingInline: spacingVars['--spacing-4'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'dashed',
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      ':focus-within': colorVars['--color-accent'],
    },
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-surface'],
    transitionProperty: 'border-color, box-shadow, background-color',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    outline: 'none',
  },
  dropzoneHover: {
    boxShadow: {
      default: null,
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': `inset 0 0 0 2px color-mix(in srgb, ${colorVars['--color-accent']} 20%, transparent)`,
      },
    },
  },
  dropzoneActive: {
    borderColor: colorVars['--color-accent'],
    backgroundColor: colorVars['--color-accent-muted'],
  },
  dropzoneDisabled: {
    cursor: 'default',
    opacity: 0.5,
    // Keeps the :focus-within border: a focused disabled trigger still shows
    // focus (spec:AST-085 FR6).
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      ':focus-within': colorVars['--color-accent'],
    },
  },
  compact: {
    boxSizing: 'border-box',
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      ':focus-within': colorVars['--color-accent'],
    },
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-surface'],
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
    boxShadow: {
      default: 'none',
      ':hover:not(:focus-within):where(:not(:disabled,[aria-disabled="true"]))':
        {
          '@media (hover: hover)': `inset 0 0 0 2px color-mix(in srgb, ${colorVars['--color-accent']} 20%, transparent)`,
        },
    },
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    height: sizeVars['--size-element-md'],
    outline: 'none',
  },
  compactDisabled: {
    cursor: 'default',
    opacity: 0.5,
    // Keeps the :focus-within border: a focused disabled trigger still shows
    // focus (spec:AST-085 FR6).
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      ':focus-within': colorVars['--color-accent'],
    },
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  placeholderText: {
    fontFamily: typographyVars['--font-family-body'],
    // The 16px floor is iOS-only: iOS Safari zooms the page when a focused
    // control sits under 16px, and only iOS WebKit implements
    // -webkit-touch-callout to key the coarse-pointer floor to it.
    fontSize: {
      default: typeScaleVars['--text-body-size'],
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': `max(1rem, ${typeScaleVars['--text-body-size']})`,
      },
    },
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-secondary'],
    textAlign: 'center',
    userSelect: 'none',
  },
  fileNameText: {
    fontFamily: typographyVars['--font-family-body'],
    // ...and the filename beside it keeps the same floor, so both lines the
    // control shows stay the same size.
    fontSize: {
      default: typeScaleVars['--text-body-size'],
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': `max(1rem, ${typeScaleVars['--text-body-size']})`,
      },
    },
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-primary'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  },
  fileNameDropzone: {
    textAlign: 'center',
    whiteSpace: 'normal',
  },
  fileNameCompact: {
    textAlign: 'start',
  },
  placeholderCompact: {
    textAlign: 'start',
    flex: 1,
    minWidth: 0,
  },
});

const statusBorderStyles = stylex.create({
  warning: {
    borderColor: colorVars['--color-border-warning'],
  },
  error: {
    borderColor: colorVars['--color-border-error'],
  },
  success: {
    borderColor: colorVars['--color-border-success'],
  },
});

export interface FileInputProps extends Omit<
  FieldInputBaseProps,
  'onChange' | 'defaultValue' | 'value'
> {
  ref?: React.Ref<HTMLInputElement>;
  /**
   * Accessible label for the file input.
   */
  label: string;
  /**
   * Whether to visually hide the label (still accessible to screen readers).
   * @default false
   */
  isLabelHidden?: boolean;
  /**
   * Currently selected file(s). Controlled component.
   */
  value: File | File[] | null;
  /**
   * Callback fired when files are selected or removed.
   */
  onChange: (files: File | File[] | null) => void;
  /**
   * Async change action (React 19 transitions pattern).
   * Use for immediate upload on file selection.
   */
  changeAction?: (files: File | File[] | null) => Promise<void>;
  /**
   * Accepted file types. Uses the HTML accept attribute format.
   * Examples: "image/*", ".pdf,.doc,.docx", "image/png,image/jpeg"
   */
  accept?: string;
  /**
   * Whether multiple files can be selected.
   * When true, `value` and `onChange` use `File[]` instead of `File`.
   * @default false
   */
  isMultiple?: boolean;
  /**
   * Maximum file size in bytes. Files exceeding this are rejected
   * with an error status.
   */
  maxSize?: number;
  /**
   * Maximum number of files (only applies when `isMultiple` is true).
   */
  maxFiles?: number;
  /**
   * Whether the input is disabled.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Explains why the input is disabled. When set together with `isDisabled`,
   * the file input shows a tooltip with this text on hover and keyboard focus,
   * and its trigger stays focusable (via `aria-disabled`) so the reason is
   * discoverable by keyboard and assistive technology. Opening the file picker
   * stays blocked.
   *
   * Use this instead of wrapping a disabled input in `Tooltip` — disabled
   * controls don't emit the pointer events an external tooltip needs.
   *
   * @example
   * ```
   * <FileInput
   *   label="Resume"
   *   value={file}
   *   isDisabled
   *   disabledMessage="Uploads are locked until your profile is verified"
   * />
   * ```
   */
  disabledMessage?: string;
  /**
   * Whether the input is required.
   * @default false
   */
  isRequired?: boolean;
  /**
   * Whether the input is in a loading state (e.g. uploading).
   * @default false
   */
  isLoading?: boolean;
  /**
   * Validation status for the input.
   */
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
   * Description text displayed below the label.
   */
  description?: string;
  /**
   * Placeholder text shown when no file is selected.
   * @default "Choose file" or "Choose files"
   */
  placeholder?: string;
  /**
   * Visual mode for the file input.
   * - 'input': compact inline style, similar to a text input
   * - 'dropzone': larger area with dashed border and drag-and-drop support
   * @default 'input'
   */
  mode?: 'dropzone' | 'input';
  /**
   * Whether the field is optional. Mutually exclusive with isRequired.
   * @default false
   */
  isOptional?: boolean;
  /**
   * Width of the field. Numbers are treated as pixels, strings are used as-is
   * (e.g. `'100%'`). Sizes the whole field (label, control, and status) so they
   * stay aligned, unlike setting width via `controlXstyle`/`controlClassName`/`controlStyle`.
   */
  width?: SizeValue;
  /**
   * Tooltip text to display in an info icon at the end of the label.
   */
  labelTooltip?: string;
}

/**
 * A file input component with optional drag-and-drop support.
 *
 * @example
 * ```
 * <FileInput label="Resume" value={file} onChange={setFile} accept=".pdf" />
 * ```
 */
export function FileInput({
  label,
  isLabelHidden = false,
  value,
  onChange,
  changeAction,
  accept,
  isMultiple = false,
  maxSize,
  maxFiles,
  isDisabled = false,
  disabledMessage,
  isRequired = false,
  isLoading = false,
  status: statusProp,
  statusVariant = 'attached',
  description,
  placeholder,
  mode = 'input',
  isOptional = false,
  labelTooltip,
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  ref,
  id: idProp,
  ...restProps
}: FileInputProps) {
  const {rest, container} = useFieldInputStyling('FileInput', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const t = useTranslator();
  const generatedID = useId();
  const id = idProp ?? generatedID;
  const descriptionID = useId();
  const statusMessageID = useId();
  const requiredID = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isBusy = isLoading || optimisticValue !== value;
  // A pick is one user action, already announced as "file selected"; a busy
  // period it starts (changeAction, or a caller setting isLoading from
  // onChange) adds no second message (spec:AST-086 FR6). The mark lasts until
  // the field is idle again. Other busy starts announce; the Spinner stays
  // decorative (FR8).
  const [isPickAnnounced, setIsPickAnnounced] = useState(false);
  if (isPickAnnounced && !isBusy) {
    setIsPickAnnounced(false);
  }
  useBusyAnnouncement(
    isBusy && !isPickAnnounced,
    t('@astryx.spinner.loading'),
    containerRef,
  );

  // Announce successful file selection to screen readers via a persistent
  // live region (forms-17). Validation errors are announced (assertively) by
  // the FieldStatus that the derived error status mounts, so only the
  // successful attach needs an explicit announcement here.
  const announce = useAnnounce();

  // Disabled-reason tooltip. Disabled controls swallow pointer events, so the
  // tooltip listeners attach to the visible container (which stays hoverable)
  // and the trigger stays perceivable via aria-disabled instead of the native
  // disabled attribute. Opening the picker is blocked by the isDisabled guards
  // in the handlers.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  const status =
    statusProp ??
    (validationError
      ? {type: 'error' as const, message: validationError}
      : undefined);

  const {statusIcon, describedBy: statusTooltipDescribedBy} =
    useInputStatusIcon({
      status,
      statusVariant,
    });

  // Required state. The trigger is a real button, but AT does not reliably
  // announce aria-required, so the trigger instead points its aria-describedby
  // at a visually hidden "Required" span — mirroring the Field label's visible
  // indicator (where isOptional takes precedence) and the pattern Slider uses
  // for its thumbs.
  const conveysRequired = isRequired && !isOptional;

  const ariaDescribedBy =
    [
      description ? descriptionID : null,
      statusVariant !== 'tooltip' && status?.message ? statusMessageID : null,
      // The tooltip variant renders no message box; describe the input by the
      // tooltip's content instead so the status is still announced.
      statusTooltipDescribedBy,
      conveysRequired ? requiredID : null,
      showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  const defaultPlaceholder = isMultiple
    ? t('@astryx.fileInput.placeholderMultiple')
    : t('@astryx.fileInput.placeholder');
  const displayPlaceholder = placeholder ?? defaultPlaceholder;

  const handleFiles = useCallback(
    (fileList: File[]) => {
      if (isDisabled) {
        return;
      }

      const {valid, errors} = validateFiles(
        fileList,
        accept,
        maxSize,
        maxFiles,
        isMultiple,
        t,
      );

      if (errors.length > 0) {
        setValidationError(errors[0]);
      } else {
        setValidationError(null);
      }

      if (valid.length === 0) {
        onChange(null);
        return;
      }

      const result = isMultiple ? valid : valid[0];
      onChange(result);

      // Announce the successful selection politely. Validation errors are
      // announced assertively by the FieldStatus that the derived error
      // status mounts, so only announce the attach here (do not
      // double-announce errors).
      if (errors.length === 0) {
        setIsPickAnnounced(true);
        announce(
          valid.length === 1
            ? t('@astryx.fileInput.fileSelected', {fileName: valid[0].name})
            : t('@astryx.fileInput.filesSelected', {count: valid.length}),
        );
      }

      if (changeAction) {
        startTransition(async () => {
          setOptimisticValue(result);
          await changeAction(result);
        });
      }
    },
    [
      accept,
      isDisabled,
      isMultiple,
      maxFiles,
      maxSize,
      onChange,
      changeAction,
      startTransition,
      setOptimisticValue,
      announce,
      t,
    ],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = Array.from(e.target.files ?? []);
      handleFiles(fileList);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [handleFiles],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setValidationError(null);
      onChange(null);
      if (changeAction) {
        startTransition(async () => {
          setOptimisticValue(null);
          await changeAction(null);
        });
      }
      if (inputRef.current) {
        inputRef.current.value = '';
        const targetInput = inputRef.current;
        if (e.detail === 0) {
          targetInput.focus();
        } else {
          // Defer focus restoration past the button's unmount task so iOS Safari
          // and touch browsers don't jump the page scroll to 0 on tap.
          requestAnimationFrame(() => {
            targetInput.focus({preventScroll: true});
          });
        }
      }
    },
    [onChange, changeAction, startTransition, setOptimisticValue],
  );

  const handleClick = useCallback(() => {
    if (!isDisabled) {
      inputRef.current?.click();
    }
  }, [isDisabled]);

  // Explicit keyboard activation so Enter/Space open the picker even where a
  // synthetic keydown does not raise a native click. The isDisabled guard
  // blocks activation while focusable-disabled.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !isDisabled) {
        e.preventDefault();
        inputRef.current?.click();
      }
    },
    [isDisabled],
  );

  // Make the surface clickable without giving it an interactive role. Clicks on
  // the nested clear/status controls are ignored by the hook, so those buttons
  // are plain siblings — no nested-interactive violation.
  const {onClick: onContainerClick, onMouseUp: onContainerMouseUp} =
    useClickableContainer({
      containerRef,
      onClick: handleClick,
      disabled: isDisabled,
    });

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDisabled && mode === 'dropzone') {
        setIsDragOver(true);
      }
    },
    [isDisabled, mode],
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDisabled && mode === 'dropzone') {
        setIsDragOver(true);
      }
    },
    [isDisabled, mode],
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Moving over the dropzone's own children (icon, text) fires dragleave on
    // the container too — only a leave that actually exits the dropzone ends
    // the drag-over state, otherwise the highlight flickers mid-drag.
    if (
      e.relatedTarget instanceof Node &&
      e.currentTarget.contains(e.relatedTarget)
    ) {
      return;
    }
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (isDisabled || mode !== 'dropzone') {
        return;
      }
      const fileList = Array.from(e.dataTransfer.files);
      if (fileList.length > 0) {
        handleFiles(fileList);
      }
    },
    [isDisabled, mode, handleFiles],
  );

  const hasFiles =
    optimisticValue != null &&
    (Array.isArray(optimisticValue) ? optimisticValue.length > 0 : true);
  const fileNames = hasFiles
    ? Array.isArray(optimisticValue)
      ? optimisticValue.map(f => f.name).join(', ')
      : (optimisticValue?.name ?? '')
    : null;

  const renderDropzoneContent = () => {
    if (isBusy) {
      return <Spinner size="md" aria-hidden="true" />;
    }
    if (hasFiles) {
      return (
        <div {...stylex.props(styles.fileNameText, styles.fileNameDropzone)}>
          {fileNames}
        </div>
      );
    }
    return (
      <>
        <Icon
          icon="upload"
          size="md"
          color="secondary"
          {...themeProps('file-input-icon', {mode})}
        />
        <span {...stylex.props(styles.placeholderText)}>
          {isDragOver ? t('@astryx.fileInput.dropHint') : displayPlaceholder}
        </span>
      </>
    );
  };

  const renderCompactContent = () => {
    if (isBusy) {
      return (
        <>
          <span {...stylex.props(styles.fileNameText)}>
            {fileNames ?? displayPlaceholder}
          </span>
          <Spinner size="sm" aria-hidden="true" />
        </>
      );
    }
    return (
      <>
        <Icon
          icon="upload"
          size="sm"
          color="secondary"
          {...themeProps('file-input-icon', {mode})}
        />
        <span
          {...stylex.props(
            hasFiles ? styles.fileNameText : styles.placeholderText,
            hasFiles ? styles.fileNameCompact : styles.placeholderCompact,
          )}>
          {fileNames ?? displayPlaceholder}
        </span>
        {statusIcon}
      </>
    );
  };

  const isDropzone = mode === 'dropzone';

  const dragDropProps = isDropzone
    ? {
        onDragEnter: handleDragEnter,
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
        onDrop: handleDrop,
      }
    : {};

  return (
    <Field
      {...container}
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={id}
      descriptionID={description ? descriptionID : undefined}
      isOptional={isOptional}
      isRequired={isRequired}
      isDisabled={isDisabled}
      status={
        status
          ? {
              type: status.type,
              message: status.message,
              messageID: status.message ? statusMessageID : undefined,
            }
          : undefined
      }
      statusVariant={statusVariant}
      labelTooltip={labelTooltip}
      width={width}>
      <div
        ref={el => {
          containerRef.current = el;
          // Anchor + hover/focus listeners for the disabled-message tooltip on
          // the visible container (the focusable trigger is visually hidden, so
          // anchoring there would place the tooltip at a 1px box). focusin
          // bubbles from the trigger button, so the tooltip still opens on
          // keyboard focus. Handlers are gated internally by isEnabled.
          disabledMessageTooltip.ref(el);
        }}
        onClick={!isDisabled ? onContainerClick : undefined}
        onMouseUp={!isDisabled ? onContainerMouseUp : undefined}
        {...dragDropProps}
        {...mergeProps(
          themeProps('file-input', {mode, status: status?.type ?? null}),
          stylex.props(
            isDropzone ? styles.dropzone : styles.compact,
            isDropzone && !isDisabled && styles.dropzoneHover,
            isDropzone && isDragOver && styles.dropzoneActive,
            isDropzone && isDisabled && styles.dropzoneDisabled,
            !isDropzone && isDisabled && styles.compactDisabled,
            status && statusBorderStyles[status.type],
            controlXstyle,
          ),
          controlClassName,
          controlStyle,
        )}>
        {/* Visually hidden real button carrying the accessible role, name, and
            ARIA. Kept as a sibling of the clear/status controls inside a
            non-interactive container, so no interactive element nests inside
            another (WCAG 4.1.2). The visible focus feedback is the container's
            :focus-within border; the surface click is handled by the container
            (VisuallyHidden disables the button's own pointer events), and
            keyboard activation still fires here. */}
        <VisuallyHidden>
          <button
            type="button"
            // A disabled trigger keeps its Tab stop (spec:AST-085 FR1).
            tabIndex={0}
            aria-disabled={isDisabled ? 'true' : undefined}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            // aria-label suppresses child content from the accessible name, so
            // compose the selected filenames into it — otherwise a
            // screen-reader user refocusing the control hears only the field
            // label and cannot tell what (if anything) is attached.
            aria-label={
              hasFiles && fileNames
                ? t('@astryx.fileInput.triggerWithFiles', {label, fileNames})
                : label
            }
            aria-busy={isBusy || undefined}
            aria-describedby={ariaDescribedBy}
            aria-invalid={status?.type === 'error' ? 'true' : undefined}
          />
        </VisuallyHidden>
        <input
          {...rest}
          ref={useMergedRefs(ref, inputRef)}
          id={id}
          type="file"
          accept={accept}
          multiple={isMultiple}
          // Detached from its form while disabled, so selected files are not
          // submitted and `required` does not block submission (FR3).
          form={isDisabled ? '' : undefined}
          // A label or description click activates this input directly; cancel
          // it so a disabled input never opens the picker (FR2).
          onClick={isDisabled ? event => event.preventDefault() : rest.onClick}
          onChange={handleInputChange}
          // The visually-hidden native input is never focused (tabIndex={-1});
          // its describedby/required/invalid live on the trigger button.
          aria-hidden="true"
          tabIndex={-1}
          {...stylex.props(styles.hiddenInput)}
        />
        {isDropzone ? renderDropzoneContent() : renderCompactContent()}
        {hasFiles && !isDisabled && !isBusy && (
          <InputClearButton
            label={t('@astryx.fileInput.clearLabel', {label})}
            onClick={handleClear}
          />
        )}
      </div>
      {conveysRequired && (
        <VisuallyHidden id={requiredID}>
          {t('@astryx.fileInput.required')}
        </VisuallyHidden>
      )}
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </Field>
  );
}

FileInput.displayName = 'FileInput';
