import { describe, expect, it } from 'vitest';
import type { HoleId } from '../model/types';
import { SelectionStore } from './SelectionStore';

const a = 'a' as HoleId;
const b = 'b' as HoleId;
const c = 'c' as HoleId;

describe('SelectionStore', () => {
  it('set/add/remove/toggle/clear notifican solo si hay cambios', () => {
    const sel = new SelectionStore();
    let calls = 0;
    sel.subscribe(() => calls++);
    sel.set([a, b]);
    sel.set([b, a]); // igual: no notifica
    sel.add([c]);
    sel.add([c]); // igual
    sel.toggle([a]);
    expect([...sel.ids].sort()).toEqual(['b', 'c']);
    sel.remove([b]);
    sel.clear();
    sel.clear(); // igual
    expect(sel.size).toBe(0);
    expect(calls).toBe(5);
  });
});
