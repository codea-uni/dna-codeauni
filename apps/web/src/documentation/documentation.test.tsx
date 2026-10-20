import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { METHOD_TOPICS } from '@cronos/core';
import { chapters } from './content';
import DocumentationPanel from './DocumentationPanel';
import { useDocsNav } from './docsNav';
import { guideChapters } from './guide';

// Sin documento ni ventanas en el servidor: el flujo y la cinta, mínimos.
vi.mock('../hooks/useWorkflow', () => ({ useWorkflow: () => ({}), tabAvailable: () => true }));
vi.mock('../components/WorkspaceWindows', () => ({
  WORKSPACE_PANELS: [{ id: 'vibration', label: 'app.tab.vibration', requires: null }],
  openWorkspacePanel: vi.fn(),
}));

// Cada capítulo se dibuja sin errores: una fórmula mal escrita tumbaba la ventana entera.
describe('Documentación', () => {
  const ids = [
    ...guideChapters.map((g) => g.id),
    ...chapters.map((c) => c.id),
    ...METHOD_TOPICS.map((tp) => `models.${tp.id}`),
  ];
  it.each(ids)('capítulo %s', (chapter) => {
    useDocsNav.setState({ target: { chapter, seq: 1 } });
    const html = renderToString(createElement(DocumentationPanel));
    expect(html).toContain('id="docs-heading"');
    expect(html).toContain('Funciones del programa');
    expect(html).toContain('Modelos y fórmulas');
  });

  it('el tema de vibración lista las leyes elegibles y la prevista', () => {
    useDocsNav.setState({ target: { chapter: 'models.vibration', seq: 2 } });
    const html = renderToString(createElement(DocumentationPanel));
    for (const name of ['USBM', 'Ambraseys-Hendron', 'Langefors-Kihlström', 'Ghosh-Daemen'])
      expect(html).toContain(name);
    expect(html).toContain('id="model-vibration-usbm"');
  });
});
