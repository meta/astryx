// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  useCallback,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

interface LiveNumberInputOptions {
  min?: number | null;
  max?: number | null;
  isIntegerOnly?: boolean;
}

export function readLiveNumberDraft(
  text: string,
  {min, max, isIntegerOnly}: LiveNumberInputOptions,
): number | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || (isIntegerOnly && !Number.isInteger(value))) {
    return null;
  }
  if ((min != null && value < min) || (max != null && value > max)) {
    return null;
  }
  return value;
}

export function useLiveNumberInput(
  value: number | null,
  onChange: (value: number | null) => void,
  {min, max, isIntegerOnly}: LiveNumberInputOptions = {},
) {
  const [editBase, setEditBase] = useState<number | null | undefined>(
    undefined,
  );
  const editBaseRef = useRef(value);
  const committedAtBoundaryRef = useRef(false);

  const handleChange = useCallback(
    (nextValue: number | null) => {
      committedAtBoundaryRef.current = true;
      editBaseRef.current = nextValue;
      setEditBase(nextValue);
      onChange(nextValue);
    },
    [onChange],
  );
  const handleFocus = useCallback(() => {
    editBaseRef.current = value;
    committedAtBoundaryRef.current = false;
    setEditBase(value);
  }, [value]);
  const handleInput = useCallback(
    (event: FormEvent<HTMLElement>) => {
      committedAtBoundaryRef.current = false;
      const liveValue = readLiveNumberDraft(
        (event.currentTarget as HTMLInputElement).value,
        {min, max, isIntegerOnly},
      );
      if (liveValue !== null && liveValue !== value) {
        onChange(liveValue);
      }
    },
    [isIntegerOnly, max, min, onChange, value],
  );
  const restoreRejectedDraft = useCallback(() => {
    if (!committedAtBoundaryRef.current && value !== editBaseRef.current) {
      onChange(editBaseRef.current);
    }
    committedAtBoundaryRef.current = false;
  }, [onChange, value]);
  const handleBlur = useCallback(
    (_event: FocusEvent<HTMLInputElement>) => {
      restoreRejectedDraft();
      setEditBase(undefined);
    },
    [restoreRejectedDraft],
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        restoreRejectedDraft();
      }
    },
    [restoreRejectedDraft],
  );

  return {
    value: editBase === undefined ? value : editBase,
    handleBlur,
    handleChange,
    handleFocus,
    handleInput,
    handleKeyDown,
  };
}
