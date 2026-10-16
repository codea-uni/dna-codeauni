import type { KnowledgeLayer, ProjectKnowledge } from '@cronos/api';
import { session } from '../session';
import { api } from '../server/api';
import { useProjectSession } from '../server/projectSession';

/**
 * Capas de conocimiento del agente (docs/agent/CAPAS-CONOCIMIENTO.md):
 * 1. Skill de experto en perforación y voladura (fija, `skill/voladura.md` + `skill/rules.ts`).
 * 2. Conocimiento general: marco teórico, conceptos prácticos, transcripciones y recomendaciones
 *    de especialistas (la plataforma).
 * 3. Empresa (p. ej. la de explosivos que da el servicio): procedimientos y catálogo de explosivos.
 * 4. Sitio (la mina cliente): procedimientos de sitio, geología y parámetros.
 * 5. Proyecto: sus topografías y los explosivos habilitados (un subconjunto del catálogo de la
 *    empresa, en la biblioteca del diseño) y sus notas.
 * Las capas 2–5 viven en el servidor; sin servidor (modo local) el agente solo tiene la skill.
 */

let cache: { projectId: string; data: ProjectKnowledge; at: number } | null = null;
let inflight: Promise<ProjectKnowledge | null> | null = null;

/** Proyecto del servidor abierto en el editor, o `null` en modo local. */
export function serverProjectId(): string | null {
  return useProjectSession.getState().current?.projectId ?? null;
}

/** Trae (o reusa, hasta 2 min) el resumen de capas del proyecto abierto. No falla: sin datos, `null`. */
export async function loadKnowledge(force = false): Promise<ProjectKnowledge | null> {
  const projectId = serverProjectId();
  if (!projectId) return null;
  if (!force && cache?.projectId === projectId && Date.now() - cache.at < 120_000)
    return cache.data;
  inflight ??= api
    .projectKnowledge(projectId)
    .then((data) => {
      cache = { projectId, data, at: Date.now() };
      return data;
    })
    .catch(() => (cache?.projectId === projectId ? cache.data : null))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Resumen corto para el contexto del modelo (lo que sabe de cada capa y qué explosivos hay). */
export function knowledgeSummary() {
  const projectId = serverProjectId();
  const projectExplosives = session.document.project.library.explosives.map((e) => e.name);
  if (!projectId || cache?.projectId !== projectId)
    return { available: false, project_explosives: projectExplosives };
  const k = cache.data;
  const catalog = new Set(k.companyExplosives.map((n) => n.toLowerCase()));
  const layer = (l: KnowledgeLayer) => k.layers.find((x) => x.layer === l)?.docs.map((d) => d.title) ?? [];
  return {
    available: true,
    company: k.organization.name,
    site: k.mine.name,
    project: k.project.name,
    general_docs: layer('general'),
    company_docs: layer('organization'),
    site_docs: layer('mine'),
    project_docs: layer('project'),
    company_explosives: k.companyExplosives,
    project_explosives: projectExplosives,
    // Explosivos del diseño que la empresa no tiene en su catálogo (avisar, no bloquear).
    not_in_company_catalog:
      catalog.size > 0 ? projectExplosives.filter((n) => !catalog.has(n.toLowerCase())) : [],
  };
}
