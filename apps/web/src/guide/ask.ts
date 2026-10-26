import { sendToAssistant, useAiStore } from '../ai/agent';
import { currentStep, useGuideStore } from './store';

/**
 * Pregunta desde la guía (burbuja o bienvenida): va al mismo asistente que el panel de IA, con una
 * nota de que el usuario está en modo guiado y en qué paso está. La respuesta queda en la burbuja.
 */
export async function askGuide(text: string): Promise<void> {
  const question = text.trim();
  const g = useGuideStore.getState();
  if (!question || g.busy) return;
  g.say({ role: 'user', text: question });
  g.setBusy(true);
  const step = currentStep();
  const note = [
    '[guide] The user is in guided mode (guide bubble): answer in 1–2 short sentences and point at the real controls with show_me / focus_object instead of describing menus.',
    step
      ? `Current guide step: «${step.text}»${step.target ? ` (control ${step.target})` : ''}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  try {
    // Si el panel de IA está respondiendo otra cosa, espera a que termine.
    for (let i = 0; i < 100 && useAiStore.getState().busy; i++)
      await new Promise((r) => setTimeout(r, 150));
    const answer = await sendToAssistant(question, undefined, note);
    const last = useAiStore.getState().entries.at(-1);
    const reply = answer || (last?.kind === 'error' ? last.text || last.code : '');
    if (reply) useGuideStore.getState().say({ role: 'guide', text: reply });
  } finally {
    useGuideStore.getState().setBusy(false);
  }
}
