import { create } from 'zustand';
import { useUiStore } from '../stores/uiStore';

/**
 * Navegación hacia la Documentación desde otras ventanas (p. ej. «Ver en Documentación» del
 * Detalle de un modelo). Módulo liviano: no arrastra la ventana diferida ni KaTeX.
 */
interface DocsNavState {
  /** Capítulo a mostrar y, opcionalmente, el ancla dentro de él. */
  target: { chapter: string; anchor?: string; seq: number } | null;
  go: (chapter: string, anchor?: string) => void;
}

export const useDocsNav = create<DocsNavState>((set, get) => ({
  target: null,
  go: (chapter, anchor) => {
    set({
      target: { chapter, ...(anchor ? { anchor } : {}), seq: (get().target?.seq ?? 0) + 1 },
    });
  },
}));

/** Ancla de un modelo del catálogo en la Documentación. */
export const modelAnchor = (id: string) => `model-${id.replace(/[^a-zA-Z0-9-]/g, '-')}`;

/** Abre (o trae al frente) la ventana Documentación en el capítulo pedido. */
export function openDocumentation(chapter: string, anchor?: string): void {
  useDocsNav.getState().go(chapter, anchor);
  const ui = useUiStore.getState();
  const id = 'workspace.documentation';
  if (ui.floating.some((w) => w.id === id)) ui.raiseFloating(id);
  else ui.floatPanel(id, 1100);
}
