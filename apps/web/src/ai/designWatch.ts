import { projectKind } from '@cronos/core';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { topographyTin, benchOnSurveyOps } from '../topography/session';
import { sendToAssistant, useAiStore } from './agent';
import { onCardChoice, pushCard, type AgentCard, type CardChoice } from './cards';
import { liveVoice, useLiveStore } from './live';
import { applyPresetById, loadScenarioById } from './sceneTools';
import { applyTopographyById, copyPerimeter } from './workspaceTools';
import { applyPendingTieUp, TIE_UP_CARD } from './tools';
import { liveActive } from '../xr/liveDesign';

/**
 * Lo que pasa fuera de la conversación y el agente debe saber:
 * - Al cargar una topografía que el banco no usa, o un perímetro dibujado/importado a mano,
 *   aparece una tarjeta «¿La usamos para esta voladura?» y se avisa al agente para que lo pregunte.
 * - Lo que el usuario elige en una tarjeta (preset, escenario, opción) se aplica o se le cuenta al
 *   agente para que siga la conversación con esa respuesta.
 */

/** Dice algo al agente: por voz en vivo si está conectada; si no, al chat si ya hay conversación. */
export function tellAgent(text: string): void {
  const phase = useLiveStore.getState().phase;
  if (phase !== 'off' && phase !== 'error') {
    liveVoice.greet(text);
    return;
  }
  if (useAiStore.getState().entries.length > 0 && !useAiStore.getState().busy)
    void sendToAssistant(text);
}

async function applySurvey(surveyId: string): Promise<void> {
  const blast = session.document.project.blasts[0];
  const survey = session.document.project.topography.find((s) => s.id === surveyId);
  if (!blast || !survey) return;
  const r = await benchOnSurveyOps(blast, survey, topographyTin(survey.id));
  session.document.dispatch(r.ops, `Usar ${survey.name}`);
  useUiStore.getState().notify(`El banco usa «${survey.name}».`);
}

function handleChoice(card: AgentCard, choice: CardChoice): void {
  if (card.id === TIE_UP_CARD) {
    if (choice.id === 'change') {
      tellAgent(
        '[ui] El usuario quiere cambiar el amarre propuesto (no se aplicó). Pregúntale qué cambiar: tipo (V, fila por fila, echelon), retardos de la librería o taladro de inicio.',
      );
      return;
    }
    const better = choice.id === 'better' ? /(\d+)\/(\d+)/.exec(choice.label) : null;
    void applyPendingTieUp(
      better ? { inter_hole: better[1] ?? '', inter_row: better[2] ?? '' } : undefined,
    ).then((out) => {
      tellAgent(
        out.ok
          ? `[ui] El usuario tocó «${choice.label}» y el amarre ya está aplicado: ${JSON.stringify(out.result)}. Confírmalo en una frase (no lo vuelvas a aplicar).`
          : `[ui] No se pudo aplicar el amarre: ${out.error}. Díselo en una frase y propone cómo seguir.`,
      );
    });
    return;
  }
  if (card.id === 'presets') {
    void applyPresetById(choice.id).then((name) => {
      if (name)
        tellAgent(
          `[ui] El usuario eligió y apliqué el preset «${name}» en el polígono activo. Revisa el resultado (predict_results) y coméntalo en una o dos frases.`,
        );
    });
    return;
  }
  if (card.id === 'scenarios') {
    const name = loadScenarioById(choice.id);
    if (name) tellAgent(`[ui] El usuario cargó el escenario «${name}». Coméntalo en una frase.`);
    return;
  }
  if (card.id.startsWith('topo:')) {
    const surveyId = card.id.slice('topo:'.length);
    if (choice.id === 'use') {
      void applySurvey(surveyId).then(() => {
        tellAgent(
          `[ui] El usuario eligió usar la topografía nueva para esta voladura (ya está aplicada al banco). Confírmalo brevemente y sigue.`,
        );
      });
    } else tellAgent('[ui] El usuario dejó la topografía nueva solo como referencia.');
    return;
  }
  if (card.id.startsWith('perim:')) {
    if (choice.id === 'use') {
      useUiStore.getState().setActiveBoundary(card.id.slice('perim:'.length) as never);
      tellAgent(
        `[ui] El usuario quiere diseñar en el polígono nuevo «${card.sub}» (ya es el activo). Pregunta lo que falte o propón la malla.`,
      );
    } else tellAgent(`[ui] El polígono «${card.sub}» queda solo como referencia.`);
    return;
  }
  if (card.id.startsWith('ws-')) {
    handleWorkspaceChoice(card.id.slice(3), choice);
    return;
  }
  // Opciones que ofreció el agente (show_choices): la respuesta vuelve como si la hubiera dicho.
  tellAgent(`[ui] El usuario eligió: ${choice.label}`);
}

