// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSpeechRecognition.ts
 * @input Uses React hooks, browser SpeechRecognition API, AudioContext
 * @output Exports useSpeechRecognition hook — pure utility for voice-to-text
 * @position Utility hook — framework-agnostic SpeechRecognition wrapper
 *
 * Wraps the browser SpeechRecognition API in a headless React hook,
 * providing start/stop/toggle controls, transcript state, and real-time
 * volume level from the microphone via AudioContext analyser.
 */

import {useState, useCallback, useEffect, useMemo, useRef} from 'react';
import {useLocale} from '../i18n';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Chat/useSpeechRecognition.generated';

registerEnglishFallback(english);

// =============================================================================
// Types
// =============================================================================

export interface UseSpeechRecognitionOptions {
  /** BCP-47 language tag. @default InternationalizationProvider locale */
  lang?: string;
  /** Whether recognition continues until explicitly stopped. @default true */
  continuous?: boolean;
  /** Whether interim results are reported. @default true */
  interimResults?: boolean;
  /** Shared AudioContext — uses an internal lazy singleton by default. */
  audioContext?: AudioContext;
  /** Transform transcript text before reporting. */
  transformTranscript?: (text: string) => string;
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
}

export interface UseSpeechRecognitionReturn {
  /** Whether the browser supports SpeechRecognition. */
  isSupported: boolean;
  /** Whether recognition is currently active. */
  isListening: boolean;
  /** Whether speech is currently being detected. */
  isSpeaking: boolean;
  /** Real-time microphone volume level, 0 to 1. */
  volume: number;
  /** Frequency band levels (low to high), each 0-1. */
  bands: number[];
  /** Raw (uncalibrated) band levels for debugging. */
  rawBands: number[];
  /** The current interim transcript text. */
  interimTranscript: string;
  /** Start speech recognition. */
  start: () => void;
  /** Stop speech recognition gracefully. */
  stop: () => void;
  /** Abort speech recognition immediately. */
  abort: () => void;
  /** Toggle between start and stop. */
  toggle: () => void;
}

// =============================================================================
// SpeechRecognition type shim
// =============================================================================

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onerror: ((event: {error: string; message?: string}) => void) | null;
  onnomatch: (() => void) | null;
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: {transcript: string};
    };
  };
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return (
    (window as unknown as {SpeechRecognition?: SpeechRecognitionConstructor})
      .SpeechRecognition ??
    (
      window as unknown as {
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      }
    ).webkitSpeechRecognition ??
    null
  );
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
          let bandSum = 0;
          for (let i = start; i < end; i++) {
            bandSum += getCleanBin(i);
          }
          bands.push(bandSum / (end - start));
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
          let bandSum = 0;
          for (let i = start; i < end; i++) {
            bandSum += dataArray[i] / 255;
          }
          bands.push(bandSum / (end - start));
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
// AudioContext singleton
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

// =============================================================================
// Hook
// =============================================================================

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionReturn {
  const t = useComponentTranslator();
  const providerLocale = useLocale();
  const {
    lang,
    continuous = true,
    interimResults = true,
    onTranscript,
    onResult,
    onError,
    onStart,
    onEnd,
    audioContext: externalAudioContext,
    transformTranscript,
  } = options;

  const getAudioContext = useCallback(
    () => externalAudioContext ?? getDefaultAudioContext(),
    [externalAudioContext],
  );

  const isSupported = useMemo(() => getSpeechRecognition() != null, []);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [bands, setBands] = useState<number[]>([0, 0, 0, 0, 0]);
  const [rawBands, setRawBands] = useState<number[]>([0, 0, 0, 0, 0]);
  const [interimTranscript, setInterimTranscript] = useState('');

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const getAudioContextRef = useRef(getAudioContext);
  getAudioContextRef.current = getAudioContext;
  const analyserRef = useRef<VolumeAnalyser | null>(null);
  const rafRef = useRef<number>(0);

  const callbacksRef = useRef({
    onTranscript,
    onResult,
    onError,
    onStart,
    onEnd,
    transformTranscript,
  });
  callbacksRef.current = {
    onTranscript,
    onResult,
    onError,
    onStart,
    onEnd,
    transformTranscript,
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      analyserRef.current?.cleanup();
      analyserRef.current = null;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const startVolumePolling = useCallback(() => {
    const poll = () => {
      const a = analyserRef.current;
      if (a) {
        setVolume(a.getVolume());
        setBands(a.getBands(5));
        setRawBands(a.getRawBands(5));
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
    analyserRef.current?.cleanup();
    analyserRef.current = null;
  }, []);

  const start = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      return;
    }
    recognitionRef.current?.abort();
    const recognition = new SR();
    recognition.lang = lang ?? providerLocale;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;

    recognition.onstart = () => {
      setIsListening(true);
      callbacksRef.current.onStart?.();
      void createVolumeAnalyser(getAudioContextRef.current).then(a => {
        if (a) {
          analyserRef.current = a;
          startVolumePolling();
        }
      });
    };

    recognition.onend = () => {
      setIsListening(false);
      setIsSpeaking(false);
      setInterimTranscript('');
      stopVolumePolling();
      callbacksRef.current.onEnd?.();
    };

    recognition.onspeechstart = () => {
      setIsSpeaking(true);
    };
    recognition.onspeechend = () => {
      setIsSpeaking(false);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        let transcript = result[0].transcript;
        if (callbacksRef.current.transformTranscript) {
          transcript = callbacksRef.current.transformTranscript(transcript);
        }
        if (result.isFinal) {
          callbacksRef.current.onResult?.(transcript);
          callbacksRef.current.onTranscript?.(transcript, true);
          setInterimTranscript('');
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        setInterimTranscript(interim);
        callbacksRef.current.onTranscript?.(interim, false);
      }
    };

    recognition.onerror = event => {
      callbacksRef.current.onError?.({
        error: event.error,
        message: event.message,
      });
    };

    recognition.onnomatch = () => {
      callbacksRef.current.onError?.({
        error: 'no-speech',
        message: t('@astryx.chat.speechRecognition.noSpeechDetected'),
      });
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [
    lang,
    providerLocale,
    continuous,
    interimResults,
    startVolumePolling,
    stopVolumePolling,
    t,
  ]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const abort = useCallback(() => {
    recognitionRef.current?.abort();
    stopVolumePolling();
  }, [stopVolumePolling]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  return {
    isSupported,
    isListening,
    isSpeaking,
    volume,
    bands,
    rawBands,
    interimTranscript,
    start,
    stop,
    abort,
    toggle,
  };
}
