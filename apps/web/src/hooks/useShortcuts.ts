import { useEffect } from 'react';
import * as actions from '../actions';
import { TOOL_KEYS } from '../components/Toolbar';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
}

/** Atajos globales de la aplicación. Las teclas propias de cada herramienta las maneja el engine. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditable(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        if (e.shiftKey) actions.redo();
        else actions.undo();
      } else if (mod && key === 'y') {
        actions.redo();
      } else if (mod && key === 'a') {
        actions.selectAll();
      } else if (mod && key === 's') {
        void actions.saveProject();
      } else if (e.key === 'Delete') {
        actions.deleteSelection();
      } else if (e.key === 'Escape') {
        session.selection.clear();
      } else if (!mod && !e.altKey && key === 'f') {
        actions.zoomToFit();
      } else if (!mod && !e.altKey && TOOL_KEYS[key]) {
        useUiStore.getState().setTool(TOOL_KEYS[key]);
      } else {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
