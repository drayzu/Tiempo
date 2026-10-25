# Tiempo · estado del proyecto

Un solo scroll que recorre todo el tiempo, de antes del Big Bang a la última luz y después. Tercera pieza de la serie *Escalas* (después de Potencias y AstroIngeniería). Lo visual va por sobre todo: la cámara se queda en nuestro lugar y el tiempo pasa sobre ella; una frase por era. El contexto completo está en `BRIEF.md`; la dirección visual, en `BIBLIA.md`.

## Decisiones tomadas
**25 de octubre de 2026 (Diego, respuestas a la sección 13 del brief):**
- **Nombre:** «Tiempo», por ahora (puede cambiar más adelante). Repo propuesto: `drayzu/Tiempo` → drayzu.github.io/Tiempo; confirmar al publicar.
- **Protón protagonista:** sí. Un punto azul que el viaje nunca pierde, desde que los quarks quedan presos hasta el agua de tu cuerpo y después.
- **«Ahora»:** un solo momento fuerte (el zoom temporal), no un capítulo sobre la vida y lo humano.
- **Finales:** bifurcación que elige el visitante, con la elección en la URL (`?final=rip`).
- **Bucle final** con Penrose: sí.
- **Duración:** largo, sin miedo al largo (Potencias dura ~11 minutos en autoplay; Tiempo puede durar más).

Heredado del brief: Vite + TypeScript + Three.js sin React; Instrument Serif, Geist y Geist Mono; acento azul `#8fb4ff`; el fondo es la temperatura del universo; regla-cono a la derecha; teclas A, S, I y L como Potencias; bilingüe; sonido opcional generado.

**25 de octubre de 2026 (Diego, tras ver los estudios de estilo): fase 0 cerrada.**
- **Base: B · Brasa** («el más espectacular, tiene más cosas»).
- **Momentos de A · Horno** donde la luz llena todo: el cielo naranja de la niebla y su transición («un momento genial»), el encendido de la primera estrella («incluso más color»), los destellos.
- **C · Lámina** como capa opcional para aprender (tecla I): clara y útil, pero no es la base.
- **«Ahora»: Tierra** (los continentes que se arman, la Tierra que gira rápido) **con la inmersión del Túnel** (primera persona). La Regla, opcional dentro de la lámina.
- **Inmersión como regla del sitio entero:** movimientos de cámara, primera persona, volar dentro de las cosas; «estas cosas debes usarlo mucho en la página, es clave». Recogido en `BIBLIA.md` (principio 2).

**25 de octubre de 2026, tarde (Diego, tras ver la fase 1):** el túnel de anillos de «Ahora» no se ve natural: quitarlo y dejar la Tierra girando. «El resto va por buen camino.» Pide seguir con espectacularidad, efecto wow y movimiento de cámara.

## La aplicación (`index.html`, `npm run dev`, puerto 5191) · fases 1 a 3
El viaje entero ya corre con el motor de Tiempo, de punta a punta: **16 eras**, unos **145 beats** (~67 000 px de scroll), del «t = ?» de la portada a «Después del tiempo».

antes del tiempo (provisional) → **época de Planck** (la espuma de Potencias) → inflación → plasma de quarks → una de cada mil millones → veinte minutos de cocina (provisionales) → **la niebla / se hace la luz** → el gas se enfría (provisional) → **la edad oscura / la primera estrella / el amanecer** → las burbujas se tocan → la Vía Láctea → nace el Sol (provisionales) → **ahora** → el Sol se apaga → el largo final → después del tiempo (provisionales).

