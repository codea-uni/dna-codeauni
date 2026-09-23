import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Qué se muestra si el contenido falla. */
  fallback?: ReactNode;
}

/** Aísla fallos de un bloque (p.ej. un gráfico con carga diferida) para que no tumben la app. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('[ui]', error);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <p className="hint warn">
            No se pudo mostrar este bloque.{' '}
            <button
              className="icon"
              onClick={() => {
                this.setState({ failed: false });
              }}
            >
              Reintentar
            </button>
          </p>
        )
      );
    }
    return this.props.children;
  }
}
