// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useChatDictation.ts
 * @input Uses useSpeechRecognition, AudioContext, ChatComposerInputHandle
 * @output Exports useChatDictation — full dictation hook for ChatComposer
 * @position Utility hook — the ONE hook consumers call for voice-to-text input
 *
 * Wraps useSpeechRecognition and adds AudioContext (volume, frequency bands,
 * noise floor calibration), audio feedback sounds, CAPS LOCK (sustained volume
 * → uppercase), and optional interim text DOM management for ChatComposerInput.
 */

import {useState, useCallback, useEffect, useRef} from 'react';
import type {ChatComposerInputHandle} from './ChatComposerInput';
import {useSpeechRecognition} from './useSpeechRecognition';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';

// =============================================================================
// Types
// =============================================================================

export interface UseChatDictationOptions {
  /** BCP-47 language tag. @default InternationalizationProvider locale */
  lang?: string;
  /** Whether recognition continues until explicitly stopped. @default true */
  continuous?: boolean;
  /** Whether interim results are reported. @default true */
  interimResults?: boolean;
  /** Transform transcript text before it's reported. Applied before CAPS LOCK. */
  transformTranscript?: (transcript: string) => string;
  /** Called on each transcript result (interim or final). */
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  /** Called when a final result is produced. */
  onResult?: (transcript: string) => void;
  /** Called when a recognition error occurs. */
  onError?: (error: {error: string; message?: string}) => void;
  /** Called when recognition starts. */
  onStart?: () => void;
  /** Called when recognition ends. */
  onEnd?: () => void;
  /** Play subtle audio cues on start/stop. @default false */
  hasSounds?: boolean;
  /** Shared AudioContext — uses an internal lazy singleton by default. */
  audioContext?: AudioContext;
  /** Ref to ChatComposerInput. If provided, manages interim ghost text in the input. */
  inputRef?: React.RefObject<ChatComposerInputHandle | null>;
}

export interface UseChatDictationReturn {
  /** Whether the browser supports SpeechRecognition. */
  isSupported: boolean;
  /** Whether recognition is currently active. */
  isListening: boolean;
  /** Whether speech is currently being detected. */
  isSpeaking: boolean;
  /** Real-time microphone volume level, 0 to 1. Updates ~60fps while listening. */
  volume: number;
  /** Frequency band levels (low to high), each 0-1. Updates ~60fps while listening. */
  bands: number[];
  /** Raw (uncalibrated) band levels for debugging. */
  rawBands: number[];
  /** The current interim transcript text. */
  interimTranscript: string;
  /** Start speech recognition. */
  start: () => void;
  /** Stop speech recognition gracefully (waits for final result). */
  stop: () => void;
  /** Abort speech recognition immediately. */
  abort: () => void;
  /** Toggle between start and stop. */
  toggle: () => void;
}

// =============================================================================
// Volume analyser
// =============================================================================

interface VolumeAnalyser {
  calibrate: () => void;
  getVolume: () => number;
  getBands: (count: number) => number[];
  getRawBands: (count: number) => number[];
  cleanup: () => void;
}

async function createVolumeAnalyser(
  getCtx: () => AudioContext,
): Promise<VolumeAnalyser | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    const audioContext = getCtx();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const noiseFloor = new Float32Array(analyser.frequencyBinCount);
    let calibrationSamples = 0;
    const CALIBRATION_FRAMES = 60;

    function calibrate() {
      analyser.getByteFrequencyData(dataArray);
      calibrationSamples++;
      for (let i = 0; i < dataArray.length; i++) {
        const val = dataArray[i] / 255;
        if (val > noiseFloor[i]) {
          noiseFloor[i] = val;
        }
      }
    }

    function getCleanBin(i: number): number {
      const raw = dataArray[i] / 255;
      if (calibrationSamples < CALIBRATION_FRAMES) {
        return 0;
      }
      return Math.max(0, raw - noiseFloor[i] * 1.1);
    }

    return {
      calibrate,
      getVolume: () => {
        analyser.getByteFrequencyData(dataArray);
        if (calibrationSamples < CALIBRATION_FRAMES) {
          calibrate();
        }
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += getCleanBin(i);
        }
        return sum / dataArray.length;
      },
      getBands: (count: number) => {
        analyser.getByteFrequencyData(dataArray);
        if (calibrationSamples < CALIBRATION_FRAMES) {
          calibrate();
        }
        const bands: number[] = [];
        const binCount = dataArray.length;
        const voiceSplits = [3, 6, 11, 18, binCount];
        const splits =
          count <= voiceSplits.length
            ? voiceSplits.slice(0, count)
            : voiceSplits;
        let start = 1;
        for (let b = 0; b < splits.length; b++) {
          const end = splits[b];
          let sum = 0;
          for (let i = start; i < end; i++) {
            sum += getCleanBin(i);
          }
          bands.push(sum / (end - start));
          start = end;
        }
        return bands;
      },
      getRawBands: (count: number) => {
        analyser.getByteFrequencyData(dataArray);
        const bands: number[] = [];
        const binCount = dataArray.length;
        const voiceSplits = [3, 6, 11, 18, binCount];
        const splits =
          count <= voiceSplits.length
            ? voiceSplits.slice(0, count)
            : voiceSplits;
        let start = 1;
        for (let b = 0; b < splits.length; b++) {
          const end = splits[b];
          let sum = 0;
          for (let i = start; i < end; i++) {
            sum += dataArray[i] / 255;
          }
          bands.push(sum / (end - start));
          start = end;
        }
        return bands;
      },
      cleanup: () => {
        source.disconnect();
        for (const track of stream.getTracks()) {
          track.stop();
        }
      },
    };
  } catch {
    return null;
  }
}