- Eras **reales** (12): Planck · **inflación** (lámina: la retícula de la espuma estirándose sin fin, arrugas que se congelan, semillas en azul; los relojes muestran el trozo de universo creciendo 10²⁶ veces y la temperatura ≈ 0; al terminar, el destello del recalentamiento) · **el plasma de quarks** (vuelo en primera persona entre quarks rojos, verdes y azules y gluones; al enfriarse quedan presos de a tres, los colores se apagan en blanco y la «Y» de tubos de gluones de nuestro protón se forma mientras la cámara lo rodea) · **una de cada mil millones** (materia y antimateria se aniquilan en destellos; quedan sobrevivientes; después la ola de electrones y positrones; la lámina avisa que el dibujo deja 1 de cada 30 y la realidad 1 de cada 1 000 millones) · **veinte minutos de cocina** (deuterio y luego helio dorado entre protones blancos; nuestro protón queda solo: hidrógeno) · **la niebla / se hace la luz** · **el gas se enfría** (puente de 20 órdenes de magnitud: zoom infinito por un gas que se agrumó en hilos y nudos) · **la primera estrella** · **las burbujas se tocan** (reionización: galaxias que se encienden en la red y burbujas rosadas que se funden) · **la Vía Láctea se arma** (enanas que caen en espiral, disco que crece de adentro hacia afuera con cuatro brazos, viveros rosados, polvo oscuro, bulbo; «la expansión acelera») · **nace el Sol** (nube molecular, onda de supernova que la siembra, colapso en disco con chorros, anillos vistos de frente como en ALMA, el Sol se enciende) · **ahora** (sin túnel: la Tierra girando y la cámara rodeándola; la órbita de la Luna como anillo de luz que se condensa en la Luna en su fase real; los hitos pasan arriba).
- Las **provisionales** (antes del tiempo, el Sol se apaga, el largo final, después del tiempo) dicen «era provisional» arriba en pantalla y se reemplazan en la fase 4.
- El plasma (quarks, aniquilación, núcleos) tiene **profundidad**: es opaco, así que lo cercano es nítido y lo lejano se disuelve en su resplandor (`uFog`).
- Scroll nativo; **A** reproduce, **S** sonido, **I** lámina (`?lamina` la abre encendida), **L** idioma. `?ver=N` congela en el beat N; `?p=N` arranca ahí; `?debug` deja `tiempo` en la consola: `tiempo.sheet([beats], columnas, ancho, 'docs/…/x.jpg')` guarda una hoja de contactos (película + lámina) en el proyecto; `tiempo.seek(b)`, `tiempo.at('niebla')`.
- Capturas de la fase 1: `docs/fase1/viaje.jpg` (el viaje entero) y `docs/fase1/momentos.jpg`.

### El motor (`src/engine/`)
- `eras.ts`: la cadena de eras **en el orden en que se viven** (no por tamaño, como en Potencias): cada era tiene sus unidades y se ancla en la anterior (`anchor` + razón de unidades: la escala puede subir o bajar). La pista `era` dice dónde estamos (3,4 = 40 % del paso de la era 3 a la 4). Matrices en doble precisión relativas al pivote; carga perezosa; generación en workers (puede ser asíncrona: la Tierra carga sus costas). Visibilidad por el paso (`fade`) y por la escala (`fadeE`, como los mundos de Potencias: una era vista lejos de su escala serían manchas o polvo).
- `materia.ts`: las partículas de Potencias + **tinta** (cada punto da luz y tapa luz, premultiplicado), niebla por distancia (`uFog`), desvanecimiento cerca de la cámara (`uNear`, para volar dentro), reordenamiento (`uAssemble`), sustitutos (`flag`), fuentes de luz (`star`) y GLSL propio por era (`move`).
- `fondo.ts`: **el fondo es la temperatura** (ley de Planck, brillo para un ojo adaptado a la oscuridad). Brasa (tinta incandescente con huecos que se disipa en una pared lejana) y Horno (pantalla entera) mezclados por la pista `horno`; `fondo` es su ganancia (0 en las eras de lámina). La transparencia del universo sale de la recombinación (`cosmo.transparency`); el plasma «suena» (ondas acústicas) hasta que la luz se libera.
- `protagonista.ts`: **nuestro protón**, un punto azul que nunca se pierde; cada era dice dónde está (`proton()` en sus unidades) y el motor lo mezcla entre eras. Con núcleo oscuro sobre fondos brillantes.
- `placa.ts`: todo lo 2D sobre la película (en el canvas `#placa`, así las capturas lo incluyen): los **tres relojes** (`reloj` 0 desde el inicio con `lt`; 1 hacia atrás con `lb`; 2 ahora, con la hora real; 3 hacia adelante con `ah`; 4 «t = ?»), el **cono** (relleno con el color del universo a lo largo del viaje, bordes según certeza, las ramas de los finales, el nombre de la era) y las notas. Bilingüe.
- `post.ts`, `scroll.ts`, `polvo.ts` (de Potencias); `sonido.ts` (el tono baja con la temperatura); `taller.ts` (workers); `contactos.ts` (hoja de contactos que guarda en `docs/`).
- Pistas globales: `era`, `e`, `lt`, `lb`, `ah`, `reloj`, `yaw`/`pitch`/`roll`/`fov`, `<era>.fx/fy/fz` (volar por la era: primera persona), `<era>.keep`, `fondo`, `horno`, `bloom`/`umbral`. Sobre un cielo Horno brillante el bloom cede solo (si no, rellena las motas oscuras).
- `src/eras/`: un módulo por era y `provisional.ts` + `provisionales.ts` para las que faltan. `infinito.ts`: zoom infinito (capas del mismo patrón a décadas fijas alrededor de la cámara; en puntos o en líneas de lámina) para las eras que cruzan muchos órdenes sin un objeto de un solo tamaño (inflación, el gas).
- Las eras pueden corregir los relojes donde la historia estándar no vale (`lectura()`: en la inflación el tamaño y una temperatura ≈ 0).
- Regla de GLSL: las variables internas del shader de la materia llevan prefijo `m` (`mK`, `mPx`…); el código de una era puede usar cualquier nombre corto. `tiempo.errores()` (con `?debug`) lista los shaders que no compilaron: una era con un error simplemente no se ve. Para agregar una era: su módulo y sumarla a `crearEras()` en `src/eras/index.ts` (la usan la página y los workers).

