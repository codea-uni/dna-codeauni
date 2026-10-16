# Capas de conocimiento del agente de voladura

El agente razona con cinco capas, de la más general a la más específica. **Cuando dos capas dicen
cosas distintas, manda la más cercana al diseño** (proyecto > sitio > empresa > general > skill), y
el agente dice de dónde lo sacó («según el procedimiento de sitio de Antamina…»).

| # | Capa | Qué guarda | Quién la edita | Dónde vive |
|---|------|-----------|----------------|-----------|
| 1 | **Skill de experto** en perforación y voladura | Entrevista previa, reglas guía con fuente, criterio de diseño | Desarrollo (con el ingeniero) | `apps/web/src/ai/skill/voladura.md`, `skill/rules.ts` (de `CONOCIMIENTO-VOLADURA.md`) |
| 2 | **General** | Voladura teórica, marco teórico, conceptos prácticos, transcripciones, recomendaciones de especialistas | La plataforma (superadministrador) | Servidor: `knowledge_doc` capa `general` |
| 3 | **Empresa** (la que compra el software: p. ej. Enaex) | Procedimientos de la empresa, **catálogo de explosivos** | Administrador de la empresa | `knowledge_doc` capa `organization` + `organization_explosive` |
| 4 | **Sitio** (la mina cliente: p. ej. Antamina) | Procedimientos de sitio, condiciones geológicas, parámetros | Diseñadores de esa mina | `knowledge_doc` capa `mine` |
| 5 | **Proyecto** (p. ej. Chinalco, fase 4) | Topografías (cargadas y actualizadas), **explosivos habilitados** (un subconjunto del catálogo de la empresa), notas y lecciones | Diseñadores del proyecto | Diseño (`project.topography`, `library.explosives`) + `knowledge_doc` capa `project` |

Encaja con la jerarquía que ya tenía el servidor: **empresa → mina → proyecto**.

## El eco del catálogo de explosivos

La empresa puede tener muchos explosivos; un proyecto, por sus condiciones, solo cuenta con
algunos. El catálogo vive en la empresa (**Conocimiento → Explosivos de la empresa**, o desde la
biblioteca de un proyecto con «Subir al catálogo de la empresa»). Cada proyecto **habilita** los suyos:
el agente lo hace con `enable_explosive` («habilita la emulsión gasificada del catálogo»), que copia la
ficha a la biblioteca del diseño (se deshace). Si el diseño usa un explosivo que no está en el
catálogo de la empresa, el agente lo avisa una vez.

## Cómo la usa el agente

- En cada turno recibe el **resumen de capas** (títulos de documentos por capa, catálogo de la
  empresa, explosivos del proyecto).
- `search_knowledge` busca texto completo en español (sin tildes) en las capas que alcanzan al
  proyecto abierto; las capas más cercanas pesan más (proyecto ×1,6, sitio ×1,4, empresa ×1,2).
- `company_explosives`, `enable_explosive`, `save_project_note` («recuerda que en esta zona hay
  agua a 8 m»).
- Sin servidor (modo local) solo tiene la skill.

## Cargar conocimiento

Página **Conocimiento** (barra superior): pestañas General · Empresa · Sitio · Proyecto · Explosivos.
Se pega texto (Markdown o plano) o se carga un `.md`/`.txt`. El texto se parte por títulos y
párrafos para la búsqueda. API: `GET/POST /api/knowledge`, `PATCH/DELETE /api/knowledge/:id`,
`GET /api/projects/:id/knowledge` (resumen) y `/knowledge/search?q=`.

Pendiente: PDF y Word directo (hoy se convierten a texto antes), búsqueda semántica (pgvector) si
la búsqueda por palabras se queda corta.
