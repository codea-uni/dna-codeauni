import 'fake-indexeddb/auto';
import { createEmptyProject } from '@cronos/core';
import { describe, expect, it } from 'vitest';
import { listVersions, readVersion, saveVersion } from './autosave';
import { KEEP_VERSIONS } from './history';

const at = (min: number) => new Date(Date.UTC(2026, 8, 28, 12, min));

describe('autoguardado en IndexedDB', () => {
  it('guarda, lista sin el JSON, lee una versión y poda las más viejas', async () => {
    const project = createEmptyProject('Banco 4250');
    await saveVersion(project, '{"v":0}', at(0));
    // A los 30 s sobrescribe la misma versión
    await saveVersion(project, '{"v":1}', new Date(at(0).getTime() + 30_000));
    let list = await listVersions();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('text');
    expect(list[0]).toMatchObject({ projectId: project.id, name: 'Banco 4250' });
    expect((await readVersion(list[0]?.id ?? -1))?.text).toBe('{"v":1}');

    for (let i = 1; i <= KEEP_VERSIONS + 2; i++)
      await saveVersion(project, `{"v":${String(i + 1)}}`, at(i * 2));
    list = await listVersions();
    expect(list).toHaveLength(KEEP_VERSIONS);
    const newest = list[0];
    const oldest = list[list.length - 1];
    expect((await readVersion(newest?.id ?? -1))?.text).toBe(`{"v":${String(KEEP_VERSIONS + 3)}}`);
    expect(oldest?.savedAt).toBe(at(6).toISOString());
  });
});