## Fase 0 · estudios de estilo (`prototypes/`)
`prototypes/index.html` (laboratorio) enlaza `prototypes/estudio.html`: tres momentos clave, cada uno de tres maneras. El scroll es el tiempo; **A** reproduce, **1–3** cambian de estilo.

| Momento | A · Horno | B · Brasa | C · Lámina |
|---|---|---|---|
| **Se hace la luz** (~380 000 años) | La pantalla entera es la luz del universo, del color de su temperatura; la materia, motas oscuras contra el fuego. Al enfriarse: naranja, rojo, negro | Fondo negro; tinta incandescente con huecos, partículas de luz; al disiparse, la luz libre en trazos dorados que se enrojecen | La física dibujada: caminos de la luz enredados y luego rectos, el círculo de «lo que alcanza a viajar la luz», el espectro corriéndose al infrarrojo, notas |
| **La primera estrella** (~150 millones de años) | Negro; al encenderse, la luz de la estrella llena la pantalla y la red de gas queda en silueta | La estrella como punto azul cegador; burbuja rosada de hidrógeno ionizado; restos de colores | Red de materia oscura dibujada, flechas de gas que cae, ficha de la estrella, frente de ionización y onda de la supernova como círculos |

| «Ahora» | Qué se ve |
|---|---|
| **1 · Túnel** | Un anillo por potencia de diez pasa sobre la cámara (el desierto de Potencias) con los hitos en sus paredes; al fondo, nuestro protón, que al llegar está en una molécula de agua |
| **2 · Tierra** | El planeta (tierras de Natural Earth vía `world-atlas`): los continentes se asientan, las edades de hielo van y vienen, los días se vuelven bandas (exposición larga) y luego un día; al llegar, el Sol lo ilumina como en este instante y tú estás marcado (lugar aproximado por la zona horaria) |
| **3 · Regla** | Lámina: el calendario cósmico lineal arriba (toda la historia humana es un pelo al final) contra la regla logarítmica abajo, con una lupa entre ambas que dice cuántos píxeles mide lo que vemos |

**Capturas** (`docs/estudio/`): `resumen.jpg` (los nueve en un cuadro), `luz.jpg`, `estrella.jpg`, `ahora.jpg` (secuencias, una fila por estilo).