// =============================================================================
// Audio feedback
// =============================================================================

let _sharedAudioCtx: AudioContext | null = null;

function getDefaultAudioContext(): AudioContext {
  if (!_sharedAudioCtx || _sharedAudioCtx.state === 'closed') {
    _sharedAudioCtx = new AudioContext();
  }
  if (_sharedAudioCtx.state === 'suspended') {
    void _sharedAudioCtx.resume();
  }
  return _sharedAudioCtx;
}

const isIOS =
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent);

function playPlop(
  freq: number,
  delay: number,
  getCtx: () => AudioContext,
  volume: number = 0.25,
) {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const dur = freq < 200 ? 0.18 : 0.06;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.3, now + delay);
    osc.frequency.exponentialRampToValueAtTime(freq, now + delay + 0.01);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.93, now + delay + dur);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.setValueAtTime(volume, now + delay);
    gain.gain.exponentialRampToValueAtTime(
      volume * 0.2,
      now + delay + dur * 0.12,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + dur);
  } catch {
    // Audio playback is best-effort
  }
}

function playStartSound(getCtx: () => AudioContext) {
  if (isIOS) {
    return;
  }
  playPlop(392, 0, getCtx);
  playPlop(523, 0.07, getCtx);
}

function playStopSound(getCtx: () => AudioContext) {
  if (isIOS) {
    return;
  }
  playPlop(523, 0, getCtx);
  playPlop(392, 0.07, getCtx);
}

// =============================================================================
// Hook
// =============================================================================

