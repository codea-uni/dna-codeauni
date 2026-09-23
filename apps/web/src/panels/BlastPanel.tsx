import { commands, type BoundaryId } from '@blastlab/core';
import { boundaryColorCss } from '@blastlab/engine';
import { TextCell } from '../components/CellInput';
import { NumberField } from '../components/NumberField';
import { useActiveBlast } from '../hooks/useDocument';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';

export function BlastPanel() {
  const blast = useActiveBlast();
  const setTool = useUiStore((s) => s.setTool);
  const activeBoundaryId = useUiStore((s) => s.activeBoundaryId);
  const setActiveBoundary = useUiStore((s) => s.setActiveBoundary);
  if (!blast) return null;

  const setBench = (patch: Partial<typeof blast.bench>, label: string) => {
    session.document.dispatch(
      { type: 'blast/patch', blastId: blast.id, patch: { bench: { ...blast.bench, ...patch } } },
      label,
    );
  };
  const remove = (id: BoundaryId, name: string) => {
    session.document.dispatch(
      commands.removeBoundary(session.document, blast.id, id),
      `Borrar ${name}`,
    );
    if (activeBoundaryId === id) setActiveBoundary(null);
  };

  return (
    <>
      <section className="panel">
        <h2>Voladura</h2>
        <p className="muted">
          {blast.name} · {blast.holes.length} taladros · {blast.patterns.length} mallas
        </p>
        <NumberField
          label="Cota de piso"
          unit="m"
          value={blast.bench.floorElevation}
          onCommit={(v) => {
            setBench({ floorElevation: v }, 'Cota de piso');
          }}
        />
        <NumberField
          label="Altura de banco"
          unit="m"
          min={0.1}
          value={blast.bench.height}
          onCommit={(v) => {
            setBench({ height: v }, 'Altura de banco');
          }}
        />
        <p className="hint">El banco se aplica a los taladros nuevos (boca en piso + altura).</p>
      </section>

      <section className="panel">
        <h2>Perímetros</h2>
        {blast.boundaries.length === 0 ? (
          <p className="hint">Sin perímetros. Dibuja uno con la herramienta Perímetro (B).</p>
        ) : (
          <ul className="boundary-list">
            {blast.boundaries.map((b, i) => (
              <li key={b.id} className={b.id === activeBoundaryId ? 'active' : ''}>
                <button
                  className="swatch"
                  title="Activar"
                  style={{ background: boundaryColorCss(i) }}
                  onClick={() => {
                    setActiveBoundary(b.id === activeBoundaryId ? null : b.id);
                  }}
                />
                <TextCell
                  value={b.name}
                  onCommit={(name) => {
                    session.document.dispatch(
                      commands.renameBoundary(session.document, blast.id, b.id, name),
                      'Renombrar perímetro',
                    );
                  }}
                />
                <span className="muted small" title="Vértices · caras libres">
                  {b.polygon.length} v ·{' '}
                  {b.freeFaceEdges.length === 0 ? (
                    <span className="warn">sin cara libre</span>
                  ) : (
                    `${b.freeFaceEdges.length} cara${b.freeFaceEdges.length > 1 ? 's' : ''} libre${b.freeFaceEdges.length > 1 ? 's' : ''}`
                  )}
                </span>
                <button
                  className="icon danger"
                  title="Borrar perímetro"
                  onClick={() => {
                    remove(b.id, b.name);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button
            onClick={() => {
              setTool('boundary');
            }}
          >
            Dibujar perímetro (B)
          </button>
          <button
            disabled={blast.boundaries.length === 0}
            onClick={() => {
              setTool('freeFace');
            }}
          >
            Cara libre (C)
          </button>
        </div>
        <p className="hint">
          Cara libre: con la herramienta C, haz clic junto a la arista del talud. Las marcas indican
          hacia dónde se desplaza el material.
        </p>
      </section>
    </>
  );
}
