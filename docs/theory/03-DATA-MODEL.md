# 03 — Modelo de datos e importación (borrador para que el dev lo ajuste)

Punto de partida del modelo de datos, de los catálogos y de los formatos de entrada y salida de la Fase 1. El dev lo corrige y lo cierra en el hito G1 con una nota en `docs/DECISIONS.md`. Nombres en español aquí; en el código, los que el dev decida (los indicadores tienen nombres fijos, ver `02`, sección 0).

## 1. Principios

1. **Unidades del SI internas** y **coordenadas reales** (Este, Norte, Cota) con el CRS (EPSG) declarado por proyecto. Sin CRS no se importa nada.
2. **Diseño y realidad son datos distintos.** Hoy solo hay diseño; deja previsto un segundo juego de valores "as-drilled" (perforado) y "as-loaded" (cargado) por taladro para la Fase 4.
3. **Un escenario es una variante completa** del diseño (malla, cargas, amarre, retardos) que se puede comparar con otra. El proyecto contiene varios escenarios.
4. **El formato de proyecto está versionado** (`schema_version`) y tiene migraciones desde el primer hito.
5. **Cada dato con unidad lleva su unidad** en el nombre (`diametro_m`, `retardo_ms`, `densidad_kg_m3`).
6. **Catálogos separados del proyecto:** el proyecto referencia productos por id y **guarda una copia congelada** de las propiedades usadas, de modo que cambiar el catálogo después no altere un diseño ya cerrado.

## 2. Entidades

### Proyecto
`id`, `nombre`, `crs_epsg`, `unidades_visualizacion` (m/ft, mm/in, kg/lb, g/cc/kg/m³), `idioma`, `schema_version`, `creado`, `modificado`, `escenarios[]`, `puntos_monitoreo[]`, `tabla_limites_ppv[]`, `roca_dominios[]`.

### Banco y roca
- **Banco:** `id`, `cota_techo_m`, `cota_piso_m`, `altura_m` (= techo − piso), `caras_libres[]`.
- **Cara libre:** `id`, `polilinea[]` (puntos E, N, Z), `nombre`. Es la referencia de burden y de secuencia. Puede haber varias.
- **Dominio de roca:** `id`, `nombre`, `densidad_kg_m3`, `ucs_mpa`, `resistencia_traccion_mpa` (RT), `vp_m_s`, `rqd`, `factor_roca_A` (Kuz-Ram, F2), y campos opcionales (E, ν, JPS, JPA, alteración).

### Polígono de diseño
`id`, `nombre`, `vertices[]` (E, N), `cota_m` (nivel de banco), `tipo` (área de malla, exclusión, zona de grupo).

### Taladro
| Campo | Unidad | Notas |
|---|---|---|
| `id` | texto | Único en el escenario; se muestra como etiqueta. |
| `grupo_id` | | Precorte, buffer, producción u otro definido por el usuario. |
| `collar_e`, `collar_n`, `collar_z` | m | Posición del collar (boca). |
| `azimut_deg`, `inclinacion_deg` | ° | Convenciones de `02`, sección 0. Inclinación 0 = vertical. |
| `diametro_m` | m | |
| `altura_banco_m` | m | Puede heredarse del banco. |
| `sobreperforacion_m` | m | Parámetro del usuario; sin constante por defecto fija. |
| `longitud_m` | m | Calculada = H/cos α + J (o dato importado; si ambos, aviso si difieren). |
| `fila`, `columna` | | Posición en la malla generada (opcional). |
| `agua` | seco / con agua / dinámica | **Dato por definir** (guía sección 17): condiciona el producto. |
| `carga_id` | | Referencia a la carga del taladro (abajo). |
| `perforado` | | Reservado F4 (longitud, desviación, posición real). |

### Grupo de taladros
`id`, `nombre`, `tipo` (precorte / buffer / producción / otro), `color`, `parametros_por_defecto` (diámetro, sobreperforación, plantilla de carga, retardos). Los grupos se asignan **seleccionando taladros con un polígono** (solo los encerrados).

### Carga del taladro
`id`, `taladro_id`, `tramos[]` ordenados. Cada **tramo**: `tipo` (explosivo / taco / aire / separador), `producto_id` (explosivo o material de taco), `desde_m`, `hasta_m` (desde el collar), `densidad_kg_m3` (medida o del catálogo), `masa_kg` (calculada o dato directo), `diametro_efectivo_m` (opcional, para cartuchos), `esponjamiento_m` (opcional, gasificación). Además `elementos_iniciacion[]`: cada uno con `tipo` (detonador / booster / cordón), `producto_id`, `posicion_m` desde el collar y, para detonadores, `retardo_fondo_ms`.

