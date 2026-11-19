// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Merge xds-* props, stylex.props result, and optional consumer className/style.
 *
 * stylex.props() returns { className, style }. This merges the Astryx stable
 * class name plus any data-attribute reflection from `themeProps()` with the
 * StyleX class name so both StyleX styles and the theme-targeting surface are
 * applied.
 *
 * Consumer className is appended after StyleX classes.
 * Consumer style is spread after StyleX inline styles, so these values take priority.
 *
 * @example
 * ```tsx
 * // Root element with themeProps
 * <div {...mergeProps(
 *   themeProps('button', { variant }),
 *   stylex.props(styles.base, variants[variant]),
 *   className,
 *   style,
 * )} />
 *
 * // Internal element — stylex + dynamic style only
 * <div {...mergeProps(
 *   stylex.props(styles.track),
 *   { style: { width: dynamicWidth } },
 * )} />
 * ```
 */

type StyleObject = React.CSSProperties;
type PropsObject = {
  className?: string;
  style?: StyleObject;
  [key: string]: unknown;
};

export function mergeProps(
  xdsClassOrStylexResult: string | PropsObject,
  stylexResultOrClassName?: PropsObject | string,
  classNameOrStyle?: string | React.CSSProperties,
  style?: React.CSSProperties,
): PropsObject {
  // Disambiguate: first arg is string → (xdsClass, stylexResult, className?, style?)
  // first arg is object → merge arbitrary props (supports themeProps + data attrs).
  if (typeof xdsClassOrStylexResult === 'string') {
    const xdsClass = xdsClassOrStylexResult;
    const stylexResult = (stylexResultOrClassName as PropsObject) ?? {
      className: '',
    };
    const className = classNameOrStyle as string | undefined;

    let cls = stylexResult.className
      ? `${xdsClass} ${stylexResult.className}`
      : xdsClass;
    if (className) {
      cls = `${cls} ${className}`;
    }

    const mergedStyle =
      style && stylexResult.style
        ? {...stylexResult.style, ...style}
        : style || stylexResult.style;

    return {...stylexResult, className: cls, style: mergedStyle};
  }

  const first = xdsClassOrStylexResult;
  const isSecondString = typeof stylexResultOrClassName === 'string';
  const second = isSecondString ? undefined : stylexResultOrClassName;

  const merged: PropsObject = second ? {...first, ...second} : {...first};

  const cls1 = first.className;
  const cls2 = isSecondString ? stylexResultOrClassName : second?.className;
  const cls3 =
    typeof classNameOrStyle === 'string' ? classNameOrStyle : undefined;

  let cls = '';
  if (cls1) {
    cls = cls1;
  }
  if (cls2) {
    cls = cls ? `${cls} ${cls2}` : cls2;
  }
  if (cls3) {
    cls = cls ? `${cls} ${cls3}` : cls3;
  }

  if (cls) {
    merged.className = cls;
  } else {
    delete merged.className;
  }

  const s1 = first.style;
  const s2 = second?.style;
  const s3 =
    typeof classNameOrStyle === 'object' && classNameOrStyle != null
      ? classNameOrStyle
      : undefined;
  const s4 = style != null ? style : undefined;

  let styleCount = 0;
  if (s1) {
    styleCount++;
  }
  if (s2) {
    styleCount++;
  }
  if (s3) {
    styleCount++;
  }
  if (s4) {
    styleCount++;
  }

  if (styleCount === 0) {
    delete merged.style;
  } else if (styleCount === 1) {
    merged.style = s4 || s3 || s2 || s1;
  } else {
    merged.style = {
      ...(s1 || {}),
      ...(s2 || {}),
      ...(s3 || {}),
      ...(s4 || {}),
    };
  }

  return merged;
}
