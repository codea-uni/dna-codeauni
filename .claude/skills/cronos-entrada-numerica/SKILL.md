---
name: cronos-entrada-numerica
description: Úsala cuando agregues, cambies o revises en Cronos (apps/web) un campo donde el usuario escribe un número, una celda numérica de tabla, una cifra mostrada con unidad, o cualquier conversión de unidades de presentación (m/ft, mm/in, kg/lb) — incluido decimales con coma o punto, precisión de visualización, pegar desde Excel, valores inválidos, flechas para incrementar y selección con valores mixtos. Keywords - NumberField, NumberCell, CellInput, useFormat, useUnits, decimal, coma, punto, parse, toFixed, input type number, unidades.
---

# Cronos · Entrada numérica, decimales y unidades

## Principio

El ingeniero escribe cifras todo el día y con prisa. Un campo numérico debe:

- **aceptar lo que el usuario escribe** en su idioma;
- **mostrar las cifras igual que los resultados** que tiene al lado;
- **no cambiar nunca el dato** que el usuario no tocó.

## Reglas del dato

- **Dentro del sistema todo está en SI** (m, kg, s, rad). La conversión ocurre solo al mostrar y al leer.
  - Se hace con `hooks/useUnits.ts`: `len`, `area`, `volume` y `dia`, cada uno con `show`, `parse` y `unit`.
  - Si falta una magnitud (ms/m, lb, ft en la leyenda), agrégala a `useUnits`. No conviertas a mano en el componente.
- **Redondear es cosa de la presentación.** El motor nunca redondea.
  - Si el texto del campo no cambió, no se hace commit: un 6,4999 que se muestra como «6,50» sigue valiendo 6,4999. `NumberField` ya lo respeta y hay que conservarlo.
- **Prohibido usar `<input type="number">`.** Hace commit con cada tecla y trata la coma distinto según el navegador. Ya no queda ninguno en `apps/web`; búscalo con grep antes de entregar.

## Qué componente usar (ya implementados)

| Caso | Componente |
|---|---|
| Campo con etiqueta en un panel | `NumberField` (`components/NumberField.tsx`) |
| Celda de tabla | `NumberCell` (`components/CellInput.tsx`); pasa `label` |
| Campo sin etiqueta propia (fila `.field` armada o barra) | `NumberInput` (mismo archivo) |
| Lógica común | `useNumberInput` (`components/useNumberInput.ts`) |
| Leer y mostrar | `parseUserNumber` y `formatInputNumber` (`i18n/numbers.ts`, con tests en `numbers.test.ts`) |

Para un caso nuevo, extiende `useNumberInput`. No copies la lógica en el componente. Ya tiene:

- `parseText`: lectura propia del texto (p. ej. pies con `'` en el largo de barra). Si devuelve `null`, se intenta la lectura normal con coma o punto.
- `zeroText`: el 0 significa otra cosa (p. ej. «∞» = sin límite en `VibrationPanel`). Con 0 el campo queda vacío con ese texto de ayuda, y vacío, `∞` o ese texto confirman 0.

## Contrato de un campo numérico

| Aspecto | Comportamiento |
|---|---|
| Lectura | `parseUserNumber` (abajo). Acepta coma o punto, separador de miles, espacios y la unidad del campo escrita al final («7,25 m»). |
| Visualización en el campo | Separador decimal del idioma (coma en español) y la precisión de la magnitud, **sin separador de miles**. Si llevara miles, «1.234» se volvería a leer como 1,234. |
| Visualización de solo lectura | `useFormat()(v, decimales)` **con** miles («10.728 m²»). |
| Confirmar | Enter, Tab o salir del campo. **Enter no suelta el foco**: selecciona el texto para seguir ajustando. Esc revierte; un segundo Esc cierra la ventana. Si el texto no cambió, no se confirma nada. |
| Valor inválido | Borde, icono y un mensaje que da el rango («Entre 0 y 30 m»), unido con `aria-describedby`. El foco se queda en el campo y el mensaje no desaparece solo. |
| Teclado | ↑/↓ suman o restan un paso de la magnitud. Mayús multiplica el paso por 10 y Alt lo divide entre 10. RePág/AvPág multiplican por 10. **La rueda del ratón no cambia el valor**: el usuario está desplazando el panel. |
| Selección mixta | `value=null` muestra el placeholder «múltiple». Lo que se escriba se aplica a todos. |
| Unidad | Siempre visible y sin recortes. `.field-unit` mide hoy 1,8 rem y corta «ms/m» o «t/m³»; usa `min-width` y deja que crezca. |
| Accesibilidad | `<label>` asociado. En una celda de tabla, `aria-label` con la columna y la fila («Burden, taladro 12»). |

## Tablas (biblioteca, cargas, taladros)

