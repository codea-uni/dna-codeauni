import { projectKind } from '@cronos/core';
import { z } from 'zod';
import { feedbackContext, feedbackWhere } from '../guide/feedback';
import { FocusError, showObject } from '../guide/focus';
import { revealTarget } from '../guide/reveal';
import { findGuideTarget, searchGuideTargets } from '../guide/targets';
import { useGuideStore } from '../guide/store';
import { startTour, TOUR_IDS, tourTitle, type TourId } from '../guide/tours';
import { getEngine, session } from '../session';
import { api } from '../server/api';
import { ToolError, type ToolDef } from './tools';

/**
 * Herramientas del agente guía: señalar en pantalla dónde se hace algo (paso a paso), lanzar un
 * recorrido, llevar la cámara a un objeto con su burbuja y anotar pedidos en el buzón de mejoras.
 * Ninguna cambia el diseño.
 */

const kindNow = () => projectKind(session.document.project);

function notInVr(): void {
  if (getEngine()?.xrMode)
    throw new ToolError('The user is in VR: the on-screen guide is not visible there.');
}

const stepSchema = z.object({
  target: z
    .string()
    .optional()
    .describe('Control id from guide_targets (e.g. "panel.charge", "import.workings", "ug.send").'),
  label: z
    .string()
    .optional()
    .describe('Visible text of the control, when it has no id (must be on screen).'),
  text: z
    .string()
    .describe('One short imperative sentence in the user language: what to do there.'),
  title: z.string().optional(),
});

const showSchema = z.object({
  title: z
    .string()
    .optional()
    .describe('Short title of the walkthrough, e.g. «Cargar los taladros».'),
  steps: z.array(stepSchema).min(1).max(8),
});

async function showMe(args: z.infer<typeof showSchema>) {
  notInVr();
  const unknown = args.steps.filter((s) => s.target && !findGuideTarget(s.target) && !s.label);
  if (unknown.length)
    throw new ToolError(
      `Unknown control ids: ${unknown.map((s) => s.target).join(', ')}. Call guide_targets to find the right id, or pass label with the visible text.`,
    );
  const first = args.steps[0];
  const found = first ? await revealTarget(first.target, first.label) : null;
  useGuideStore.getState().start(
    args.steps.map((s) => ({
      ...(s.target ? { target: s.target } : {}),
      ...(s.label ? { label: s.label } : {}),
      text: s.text,
      ...(s.title ? { title: s.title } : {}),
    })),
    { source: 'agent', ...(args.title ? { title: args.title } : {}) },
  );
  return {
    showing: args.steps.length,
    first_found: found !== null,
    ...(found
      ? {}
      : {
          note: 'The first control is not on screen now (a previous step may be missing, e.g. no holes yet). Tell the user what is missing.',
        }),
  };
}

const focusSchema = z.object({
  kind: z
    .enum(['hole', 'perimeter', 'working', 'point', 'face', 'rings'])
    .describe(
      'hole (label), perimeter (polígono name), working (underground labor: tunnel, drive, stope, ramp), point (protected/monitoring point), face (the designed tunnel face in 3D), rings (the designed stope rings in 3D).',
    ),
  name: z.string().optional().describe('Name or label (not needed for face / rings).'),
  text: z
    .string()
    .describe('What to say in the bubble next to the object: one or two short sentences.'),
});

function focusObjectTool(args: z.infer<typeof focusSchema>) {
  notInVr();
  try {
    const anchor = showObject(args.kind, args.name ?? '', args.text);
    return {
      focused: anchor.name ?? args.kind,
      x: Math.round(anchor.at.x),
      y: Math.round(anchor.at.y),
      z: Math.round(anchor.at.z),
    };
  } catch (err) {
    if (err instanceof FocusError) throw new ToolError(err.message);
    throw err;
  }
}

const feedbackSchema = z.object({
  kind: z.enum(['bug', 'idea', 'question']),
  text: z
    .string()
    .min(10)
    .max(2000)
    .describe(
      'Clear description in Spanish for the product team: what the user wanted, what happened, where (screen/tool), and the exact message if any.',
    ),
});

async function reportFeedback(args: z.infer<typeof feedbackSchema>) {
  try {
    await api.sendFeedback({
      kind: args.kind,
      text: args.text,
      context: { ...feedbackContext(), via: 'assistant' },
      ...feedbackWhere(),
    });
  } catch (err) {
    throw new ToolError(
      `Could not send it (${err instanceof Error ? err.message : String(err)}). Offer the «Enviar al equipo» button.`,
    );
  }
  return { sent: true };
}

export const GUIDE_TOOLS: Record<string, ToolDef> = {
  guide_targets: {
    description:
      'GUIDE: find on-screen controls the guide can point at (ids for show_me). Search by words in Spanish or English ("cargar", "importar labores", "vibración", "simular"). Without query, lists all.',
    schema: z.object({ query: z.string().optional() }),
    run: (args: { query?: string }) => ({
      targets: searchGuideTargets(args.query ?? '', kindNow()),
    }),
  },
  show_me: {
    description:
      'GUIDE: point at the real controls on screen, step by step (dims the screen, an animated hand goes to the control, a bubble says what to do; it opens the needed tab, window or menu by itself and moves on when the user does it). Use it whenever the user asks WHERE or HOW to do something in the app, instead of describing menus. 1–6 steps.',
    schema: showSchema,
    run: showMe,
  },
  start_tour: {
    description: `GUIDE: start a ready guided walkthrough (skips what is already done and follows the user). Tours: ${TOUR_IDS.map((id) => `${id} (${tourTitle(id)})`).join('; ')}.`,
    schema: z.object({ tour: z.enum(TOUR_IDS as [TourId, ...TourId[]]) }),
    run: (args: { tour: TourId }) => {
      notInVr();
      startTour(args.tour);
      return { started: args.tour };
    },
  },
  focus_object: {
    description:
      'GUIDE: fly the camera to an object (hole, polígono, underground working/labor, protected point, the tunnel face, the rings), highlight it and pin a bubble with text next to it in the scene. For «¿dónde está…?», «muéstrame el tajeo 2 / la GL-420 / el taladro 14 / la comunidad».',
    schema: focusSchema,
    run: focusObjectTool,
  },
  guide_stop: {
    description: 'GUIDE: close the on-screen guide (bubble and highlight).',
    schema: z.object({}),
    run: () => {
      useGuideStore.getState().stop();
      return { stopped: true };
    },
  },
  report_feedback: {
    description:
      'GUIDE: send a bug, improvement request or confusing point to the product team mailbox (buzón de mejoras), with the screen context attached. The team validates it before anything changes. Use it when the user reports something that does not work, asks for a feature the app lacks, or after you could not solve their problem; tell them it was sent.',
    schema: feedbackSchema,
    run: reportFeedback,
  },
};

export const GUIDE_READ_ONLY = Object.keys(GUIDE_TOOLS);
