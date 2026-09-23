import type { Tool } from './types';

/** El arrastre con botón izquierdo desplaza la vista (lo resuelve el InputRouter). */
export class PanTool implements Tool {
  readonly name = 'pan' as const;
  readonly cursor = 'grab';
}
