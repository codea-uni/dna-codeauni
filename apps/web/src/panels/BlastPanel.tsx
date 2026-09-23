import { commands } from '@blastlab/core';
import { NumberField } from '../components/NumberField';
import { useActiveBlast } from '../hooks/useDocument';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';

export function BlastPanel() {
  const blast = useActiveBlast();
  const setTool = useUiStore((s) => s.setTool);
  if (!blast) return null;

  const setBench = (patch: Partial<typeof blast.bench>, label: string) => {
    session.document.dispatch(
      { type: 'blast/patch', blastId: blast.id, patch: { bench: { ...blast.bench, ...patch } } },
      label,
    );
  };

  return (
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
      <div className="row">
        <button
          onClick={() => {
            setTool('boundary');
          }}
        >
          Dibujar perímetro
        </button>
        <button
          disabled={!blast.boundary}
          onClick={() => {
            session.document.dispatch(
              commands.setBlastBoundary(blast.id, undefined),
              'Quitar perímetro',
            );
          }}
        >
          Quitar perímetro
        </button>
      </div>
      {blast.boundary && <p className="muted">Perímetro de {blast.boundary.length} vértices</p>}
    </section>
  );
}
