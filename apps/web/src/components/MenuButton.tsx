import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onSelect: () => void;
}

/** Menús anclados al botón, fuera del scroll de la cinta. */
export function MenuButton({
  icon: Icon,
  label,
  displayLabel,
  items,
  showLabel = false,
}: {
  icon: LucideIcon;
  label: string;
  displayLabel?: string;
  items: MenuItem[];
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const menu = list.current;
      const button = trigger.current;
      if (!menu || !button) return;
      const anchor = button.getBoundingClientRect();
      const width = menu.getBoundingClientRect().width;
      const below = window.innerHeight - anchor.bottom - 12;
      const above = anchor.top - 12;
      const upwards = below < Math.min(menu.scrollHeight, 280) && above > below;
      const available = Math.max(48, upwards ? above : below);
      menu.style.maxHeight = `${available}px`;
      menu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
      menu.style.top = `${upwards ? Math.max(8, anchor.top - Math.min(menu.scrollHeight, available) - 4) : anchor.bottom + 4}px`;
    };
    position();
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    buttons?.[focusLast.current ? buttons.length - 1 : 0]?.focus({ preventScroll: true });
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !list.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="menu">
      <button
        ref={trigger}
        type="button"
        className={`icon-btn${open ? ' active' : ''}`}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          focusLast.current = false;
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            focusLast.current = event.key === 'ArrowUp';
            setOpen(true);
          }
        }}
      >
        <Icon size={18} strokeWidth={1.6} aria-hidden />
        {showLabel && <span>{displayLabel ?? label}</span>}
        {showLabel && <ChevronDown className="menu-chevron" size={12} aria-hidden />}
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            className="menu-list menu-popover"
            role="menu"
            aria-label={label}
            ref={list}
            onKeyDown={(event) => {
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
              );
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              let next: number | undefined;
              if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
              if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
              if (event.key === 'Home') next = 0;
              if (event.key === 'End') next = buttons.length - 1;
              if (next !== undefined) {
                event.preventDefault();
                buttons[next]?.focus();
              }
              if (event.key === 'Tab') {
                setOpen(false);
                trigger.current?.focus();
              }
            }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                  item.onSelect();
                }}
              >
                <item.icon size={16} aria-hidden />
                <span>
                  {item.label}
                  {item.hint && <small>{item.hint}</small>}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
