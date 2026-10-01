#!/usr/bin/env node
/**
 * Graba el tráiler de la app a 1920×1080 / 30 fps, con CDP y WebSocket nativo (Node >=24).
 *   node scripts/record-trailer.js [--url http://localhost:5173] [--output artifacts/cronos-trailer.mp4]
 *   --mode virtual (predeterminado) avanza 1/30 s por PNG; --mode realtime usa screencast y timestamps.
 *   --seconds 10 permite una grabación corta; --overwrite reemplaza una salida existente.
 * Sin --url inicia pnpm dev en un puerto libre. CHROMIUM_PATH permite elegir el navegador.
 *
 * Linux sin NSS: descargar y extraer librerías sin instalarlas en el sistema:
 *   mkdir -p artifacts/browser-libs
 *   cd artifacts/browser-libs
 *   apt-get download libnss3 libnspr4
 *   dpkg-deb -x libnss3_*.deb .
 *   dpkg-deb -x libnspr4_*.deb .
 * Después: CHROMIUM_LIBRARY_PATH=<ruta absoluta>/usr/lib/x86_64-linux-gnu node scripts/record-trailer.js
 * Requiere Chromium headless de Playwright en caché y ffmpeg en PATH; no requiere el paquete Playwright.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), '.cache/ms-playwright');
  const versions = readdirSync(cache).filter((v) => /^chromium_headless_shell-\d+$/.test(v));
  versions.sort((a, b) => Number(b.split('-').at(-1)) - Number(a.split('-').at(-1)));
  for (const v of versions) {
    const binary = join(cache, v, 'chrome-headless-shell-linux64/chrome-headless-shell');
    if (existsSync(binary)) return binary;
  }
  throw new Error('No se encontró Chromium headless. Define CHROMIUM_PATH.');
}

/** Navegador aislado; no reutiliza cookies, proyectos ni procesos del usuario. */
export async function openBrowser({ width = 1920, height = 1080 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'cronos-trailer-'));
  const libs =
    process.env.CHROMIUM_LIBRARY_PATH ??
    join(root, 'artifacts/browser-libs/usr/lib/x86_64-linux-gnu');
  const chrome = spawn(
    chromiumPath(),
    [
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      '--no-sandbox',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-begin-frame-control',
      '--run-all-compositor-stages-before-draw',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      'about:blank',
    ],
    {
      env: {
        ...process.env,
        LD_LIBRARY_PATH: [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  let diagnostics = '';
  let socket;
  try {
    const endpoint = await new Promise((resolveEndpoint, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Chromium no arrancó: ${diagnostics}`)),
        15000,
      );
      chrome.once('error', reject);
      chrome.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Chromium terminó (${code}): ${diagnostics}`));
      });
      chrome.stderr.on('data', (chunk) => {
        diagnostics = (diagnostics + chunk.toString()).slice(-5000);
        const match = diagnostics.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) {
          clearTimeout(timer);
          resolveEndpoint(match[1]);
        }
      });
    });
    const origin = new URL(endpoint);
    const targets = await (await fetch(`http://${origin.host}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('Chromium no creó una página.');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await once(socket, 'open');
    let nextId = 0;
    const pending = new Map();
    const listeners = new Map();
    const errors = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const task = pending.get(message.id);
        if (!task) return;
        pending.delete(message.id);
        clearTimeout(task.timer);
        if (message.error) task.reject(new Error(`${task.method}: ${message.error.message}`));
        else task.resolve(message.result);
      } else {
        for (const fn of listeners.get(message.method) ?? []) fn(message.params);
      }
    });
    const send = (method, params = {}) =>
      new Promise((resolveCommand, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }, 30000);
        pending.set(id, { resolve: resolveCommand, reject, timer, method });
        socket.send(JSON.stringify({ id, method, params }));
      });
    const on = (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name).delete(fn);
    };
    on('Runtime.exceptionThrown', (p) =>
      errors.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text),
    );
    on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') errors.push(p.args.map((a) => a.value ?? a.description).join(' '));
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    return {
      send,
      on,
      errors,
      evaluate: async (expression) => {
        const result = await send('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (result.exceptionDetails)
          throw new Error(
            result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
          );
        return result.result.value;
      },
      close: () => {
        for (const task of pending.values()) {
          clearTimeout(task.timer);
          task.reject(new Error('Navegador cerrado.'));
        }
        pending.clear();
        socket.close();
        chrome.kill('SIGTERM');
        const force = setTimeout(() => chrome.kill('SIGKILL'), 2000);
        force.unref();
        chrome.once('exit', () => clearTimeout(force));
      },
    };
  } catch (err) {
    socket?.close();
    chrome.kill('SIGTERM');
    throw err;
  }
}

export async function waitFor(browser, expression, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await browser.evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`La página no estuvo lista: ${expression}`);
}

export async function startTrailer(browser, url) {
  await browser.send('Page.navigate', { url });
  await waitFor(browser, `!!document.querySelector('button[aria-label="Videos"]')`);
  await browser.evaluate(`document.querySelector('button[aria-label="Videos"]').click()`);
  await browser.evaluate(`(() => {
    const item = [...document.querySelectorAll('[role="menuitem"]')].find(b => /Tráiler|Trailer/.test(b.textContent));
    if (!item) throw new Error('No se encontró el tráiler en el menú de videos.');
    item.click();
  })()`);
  await browser.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', {key:' '}))`);
  await waitFor(browser, `document.querySelector('.demo-root.trailer')?.dataset.ready === 'true'`);
}

