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

## Decisiones pendientes (fase 0)
- [ ] **Estilo** para la niebla y las estrellas: **A Horno**, **B Brasa** o **C Lámina** (o una mezcla por era, como el dial de tinta de Potencias).
- [ ] **Versión de «Ahora»:** **1 Túnel**, **2 Tierra** o **3 Regla** (o una combinación).

## Fase 0 · estudios de estilo (`npm run dev`, puerto 5191)
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

## Siguiente paso
1. Que Diego elija estilo (A/B/C o mezcla por era) y versión de «Ahora» (1/2/3); anotarlo arriba.
2. Fase 1 · motor: copiar y adaptar el de Potencias (`cadena`, `points`, `post`, `lamina`, `sonido`, `taller`, `hud`, `scroll`, `contactos`) a pistas de tiempo (`lt`, `lb`, `ah`), materia persistente con el protón como índice fijo, el fondo-temperatura, el HUD de tres relojes y la regla-cono.
3. Fase 2 · prueba de fuego: del plasma a la primera estrella en un tramo continuo, más «Ahora».

## Plan de fases
0 Dirección (biblia, estudios de estilo) · 1 Motor · 2 Prueba de fuego (Acto I a III + Ahora) · 3 Acto IV, V y momentos con nombre · 4 Los extremos (Acto 0, VI, finales, bucle) · 5 Sonido, lámina, bilingüe, enlaces cruzados · 6 Pulido, móvil, deploy y README.