export function useChatDictation(
  options: UseChatDictationOptions = {},
): UseChatDictationReturn {
  const {
    lang,
    continuous,
    interimResults,
    transformTranscript: userTransform,
    onTranscript: onTranscriptProp,
    onResult: onResultProp,
    onError,
    onStart: onStartProp,
    onEnd: onEndProp,
    hasSounds = false,
    audioContext: externalAudioContext,
    inputRef,
  } = options;

  const getAudioContext = useCallback(
    () => externalAudioContext ?? getDefaultAudioContext(),
    [externalAudioContext],
  );

  const [volume, setVolume] = useState(0);
  const [bands, setBands] = useState<number[]>([0, 0, 0, 0, 0]);
  const [rawBands, setRawBands] = useState<number[]>([0, 0, 0, 0, 0]);

  const volumeHistoryRef = useRef<number[]>([]);
  const getAudioContextRef = useRef(getAudioContext);
  const analyserRef = useRef<VolumeAnalyser | null>(null);
  const rafRef = useRef<number>(0);
  const interimSpanRef = useRef<HTMLSpanElement | null>(null);

  const callbacksRef = useRef({
    onTranscriptProp,
    onResultProp,
    onStartProp,
    onEndProp,
  });
  // Recognition events read the latest callbacks and audio context. Write
  // them at commit: a render React discards, as a suspended transition does,
  // must not leave its values behind.
  useIsomorphicLayoutEffect(() => {
    getAudioContextRef.current = getAudioContext;
    callbacksRef.current = {
      onTranscriptProp,
      onResultProp,
      onStartProp,
      onEndProp,
    };
  });

  const startVolumePolling = useCallback(() => {
    const poll = () => {
      const analyser = analyserRef.current;
      if (analyser) {
        const vol = analyser.getVolume();
        setVolume(vol);
        const hist = volumeHistoryRef.current;
        hist.push(vol);
        if (hist.length > 30) {
          hist.shift();
        }
        setBands(analyser.getBands(5));
        setRawBands(analyser.getRawBands(5));
      }
      rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
  }, []);

  const stopVolumePolling = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setVolume(0);
    setBands([0, 0, 0, 0, 0]);
    setRawBands([0, 0, 0, 0, 0]);
    volumeHistoryRef.current = [];
    analyserRef.current?.cleanup();
    analyserRef.current = null;
  }, []);

  const getEditable = useCallback((): HTMLDivElement | null => {
    const active = document.activeElement;
    if (active?.getAttribute('contenteditable') === 'true') {
      return active as HTMLDivElement;
    }
    return document.querySelector<HTMLDivElement>(
      '.astryx-chat-composer-input [contenteditable="true"], [role="textbox"][contenteditable="true"]',
    );
  }, []);

  const insertInterimSpan = useCallback(() => {
    const editable = getEditable();
    if (!editable) {
      return;
    }
    const span = document.createElement('span');
    span.setAttribute('data-astryx-dictation-interim', '');
    span.contentEditable = 'false';
    span.style.color = 'var(--color-text-disabled, #999)';
    span.style.fontStyle = 'italic';
    span.style.opacity = '0.7';
    span.style.pointerEvents = 'none';
    editable.appendChild(span);
    interimSpanRef.current = span;
    editable.dispatchEvent(new Event('input', {bubbles: true}));
  }, [getEditable]);

  const removeInterimSpan = useCallback(() => {
    const span = interimSpanRef.current;
    if (span?.isConnected) {
      try {
        span.remove();
      } catch {
        /* Already removed */
      }
    }
    interimSpanRef.current = null;
  }, []);

  const transformTranscript = useCallback(
    (text: string) => {
      let t = text;
      if (userTransform) {
        t = userTransform(t);
      }
      const hist = volumeHistoryRef.current;
      const avgVolume =
        hist.length > 0 ? hist.reduce((a, b) => a + b, 0) / hist.length : 0;
      if (avgVolume >= 0.15 && hist.length >= 10) {
        t = t.toUpperCase();
      }
      return t;
    },
    [userTransform],
  );

  // Releases the audio analyser and the animation frame on unmount.
  useEffect(() => {
    return () => {
      analyserRef.current?.cleanup();
      analyserRef.current = null;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const speech = useSpeechRecognition({
    lang,
    continuous,
    interimResults,
    transformTranscript,
    onTranscript: (transcript, isFinal) => {
      if (inputRef) {
        if (isFinal) {
          removeInterimSpan();
          const handle = inputRef.current;
          if (handle) {
            handle.focus();
            handle.insertText(transcript + ' ');
          }
          callbacksRef.current.onResultProp?.(transcript);
          insertInterimSpan();
        } else {
          const span = interimSpanRef.current;
          if (span) {
            span.textContent = transcript;
          } else {
            insertInterimSpan();
            if (interimSpanRef.current) {
              interimSpanRef.current.textContent = transcript;
            }
          }
        }
      }
      callbacksRef.current.onTranscriptProp?.(transcript, isFinal);
    },
    onResult: inputRef ? undefined : onResultProp,
    onError,
    onStart: () => {
      if (hasSounds) {
        playStartSound(getAudioContextRef.current);
      }
      void createVolumeAnalyser(getAudioContextRef.current).then(analyser => {
        if (analyser) {
          analyserRef.current = analyser;
          startVolumePolling();
        }
      });
      if (inputRef) {
        insertInterimSpan();
      }
      callbacksRef.current.onStartProp?.();
    },
    onEnd: () => {
      stopVolumePolling();
      if (hasSounds) {
        playStopSound(getAudioContextRef.current);
      }
      if (inputRef) {
        removeInterimSpan();
        const editable = getEditable();
        if (editable) {
          editable.dispatchEvent(new Event('input', {bubbles: true}));
        }
      }
      callbacksRef.current.onEndProp?.();
    },
  });

  const speechAbort = speech.abort;
  const wrappedAbort = useCallback(() => {
    speechAbort();
    stopVolumePolling();
  }, [speechAbort, stopVolumePolling]);

  return {
    isSupported: speech.isSupported,
    isListening: speech.isListening,
    isSpeaking: speech.isSpeaking,
    interimTranscript: speech.interimTranscript,
    volume,
    bands,
    rawBands,
    start: speech.start,
    stop: speech.stop,
    abort: wrappedAbort,
    toggle: speech.toggle,
  };
}
