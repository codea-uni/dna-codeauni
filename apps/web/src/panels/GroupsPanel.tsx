import type { HoleGroupKind } from '@cronos/core';
import { Crosshair, Trash2, UserMinus, UserPlus } from 'lucide-react';
import * as actions from '../actions';
import { TextCell } from '../components/CellInput';
import { IconButton } from '../components/IconButton';
import { useActiveBlast, useSelectionIds } from '../hooks/useDocument';
import { useT } from '../i18n';

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
              <tr key={g.id}>
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