Restricción: la suma de longitudes de tramos = longitud del taladro.

### Amarre y retardos
- **Punto de inicio:** `taladro_id` (o "origen") y `t0_ms`.
- **Conexión:** `id`, `desde` (taladro u origen), `hacia` (taladro), `retardo_ms`, `producto_id` (conector), `tipo` (superficie / electrónico programado).
- El **amarre** son las conexiones (topología); los **retardos** son `retardo_ms` de cada conexión y `retardo_fondo_ms` de cada detonador. Se pueden editar por separado.
- Para detonadores electrónicos: `tiempo_programado_ms` por taladro (sin conexiones de tiempo).

### Punto de monitoreo
`id`, `nombre`, `e`, `n`, `z`, `limite_ppv_mm_s` (o referencia a la tabla), `k`, `beta` (opcionales, sobrescriben el valor del sitio). Ver `02`, sección 4.

### Tabla de límites de vibración
Filas: `distancia_desde_m`, `distancia_hasta_m`, `ppv_max_mm_s`, `fuente` (texto obligatorio: norma o criterio). Valores iniciales de curso en `02`, sección 4.

### Escenario
`id`, `nombre`, `taladros[]`, `grupos[]`, `cargas[]`, `amarre` (punto de inicio y conexiones), `parametros_calculo` (ventana MIC en ms, γ de presión, K y β del sitio, tiempo mínimo de alivio), `resultados` (caché de lo calculado; se puede recomputar y **nunca es la fuente de verdad**), `comentarios[]` (rol revisor).

### Usuario y rol (G8)
`id`, `nombre`, `correo`, `rol` (diseñador / revisor / administrador), `idioma`. El revisor lee y comenta; no edita. Cada cambio deja un registro (`quien`, `cuando`, `que`).

## 3. Catálogos

### Explosivo (producto de carga)
`id`, `nombre`, `fabricante`, `familia` (ANFO, emulsión encartuchada, emulsión a granel, hidrogel/slurry, mezcla ANFO–emulsión, otro), `presentacion` (granel / cartucho), `densidad_min_kg_m3`, `densidad_max_kg_m3`, `densidad_kg_m3` (valor de diseño), `vod_ideal_m_s`, `diametro_critico_mm`, `curva_vod_diametro[]` (opcional), `energia_absoluta_mj_kg` (AWS) y/o `energia_kcal_kg` con `potencia_relativa_anfo_peso` (RWS) y `_volumen` (RBS), `resistencia_agua` (ninguna / limitada / alta), `esponjamiento` (para gasificables: densidad inicial y final, tiempo máximo en taladro), `sensibilidad` (necesita booster: sí/no), `precio_usd_kg`, `fuente_ficha` (URL o cita de la ficha técnica), `version`.
Motivo: un mismo producto aparece con densidades distintas según la fuente; el catálogo debe tener **origen y versión** (ficha técnica del fabricante).

### Accesorio de iniciación
`id`, `nombre`, `fabricante`, `tipo` (detonador no eléctrico, detonador electrónico, detonador eléctrico, conector de superficie, booster/cebo, cordón detonante, mecha de seguridad, fulminante), `retardo_nominal_ms`, `precision_pct` o `dispersion_ms` (por familia), `longitud_m`, `velocidad_combustion_s_m` (mecha; **dato por producto**, no hay valor universal), `rango_programable_ms` (electrónicos), `masa_explosivo_g` (booster), `precio_usd`, `fuente_ficha`, `version`.

### Material de taco
`id`, `nombre`, `tipo` (roca triturada, arena, detritus de perforación, tapón, otro), `angularidad` (angular / redondeado), `granulometria_recomendada_mm`, `densidad_kg_m3`, `notas`. Valores típicos como **sugerencia**: en superficie, roca triturada angular de 6 a 14 mm en taladros de 50 a 130 mm es lo más eficaz; el agua no se ofrece en el módulo de superficie. Los materiales pertenecen a un catálogo con propiedades, no a una lista fija en el código.

**Carga de catálogos (G4).** Un catálogo base incluido con el producto (datos de fichas públicas, con fuente) y un importador para el catálogo de otro proveedor (CSV con estas columnas). Cada importación conserva la fuente y la fecha.

