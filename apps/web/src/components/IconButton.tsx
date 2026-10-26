import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface IconButtonProps {
  icon: LucideIcon;
  /** Nombre de la acción (tooltip y lector de pantalla). */
  label: string;
  displayLabel?: string;
  /** Atajo de teclado; se muestra en el botón y en el tooltip. */
  shortcut?: string;
  /** Detalle extra del tooltip. */
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  /** Muestra el texto junto al ícono. */
  showLabel?: boolean;
  className?: string;
  /** Ancla del agente guía (`data-guide`), ver guide/targets.ts. */
  guide?: string;
  onClick: () => void;
  children?: ReactNode;
}

/** Botón con ícono; el atajo aparece como insignia y en el tooltip. */
export function IconButton({
  icon: Icon,
  label,
  displayLabel,
  shortcut,
  hint,
  active,
  disabled,
  showLabel,
  className,
  guide,
  onClick,
}: IconButtonProps) {
  const title = [shortcut ? `${label} (${shortcut})` : label, hint].filter(Boolean).join('\n');
  return (
    <button
      type="button"
      className={`icon-btn${active ? ' active' : ''}${showLabel ? ' with-label' : ''}${className ? ` ${className}` : ''}`}
      title={title}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      data-guide={guide}
      onClick={onClick}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden />
      {showLabel && <span>{displayLabel ?? label}</span>}
      {shortcut && shortcut.length <= 2 && <kbd>{shortcut}</kbd>}
    </button>
  );
}
