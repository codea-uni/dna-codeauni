import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
  icon: LucideIcon;
  label: string;
  /** Segunda línea descriptiva (opcional). */
  hint?: string;
  onSelect: () => void;
}

/** Botón con ícono que despliega un menú corto (Esc o clic afuera lo cierra). */
export function MenuButton({
  icon: Icon,
  label,
  items,
}: {
  icon: LucideIcon;
  label: string;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={`icon-btn${open ? ' active' : ''}`}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <Icon size={17} strokeWidth={1.8} aria-hidden />
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              <it.icon size={15} aria-hidden />
              <span>
                {it.label}
                {it.hint && <small>{it.hint}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
