import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Caché EXACTA del audio de `/api/ai/speech`: la clave es sha256(modelo + voz + texto), así que solo
 * se reutiliza el audio de exactamente el mismo texto («Listo, lo calculo», «¿Sí?», avisos fijos…).
 * Nunca por parecido. Un archivo por texto; al pasar del tope se borran los menos usados y los que
 * llevan más de `maxAgeDays` sin usarse.
 */
export interface CachedAudio {
  mimeType: string;
  data: string;
}

export class TtsCache {
  private sweeping = false;
  constructor(
    private readonly dir: string,
    private readonly maxBytes = 200 * 1024 * 1024,
    private readonly maxAgeDays = 30,
  ) {}

  static key(model: string, voice: string, text: string): string {
    return createHash('sha256').update(`${model}\n${voice}\n${text}`).digest('hex');
  }

  private file(key: string): string {
    return join(this.dir, `${key}.json`);
  }

  async get(key: string): Promise<CachedAudio | null> {
    try {
      const f = this.file(key);
      const value = JSON.parse(await readFile(f, 'utf8')) as CachedAudio;
      const now = new Date();
      await utimes(f, now, now).catch(() => undefined);
      return value.data ? value : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: CachedAudio): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(key), JSON.stringify(value));
    void this.sweep();
  }

  /** Borra lo vencido y, si aún pasa del tope, lo menos usado (por fecha de último uso). */
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const names = (await readdir(this.dir)).filter((n) => n.endsWith('.json'));
      const files = await Promise.all(
        names.map(async (n) => {
          const s = await stat(join(this.dir, n)).catch(() => null);
          return s ? { path: join(this.dir, n), size: s.size, used: s.mtimeMs } : null;
        }),
      );
      const limit = Date.now() - this.maxAgeDays * 86_400_000;
      let total = 0;
      const keep: { path: string; size: number; used: number }[] = [];
      for (const f of files) {
        if (!f) continue;
        if (f.used < limit) await rm(f.path, { force: true });
        else {
          keep.push(f);
          total += f.size;
        }
      }
      keep.sort((a, b) => a.used - b.used);
      for (const f of keep) {
        if (total <= this.maxBytes) break;
        await rm(f.path, { force: true });
        total -= f.size;
      }
    } catch {
      // Sin carpeta todavía o carrera con otro borrado: se intenta en la próxima escritura.
    } finally {
      this.sweeping = false;
    }
  }
}
