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
| Decimales | Escribe `6,5`, `6.5`, `1.234,5`, `1,234.5` y `7,25 m` en «Generar malla» y registra qué muestra el campo y si quedó inválido. Comprueba si ↑ incrementa el valor |
| Teclado | Si Esc cierra la ventana, si el diálogo «Ajustes del proyecto» recibe el foco al abrirse y si Esc lo cierra |
| Pantallas | 1440×900, 1280×720 y 1024×768: captura y desbordamiento horizontal |

Para un cambio en otra pantalla, añade al script los pasos que llegan a ella siguiendo el mismo patrón: rol y nombre accesible, nunca selectores CSS frágiles.

## Línea base (2026-11-18, antes de cualquier rediseño)

Úsala para el antes y el después. Si un valor empeora, es una regresión.

| Comprobación | Línea base |
|---|---|
| axe | 1 crítica: `aria-required-attr` en `.sidebar-resize`, en todas las pestañas |
| `6,5` | Se acepta, pero el campo lo muestra como `6.5`; los resultados de al lado usan coma |
| `1.234,5` y `7,25 m` | Inválidos (solo borde rojo) |
| ↑ en un campo numérico | No hace nada |
| Esc en una ventana flotante | No la cierra |
| Ajustes del proyecto | No recibe el foco y Esc no lo cierra |
| 1024×768 | Sin desbordamiento horizontal |
| Errores JS | 0 |

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
