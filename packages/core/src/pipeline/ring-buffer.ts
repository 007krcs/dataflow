// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * RingBuffer — Fixed-capacity circular buffer with O(1) push/pop.
 * Used for backpressure control and time-travel history.
 * Backed by a pre-allocated array to avoid GC pressure.
 */

export class RingBuffer<T> {
  private readonly _buf: (T | undefined)[];
  private _head = 0;   // write pointer
  private _tail = 0;   // read pointer
  private _size = 0;

  constructor(public readonly capacity: number) {
    this._buf = new Array(capacity);
  }

  get size(): number { return this._size; }
  get isFull(): boolean { return this._size === this.capacity; }
  get isEmpty(): boolean { return this._size === 0; }
  get utilization(): number { return this._size / this.capacity; }

  /** Push an item. Returns the evicted item if buffer was full, otherwise undefined. */
  push(item: T): T | undefined {
    let evicted: T | undefined;
    if (this.isFull) {
      evicted = this._buf[this._tail];
      this._tail = (this._tail + 1) % this.capacity;
      this._size--;
    }
    this._buf[this._head] = item;
    this._head = (this._head + 1) % this.capacity;
    this._size++;
    return evicted;
  }

  /** Pop oldest item (FIFO). */
  pop(): T | undefined {
    if (this.isEmpty) return undefined;
    const item = this._buf[this._tail];
    this._buf[this._tail] = undefined;
    this._tail = (this._tail + 1) % this.capacity;
    this._size--;
    return item;
  }

  /** Pop up to `n` oldest items at once. */
  popN(n: number): T[] {
    const result: T[] = [];
    const count = Math.min(n, this._size);
    for (let i = 0; i < count; i++) {
      result.push(this.pop()!);
    }
    return result;
  }

  /** Peek without removing. index 0 = oldest */
  peek(index = 0): T | undefined {
    if (index >= this._size) return undefined;
    return this._buf[(this._tail + index) % this.capacity];
  }

  /** Snapshot current contents oldest-first (allocates array). */
  toArray(): T[] {
    const result: T[] = new Array(this._size);
    for (let i = 0; i < this._size; i++) {
      result[i] = this._buf[(this._tail + i) % this.capacity] as T;
    }
    return result;
  }

  clear(): void {
    this._buf.fill(undefined);
    this._head = 0;
    this._tail = 0;
    this._size = 0;
  }
}