async function record() {
  const { values } = parseArgs({
    options: {
      url: { type: 'string' },
      output: { type: 'string', default: 'artifacts/cronos-trailer.mp4' },
      mode: { type: 'string', default: 'virtual' },
      seconds: { type: 'string', default: '58' },
      overwrite: { type: 'boolean', default: false },
    },
  });
  if (!['virtual', 'realtime'].includes(values.mode))
    throw new Error('--mode debe ser virtual o realtime.');
  const seconds = Number(values.seconds);
  if (!(seconds > 0 && seconds <= 300)) throw new Error('--seconds debe estar entre 0 y 300.');
  const output = resolve(values.output);
  if (existsSync(output) && !values.overwrite)
    throw new Error(`La salida ya existe: ${output}. Usa --overwrite.`);
  mkdirSync(dirname(output), { recursive: true });
  const work = mkdtempSync(join(dirname(output), '.cronos-record-'));
  const encoding = join(work, 'video.mp4');
  const stills = output.replace(/\.mp4$/i, '') + '-frames';
  mkdirSync(stills, { recursive: true });
  let web;
  let browser;
  let encoder;
  let encodeError = '';
  try {
    let url = values.url;
    if (!url) {
      web = spawn(
        'pnpm',
        ['--filter', '@cronos/web', 'dev', '--host', '127.0.0.1', '--port', '5180'],
        { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      url = await new Promise((resolveUrl, reject) => {
        const timer = setTimeout(() => reject(new Error('Vite no arrancó.')), 20000);
        web.once('error', reject);
        web.stdout.on('data', (chunk) => {
          const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+\//);
          if (match) {
            clearTimeout(timer);
            resolveUrl(match[0]);
          }
        });
        web.stderr.on('data', (chunk) => process.stderr.write(chunk));
      });
    }
    browser = await openBrowser();
    await startTrailer(browser, url);
    const total = Math.ceil(seconds * 30);
    encoder = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        values.overwrite ? '-y' : '-n',
        '-f',
        'image2pipe',
        '-framerate',
        '30',
        '-i',
        'pipe:0',
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        encoding,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    encoder.stderr.on('data', (chunk) => {
      encodeError = (encodeError + chunk.toString()).slice(-3000);
    });
    encoder.stdin.on('error', (err) => {
      encodeError += String(err);
    });
    const encoded = new Promise((resolveEncode, reject) => {
      encoder.once('error', reject);
      encoder.once('exit', (code) =>
        code === 0 ? resolveEncode() : reject(new Error(`ffmpeg (${code}): ${encodeError}`)),
      );
    });
    // La promesa puede fallar mientras se captura; se consulta de nuevo al terminar.
    void encoded.catch((err) => {
      encodeError = String(err);
    });
    const write = async (data) => {
      if (encoder.exitCode !== null) throw new Error(`ffmpeg terminó: ${encodeError}`);
      if (!encoder.stdin.write(data)) await once(encoder.stdin, 'drain');
    };
    let frames = 0;
    const scenes = new Map();
    const noteScene = async (data) => {
      const state = await browser.evaluate(
        `({step:document.querySelector('.demo-root.trailer')?.dataset.step,caption:document.querySelector('.demo-caption p')?.textContent})`,
      );
      if (state.step === undefined)
        throw new Error(`El tráiler terminó antes de tiempo: ${browser.errors.join('\n')}`);
      if (!scenes.has(state.step)) {
        const name = join(stills, `scene-${state.step}.png`);
        writeFileSync(name, data);
        scenes.set(state.step, { frame: frames, ...state });
        console.log(`Escena ${Number(state.step) + 1}: ${state.caption}`);
      }
    };
    if (values.mode === 'virtual') {
      // Congela timers y performance.now; cada presupuesto equivale a un frame del MP4.
      await browser.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
      await browser.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', {key:' '}))`);
      while (frames < total) {
        const expired = new Promise((r) => {
          const timeout = setTimeout(() => {
            off();
            r(false);
          }, 10000);
          const off = browser.on('Emulation.virtualTimeBudgetExpired', () => {
            off();
            clearTimeout(timeout);
            r(true);
          });
        });
        await browser.send('Emulation.setVirtualTimePolicy', {
          policy: 'pauseIfNetworkFetchesPending',
          budget: 1000 / 30,
          maxVirtualTimeTaskStarvationCount: 100,
        });
        if (!(await expired)) throw new Error('El tiempo virtual se bloqueó. Usa --mode realtime.');
        const state = await browser.evaluate(
          `({step:document.querySelector('.demo-root.trailer')?.dataset.step,ready:document.querySelector('.demo-root.trailer')?.dataset.ready})`,
        );
        if (state.step === undefined) {
          if (scenes.size === 6 && frames >= total - 30) break;
          throw new Error(`El tráiler se interrumpió: ${browser.errors.join('\n')}`);
        }
        if (state.ready !== 'true') {
          await sleep(10);
          continue;
        }
        const shot = await browser.send('HeadlessExperimental.beginFrame', {
          screenshot: { format: 'png' },
          interval: 1000 / 30,
        });
        if (!shot.screenshotData) throw new Error('Chromium no devolvió el fotograma.');
        const data = Buffer.from(shot.screenshotData, 'base64');
        await write(data);
        if (frames % 15 === 0) await noteScene(data);
        if (frames % 300 === 0) console.log(`${frames}/${total} frames`);
        frames++;
      }
    } else {
      // SwiftShader puede emitir menos de 30 fps: duplica según timestamps, sin acelerar el video.
      const queue = [];
      const off = browser.on('Page.screencastFrame', (p) => {
        queue.push(p);
        void browser.send('Page.screencastFrameAck', { sessionId: p.sessionId });
      });
      await browser.send('Page.startScreencast', {
        format: 'png',
        maxWidth: 1920,
        maxHeight: 1080,
        everyNthFrame: 1,
      });
      await browser.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', {key:' '}))`);
      let first;
      let previous;
      while (frames < total) {
        if (!queue.length) {
          await sleep(10);
          continue;
        }
        const shot = queue.shift();
        const stamp = shot.metadata.timestamp;
        first ??= stamp;
        const until = Math.min(total, Math.round((stamp - first) * 30));
        const data = Buffer.from(shot.data, 'base64');
        for (; frames < until; frames++) await write(previous ?? data);
        previous = data;
        await noteScene(data);
      }
      await browser.send('Page.stopScreencast');
      off();
    }
    encoder.stdin.end();
    await encoded;
    if (browser.errors.length)
      throw new Error(`Errores del navegador: ${browser.errors.join('\n')}`);
    // Cada ejecución codifica por separado: una captura anterior nunca escribe sobre otra.
    // Valida todos los frames, no solo los metadatos del contenedor MP4.
    const validation = spawn(
      'ffmpeg',
      ['-v', 'error', '-xerror', '-i', encoding, '-f', 'null', '-'],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let invalid = '';
    validation.stderr.on('data', (chunk) => {
      invalid = (invalid + chunk.toString()).slice(-3000);
    });
    await new Promise((resolveValidation, reject) => {
      validation.once('error', reject);
      validation.once('exit', (code) =>
        code === 0 ? resolveValidation() : reject(new Error(`MP4 inválido (${code}): ${invalid}`)),
      );
    });
    if (existsSync(output) && !values.overwrite) throw new Error(`La salida ya existe: ${output}.`);
    renameSync(encoding, output);
    writeFileSync(
      output.replace(/\.mp4$/i, '') + '.json',
      JSON.stringify(
        {
          width: 1920,
          height: 1080,
          fps: 30,
          frames,
          seconds: frames / 30,
          mode: values.mode,
          scenes: [...scenes.values()],
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`Video listo: ${output} (${frames / 30} s, 30 fps)`);
  } finally {
    browser?.close();
    if (encoder && encoder.exitCode === null) {
      encoder.stdin.destroy();
      encoder.kill('SIGTERM');
    }
    if (web?.pid) process.kill(-web.pid, 'SIGTERM');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await record().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