### Herramientas
- `?m=luz|estrella|ahora&s=1..3`; `?p=6` arranca en el beat 6; `?ver=6` congela ahí; `?cap=1600x900` dibuja a ese tamaño fijo; `?clean` sin interfaz del estudio.
- `?debug` deja `estudio` en la consola: `estudio.foto(ruta, beat)`, `estudio.hoja(ruta, [estilos], [beats], ancho, rótulos)` y `estudio.mosaico(ruta, [[momento, estilo, beat, rótulo]…], columnas)`. Las imágenes se guardan en el proyecto por un plugin de Vite solo de desarrollo (`/__guardar`, dentro de `docs/` o `tools/`).
- Todo lo de la interfaz (HUD, cono, notas) se dibuja en un canvas 2D sobre el WebGL, así que las capturas lo incluyen.

### Cómo está hecho
- `src/lib/cosmo.ts`: el reloj del universo. ΛCDM con los parámetros de Planck 2018 (TT,TE,EE+lowE+lensing+BAO: H₀ = 67,66, Ωm = 0,3111, radiación Ωr h² ≈ 4,18 × 10⁻⁵): `scaleFactor(t)` integrando Friedmann, `temperature(t)` (T₀/a desde los primeros minutos; antes, la relación de la era de radiación con g* por escalones), `patchRadius(t)`, `cosmicCalendar(t)`.
- `src/lib/cuerpo-negro.ts`: color de cuerpo negro con la ley de Planck × funciones de igualación de color CIE 1931 (ajuste de Wyman, Sloan y Shirley 2013) → sRGB lineal; `bbVisible(T)`: brillo para un ojo adaptado a la oscuridad (logarítmico; ~800 K, el punto de Draper, apenas se ve; ~4 200 K enceguece).
- `src/engine/timeline.ts`: copiado de Potencias (pistas, subtítulos de momento).
- `prototypes/src/`: `estudio.ts` (página, scroll, capturas), `stage.ts` (película: HDR, bloom, ACES, grano), `materia.ts` (partículas de Potencias que además tapan luz: emisión + tinta, premultiplicado; niebla por distancia), `pantalla.ts` (fondo en el infinito que sabe hacia dónde mira cada píxel; trazos), `placa.ts` (los tres relojes, el cono, notas, formato de números en español), `escenas/luz.ts`, `escenas/estrella.ts`, `escenas/ahora.ts`.
- Física de «Se hace la luz»: fracción de electrones libres x_e(z) con un ajuste logístico centrado en z ≈ 1 180 (por verificar contra RECFAST); camino libre de la luz ∝ 1/(x_e · n_e), en unidades de escena ilustrativas; cada captura de electrón suelta un fotón (un destello); las ondas de sonido del plasma laten hasta que la luz se libera y ahí se congelan.
- Física de «La primera estrella»: el mismo gas se reúne en la red (materia oscura dibujada en lámina), cae al nudo y se calienta; la estrella (~100 000 K) ioniza una burbuja de frente irregular (el gas de adentro brilla en H-alfa y es empujado a una cáscara) que se apaga al morir la estrella; la supernova siembra carbono, oxígeno y hierro.

### Cifras comprobadas en esta sesión (con `cosmo.ts`)
- Edad del universo: 13 786 millones de años (Planck 2018: 13 787 ± 20).
- A los 380 000 años: T ≈ 2 935 K, z ≈ 1 076; nuestro trozo de universo medía ~86 millones de años luz.
- El resplandor baja de ~800 K (punto de Draper, deja de verse) hacia los 3,1 millones de años (z ≈ 293), como estimaba el brief.
- 1 s: T ≈ 10¹⁰ K. 3 minutos: T ≈ 10⁹ K. 150 millones de años: T ≈ 64 K, z ≈ 22.

### Por verificar antes de la fase 2
- x_e(z) y la duración de la recombinación (RECFAST o Planck 2018).
- Estrellas de población III: masas, temperatura de superficie (~10⁵ K), vida (~2–3 millones de años), época (z ~ 20–30), tipo de muerte por masa.
- Hitos de «Ahora» (algas multicelulares ~1 000 millones de años, Cámbrico 538,8, tetrápodos ~375, dinosaurios ~233, asteroide 66,0, homininos ~7, herramientas 3,3, Homo sapiens ~300 000, máximo glacial ~21 000, Holoceno 11 700, escritura ~5 200).
- El ciclo de edades de hielo es un esbozo (dientes de sierra de 100 000 y 41 000 años), no datos.

