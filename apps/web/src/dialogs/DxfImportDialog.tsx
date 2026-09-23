import {
  commands,
  nextHoleNumber,
  newId,
  type DxfInspection,
  type DxfLayerRole,
} from '@blastlab/core';
import { X } from 'lucide-react';
import { useState } from 'react';
import { getCompute, getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';

export interface DxfPreview {
  fileName: string;
  text: string;
  inspection: DxfInspection;
}

const ROLES: { value: DxfLayerRole; label: string }[] = [
  { value: 'holeLines', label: 'Taladros (líneas boca → fondo)' },
  { value: 'holePoints', label: 'Taladros (puntos / círculos)' },
  { value: 'labels', label: 'Etiquetas de taladros' },
  { value: 'boundaries', label: 'Perímetros (polilíneas cerradas)' },
  { value: 'freeFaces', label: 'Caras libres (líneas)' },
  { value: 'topography', label: 'Topografía (3DFACE)' },
  { value: 'ignore', label: 'Ignorar' },
];

const describe = (counts: Record<string, number>) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${n} ${t}`)
    .join(' · ');

/** Importación DXF: rol por capa (taladros, etiquetas, perímetros, caras libres, topografía). */
export function DxfImportDialog({
  preview,
  onClose,
}: {
  preview: DxfPreview;
  onClose: () => void;
}) {
  const [roles, setRoles] = useState<Record<string, DxfLayerRole>>(() =>
    Object.fromEntries(preview.inspection.layers.map((l) => [l.name, l.suggested])),
  );
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const template = useUiStore((s) => s.holeTemplate);
  const nothing = Object.values(roles).every((r) => r === 'ignore');

  const run = async () => {
    const { document } = session;
    const blast = document.project.blasts[0];
    if (!blast) return;
    setBusy(true);
    try {
      const r = await getCompute().api.dxfImport(preview.text, roles, {
        diameter: template.diameter,
        subdrill: template.subdrill,
        bench: blast.bench,
        startNumber: replace ? 1 : nextHoleNumber(blast.holes),
      });
      setWarnings(r.warnings);
      const ops = [
        ...(replace
          ? commands.deleteHoles(
              document,
              blast.holes.map((h) => h.id),
            )
          : []),
        ...commands.addHoles(blast.id, r.holes),
      ];
      // Perímetros: se agregan (con nombres libres) sobre la lista actual.
      let boundaries = blast.boundaries;
      for (const b of r.boundaries) {
        const nb = {
          ...commands.makeBoundary({ boundaries }, b.polygon),
          freeFaceEdges: b.freeFaceEdges,
        };
        boundaries = [...boundaries, nb];
      }
      if (r.boundaries.length)
        ops.push({ type: 'blast/patch', blastId: blast.id, patch: { boundaries } });
      if (r.surfaces.length) {
        const surfaces = r.surfaces.map((s, i) => ({
          ...s,
          id: newId<'Surface'>(),
          name: `${preview.fileName}${r.surfaces.length > 1 ? ` ${i + 1}` : ''}`,
          kind: 'topography' as const,
        }));
        ops.push({
          type: 'project/patch',
          patch: { surfaces: [...document.project.surfaces, ...surfaces] },
        });
        const first = surfaces[0];
        if (first)
          ops.push({
            type: 'blast/patch',
            blastId: blast.id,
            patch: { bench: { ...blast.bench, topSurfaceId: first.id } },
          });
      }
      if (ops.length === 0) {
        useUiStore.getState().notify('El DXF no aportó elementos con los roles elegidos', 'error');
        return;
      }
      document.dispatch(
        ops,
        `Importar DXF (${r.holes.length} taladros, ${r.boundaries.length} perímetros)`,
      );
      getEngine()?.zoomToFit();
      useUiStore
        .getState()
        .notify(
          `DXF: ${r.holes.length} taladros · ${r.boundaries.length} perímetros · ${r.surfaces.length} superficies`,
        );
      if (r.warnings.length === 0) onClose();
    } catch (err) {
      useUiStore.getState().notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Importar DXF">
      <div className="modal">
        <header>
          <h2>Importar DXF · {preview.fileName}</h2>
          <button className="icon" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </header>
        <p className="muted">
          {preview.inspection.entityCount} entidades · {preview.inspection.layers.length} capas
        </p>
        <table className="grid-table layers">
          <thead>
            <tr>
              <th>Capa</th>
              <th>Contenido</th>
              <th>Usar como</th>
            </tr>
          </thead>
          <tbody>
            {preview.inspection.layers.map((l) => (
              <tr key={l.name}>
                <td className="mono">{l.name}</td>
                <td className="muted small">{describe(l.counts)}</td>
                <td>
                  <select
                    className="cell"
                    value={roles[l.name] ?? 'ignore'}
                    onChange={(e) => {
                      setRoles((r) => ({ ...r, [l.name]: e.target.value as DxfLayerRole }));
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="check">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => {
              setReplace(e.target.checked);
            }}
          />
          Reemplazar los taladros existentes
        </label>
        {warnings.length > 0 && (
          <div className="errors">
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <footer>
          <button onClick={onClose}>Cancelar</button>
          <button className="primary-inline" disabled={busy || nothing} onClick={() => void run()}>
            {busy ? 'Importando…' : 'Importar'}
          </button>
        </footer>
      </div>
    </div>
  );
}
