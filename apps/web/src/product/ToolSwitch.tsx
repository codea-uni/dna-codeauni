import { PROJECT_KINDS, type ProjectKind } from '@cronos/core';
import { useT, type MessageKey } from '../i18n';
import { PRODUCT_ICON, useEditorTool } from './product';

/**
 * Selector de herramienta siempre visible en la barra del editor: Cielo abierto | Subterránea.
 * Qué pasa al elegir lo decide quien lo usa (modo local: cambia de diseño ahí mismo; servidor:
 * vuelve a la mina en la otra herramienta).
 */
export function ToolSwitch({
  onSelect,
  hint,
}: {
  onSelect: (kind: ProjectKind) => void;
  hint: MessageKey;
}) {
  const t = useT();
  const tool = useEditorTool();
  return (
    <div className="tool-switch" role="group" aria-label={t('product.switch')} title={t(hint)}>
      {PROJECT_KINDS.map((kind) => {
        const Icon = PRODUCT_ICON[kind];
        return (
          <button
            key={kind}
            type="button"
            data-kind={kind}
            aria-pressed={tool === kind}
            translate="no"
            onClick={() => {
              if (tool !== kind) onSelect(kind);
            }}
          >
            <Icon size={14} aria-hidden />
            <span className="tool-switch-label">{t(`product.badge.${kind}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
