import { describe, expect, it } from 'vitest';
import { computeApi } from './computeApi';

describe('computeApi', () => {
  it('ping delega en core', () => {
    expect(computeApi.ping('hola')).toBe('pong: hola');
  });
});
