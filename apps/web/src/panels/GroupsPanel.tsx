import {
  bufferBurden,
  bufferSpacing,
  holeCharge,
  indexLibrary,
  presplitHole,
  type Blast,
  type HoleGroup,
  type HoleGroupKind,
} from '@cronos/core';
import { Crosshair, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { Fragment } from 'react';
import * as actions from '../actions';
import { TextCell } from '../components/CellInput';
import { IconButton } from '../components/IconButton';
import { useActiveBlast, useProject, useSelectionIds } from '../hooks/useDocument';
import { useUnits } from '../hooks/useUnits';
import { useFormat, useT } from '../i18n';

const KINDS: HoleGroupKind[] = ['presplit', 'buffer', 'production', 'other'];

/** Grupos de taladros (H-303, RM-18): precorte, buffer y producción con su propia configuración. */
export function GroupsPanel() {
  const t = useT();
  const blast = useActiveBlast();
  const selected = useSelectionIds();
  if (!blast) return null;
  const count = new Map<string, number>();
  for (const h of blast.holes) if (h.groupId) count.set(h.groupId, (count.get(h.groupId) ?? 0) + 1);
  const hasSelection = selected.size > 0;

  return (
    <section className="panel">
      <h2>{t('groups.title')}</h2>
      <p className="hint">{t('groups.hint')}</p>
      {blast.groups.length === 0 && <p className="muted">{t('groups.none')}</p>}
      {blast.groups.length > 0 && (
        <table className="grid-table">
          <tbody>
            {blast.groups.map((g) => (
              <Fragment key={g.id}>
                <tr>
                  <td>
                    <input
                      type="color"
                      value={g.color}
                      aria-label={g.name}
                      onChange={(e) => {
                        actions.updateGroup(g.id, { color: e.target.value });
                      }}
                    />
                  </td>
                  <td>
                    <TextCell
                      value={g.name}
                      onCommit={(name) => {
                        if (name.trim()) actions.updateGroup(g.id, { name: name.trim() });
                      }}
                    />
                  </td>
                  <td>
                    <select
                      className="cell"
                      value={g.kind}
                      onChange={(e) => {
                        actions.updateGroup(g.id, { kind: e.target.value as HoleGroupKind });
                      }}
                    >
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(`groups.kind.${k}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num muted">{t('groups.holes', { n: count.get(g.id) ?? 0 })}</td>
                  <td>
                    <IconButton
                      icon={UserPlus}
                      label={t('groups.assign')}
                      disabled={!hasSelection}
                      onClick={() => {
                        actions.assignSelectionToGroup(g.id);
                      }}
                    />
                    <IconButton
                      icon={Crosshair}
                      label={t('groups.select')}
                      onClick={() => {
                        actions.selectGroup(g.id);
                      }}
                    />
                    <IconButton
                      icon={Trash2}
                      label={t('groups.remove')}
                      onClick={() => {
                        actions.removeGroup(g.id);
                      }}
                    />
                  </td>
                </tr>
                {(g.kind === 'presplit' || g.kind === 'buffer') && (
                  <tr>
                    <td colSpan={5}>
                      <GroupDesign group={g} blast={blast} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      <div className="row">
        <button disabled={!hasSelection} onClick={actions.createGroupFromSelection}>
          {t('groups.new')}
        </button>
        <IconButton
          icon={UserMinus}
          label={t('groups.unassign')}
          disabled={!hasSelection}
          onClick={() => {
            actions.assignSelectionToGroup(null);
          }}
        />
      </div>
    </section>
  );
}

/**
 * Cálculo sugerido de precorte y buffer (`R1` F26, CR-01) con el primer taladro del grupo: es un
 * cálculo de un solo taladro, apto para el hilo principal. La revisión completa del grupo corre en
 * el worker (`presplitChecks`).
 */
function GroupDesign({ group, blast }: { group: HoleGroup; blast: Blast }) {
  const t = useT();
  const fmt = useFormat();
  const { len, dia } = useUnits();
  const project = useProject();
  const rock = project.rockMasses.find((r) => r.id === blast.rockMassId);
  const holes = blast.holes.filter((h) => h.groupId === group.id);
  const first = holes[0];
  if (!first) return null;
  const lines: string[] = [];
  if (group.kind === 'presplit') {
    const p = presplitHole(first, project.library, rock);
    if (!p) return <p className="hint">{t('groups.presplit.noCharge')}</p>;
    lines.push(
      t('groups.presplit.pb', {
        pb: fmt(p.pb / 1e6, 1),
        ucs: rock ? fmt(rock.ucs / 1e6, 0) : '—',
        f: fmt(p.f, 4),
      }),
    );
    let spacing = Infinity;
    for (const h of holes)
      if (h !== first)
        spacing = Math.min(
          spacing,
          Math.hypot(h.collar.x - first.collar.x, h.collar.y - first.collar.y),
        );
    if (p.maxSpacing === null) lines.push(t('groups.presplit.noRt'));
    else if (Number.isFinite(spacing))
      lines.push(
        t('groups.presplit.spacing', {
          s: fmt(len.show(spacing), 2),
          e: fmt(len.show(p.maxSpacing), 2),
          u: len.unit,
        }),
      );
    if (p.chargeDiameterForUcs !== null)
      lines.push(
        t('groups.presplit.suggest', { d: fmt(dia.show(p.chargeDiameterForUcs), 2), u: dia.unit }),
      );
  } else {
    const productionGroups = new Set(
      blast.groups.filter((g) => g.kind === 'production').map((g) => g.id),
    );
    const prod = blast.holes.find(
      (h) => h.groupId !== undefined && productionGroups.has(h.groupId) && h.patternId,
    );
    const pattern = prod && blast.patterns.find((p) => p.id === prod.patternId);
    const lib = indexLibrary(project.library);
    const w = holeCharge(first, lib).explosive;
    const H = blast.bench.height;
    const prodKg = prod ? holeCharge(prod, lib).explosive : 0;
    if (!prod || !pattern || !rock || w <= 0 || prodKg <= 0)
      return <p className="hint">{t('groups.buffer.needProduction')}</p>;
    // FC de diseño de la producción con el volumen nominal B·S·H (P-06).
    const pf = prodKg / (pattern.burden * pattern.spacing * H * rock.density);
    const b = bufferBurden(w, pf, H, rock.density, pattern.spacing / pattern.burden);
    lines.push(
      t('groups.buffer.suggest', {
        b: fmt(len.show(b), 1),
        s: fmt(len.show(bufferSpacing(b)), 1),
        u: len.unit,
        w: fmt(w, 0),
        pf: fmt(pf * 1000, 3),
      }),
    );
  }
  return (
    <div className="hint">
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
      <div className="muted">{t('groups.source')}</div>
    </div>
  );
}
