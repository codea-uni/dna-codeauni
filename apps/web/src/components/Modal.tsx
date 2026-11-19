import { useRef, type ReactNode } from 'react';
import { useDialogFocus } from './useDialogFocus';

/**
 * Diálogo modal común: fondo, foco adentro al abrir y de vuelta al cerrar, Tab atrapado y Esc
 * cierra (cronos-ux-interfaz, accesibilidad). `closeOnBackdrop` en false para diálogos con un
 * trabajo a medias (importaciones), donde un clic fuera no debe descartarlo.
 */
export function Modal({
  label,
  onClose,
  className,
  closeOnBackdrop = true,
  children,
}: {
  label: string;
  onClose: () => void;
  className?: string;
  closeOnBackdrop?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useDialogFocus(ref, onClose);
  return (
    <div className="modal-backdrop" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        ref={ref}
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
}
