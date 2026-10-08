import type { MessageKey } from '../i18n';

/**
 * Textos y voz del asistente que comparten el panel de la web y el visor (D-18, D-19): etiqueta de
 * cada herramienta que cambia el diseño, mensajes de error y lectura en voz alta.
 */

export const TOOL_LABELS: Record<string, MessageKey> = {
  generate_pattern: 'ai.tool.generate_pattern',
  edit_holes: 'ai.tool.edit_holes',
  move_holes: 'ai.tool.move_holes',
  add_holes: 'ai.tool.add_holes',
  delete_holes: 'ai.tool.delete_holes',
  set_charge: 'ai.tool.set_charge',
  clear_charge: 'ai.tool.clear_charge',
  set_tie_up: 'ai.tool.set_tie_up',
  set_electronic_timing: 'ai.tool.set_electronic_timing',
  set_hole_delays: 'ai.tool.set_hole_delays',
  clear_tie_up: 'ai.tool.clear_tie_up',
  create_perimeter: 'ai.tool.create_perimeter',
  set_free_face: 'ai.tool.set_free_face',
  undo: 'ai.tool.undo',
};

export const ERROR_KEYS: Record<string, MessageKey> = {
  ai_not_configured: 'ai.error.ai_not_configured',
  ai_upstream: 'ai.error.ai_upstream',
  unauthorized: 'ai.error.unauthorized',
  ai_empty: 'ai.error.ai_empty',
  ai_steps: 'ai.error.ai_steps',
  ai_cancelled: 'ai.error.ai_cancelled',
  voice: 'ai.error.voice',
};

/** Idioma de voz: el del navegador si coincide con el de la interfaz (es-PE, es-CL…). */
export function speechLang(locale: string): string {
  const nav = navigator.language;
  if (nav.toLowerCase().startsWith(locale)) return nav;
  return locale === 'en' ? 'en-US' : 'es-ES';
}

export function speak(text: string, lang: string): void {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.speak(u);
}