- **Enter** confirma y baja a la fila siguiente. **Tab** confirma y pasa a la derecha. **Mayús+Enter** sube.
- **Pegar** varias líneas, por ejemplo una columna copiada de Excel con coma decimal, rellena hacia abajo desde la celda activa. Se lee cada valor con `parseUserNumber` y todo el pegado es **un único comando** (un solo paso de deshacer).
- Las cifras van alineadas a la derecha con `font-variant-numeric: tabular-nums`.

## Lector de números de referencia

La versión vigente está en `apps/web/src/i18n/numbers.ts`. Este fragmento explica la regla; si los dos difieren, manda el código con sus tests.

```ts
/**
 * Lee lo que escribe el ingeniero: «6,5» «6.5» «1.234,5» «1,234.5» «7,25 m» «−3».
 * Regla para «1.234» o «1,234» (un solo separador): siempre es decimal. En un campo nadie
 * escribe miles, y el punto del teclado numérico debe funcionar en español.
 * Devuelve null si el texto no es un número.
 */
export function parseUserNumber(raw: string, unit?: string): number | null {
  let s = raw.replace(/[\s  ]/g, '').replace('−', '-');
  const u = unit?.replace(/\s/g, '');
  if (u && s.endsWith(u)) s = s.slice(0, -u.length);
  const m = /^([+-]?)([\d.,]+)$/.exec(s);
  if (!m || !/\d/.test(m[2] ?? '')) return null;
  const sign = m[1] ?? '';
  const body = m[2] ?? '';
  const dots = body.split('.').length - 1;
  const commas = body.split(',').length - 1;
  let decimal: '.' | ',' | null = null;
  if (dots > 0 && commas > 0) decimal = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ',';
  else if (dots === 1) decimal = '.';
  else if (commas === 1) decimal = ',';
  const group = decimal === '.' ? ',' : decimal === ',' ? '.' : dots > 1 ? '.' : ',';
  const parts = decimal ? body.split(decimal) : [body];
  if (parts.length > 2) return null;
  const int = parts[0] ?? '';
  const frac = parts[1] ?? '';
  if (frac.includes(group)) return null;
  if (int.includes(group) && !new RegExp(`^\\d{1,3}(\\${group}\\d{3})+$`).test(int)) return null;
  const n = Number(`${sign}${int.split(group).join('') || '0'}.${frac || '0'}`);
  return Number.isFinite(n) ? n : null;
}
```

**Casos que el test debe cubrir:**

| Escrito | Resultado |
|---|---|
| `6,5` y `6.5` | 6.5 |
| `1.234,5` y `1,234.5` | 1234.5 |
| `1.234.567` | 1234567 |
| `1.234` | 1.234 |
| `7,25 m` (unidad `m`) | 7.25 |
| `−3` | −3 |
| `,` | null |
| `1.2.3` | null |
| `6*1,1` | null |
| texto vacío | null |

Las expresiones (`=6*1,15`) son una mejora posible, pero solo con un analizador propio y acotado. Nunca con `eval` ni `Function`.

## Precisión de visualización: propuesta pendiente de confirmar

Los documentos no fijan decimales por magnitud (auditoría de `docs/`). La tabla siguiente es un **supuesto razonable (D-12)** que el usuario aceptó el 2026-11-18.

**Pendiente:** centralizarla en un único mapa `PRECISION`, porque hoy cada panel pasa su propio `decimals`, y anotarla en `docs/QUESTIONS.md` §2.

| Magnitud | Unidad mostrada | Decimales | Paso ↑/↓ |
|---|---|---|---|
| Coordenadas E/N/Z | m · ft | 2 | 0,1 |
| Burden, espaciamiento, taco, sobreperforación, largo de carga | m · ft | 2 | 0,1 |
| Diámetro | mm · in | 0 · 3 | 1 mm · 0,125 in |
| Inclinación, azimut | ° | 1 | 1 |
| Retardos y tiempos | ms | 0 | 1 |
| Densidad | g/cm³ | 2 | 0,01 |
| Masa por taladro | kg | 1 | 1 |
| Masa total, volumen, tonelaje | kg · m³ · t | 0 | — |
| Factor de carga, de potencia y de energía | kg/m³ · kg/t · MJ/t | 3 | — |
| PPV | mm/s | 1 | — |
| Costos totales · costo unitario | moneda · moneda/t | 0 · 3 | — |

## Errores comunes

| Error | Corrección |
|---|---|
| `draft.replace(',', '.')` (solo cambia la primera coma) | `parseUserNumber` |
| `String(Number(v.toFixed(d)))` en el campo, que muestra punto en español | Separador del idioma, sin miles |
| `toFixed` o una unidad fija («m») para mostrar | `useFormat()` + `useUnits()` |
| Conversión de unidades hecha a mano en el componente | Una magnitud nueva en `useUnits` |
| Error solo con borde rojo | Mensaje con el rango, `aria-describedby` y foco en el campo |
| Commit con cada tecla | Commit con Enter, Tab o al salir del campo |
| Pegar 50 valores genera 50 pasos de deshacer | Un único comando |
