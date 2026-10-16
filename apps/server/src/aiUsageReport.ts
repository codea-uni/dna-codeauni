import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { priceOf, type UsageTokens } from './services/aiUsage';

/**
 * Resumen del registro de uso de la IA (`usage-AAAA-MM-DD.jsonl` en `AI_LOG_DIR`): llamadas,
 * tokens, costo y lo que ya se ahorró por día y tarea, para comprobar que el ahorro se da de verdad.
 *   pnpm --filter @cronos/server ai-usage [carpeta] [--desde AAAA-MM-DD]
 * En producción: docker compose exec api node dist/aiUsageReport.js
 *
 * «Ahorro» cuenta solo lo medido: tokens servidos por la caché implícita de Gemini (90 % de su
 * precio de entrada) y audios servidos desde la caché exacta de voz (al costo medio de los que sí
 * se pagaron ese día). El recorte del contexto de Live se ve en «entrada media por turno»:
 * comparar días con LIVE_CONTEXT_TRIGGER_TOKENS=0 contra días con el tope.
 */
interface Line {
  at: string;
  task: string;
  model: string;
  tokens?: UsageTokens;
  costUsd: number;
  cacheHit?: boolean;
  retried?: string;
  error?: string;
}

const args = process.argv.slice(2);
const since = args.includes('--desde') ? (args[args.indexOf('--desde') + 1] ?? '') : '';
const dir =
  args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--desde') ??
  process.env.AI_LOG_DIR ??
  'deploy/ai-logs';

const files = (await readdir(dir)).filter((f) => /^usage-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
const rows = new Map<string, Line[]>();
for (const f of files) {
  if (since && f.slice(6, 16) < since) continue;
  for (const raw of (await readFile(join(dir, f), 'utf8')).split('\n')) {
    if (!raw.trim()) continue;
    const l = JSON.parse(raw) as Line;
    const k = `${l.at.slice(0, 10)} ${l.task}`;
    rows.set(k, [...(rows.get(k) ?? []), l]);
  }
}

const usd = (n: number) => `$${n.toFixed(4)}`;
const table: Record<string, string | number>[] = [];
let total = 0;
let saved = 0;
for (const [k, ls] of [...rows].sort()) {
  const paid = ls.filter((l) => !l.cacheHit && l.tokens);
  const hits = ls.filter((l) => l.cacheHit).length;
  const cost = ls.reduce((s, l) => s + (l.costUsd || 0), 0);
  const sum = (f: keyof UsageTokens) => paid.reduce((s, l) => s + (l.tokens?.[f] ?? 0), 0);
  const cachedSaved = paid.reduce(
    (s, l) => s + ((l.tokens?.cached ?? 0) * priceOf(l.model).in * 0.9) / 1e6,
    0,
  );
  const hitSaved = paid.length ? (hits * cost) / paid.length : 0;
  total += cost;
  saved += cachedSaved + hitSaved;
  table.push({
    'día tarea': k,
    llamadas: ls.length,
    'de caché': hits,
    reintentos: ls.filter((l) => l.retried).length,
    errores: ls.filter((l) => l.error).length,
    'entrada media': paid.length ? Math.round(sum('in') / paid.length) : 0,
    'salida+razon.': sum('out') + sum('thinking'),
    '% cacheado': sum('in') ? `${Math.round((100 * sum('cached')) / sum('in'))} %` : '-',
    costo: usd(cost),
    ahorrado: usd(cachedSaved + hitSaved),
  });
}
console.table(table);
console.log(
  `Total ${usd(total)} · ahorrado medido ${usd(saved)} · sin las mejoras habría sido ${usd(total + saved)}`,
);
