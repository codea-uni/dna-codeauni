# Costo de la IA del agente

Las conversaciones con el asistente (voz y texto) son datos PERSONALES (Ley 29733): solo van a
Gemini de pago con la clave del servidor, nunca a la capa gratuita ni a otro proveedor.
Tarea MEDIA (herramientas sobre el diseño), EN VIVO: no aplica Batch.

## Qué hace el servidor (`apps/server/src/routes/ai.ts`)

| Ruta             | Medida                                                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| todas            | registro de uso SIN contenido en `AI_LOG_DIR/usage-AAAA-MM-DD.jsonl` (tarea, modelo, tokens de entrada/salida/razonamiento/caché/audio, costo estimado, latencia, caché, reintento, error)                            |
| `/ai/generate`   | tope por usuario y hora, tope diario global, `maxOutputTokens`, un reintento solo ante 5xx/timeout/red (nunca 4xx), un reintento si la respuesta llega vacía, cortada (`MAX_TOKENS`) o con la herramienta mal llamada |
| `/ai/speech`     | caché EXACTA por sha256(modelo + voz + texto) en `AI_LOG_DIR/tts-cache` (tope 200 MB, 30 días sin uso), tope por usuario y hora y diario                                                                              |
| `/ai/live-token` | tope diario; el contexto de la sesión se recorta al pasar de 48k tokens (queda en 32k; lo fijo ya son ~19k)                                                                                                           |
| `/ai/usage`      | el navegador informa los tokens de cada turno de Live (la sesión va directo a Google)                                                                                                                                 |

En la web, las instrucciones del asistente de texto son fijas y el estado del diseño viaja como
nota `[context]` en cada mensaje: así el prefijo (instrucciones + herramientas + conversación) es
idéntico entre pasos y Gemini lo cobra al 10 % desde su caché implícita.

## Variables (opcionales; sin ellas rigen los valores por defecto)

`AI_CHAT_PER_HOUR` (300) · `AI_SPEECH_PER_HOUR` (200) · `AI_DAILY_CHAT` (3000) ·
`AI_DAILY_SPEECH` (2000) · `AI_DAILY_LIVE` (300) · `AI_MAX_OUTPUT_TOKENS` (8192) ·
`AI_FALLBACK_MODEL` (vacío = el mismo modelo) · `AI_TTS_CACHE_DIR` · `AI_TTS_CACHE_MB` (200) ·
`LIVE_CONTEXT_TRIGGER_TOKENS` (48000; `0` = sin recorte propio) · `LIVE_CONTEXT_TARGET_TOKENS` (32000).

## Comprobar el ahorro

```sh
docker compose -p dna-agente -f docker-compose.agente.yml exec api node dist/aiUsageReport.js
docker compose -p dna-agente -f docker-compose.agente.yml exec api node dist/aiUsageReport.js --desde 2026-10-20
```

Muestra por día y tarea: llamadas, cuántas salieron de caché, reintentos, errores, entrada media
por llamada, % de entrada cacheada, costo y lo ahorrado medido. Para el recorte de Live: una
sesión de prueba con `LIVE_CONTEXT_TRIGGER_TOKENS=0` y otra igual con el valor por defecto, y
comparar «entrada media» de `live` (solo baja en sesiones de más de ~20 respuestas; hoy la media es ~13). Contrastar el
total con la facturación de AI Studio del mismo día (los precios de TTS y Live del registro son
supuestos hasta verificarlos: `apps/server/src/services/aiUsage.ts`).

## Lo que más pesa y queda pendiente (decisión de producto)

Cada respuesta de Live re-cobra ~19k tokens fijos: instrucciones (~27 mil caracteres) y las
declaraciones de TODAS las herramientas (~45 mil caracteres). Mandar al visor solo las
herramientas que se usan por voz, o acortar sus descripciones, bajaría la entrada de cada turno
~30-40 %. No se hizo: cambia qué puede hacer el asistente y hay que probarlo con sesiones reales.
