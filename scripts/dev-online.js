#!/usr/bin/env node
// `pnpm dev:online`: la app con login, empresas, minas e historial (D-14) en un solo comando.
//   1. PostgreSQL de desarrollo (docker-compose.dev.yml), si no está arriba.
//   2. apps/server/.env desde su plantilla, si no existe.
//   3. Datos de demostración (cuentas del README, empresas, minas y proyectos), si faltan.
//   4. API en :3000 (si ya hay una respondiendo, la reutiliza) y web en :5173 con VITE_API_URL=/api.
// Ctrl+C detiene lo que este comando levantó (PostgreSQL queda arriba para las pruebas).
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const WEB_PORT = 5173;
const API_URL = 'http://localhost:3000/api/health';

const log = (msg) => {
  console.log(`\x1b[36m[dev:online]\x1b[0m ${msg}`);
};

async function apiUp() {
  try {
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

// 1. PostgreSQL
const docker = spawnSync(
  'docker',
  ['compose', '-f', 'docker-compose.dev.yml', 'up', '-d', '--wait'],
  { cwd: root, stdio: 'inherit' },
);
if (docker.status !== 0) {
  log('No se pudo levantar PostgreSQL con Docker. ¿Está Docker corriendo?');
  process.exit(1);
}

// 2. Variables del servidor
const envFile = `${root}apps/server/.env`;
if (!existsSync(envFile)) {
  copyFileSync(`${root}apps/server/.env.example`, envFile);
  log('Creado apps/server/.env desde la plantilla (plataforma@cronos.local / admin-cronos-dev).');
}

// 3. Datos de demostración (idempotente: solo crea lo que falta)
const seed = spawnSync('pnpm', ['--filter', '@cronos/server', '--silent', 'seed-demo'], {
  cwd: root,
  stdio: 'inherit',
});
if (seed.status !== 0) log('No se pudieron cargar los datos de demostración; se sigue igual.');

// 4. API y web
const children = [];
const env = {
  ...process.env,
  VITE_API_URL: '/api',
  // El login solo se acepta desde el origen de la web.
  BETTER_AUTH_URL: `http://localhost:${WEB_PORT}`,
};

function run(name, color, args) {
  // Grupo de procesos propio: al detener se termina también lo que lanza pnpm (vite, tsx).
  const child = spawn('pnpm', args, {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) process.stdout.write(prefix + line + '\n');
    });
  }
  child.on('exit', (code) => {
    if (stopping) return;
    log(`${name} terminó (código ${code ?? 'señal'}); se detiene todo.`);
    stop(code ?? 1);
  });
  children.push(child);
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      // ya había terminado
    }
  }
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => {
  stop(0);
});
process.on('SIGTERM', () => {
  stop(0);
});

if (await apiUp()) log('Ya hay una API en :3000; se reutiliza.');
else run('api', '35', ['--filter', '@cronos/server', 'dev']);
run('web', '32', ['--filter', '@cronos/web', 'dev', '--port', String(WEB_PORT), '--strictPort']);
log(`Abre http://localhost:${WEB_PORT} (Ctrl+C para detener).`);