/** Lo elegido en las listas de `workspace`: se hace aquí mismo y el agente lo comenta. */
function handleWorkspaceChoice(kind: string, choice: CardChoice): void {
  const fail = (err: unknown) => {
    useUiStore.getState().notify(err instanceof Error ? err.message : String(err), 'error');
  };
  if (kind === 'project') {
    tellAgent(
      `[ui] El usuario eligió abrir el proyecto «${choice.label}». Ábrelo con open_project.`,
    );
    return;
  }
  if (kind === 'mine') {
    tellAgent(
      `[ui] El usuario eligió la mina «${choice.label}». Lista sus proyectos (workspace show projects, mine).`,
    );
    return;
  }
  if (kind === 'topo') {
    useUiStore.getState().notify(`Trayendo ${choice.label}…`);
    applyTopographyById(choice.id)
      .then((r) => {
        tellAgent(
          `[ui] El usuario eligió la topografía «${choice.label}» y ya está aplicada al banco: ${JSON.stringify(r)}. Coméntalo en una frase y sigue.`,
        );
      })
      .catch(fail);
    return;
  }
  if (kind === 'perim') {
    if (choice.id.startsWith('here:')) {
      const id = choice.id.slice(5);
      useUiStore.getState().setActiveBoundary(id as never);
      tellAgent(
        `[ui] El usuario eligió trabajar en el polígono «${choice.label}» (ya es el activo). Pregunta lo que falte o propón la malla.`,
      );
      return;
    }
    const [, projectId = '', boundaryId = ''] = choice.id.split(':');
    copyPerimeter(projectId, boundaryId)
      .then((r) => {
        tellAgent(
          `[ui] El usuario trajo el polígono «${choice.label}» a esta voladura (ya es el activo): ${JSON.stringify(r)}. Coméntalo en una frase y sigue.`,
        );
      })
      .catch(fail);
  }
}

/** Empieza a vigilar el documento; devuelve cómo dejar de hacerlo. */
export function startDesignWatch(): () => void {
  onCardChoice(handleChoice);
  let surveys = new Set(session.document.project.topography.map((s) => s.id));
  let boundaries = new Set(
    session.document.project.blasts.flatMap((b) => b.boundaries.map((x) => x.id)),
  );
  let projectId = session.document.project.id;
  const off = session.document.subscribe(() => {
    const project = session.document.project;
    // Otro proyecto abierto: se toma lo que trae como punto de partida.
    if (project.id !== projectId) {
      projectId = project.id;
      surveys = new Set(project.topography.map((s) => s.id));
      boundaries = new Set(project.blasts.flatMap((b) => b.boundaries.map((x) => x.id)));
      return;
    }
    const blast = project.blasts[0];
    for (const s of project.topography) {
      if (surveys.has(s.id)) continue;
      surveys.add(s.id);
      if (blast?.bench.topographyId === s.id) continue;
      // Bajo tierra la superficie es contexto: no se ofrece como terreno del banco.
      if (projectKind(project) === 'underground') continue;
      // Nubes y modelos de bloques se ven en 3D; no sirven de terreno del banco.
      if (!s.assets.tin) continue;
      if (useAiStore.getState().busy || useLiveStore.getState().tool || liveActive()) continue;
      pushCard({
        id: `topo:${s.id}`,
        title: 'Topografía nueva',
        sub: s.name,
        metrics: [{ label: 'Fecha', value: s.surveyDate }],
        bars: [],
        notes: [],
        choices: [
          { id: 'use', label: 'Usarla para esta voladura' },
          { id: 'ref', label: 'Solo como referencia' },
        ],
        t0: performance.now(),
      });
      tellAgent(
        `[ui] Se cargó la topografía «${s.name}» (${s.surveyDate}). Pregúntale al usuario en una frase si la usamos para esta voladura (hay una tarjeta para elegir).`,
      );
    }
    for (const b of blast?.boundaries ?? []) {
      if (boundaries.has(b.id)) continue;
      boundaries.add(b.id);
      // Los que crea el asistente no se preguntan (los pidió el usuario).
      if (useAiStore.getState().busy || useLiveStore.getState().tool || liveActive()) continue;
      if ((blast?.boundaries.length ?? 0) < 2) continue;
      pushCard({
        id: `perim:${b.id}`,
        title: 'Polígono nuevo',
        sub: b.name,
        metrics: [],
        bars: [],
        notes: [],
        choices: [
          { id: 'use', label: 'Diseñar en este polígono' },
          { id: 'ref', label: 'Solo como referencia' },
        ],
        t0: performance.now(),
      });
      tellAgent(
        `[ui] El usuario agregó el polígono «${b.name}». Pregúntale en una frase si diseñamos en él (hay una tarjeta para elegir).`,
      );
    }
  });
  return () => {
    off();
    onCardChoice(null);
  };
}