## 4. Formatos de entrada y salida (Fase 1)

| Formato | Entrada | Salida | Contenido |
|---|---|---|---|
| CSV (taladros) | Sí | Sí | ID, Este, Norte, Cota, con o sin encabezado; columnas opcionales: diámetro, longitud, azimut, inclinación, grupo. Asistente de mapeo de columnas con vista previa. |
| CSV (catálogos) | Sí | Sí | Explosivos y accesorios con las columnas de la sección 3. |
| DXF | Sí | Sí | Polilíneas (contornos y caras libres), puntos (taladros), 3D face/mallas (topografía). Formato de intercambio documentado de Autodesk (no es de código abierto); validar con ejemplos reales qué entidades aparecen. |
| GeoJSON | Sí | Sí | Polígonos, líneas y puntos con propiedades; CRS explícito o el del proyecto. |
| Proyecto (`.json` versionado) | Sí | Sí | Proyecto completo con `schema_version`; ida y vuelta sin pérdida (prueba de G1). |
| PDF | No | Sí | Reporte (G7): datos, gráficos, modelos usados, parámetros y supuestos. |
| Imagen / tabla | No | Sí | Captura de la malla y tablas copiables a hoja de cálculo. |

Formatos propios de programas de planificación minera (por ejemplo, los de los paquetes de modelamiento de la mina): **validar con la operación cuáles se usan** antes de decidir importadores adicionales. No los asumas.

## 5. Trampas conocidas de importación (deben detectarse o rechazarse con mensaje claro)

| Trampa | Cómo se manifiesta | Qué hace el importador |
|---|---|---|
| Separador `;` | Todo el archivo en una sola columna | Detecta el separador (`,`, `;`, tabulador) y permite corregirlo |
| Decimal con punto y **miles con coma** | `272,345.578` | Detecta y normaliza; nunca interpreta `272,345.578` como dos números |
| Codificación **ISO-8859-1** | Acentos y ñ ilegibles | Detecta la codificación (UTF-8, ISO-8859-1, Windows-1252) y permite cambiarla |
| **Norte y Este intercambiados** | Los taladros caen lejos de la zona de trabajo (en UTM del hemisferio sur el Norte es un número de 7 cifras y el Este de 6) | Avisa si Norte < Este de forma incompatible con el CRS o si el conjunto cae fuera de la zona; ofrece intercambiar |
| Sin encabezado | Primera fila = datos | Detecta si la primera fila es numérica |
| Cotas ausentes o cero | Z vacía | Avisa; pide una cota de banco o usa la del banco |
| IDs duplicados | Dos taladros con el mismo ID | Error con la lista de duplicados |
| CRS distinto al del proyecto | Coordenadas fuera de rango | Pide confirmar el CRS del archivo y reproyecta si se le indica |
| Puntos atípicos | Un taladro a kilómetros del resto | Advertencia con vista previa en el mapa |

Regla de aceptación: **vista previa en el mapa antes de aceptar**; los elementos deben caer en su posición correcta.

## 6. Ejemplo mínimo de proyecto (JSON, para fijar ideas; el dev define el esquema final)

```json
{
  "schema_version": 1,
  "nombre": "Demo banco 4250",
  "crs_epsg": 32718,
  "unidades_visualizacion": {"longitud": "m", "diametro": "mm"},
  "escenarios": [{
    "id": "E1", "nombre": "Base",
    "taladros": [
      {"id": "A1", "grupo_id": "prod", "collar": [274600.0, 8944820.0, 4254.0],
       "azimut_deg": 0, "inclinacion_deg": 0, "diametro_m": 0.31115,
       "altura_banco_m": 15.0, "sobreperforacion_m": 2.4, "carga_id": "C1"}
    ],
    "cargas": [{"id": "C1", "tramos": [
      {"tipo": "explosivo", "producto_id": "anfo-078", "desde_m": 5.6, "hasta_m": 17.4},
      {"tipo": "taco", "producto_id": "grava-angular", "desde_m": 0.0, "hasta_m": 5.6}
    ], "elementos_iniciacion": [
      {"tipo": "booster", "producto_id": "b-400", "posicion_m": 17.3},
      {"tipo": "detonador", "producto_id": "det-500", "posicion_m": 17.3, "retardo_fondo_ms": 500}
    ]}],
    "amarre": {"inicio": "A1", "conexiones": []},
    "parametros_calculo": {"ventana_mic_ms": 8, "k": 1140, "beta": 1.6}
  }]
}
```
