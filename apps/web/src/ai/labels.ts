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
  set_site_conditions: 'ai.tool.set_site_conditions',
  add_protected_point: 'ai.tool.add_protected_point',
  recommend_design: 'ai.tool.recommend_design',
  predict_results: 'ai.tool.predict_results',
  evaluate_explosive: 'ai.tool.evaluate_explosive',
  design_presplit: 'ai.tool.design_presplit',
  design_buffer: 'ai.tool.design_buffer',
  split_zone: 'ai.tool.split_zone',
  track_blocks: 'ai.tool.track_blocks',
  show_results: 'ai.tool.show_results',
  set_layers: 'ai.tool.set_layers',
  delete_perimeter: 'ai.tool.delete_perimeter',
  hole_detail: 'ai.tool.hole_detail',
  vr_view: 'ai.tool.vr_view',
  get_analysis: 'ai.tool.get_analysis',
  get_design: 'ai.tool.get_design',
  list_holes: 'ai.tool.list_holes',
  search_knowledge: 'ai.tool.search_knowledge',
  company_explosives: 'ai.tool.company_explosives',
  enable_explosive: 'ai.tool.enable_explosive',
  save_project_note: 'ai.tool.save_project_note',
  set_camera: 'ai.tool.set_camera',
  spotlight: 'ai.tool.spotlight',
  edit_perimeter: 'ai.tool.edit_perimeter',
  edit_protected_point: 'ai.tool.edit_protected_point',
  scenarios: 'ai.tool.scenarios',
  presets: 'ai.tool.presets',
  show_choices: 'ai.tool.show_choices',
  workspace: 'ai.tool.workspace',
  open_project: 'ai.tool.open_project',
  use_topography: 'ai.tool.use_topography',
  use_perimeter: 'ai.tool.use_perimeter',
  save_version: 'ai.tool.save_version',
};

export const ERROR_KEYS: Record<string, MessageKey> = {
  ai_not_configured: 'ai.error.ai_not_configured',
  ai_upstream: 'ai.error.ai_upstream',
  unauthorized: 'ai.error.unauthorized',
  ai_empty: 'ai.error.ai_empty',
  ai_steps: 'ai.error.ai_steps',
  ai_cancelled: 'ai.error.ai_cancelled',
  voice: 'ai.error.voice',
  ai_rate_limited: 'ai.error.ai_upstream',
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
