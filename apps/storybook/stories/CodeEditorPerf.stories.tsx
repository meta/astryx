// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState, useRef, useEffect, useCallback} from 'react';
import {CodeEditor} from '@astryxdesign/lab';

const meta: Meta<typeof CodeEditor> = {
  title: 'Lab/CodeEditorPerf',
  component: CodeEditor,
  parameters: {layout: 'fullscreen'},
};

export default meta;
type Story = StoryObj<typeof CodeEditor>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateCode(lineCount: number): string {
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    const mod = i % 6;
    if (mod === 0) {
      lines.push(`import {Component${i}} from './module${i}';`);
    } else if (mod === 1) {
      lines.push(`const value${i} = ${i} + Math.random();`);
    } else if (mod === 2) {
      lines.push(`function compute${i}(x: number): number {`);
    } else if (mod === 3) {
      lines.push(`  return x * ${i} + value${Math.max(0, i - 2)};`);
    } else if (mod === 4) {
      lines.push(`}`);
    } else {
      lines.push(`// Line ${i + 1}: performance test`);
    }
  }
  return lines.join('\n');
}

function Metric({label, value}: {label: string; value: string | number}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 4,
        background: '#f0f0f0',
        fontSize: 12,
        fontFamily: 'monospace',
      }}>
      <span style={{color: 'var(--color-text-secondary)'}}>{label}:</span>
      <strong>{value}</strong>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stress Test — single editor, configurable line count
// ---------------------------------------------------------------------------

function StressTestImpl() {
  const [lineCount, setLineCount] = useState(500);
  const [code, setCode] = useState(() => generateCode(500));
  const [mountTime, setMountTime] = useState<number | null>(null);
  const mountStart = useRef(0);

  useEffect(() => {
    mountStart.current = performance.now();
  }, [code]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMountTime(performance.now() - mountStart.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [code]);

  const regenerate = useCallback((count: number) => {
    setLineCount(count);
    setCode(generateCode(count));
  }, []);

  return (
    <div
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
        <span style={{fontSize: 13, fontWeight: 600}}>Lines:</span>
        {[100, 500, 1000, 2000, 5000].map(n => (
          <button
            key={n}
            onClick={() => regenerate(n)}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: lineCount === n ? '2px solid #0066cc' : '1px solid #ccc',
              background: lineCount === n ? '#e6f0ff' : 'white',
              cursor: 'pointer',
              fontSize: 12,
            }}>
            {n}
          </button>
        ))}
        {mountTime != null && (
          <Metric label="Mount" value={`${mountTime.toFixed(1)}ms`} />
        )}
      </div>
      <CodeEditor
        label="Code editor"
        value={code}
        onChange={setCode}
        language="typescript"
        hasLineNumbers
        maxHeight={600}
      />
    </div>
  );
}

export const StressTest: Story = {
  render: () => <StressTestImpl />,
};

// ---------------------------------------------------------------------------
// Typing Latency — measure input responsiveness
// ---------------------------------------------------------------------------

function TypingLatencyImpl() {
  const [lineCount, setLineCount] = useState(500);
  const [code, setCode] = useState(() => generateCode(500));
  const [latencies, setLatencies] = useState<number[]>([]);
  const lastInput = useRef(0);

  const handleChange = useCallback((val: string) => {
    const now = performance.now();
    if (lastInput.current > 0) {
      const dt = now - lastInput.current;
      if (dt < 500) {
        setLatencies(prev => [...prev.slice(-49), dt]);
      }
    }
    lastInput.current = now;
    setCode(val);
  }, []);

  const avgLatency =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;

  const regenerate = useCallback((count: number) => {
    setLineCount(count);
    setCode(generateCode(count));
    setLatencies([]);
  }, []);

  return (
    <div
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
        <span style={{fontSize: 13, fontWeight: 600}}>Lines:</span>
        {[100, 500, 1000, 2000].map(n => (
          <button
            key={n}
            onClick={() => regenerate(n)}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: lineCount === n ? '2px solid #0066cc' : '1px solid #ccc',
              background: lineCount === n ? '#e6f0ff' : 'white',
              cursor: 'pointer',
              fontSize: 12,
            }}>
            {n}
          </button>
        ))}
        <Metric label="Avg" value={`${avgLatency.toFixed(1)}ms`} />
        <Metric label="Max" value={`${maxLatency.toFixed(1)}ms`} />
        <Metric label="Samples" value={latencies.length} />
        <span style={{fontSize: 11, color: 'var(--color-text-secondary)'}}>
          Type in the editor to measure input latency
        </span>
      </div>
      <CodeEditor
        value={code}
        onChange={handleChange}
        language="typescript"
        label="Code editor"
        hasLineNumbers
        maxHeight={600}
      />
    </div>
  );
}

export const TypingLatency: Story = {
  render: () => <TypingLatencyImpl />,
};
