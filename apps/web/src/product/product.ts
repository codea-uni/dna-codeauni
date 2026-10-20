import { parseProjectKind, projectKind, type ProjectKind } from '@cronos/core';
import { Mountain, Pickaxe, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useProject } from '../hooks/useDocument';
import type { MessageKey } from '../i18n';
import { useProjectSession } from '../server/projectSession';

/**
 * Las dos herramientas de Cronos, conectadas por la mina: **Open Pit** (proyectos `surface`) y
 * **Underground** (`underground`). Cada una tiene nombre, ícono y color de acento propios; ambas
 * comparten la topografía, los levantamientos y los perímetros de la mina.
 */

export const PRODUCT_NAME: Record<ProjectKind, MessageKey> = {
  surface: 'product.surface',
  underground: 'product.underground',
};

export const PRODUCT_ICON: Record<ProjectKind, LucideIcon> = {
  surface: Mountain,
  underground: Pickaxe,
};

/** La otra herramienta. */
export function otherKind(kind: ProjectKind): ProjectKind {
  return kind === 'surface' ? 'underground' : 'surface';
}

/** Parámetro de URL con la herramienta (`?tool=underground`). */
export const TOOL_PARAM = 'tool';

/** Herramienta pedida en la URL, o `null` si no hay (o no se entiende). */
export function toolFromSearch(search: URLSearchParams): ProjectKind | null {
  return parseProjectKind(search.get(TOOL_PARAM));
}

/** Página de la mina en una herramienta. */
export function mineToolPath(mineId: string, tool: ProjectKind): string {
  return `/mines/${mineId}?${TOOL_PARAM}=${tool}`;
}

/** Abrir un proyecto desde una herramienta (si es de la otra, se abre solo para visualizarlo). */
export function projectPath(projectId: string, kind: ProjectKind, tool: ProjectKind): string {
  return kind === tool ? `/projects/${projectId}` : `/projects/${projectId}?${TOOL_PARAM}=${tool}`;
}

/**
 * Paneles y herramientas que solo tienen sentido en banco a cielo abierto (generador de malla en
 * banco, pila/maza, cara libre del perímetro) y los que solo tienen sentido bajo tierra (panel
 * Subterránea). Topografía, carga, tiempos, energía, fragmentación, vibración y biblioteca
 * aplican en ambas.
 */
const SURFACE_ONLY = new Set(['pattern', 'muckpile', 'freeFace']);
const UNDERGROUND_ONLY = new Set(['underground']);

/** ¿El panel (o la herramienta del plano) se muestra en un proyecto de este tipo? */
export function fitsKind(id: string, kind: ProjectKind): boolean {
  return kind === 'underground' ? !SURFACE_ONLY.has(id) : !UNDERGROUND_ONLY.has(id);
}

/** Orden en la cinta: en Underground su panel va primero. */
export function kindOrder(id: string, kind: ProjectKind): number {
  return kind === 'underground' && UNDERGROUND_ONLY.has(id) ? 0 : 1;
}

/** Tipo del proyecto abierto en el editor (los proyectos sin tipo son superficiales). */
export function useProjectKind(): ProjectKind {
  return projectKind(useProject());
}

/**
 * Herramienta en uso en el editor: la del proyecto, salvo que se haya abierto desde la otra solo
 * para visualizarlo.
 */
export function useEditorTool(): ProjectKind {
  const kind = useProjectKind();
  return useProjectSession((s) => s.current?.tool) ?? kind;
}

/**
 * Marca la herramienta en la página: `data-product` en `<html>` (cambia el color de acento) y el
 * título de la pestaña del navegador. Con `null` vuelve a «Cronos».
 */
export function useProductChrome(tool: ProjectKind | null, name: string | null): void {
  useEffect(() => {
    const root = document.documentElement;
    if (tool) root.dataset.product = tool;
    else delete root.dataset.product;
    const previous = document.title;
    if (name) document.title = name;
    return () => {
      delete root.dataset.product;
      document.title = previous;
    };
  }, [tool, name]);
}
