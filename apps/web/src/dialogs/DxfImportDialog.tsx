import { commands, nextHoleNumber, type DxfInspection, type DxfLayerRole } from '@cronos/core';
import { X } from 'lucide-react';
import { useState } from 'react';
import { getCompute, getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { boundaryOps } from '../actions';
import { useT, type MessageKey } from '../i18n';
import { importErrorText } from '../i18n/coreText';
import { createSurveyOps } from '../topography/session';

export interface DxfPreview {
  fileName: string;
  text: string;
  inspection: DxfInspection;
}

const ROLES: { value: DxfLayerRole; label: MessageKey }[] = [
  { value: 'holeLines', label: 'dxf.role.holeLines' },
  { value: 'holePoints', label: 'dxf.role.holePoints' },
  { value: 'labels', label: 'dxf.role.labels' },
  { value: 'boundaries', label: 'dxf.role.boundaries' },
  { value: 'freeFaces', label: 'dxf.role.freeFaces' },
  { value: 'topography', label: 'dxf.role.topography' },
  { value: 'ignore', label: 'dxf.role.ignore' },
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
  const tr = useT();
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
      ops.push(...boundaryOps(blast, r.boundaries));
      // La topografía del DXF se guarda como levantamiento (D-16) y se usa en el banco.
      let surveys = document.project.topography;
      for (const [i, surf] of r.surfaces.entries()) {
        const { ops: surveyOps, survey } = await createSurveyOps(
          {
            name: `${preview.fileName}${r.surfaces.length > 1 ? ` ${i + 1}` : ''}`,
            surveyDate: new Date().toISOString().slice(0, 10),
            format: 'dxf',
            files: [preview.fileName],
            ...(document.project.coordinateSystem.epsg
              ? { epsg: document.project.coordinateSystem.epsg }
              : {}),
          },
          {
            tin: {
              vertices: Float64Array.from(surf.vertices),
              triangles: Uint32Array.from(surf.triangles),
            },
          },
          i === 0 ? blast.id : undefined,
          surveys,
        );
        surveys = [...surveys, survey];
        ops.push(...surveyOps);
      }
      if (ops.length === 0) {
        useUiStore.getState().notify(tr('dxf.nothing'), 'error');
        return;
      }
      document.dispatch(
        ops,
        tr('dxf.importUndo', { holes: r.holes.length, boundaries: r.boundaries.length }),
      );
      getEngine()?.zoomToFit();
      useUiStore.getState().notify(
        tr('dxf.result', {
          holes: r.holes.length,
          boundaries: r.boundaries.length,
          surfaces: r.surfaces.length,
        }),
      );
      if (r.warnings.length === 0) onClose();
    } catch (err) {
      useUiStore.getState().notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={tr('dxf.aria')}>
      <div className="modal">
        <header>
          <h2>{tr('dxf.title', { file: preview.fileName })}</h2>
          <button className="icon" onClick={onClose} aria-label={tr('settings.close')}>
            <X size={16} />
          </button>
        </header>
        <p className="muted">
          {tr('dxf.summary', {
            entities: preview.inspection.entityCount,
            layers: preview.inspection.layers.length,
          })}
        </p>
        <table className="grid-table layers">
          <thead>
            <tr>
              <th>{tr('dxf.layer')}</th>
              <th>{tr('dxf.content')}</th>
              <th>{tr('dxf.useAs')}</th>
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
                        {tr(r.label)}
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
          {tr('csv.replace')}
        </label>
        {warnings.length > 0 && (
          <div className="errors">
            <ul>
              {warnings.map((w) => (
                <li key={w}>{importErrorText({ message: w })}</li>
              ))}
            </ul>
          </div>
        )}
        <footer>
          <button onClick={onClose}>{tr('common.cancel')}</button>
          <button className="primary-inline" disabled={busy || nothing} onClick={() => void run()}>
            {busy ? tr('csv.importing') : tr('toolbar.import')}
          </button>
        </footer>
      </div>
    </div>
  );
}
