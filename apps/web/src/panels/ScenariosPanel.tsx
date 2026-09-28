import { commands, type ScenarioKpis } from '@cronos/core';
import { ClipboardCopy, GitCompare, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '../components/IconButton';
import { useActiveBlast, useProject } from '../hooks/useDocument';
import { useT, type MessageKey } from '../i18n';
import { getCompute, session } from '../session';

const fmt = (v: number | null, d = 0) =>
  v === null || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

/** Filas de la comparación: etiqueta y valor presentado. */
const ROWS: [MessageKey, (k: ScenarioKpis) => string][] = [
  ['scenarios.kpi.holes', (k) => `${String(k.holes)} (${String(k.loadedHoles)})`],
  ['scenarios.kpi.explosive', (k) => fmt(k.explosive)],
  ['scenarios.kpi.drilled', (k) => fmt(k.drilledLength)],
  ['scenarios.kpi.loadingFactor', (k) => fmt(k.loadingFactor, 3)],
  [
    'scenarios.kpi.powderFactor',
    (k) => fmt(k.powderFactor === null ? null : k.powderFactor * 1000, 3),
  ],
  [
    'scenarios.kpi.energyFactor',
    (k) => fmt(k.energyFactor === null ? null : k.energyFactor / 1000, 3),
  ],
  ['scenarios.kpi.duration', (k) => fmt(k.duration === null ? null : k.duration * 1000)],
  ['scenarios.kpi.mic', (k) => fmt(k.mic)],
  ['scenarios.kpi.micExtended', (k) => fmt(k.micExtended)],
  [
    'scenarios.kpi.ppv',
    (k) => (k.maxPpv ? `${fmt(k.maxPpv.value * 1000, 1)} (${k.maxPpv.point})` : '—'),
  ],
  ['scenarios.kpi.exceedances', (k) => String(k.exceedances)],
  ['scenarios.kpi.checks', (k) => `${String(k.errors)} / ${String(k.warnings)}`],
];

/** Escenarios (H-701, R-23): guardar variantes del diseño y compararlas lado a lado. */
export function ScenariosPanel() {
  const t = useT();
  const project = useProject();
  const blast = useActiveBlast();
  const [kpis, setKpis] = useState<ScenarioKpis[] | null>(null);
  const [busy, setBusy] = useState(false);
  if (!blast) return null;
  const scenarios = project.scenarios ?? [];

  const save = () => {
    const name = window.prompt(
      t('scenarios.namePrompt'),
      t('scenarios.defaultName', { n: scenarios.length + 1 }),
    );
    if (!name?.trim()) return;
    session.document.dispatch(
      commands.saveScenario(session.document, blast.id, name.trim()),
      t('scenarios.save'),
    );
    setKpis(null);
  };

  const compare = async () => {
    setBusy(true);
    try {
      const designs = [
        { name: t('scenarios.current'), blast },
        ...scenarios.map((s) => ({ name: s.name, blast: { ...s.blast, id: blast.id } })),
      ];
      setKpis(await getCompute().api.compareScenarios(session.document.project, designs));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>{t('scenarios.title')}</h2>
      <p className="hint">{t('scenarios.hint')}</p>
      <button className="primary" onClick={save}>
        {t('scenarios.save')}
      </button>
      {scenarios.length === 0 ? (
        <p className="muted">{t('scenarios.none')}</p>
      ) : (
        <table className="grid-table compact">
          <tbody>
            {scenarios.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className="muted">{new Date(s.savedAt).toLocaleString()}</td>
                <td className="num">{s.blast.holes.length}</td>
                <td>
                  <IconButton
                    icon={Upload}
                    label={t('scenarios.load')}
                    onClick={() => {
                      if (!window.confirm(t('scenarios.loadConfirm', { name: s.name }))) return;
                      session.document.dispatch(
                        commands.loadScenario(session.document, blast.id, s.id),
                        `${t('scenarios.load')}: ${s.name}`,
                      );
                      setKpis(null);
                    }}
                  />
                  <IconButton
                    icon={Trash2}
                    label={t('scenarios.remove')}
                    onClick={() => {
                      session.document.dispatch(
                        commands.removeScenario(session.document, s.id),
                        `${t('scenarios.remove')}: ${s.name}`,
                      );
                      setKpis(null);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button disabled={busy || scenarios.length === 0} onClick={() => void compare()}>
        <GitCompare size={14} aria-hidden />{' '}
        {busy ? t('scenarios.computing') : t('scenarios.compare')}
      </button>
      {kpis && (
        <button
          onClick={() => {
            // Tabla copiable a hoja de cálculo (03 §4)
            const rows = [
              ['', ...kpis.map((k) => k.name)],
              ...ROWS.map(([label, value]) => [t(label), ...kpis.map(value)]),
            ];
            void navigator.clipboard.writeText(rows.map((r) => r.join('\t')).join('\n'));
          }}
        >
          <ClipboardCopy size={14} aria-hidden /> {t('scenarios.copy')}
        </button>
      )}
      {kpis && (
        <div className="table-scroll">
          <table className="grid-table compact">
            <thead>
              <tr>
                <th />
                {kpis.map((k, i) => (
                  <th key={i}>{k.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, value]) => {
                const base = kpis[0] ? value(kpis[0]) : '';
                return (
                  <tr key={label}>
                    <td>{t(label)}</td>
                    {kpis.map((k, i) => {
                      const v = value(k);
                      return (
                        <td key={i} className={`num${i > 0 && v !== base ? ' warn' : ''}`}>
                          {v}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
