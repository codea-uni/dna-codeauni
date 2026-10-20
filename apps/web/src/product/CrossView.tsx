import type { ProjectSummary } from '@cronos/api';
import type { ProjectKind } from '@cronos/core';
import { ArrowLeft, Eye, FilePlus, FolderOpen, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { create } from 'zustand';
import { MenuButton, type MenuItem } from '../components/MenuButton';
import { useT } from '../i18n';
import { api } from '../server/api';
import { confirmLeave } from '../server/ProjectContext';
import { isCrossView, useProjectSession } from '../server/projectSession';
import { PRODUCT_ICON, PRODUCT_NAME, mineToolPath, otherKind, projectPath } from './product';

/** Nombre e ícono de la herramienta (Cronos Open Pit / Cronos Underground). */
export function ProductMark({ tool, short = false }: { tool: ProjectKind; short?: boolean }) {
  const t = useT();
  const Icon = PRODUCT_ICON[tool];
  return (
    <span className="product-mark" data-kind={tool} translate="no">
      <Icon size={15} aria-hidden />
      {/* `short`: junto a la palabra «Cronos» basta el nombre de la herramienta. */}
      {t(short ? `product.badge.${tool}` : PRODUCT_NAME[tool])}
    </span>
  );
}

/** Insignia del tipo de proyecto en las listas. */
export function KindBadge({ kind }: { kind: ProjectKind }) {
  const t = useT();
  const Icon = PRODUCT_ICON[kind];
  return (
    <span className="kind-badge" data-kind={kind} title={t(`product.kind.${kind}`)}>
      <Icon size={11} aria-hidden />
      {t(`product.badge.${kind}`)}
    </span>
  );
}

/** Diálogo «¿Quieres hacer un proyecto aquí?» de la visualización cruzada. */
export const useWorkDialog = create<{ open: boolean; show: (open: boolean) => void }>((set) => ({
  open: false,
  show: (open) => {
    set({ open });
  },
}));

/**
 * Banda de solo visualización: el proyecto es de la otra herramienta. Lleva el acento de la
 * herramienta del proyecto, «Trabajar aquí» (lleva a esa herramienta) y la vuelta a la propia.
 */
export function CrossViewBanner() {
  const t = useT();
  const navigate = useNavigate();
  const current = useProjectSession((s) => s.current);
  const show = useWorkDialog((s) => s.show);
  if (!current || !isCrossView(current)) return null;
  const Icon = PRODUCT_ICON[current.kind];
  return (
    <div className="cross-view-banner" data-kind={current.kind} role="status">
      <strong>
        <Eye size={14} aria-hidden />
        {t('product.crossView', { tool: t(PRODUCT_NAME[current.kind]) })}
        <Icon size={14} aria-hidden />
      </strong>
      <span className="muted">
        {t('product.crossViewHint', { current: t(PRODUCT_NAME[current.tool]) })}
      </span>
      <button
        className="cross-work"
        onClick={() => {
          show(true);
        }}
      >
        {t('product.workHere')}
      </button>
      <button
        onClick={() => {
          void navigate(mineToolPath(current.mine.id, current.tool));
        }}
      >
        <ArrowLeft size={14} aria-hidden />{' '}
        {t('product.backTo', { tool: t(PRODUCT_NAME[current.tool]) })}
      </button>
    </div>
  );
}

/**
 * «¿Quieres hacer un proyecto de perforación y voladura aquí? Esto se hace en Cronos …»: abre el
 * proyecto en su herramienta o lleva a crear uno nuevo de ese tipo en la misma mina.
 */
export function WorkHereDialog() {
  const t = useT();
  const navigate = useNavigate();
  const open = useWorkDialog((s) => s.open);
  const show = useWorkDialog((s) => s.show);
  const current = useProjectSession((s) => s.current);
  if (!open || !current || !isCrossView(current)) return null;
  const tool = t(PRODUCT_NAME[current.kind]);
  const close = () => {
    show(false);
  };
  const go = (to: string) => {
    close();
    void navigate(to);
  };
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t('product.workDialogTitle')}
      onClick={close}
    >
      <div
        className="modal work-dialog"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h2>{t('product.workDialogTitle')}</h2>
          <button className="icon" onClick={close} aria-label={t('product.keepViewing')}>
            <X size={16} />
          </button>
        </header>
        <p>{t('product.workDialogBody', { tool })}</p>
        <div className="actions">
          <button
            className="primary"
            onClick={() => {
              go(`/projects/${current.projectId}`);
            }}
          >
            <FolderOpen size={15} aria-hidden /> {t('product.openThere', { tool })}
          </button>
          <button
            onClick={() => {
              go(`${mineToolPath(current.mine.id, current.kind)}&new=1`);
            }}
          >
            <FilePlus size={15} aria-hidden /> {t('product.createThere', { tool })}
          </button>
          <button onClick={close}>{t('product.keepViewing')}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * «Ver proyectos subterráneos / superficiales de esta mina»: los proyectos de la otra herramienta
 * de la misma mina, para abrirlos solo para visualizarlos.
 */
export function OtherToolProjects() {
  const t = useT();
  const navigate = useNavigate();
  const mineId = useProjectSession((s) => s.current?.mine.id);
  const tool = useProjectSession((s) => s.current?.tool);
  const projectId = useProjectSession((s) => s.current?.projectId);
  const [loaded, setLoaded] = useState<{ mineId: string; list: ProjectSummary[] } | null>(null);
  useEffect(() => {
    if (!mineId) return;
    let alive = true;
    api.projects(mineId).then(
      (list) => {
        if (alive) setLoaded({ mineId, list });
      },
      () => {
        if (alive) setLoaded({ mineId, list: [] });
      },
    );
    return () => {
      alive = false;
    };
  }, [mineId, projectId]);
  if (!mineId || !tool) return null;
  const other = otherKind(tool);
  const list = loaded?.mineId === mineId ? loaded.list : null;
  const OtherIcon = PRODUCT_ICON[other];
  const items: MenuItem[] = [
    ...(list ?? [])
      .filter((p) => p.kind === other && p.id !== projectId)
      .map((p): MenuItem => ({
        icon: Eye,
        label: p.name,
        hint: t('product.crossView', { tool: t(PRODUCT_NAME[other]) }),
        onSelect: () => {
          if (confirmLeave()) void navigate(projectPath(p.id, p.kind, tool));
        },
      })),
    {
      icon: OtherIcon,
      label:
        list === null
          ? t('product.othersLoading')
          : t('product.goToMine', { tool: t(PRODUCT_NAME[other]) }),
      onSelect: () => {
        if (confirmLeave()) void navigate(mineToolPath(mineId, other));
      },
    },
  ];
  return <MenuButton icon={OtherIcon} label={t(`product.viewOthers.${other}`)} items={items} />;
}
