/**
 * Las fuentes estándar de PDF (Helvetica) usan WinAnsi: Latin-1 más algunos signos. Todo lo que
 * no entre se reemplaza por un equivalente legible para que el PDF nunca falle al escribir texto.
 */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

const REPLACEMENTS: Record<string, string> = {
  '≥': '>=',
  '≤': '<=',
  '≈': '~',
  '−': '-',
  '→': '->',
  '←': '<-',
  '↔': '<->',
  α: 'alfa',
  β: 'beta',
  σ: 'sigma',
  ρ: 'rho',
  π: 'pi',
  '√': 'raíz ',
  '∞': 'inf.',
  γ: 'gamma',
  Δ: 'Delta',
  '⅓': '1/3',
  '⅜': '3/8',
  '″': '"',
  '′': "'",
  '✓': 'OK',
  '…': '...',
};

export function toWinAnsi(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 63;
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255) || WIN_ANSI_EXTRA.has(ch))
      out += ch;
    else if (ch === '\n' || ch === '\t') out += ' ';
    else out += REPLACEMENTS[ch] ?? '?';
  }
  return out;
}

/**
 * Número sin depender de Intl: es-ES (miles con punto, decimales con coma) o en-US (miles con
 * coma, decimales con punto).
 */
export function fmtNumber(v: number, decimals = 0, language: 'es' | 'en' = 'es'): string {
  if (!Number.isFinite(v)) return '-';
  const [thousands, point] = language === 'en' ? [',', '.'] : ['.', ','];
  const neg = v < 0;
  const [int = '0', dec] = Math.abs(v).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  return `${neg ? '-' : ''}${grouped}${dec ? `${point}${dec}` : ''}`;
}
