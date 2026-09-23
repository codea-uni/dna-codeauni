import { X } from 'lucide-react';
import { TOOLS } from '../components/Toolbar';

const GENERAL: [string, string][] = [
  ['Ctrl+Z / Ctrl+Shift+Z', 'Deshacer / rehacer'],
  ['Ctrl+S', 'Guardar proyecto'],
  ['Ctrl+A', 'Seleccionar todo'],
  ['Supr', 'Borrar selección'],
  ['Esc', 'Cancelar / limpiar selección'],
  ['F', 'Encuadrar todo'],
  ['3', 'Alternar planta / 3D'],
  ['Espacio + arrastre', 'Desplazar vista'],
  ['Rueda', 'Zoom al cursor'],
  ['Shift / Ctrl + clic', 'Agregar / quitar de la selección'],
];

/** Referencia rápida de atajos (tecla ?). */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Atajos de teclado"
      onClick={onClose}
    >
      <div
        className="modal shortcuts"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h2>Atajos</h2>
          <button className="icon" onClick={onClose} aria-label="Cerrar">
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
                    <t.icon size={14} aria-hidden /> {t.label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="kv">
            <tbody>
              {GENERAL.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
