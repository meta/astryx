// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ToastContext.ts
 * @input Layer's toast host
 * @output ToastContext and ToastContextValue
 * @position The context lives in Layer/toastHost.tsx, so LayerProvider can
 *   provide it without importing Toast.
 */

export {ToastContext, type ToastContextValue} from '../Layer/toastHost';
