// Copyright (c) Meta Platforms, Inc. and affiliates.

export declare class CssValueError extends Error {
  constructor(reason: string, options?: {hasNoStaticForm?: boolean});
  readonly hasNoStaticForm: boolean;
}
export declare const ROOT_FONT_SIZE: number;
export declare const OUTSIDE_P3: string;
export declare function checkFamilyIsStatic(value: string): void;
export declare function valueForMode(
  value: string,
  mode: 'light' | 'dark',
): string;
export declare function toColor(value: string, notes?: string[]): string;
export declare function toPoints(
  value: string,
  notes?: string[],
  options?: {borderWidth?: boolean},
): number;
export declare function toWeight(value: string, notes?: string[]): number;
export declare function toLeading(
  value: string,
  fontSize: number | undefined,
  notes?: string[],
): number;
export declare function toShadow(
  value: string,
  notes?: string[],
): {
  x: number;
  y: number;
  blur: number;
  spread: number;
  isInset: boolean;
  color: string;
}[];
