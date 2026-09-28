import { X } from 'lucide-react';
import { TOOLS } from '../components/Toolbar';
import { useT, type MessageKey } from '../i18n';

/** [tecla (texto o clave si se traduce), acción]. */
const GENERAL: [string | { key: MessageKey }, MessageKey][] = [
  ['Ctrl+Z / Ctrl+Shift+Z', 'shortcuts.undoRedo'],
  ['Ctrl+S', 'toolbar.saveProject'],
  ['Ctrl+A', 'shortcuts.selectAll'],
  [{ key: 'shortcuts.key.delete' }, 'shortcuts.deleteSelection'],
  ['Esc', 'shortcuts.cancel'],
  ['F', 'tools.zoomFit'],
  ['3', 'shortcuts.toggle3d'],
  [{ key: 'shortcuts.key.spaceDrag' }, 'tools.pan'],
  [{ key: 'shortcuts.key.wheel' }, 'shortcuts.zoomCursor'],
  [{ key: 'shortcuts.key.modClick' }, 'shortcuts.addRemove'],
];

/** Referencia rápida de atajos (tecla ?). */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr('tools.shortcuts')}
      onClick={onClose}
    >
      <div
        className="modal shortcuts"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h2>{tr('shortcuts.title')}</h2>
          <button className="icon" onClick={onClose} aria-label={tr('settings.close')}>
            <X size={16} />
          </button>
        </header>
        <div className="modal-cols">
          <table className="kv">
            <tbody>
              {TOOLS.flat().map((t) => (
                <tr key={t.name}>
                  <td>
                    <kbd>{t.key}</kbd>
                  </td>
                  <td>
                    <t.icon size={14} aria-hidden /> {tr(t.label)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="kv">
            <tbody>
              {GENERAL.map(([k, v]) => (
                <tr key={v}>
                  <td>
                    <kbd>{typeof k === 'string' ? k : tr(k.key)}</kbd>
                  </td>
                  <td>{tr(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
