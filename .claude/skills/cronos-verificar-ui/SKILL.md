---
name: cronos-verificar-ui
description: Úsala cuando haya que comprobar en el navegador una pantalla o un cambio visible de Cronos (apps/web) antes de darlo por terminado, al auditar la interfaz actual, al comparar antes/después de un rediseño, o al sacar capturas para el manual (E2.1) o el registro de hallazgos (E2.2) — incluye accesibilidad automática (axe, WCAG 2.2 AA), prueba de decimales, teclado (Esc, foco) y tamaños de pantalla. Keywords - verificar UI, captura, screenshot, Playwright, axe, accesibilidad, auditoría, antes y después.
---

# Cronos · Verificar la interfaz

## Principio

Un cambio de UI no está terminado porque compile. Está terminado cuando **se vio funcionando con datos reales**, con evidencia del antes y el después: capturas, violaciones de axe y comprobaciones de teclado y decimales.

## Preparación (una vez por máquina)

1. **Node 24.** El proyecto lo exige (`.nvmrc`). Si `node -v` muestra una versión menor, usa un Node 24 portable y anteponlo al `PATH` solo en esa sesión de terminal.
   - En esta máquina está en `%USERPROFILE%\tools\node-v24.22.3-win-x64`.
   - PowerShell: `$env:PATH="$HOME\tools\node-v24.22.3-win-x64;$env:PATH"`.
   - Para pnpm, `corepack enable`.
2. **Dependencias del repo:** `pnpm install --frozen-lockfile`.
3. **Playwright fuera del repo**, para no tocar el lockfile ni la regla de usar solo pnpm. Instálalo en una carpeta del scratchpad:
   ```
   npm init -y
   npm i playwright @axe-core/playwright
   npx playwright install chromium
   ```
   Copia ahí `scripts/ui-check.cjs`; Node resuelve los módulos desde la carpeta del script.

## Ejecución

1. Arranca `pnpm dev` en segundo plano. Espera la línea `Local: http://localhost:5173/`.
2. Ejecuta `node ui-check.cjs --out <carpeta>`. Opciones:
   - `--base`: otra URL;
   - `--example`: el título de otro ejemplo del menú Ejemplos. El de por defecto es «Producción estándar», con 251 taladros.
3. **Mira las capturas** con la herramienta de lectura de imágenes, al menos la de la pestaña tocada y la de 1280×720. Los números solos no bastan: los solapamientos y los recortes solo se ven en la imagen.

### Qué comprueba el script

| Bloque | Comprobación |
|---|---|
| Carga | Ejemplo cargado: la barra de estado muestra «N taladros». Errores JS (`pageerror`) |
| Cinta | Captura y axe (WCAG 2.2 AA) de las 8 pestañas |
| Decimales | Escribe `6,5`, `6.5`, `1.234,5`, `1,234.5` y `7,25 m` en el **Burden** de «Generar malla» y registra qué muestra el campo y si quedó inválido. Comprueba si ↑ incrementa el valor. (La altura de banco no sirve: con taladros, cambiarla abre «Taladros existentes».) |
| Teclado | Si Esc cierra la ventana, si el diálogo «Ajustes del proyecto» recibe el foco al abrirse y si Esc lo cierra |
| Pantallas | 1440×900, 1280×720 y 1024×768: captura y desbordamiento horizontal |

Para un cambio en otra pantalla, añade al script los pasos que llegan a ella siguiendo el mismo patrón: rol y nombre accesible, nunca selectores CSS frágiles.

## Línea base vigente (2026-11-18, rama `feat/ux-rediseno-sub`, sobre `subterranea`)

Úsala para el antes y el después. **Si un valor empeora, es una regresión.**

| Comprobación | Esperado |
|---|---|
| axe (8 pestañas del editor y páginas del servidor) | 0 violaciones |
| `6,5` y `6.5` | Se aceptan y el campo muestra `6,5` |
| `1.234,5` y `1,234.5` | Se aceptan como 1234,5 |
| `7,25 m` en el Burden | Se acepta como 7,25 (la unidad del campo es m) |
| ↑ en un campo numérico | Incrementa |
| Esc en una ventana flotante | La cierra |
| Ajustes del proyecto | Recibe el foco al abrirse y Esc lo cierra |
| 1440, 1280 y 1024 px | Sin desbordamiento horizontal |
| Errores JS | 0 |

El script **no pulsa Esc entre un valor y otro**: con el campo ya confirmado, Esc cierra la ventana.

## Modo servidor sin base de datos

Sin Docker, `pnpm dev:online` no arranca. Para ver las páginas del servidor (minas, historial, administración):

1. Arranca un segundo Vite en modo servidor, **desde PowerShell**.
   - `$env:VITE_API_URL='/api'; pnpm --dir apps/web exec vite --port 5174 --strictPort`.
   - Desde Git Bash, `/api` se convierte en `C:/Program Files/Git/api` y la app muestra «Sin conexión con el servidor» (en la consola: `Fetch API cannot load file:///…/api/me`).
   - Si el puerto quedó tomado por un Vite anterior, ciérralo antes: con `--strictPort` el nuevo falla en vez de abrir otro puerto.
2. Ejecuta `node scripts/server-mock.cjs /mines/m1 mina [ancho alto]`.
   - Intercepta solo las rutas que **empiezan** por `/api/`. Con un patrón `**/api/**` también se capturan módulos de Vite (`/@fs/.../packages/api/...`).
   - En Git Bash antepón `MSYS_NO_PATHCONV=1`; si no, `/mines/m1` se convierte en una ruta de Windows.
3. Si la salida lista rutas en `missing`, agrega datos que cumplan el esquema Zod de `packages/api/src`.
4. **Login y pantallas sin sesión:** antepón `MOCK_SIGNED_OUT=1`. Así `/api/me` responde 401 y se muestra el login.
   - Revísalo a 1440 px y a 390 px.
5. **Subterránea:** agrega `?tool=underground` a la ruta de la mina para ver el acento cobre.
   - Comprueba el botón de mostrar contraseña (`aria-pressed`) y el cambio de idioma.

## Contraste

Ejecuta `node scripts/contrast.cjs "#primer-plano" "#fondo"` antes de aceptar un color nuevo. El mínimo es 4,5:1 para texto y 3:1 para bordes de controles y foco.

## Lo que el script no cubre (hazlo a mano)

- **Rendimiento:** en Chromium sin ventana, el WebGL es SwiftShader (por software) y la barra muestra «— fps». Los 60 fps con 5.000 taladros se miden en un Chrome real.
- **Idioma:** cambia a inglés en Ajustes y busca textos en español que no se tradujeron (H-802).
- **Recorrido completo con teclado:** Tab por toda la pantalla, buscando foco visible y un orden lógico.
- **Lector de pantalla:** NVDA, en el panel tocado.
- **Contraste de lo que dibuja el visor** (taladros, etiquetas): axe no ve dentro del canvas.

## Informe

Entrega una tabla con el formato del registro E2.2 (`docs/ROADMAP.md`):

| Pantalla | Hallazgo | Evidencia (captura o archivo:línea) | Severidad (alta/media/baja) |
|---|---|---|---|

Añade el antes y el después de las violaciones de axe y de la línea base. Nunca declares el cambio verificado si no viste las capturas.
