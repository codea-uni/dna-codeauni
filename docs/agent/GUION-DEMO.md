# Guion de la demo · Agente de voladura por voz (Cronos · CODEa UNI)

Un solo perímetro, creado en vivo y trabajado de principio a fin. Di cada frase tal cual, espera
a que el agente termine de hablar y mira qué hace. Unos 15 minutos.

## Antes de empezar

1. En la **PC** y en el **Quest**, entra a https://voladura.codeauni.com con la **misma
   cuenta**: `admin@cronos.local` / `cronos123`.
2. En uno de los dos, abre cualquier proyecto de **Cuajone**. El otro lo sigue solo: los
   dispositivos de una misma cuenta abren siempre el mismo proyecto y ven todo en vivo (el dibujo,
   las tarjetas y los subtítulos).
3. Panel **Asistente IA** → **Conversar en vivo** (o, en el Quest, el botón azul **Entrar en VR**).
   Desde aquí todo se hace hablando.

Unidades: diámetro en milímetros, P80 en centímetros, distancias en metros, vibración en mm/s.

---

## 1 · Dónde trabajamos

| Dices                                                                        | Verás                                                                        |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| «¿Qué proyectos tengo en Cuajone?»                                           | Tarjeta **Proyectos** (se puede tocar uno).                                  |
| «Crea un proyecto nuevo llamado Demo en vivo.»                               | Se abre el proyecto nuevo. La PC lo abre también.                           |
| «¿Qué topografías tengo cargadas?»                                           | Tarjeta **Topografías**: las tres de la mina, la más nueva primero.         |
| «Trabajemos sobre el levantamiento con dron del Sector Sur.»                 | La trae de la mina, apoya el banco en ella y la encuadra.                   |
| «Crea un perímetro de 60 por 40 metros, con la cara libre al norte.»         | El contorno se **traza** sobre el relieve.                                  |

**Otra opción, con un polígono ya hecho**, en vez de la última frase:

| Dices                                                                                     | Verás                                                       |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| «¿Qué perímetros hay en los otros proyectos?»                                             | Tarjeta **Perímetros** con los de toda la mina.            |
| «Trae el perímetro Próxima voladura banco 3370 del proyecto Banco sobre topografía.»      | Se copia aquí, queda activo y la cámara va a él.           |

Si ya estás en un proyecto con diseño y quieres partir limpio: «Borra todo el diseño y empecemos de
cero» → «Sí».

## 2 · La entrevista

| Dices                                                                              | Verás                                |
| ---------------------------------------------------------------------------------- | ------------------------------------ |
| «La roca es andesita fracturada, de 120 megapascales.»                             | Tarjeta **Condiciones del sitio**.   |
| «Los taladros tienen agua.»                                                        | Avisa que el ANFO no sirve con agua. |
| «No hay sulfuros.»                                                                 | Terreno no reactivo.                 |
| «Es mineral para la chancadora, con un P80 de 20 centímetros.»                     | P80 objetivo en la tarjeta.          |
| «Hay una comunidad a 1200 metros al este, con límite de 5 milímetros por segundo.» | Tarjeta **Punto protegido**.         |

## 3 · Diseño dibujado en vivo

| Dices                                                                             | Verás                                                                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| «Recomiéndame un diseño con taladros de 200 milímetros.»                          | Tarjeta **Propuesta de diseño** con burden, espaciamiento, explosivo y P80 previsto.              |
| «Aplícalo y cárgalo.»                                                             | Los taladros se **perforan uno a uno** y la carga sube desde el fondo. La cámara sigue el dibujo. |
| «Pon precorte en la pared sur y una fila buffer.»                                 | Se dibujan el precorte y la fila buffer.                                                          |
| «Prográmalos con electrónicos: 25 milisegundos entre taladros y 100 entre filas.» | Una **onda amarilla** recorre los taladros en orden de disparo.                                   |

## 4 · Predicción

| Dices                                           | Verás                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| «¿Cómo quedan la fragmentación y la vibración?» | Tarjeta **Predicción**: P80 contra el objetivo y vibración en la comunidad. |
| «¿Hay riesgo de tiros cortados o de gases?»     | Revisa la señal y el explosivo con agua.                                    |
| «Baja la vibración en la comunidad.»            | Cambia los tiempos y da la nueva vibración.                                 |
| «Elimina el taladro 5.»                         | El taladro se apaga en rojo.                                                |
| «Deshaz eso.»                                   | Vuelve el taladro.                                                          |
| «Dame el reporte de carga.»                     | Tarjeta **Reporte de carga y perforación**.                                 |

## 5 · Resultados

| Dices                                             | Verás                                  |
| ------------------------------------------------- | -------------------------------------- |
| «Reproduce la secuencia de disparo.»              | El disparo animado (también en la PC). |
| «¿Hacia dónde se mueve la pila y cuánto esponja?» | Tarjeta **Movimiento de la pila**.     |
| «Muéstrame el mapa de vibración.»                 | Mapa sobre el terreno.                 |
| «Oculta los resultados.»                          | Vuelve el diseño limpio.               |
| «Guarda la versión: demo en vivo.»                | Publica la versión en el servidor.     |

## 6 · Realidad virtual (en el Quest)

Con las manos:

- Mano izquierda: pellizcas y mueves la maqueta.
- Dos manos: estiras, giras y mueves.
- Mano derecha: pellizco corto para elegir; pellizcar y mover arrastra.
- Para mover una tarjeta, pellízcala.
- Con mandos: apuntas y eliges con el gatillo; **B** o **Y** para salir.

| Dices                                | Verás                                      |
| ------------------------------------ | ------------------------------------------ |
| «Muéstrame la voladura.»             | La maqueta vuela al frente.                |
| «Llévame al taladro 12.»             | Vuela al taladro y muestra su ficha.       |
| «Muéstrame dónde está la comunidad.» | Encuadra la comunidad junto a la voladura. |
| «Reproduce la secuencia.»            | El disparo frente a ti.                    |
| «Llévame dentro de la voladura.»     | Escala real, sobre el banco.               |
| «Acércame.»                          | Avanzas hacia la voladura.                 |
| «Llévame al terreno.»                | Te pone de pie sobre la topografía.        |
| «Sal de la realidad virtual.»        | Vuelve a la web.                           |

---

## Si algo sale distinto

- Pregunta de más: «Usa lo que ya tienes y sigue.»
- Entendió mal un número: «No, dije doscientos milímetros.»
- Cortar una respuesta: habla encima.
- El dibujo tarda: botón **Saltar**.
- Volver atrás: «Deshaz eso.»
- La PC no siguió al Quest: revisa que sea la misma cuenta. Si la PC tenía cambios sin publicar, no
  se mueve y avisa; ábrela a mano o publica primero.
- Lo que se diseña se comparte en vivo, pero solo queda guardado en el servidor al decir «guarda la
  versión».
