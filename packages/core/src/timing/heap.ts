/** Min-heap binario de (prioridad, índice) sobre arreglos planos. */
export class MinHeap {
  private keys: number[] = [];
  private values: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: number): void {
    const k = this.keys;
    const v = this.values;
    let i = k.length;
    k.push(key);
    v.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((k[parent] ?? 0) <= key) break;
      k[i] = k[parent] ?? 0;
      v[i] = v[parent] ?? 0;
      i = parent;
    }
    k[i] = key;
    v[i] = value;
  }

  /** Extrae el mínimo: [prioridad, índice]. */
  pop(): [number, number] | undefined {
    const k = this.keys;
    const v = this.values;
    if (k.length === 0) return undefined;
    const top: [number, number] = [k[0] ?? 0, v[0] ?? 0];
    const lastK = k.pop() ?? 0;
    const lastV = v.pop() ?? 0;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && (k[r] ?? 0) < (k[l] ?? 0) ? r : l;
        if ((k[c] ?? 0) >= lastK) break;
        k[i] = k[c] ?? 0;
        v[i] = v[c] ?? 0;
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}
