// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file fenwick.ts
 * @input Row count, an estimated row size, and measured sizes as rows render
 * @output O(log n) row offsets and offset-to-index lookup over measured sizes
 * @position Candidate 4 of the bench (a prefix-sum tree) and the offset model
 *   under candidate 5 (outside-React recycling). Bench-only; never merged.
 */

export class FenwickOffsets {
  private tree: Float64Array;
  private sizes: Float64Array;
  private n: number;

  constructor(
    count: number,
    private estimate: number,
  ) {
    this.n = count;
    this.sizes = new Float64Array(count).fill(estimate);
    this.tree = new Float64Array(count + 1);
    this.rebuild();
  }

  get count(): number {
    return this.n;
  }

  private rebuild() {
    this.tree.fill(0);
    for (let i = 0; i < this.n; i++) {
      const size = this.sizes[i] ?? 0;
      const j = i + 1;
      this.tree[j] = (this.tree[j] ?? 0) + size;
      const parent = j + (j & -j);
      if (parent <= this.n) {
        this.tree[parent] = (this.tree[parent] ?? 0) + (this.tree[j] ?? 0);
      }
    }
  }

  sizeOf(index: number): number {
    return this.sizes[index] ?? this.estimate;
  }

  /** Sets a measured size; returns the change in px. */
  set(index: number, size: number): number {
    const delta = size - (this.sizes[index] ?? 0);
    if (delta === 0 || index < 0 || index >= this.n) {
      return 0;
    }
    this.sizes[index] = size;
    for (let j = index + 1; j <= this.n; j += j & -j) {
      this.tree[j] = (this.tree[j] ?? 0) + delta;
    }
    return delta;
  }

  /** Content offset of the row at `index` (sum of the sizes before it). */
  offsetOf(index: number): number {
    let sum = 0;
    for (let j = Math.min(index, this.n); j > 0; j -= j & -j) {
      sum += this.tree[j] ?? 0;
    }
    return sum;
  }

  total(): number {
    return this.offsetOf(this.n);
  }

  /** The row whose span contains `offset`. */
  indexAt(offset: number): number {
    if (offset <= 0) {
      return 0;
    }
    let index = 0;
    let remaining = offset;
    let step = 1;
    while (step * 2 <= this.n) {
      step *= 2;
    }
    for (; step > 0; step >>= 1) {
      const next = index + step;
      if (next <= this.n && (this.tree[next] ?? 0) <= remaining) {
        index = next;
        remaining -= this.tree[next] ?? 0;
      }
    }
    return Math.min(index, Math.max(0, this.n - 1));
  }

  /** Inserts `count` estimated rows before `at`. */
  insert(at: number, count: number) {
    const sizes = new Float64Array(this.n + count);
    sizes.set(this.sizes.subarray(0, at), 0);
    sizes.fill(this.estimate, at, at + count);
    sizes.set(this.sizes.subarray(at), at + count);
    this.sizes = sizes;
    this.n += count;
    this.tree = new Float64Array(this.n + 1);
    this.rebuild();
  }
}