## Historial
**Sesión del 25 de octubre de 2026 (fase 0):**
- Lectura del brief y de Potencias (biblia, estado, motor, Planck, protón, universo).
- Respuestas de Diego a la sección 13 (arriba).
- Proyecto creado: Vite + TypeScript + Three.js, `BIBLIA.md`, `ESTADO.md`, laboratorio y estudio de estilo.
- Física base: reloj cosmológico y color de cuerpo negro.
- Estudios de «Se hace la luz», «La primera estrella» (A/B/C) y «Ahora» (1/2/3), revisados con hojas de contactos y corregidos (exposición del fondo, materia iluminada por el resplandor, frente de ionización irregular, recombinación al morir la estrella, pliegues en la deriva de continentes, exponentes en las etiquetas).
- Diego eligió: Brasa de base, Horno en los picos de luz, Lámina opcional, «Ahora» Tierra con la inmersión del Túnel, y pidió inmersión en primera persona en todo el sitio.

**Sesión del 25 de octubre de 2026, tarde (fase 1 · motor):**
- Motor de Tiempo adaptado de Potencias (ver «El motor»): eras en orden de viaje, materia con tinta, fondo-temperatura Brasa/Horno, protón protagonista, tres relojes, cono, sonido por temperatura, workers, hoja de contactos que guarda en el proyecto.
- Esqueleto del viaje entero con 16 eras; reales: Planck (de Potencias, cuerdas en azul), la niebla, la primera estrella y «Ahora» (anillos del túnel en espacio de cámara: años hasta un año, luego segundos).
- Revisión con hoja de contactos: eras que aparecían como manchas al estar lejos de su escala (visibilidad por escala), Tierra quemada (bloom por momento), inflación negra, motas invisibles sobre el cielo naranja (el bloom las rellenaba: ahora cede solo), contraste del texto sobre Horno.

**Sesión del 25 de octubre de 2026, tarde y noche (fases 2 y 3, Diego dejó trabajando en segundo plano):**
- «Ahora» sin túnel (pedido de Diego): la Tierra girando, la cámara que la rodea, la Luna en su fase real.
- Fase 2: inflación, plasma de quarks, aniquilación, nucleosíntesis y el gas que se enfría, como eras reales; recalentamiento al salir de la inflación.
- Fase 3: las burbujas se tocan, la Vía Láctea se arma, nace el Sol.
- Correcciones: el destello de la primera estrella vuelve a ser azul lavanda con siluetas (era una pantalla blanca); hueco negro antes del futuro; shaders que no compilaban por nombres repetidos (de ahí la regla del prefijo).

## Siguiente paso
0. Fase 4: el futuro (el Sol se apaga, Andrómeda, la última estrella), el largo final (enanas negras, ¿mueren los protones? —el fin del hilo—, la última luz de los agujeros negros), la bifurcación de finales (`?final=`), después del tiempo y el bucle; y antes del tiempo (portada).
1. Que Diego recorra el viaje (mejor con **A**) y diga qué funciona.
2. Fase 2 · prueba de fuego: del plasma a la primera estrella en un tramo continuo, volando dentro. Reemplazar las provisionales del Acto I y II por eras reales: la inflación (arrugas estiradas, «serán galaxias»), el plasma de quarks y el nacimiento de nuestro protón (enlace con «Nadie ha visto un quark solo» de Potencias), la aniquilación (un destello y el sobrante), la nucleosíntesis (dos tonos) y el gas que se enfría (un puente que se vea a toda escala). Hoy esas tres eras del plasma se parecen demasiado (todo es tinta blanca azulada).
3. Pendientes del motor: tono exacto del fondo bajo ACES (hoy el naranja tira a dorado cuando es muy brillante; se puede corregir invirtiendo la curva solo para el fondo), y transiciones de gran salto de escala sin nada en medio (Vía Láctea → Sol, futuro → final).

## Plan de fases
0 Dirección (biblia, estudios de estilo) ✓ · 1 Motor ✓ · 2 Prueba de fuego (Acto I a III + Ahora) ✓ · 3 Acto IV ✓ (V y momentos con nombre: en curso) · 4 Los extremos (Acto 0, VI, finales, bucle) · 5 Sonido, lámina, bilingüe, enlaces cruzados · 6 Pulido, móvil, deploy y README.
