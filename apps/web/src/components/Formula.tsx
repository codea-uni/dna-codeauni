import { memo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/** HTML de KaTeX; null si la fórmula no se puede leer (se muestra el TeX en texto). */
export function renderTex(tex: string, display = true): string | null {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      output: 'htmlAndMathml',
      trust: false,
      // Un carácter fuera del estándar no debe tumbar la ventana entera (la Documentación
      // dejaba de cargar por una tilde en una fórmula): se avisa en consola y se dibuja igual.
      strict: 'warn',
      throwOnError: true,
    });
  } catch (error) {
    console.error('[formula]', tex, error);
    return null;
  }
}

/** Fórmula de referencia (contenido del programa, nunca del usuario). MathML para lectores. */
export const Formula = memo(function Formula({
  tex,
  label,
  className = 'docs-formula',
  display = true,
}: {
  tex: string;
  label: string;
  className?: string;
  display?: boolean;
}) {
  const html = renderTex(tex, display);
  if (html === null)
    return (
      <code className={`${className} formula-fallback`} role="group" aria-label={label}>
        {tex}
      </code>
    );
  return (
    <div
      className={className}
      role="group"
      aria-label={label}
      tabIndex={0}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
