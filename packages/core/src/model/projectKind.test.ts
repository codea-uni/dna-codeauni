import { describe, expect, it } from 'vitest';
import { serializeProject, parseProjectFile } from '../io/projectFile';
import { createEmptyProject } from './factories';
import { parseProjectKind, projectKind } from './projectKind';
import { SCHEMA_VERSION } from './schema';

describe('tipo de proyecto (Open Pit / Underground)', () => {
  it('un proyecto nuevo es superficial salvo que se pida subterráneo', () => {
    expect(createEmptyProject('A').kind).toBe('surface');
    expect(createEmptyProject('B', new Date(), 'underground').kind).toBe('underground');
  });

  it('los proyectos guardados sin el campo son superficiales', () => {
    expect(projectKind({})).toBe('surface');
    expect(projectKind(null)).toBe('surface');
    expect(projectKind({ kind: 'underground' })).toBe('underground');
  });

  it('un archivo viejo sin `kind` se abre y se trata como superficial', () => {
    const project = createEmptyProject('Rajo');
    delete project.kind;
    const text = serializeProject(project, { appVersion: 'test' });
    expect((JSON.parse(text) as { schemaVersion: number }).schemaVersion).toBe(SCHEMA_VERSION);
    const parsed = parseProjectFile(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.project.kind).toBeUndefined();
    expect(projectKind(parsed.file.project)).toBe('surface');
  });

  it('el tipo subterráneo se conserva al guardar y abrir', () => {
    const project = createEmptyProject('Galería 3', new Date(), 'underground');
    const parsed = parseProjectFile(serializeProject(project, { appVersion: 'test' }));
    expect(parsed.ok && parsed.file.project.kind).toBe('underground');
  });

  it('rechaza un tipo desconocido', () => {
    const project = createEmptyProject('X');
    const json = JSON.parse(serializeProject(project, { appVersion: 'test' })) as {
      project: Record<string, unknown>;
    };
    json.project.kind = 'quarry';
    expect(parseProjectFile(JSON.stringify(json)).ok).toBe(false);
  });

  it('interpreta nombres libres del tipo', () => {
    expect(parseProjectKind('Underground')).toBe('underground');
    expect(parseProjectKind('subterráneo')).toBe('underground');
    expect(parseProjectKind('open pit')).toBe('surface');
    expect(parseProjectKind('Superficial')).toBe('surface');
    expect(parseProjectKind('tajo abierto')).toBe('surface');
    expect(parseProjectKind('')).toBeNull();
    expect(parseProjectKind('otro')).toBeNull();
    expect(parseProjectKind(3)).toBeNull();
  });
});
