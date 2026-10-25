# Tiempo · biblia visual

**Una idea:** un solo scroll que recorre todo el tiempo, de antes del Big Bang a la última luz y después. **Tú te quedas y el tiempo pasa:** la cámara está en nuestro lugar del universo, y la misma materia se reordena delante de ella.

Tercera pieza de la serie *Escalas* (Potencias mide el tamaño; Tiempo, la duración). De la misma familia que Potencias, pero no igual.

## Principios
0. **Un viaje muy, muy largo.** De 10⁻⁴³ s a 10¹⁰⁰ años y más: unos 150 órdenes de magnitud, más del doble que Potencias. Mucho scroll, y algo que ver en cada tramo.
1. **Lo visual va primero.** Cada era tiene un nombre, **una frase** y su momento en el tiempo. Si algo necesita un párrafo, va a la lámina.
2. **Tú te quedas, el tiempo pasa.** La cámara está en el trocito de universo que algún día será la Vía Láctea, el Sol y la Tierra. Se mueve para los momentos (se acerca a nuestro protón, se asoma a una estrella), pero vuelve.
3. **Nada se crea: el tiempo reordena.** Hay una sola materia persistente que nunca desaparece de golpe: los quarks quedan presos en protones, los protones atrapan electrones, el gas cae en la red, se enciende en estrellas, los continentes se asientan… y en el futuro lejano el proceso se invierte: todo se dispersa, se enfría y se apaga.
4. **El hilo: un protón tuyo.** Un punto azul que la cámara nunca pierde. Nace cuando los quarks quedan presos (~10⁻⁶ s), atrapa su electrón (380 000 años), cae en la nube que formará el Sol y queda en el agua de la Tierra. En **Ahora**: «este protón está en ti». Después lo seguimos hasta el final, y si los protones decaen (hipótesis), es el último en desaparecer.
5. **Cada color tiene una razón física**, como en Potencias cada parpadeo. El fondo es el color de cuerpo negro del universo en ese instante, calculado con la ley de Planck, nunca elegido a mano.
6. **Lo observado, lo teórico y lo especulativo se distinguen a la vista:** continuo = observado, discontinuo = teórico, punteado = especulativo. Lo especulativo se dibuja en lenguaje de **lámina**.
7. **Momentos con nombre**, pocos y solo donde pasa algo que no pasa en otro lado (se hace la luz, la primera estrella, ahora…).
8. **Nunca un cuadro vacío por accidente.** La edad oscura y la muerte térmica son oscuras porque ese es el tema, pero medidas: algo se mueve, una lámina mide, un número corre.
9. **Los números son el espectáculo** en los extremos: 10⁻⁴³ s, 10¹⁰⁰ años, 10^(10^(10^…)) años.
10. **Nada parpadea sin razón física** (heredado de Potencias). Una captura de electrón suelta un fotón: eso puede destellar. Lo que pasa más rápido de lo que el ojo sigue se ve como una **exposición larga** (los días se vuelven bandas, las edades de hielo un promedio), nunca como un estroboscopio.

## Lenguaje
| Capa | Qué es | Dónde |
|---|---|---|
| **El fondo-temperatura** | La radiación que llena el universo, del color de su temperatura (Planck) y con el brillo que vería un ojo adaptado a la oscuridad | Blanco azulado → amarillo → naranja en la niebla; rojo y negro a los ~3 millones de años; negro después |
| **Partículas de luz** | La materia, con tamaño físico (motor de Potencias) | En todo el viaje |
| **Tinta** | La materia que además **tapa** luz: sobre un fondo brillante una partícula es una mota oscura; sobre negro, una chispa | Donde el universo brilla más que su materia (la niebla, la luz de una estrella) |
| **Lámina científica** | Líneas finas, notas con guía, figuras medidas | Capa opcional (tecla I) y lenguaje de lo especulativo y de lo que no brilla (la materia oscura) |

## Color
Interfaz: tinta `#ece7db`, tenue al 50 %, **acento azul `#8fb4ff`** (el protón, el marcador, los números de la lámina). Potencias es naranja `#ff5b2e`; Tiempo, azul. Sobre un fondo brillante la tinta de la interfaz se invierte a oscuro (`#1a1510`).

| Era | Paleta |
|---|---|
| La niebla | El fondo es la luz misma: blanco azulado, amarillo, naranja (cuerpo negro de 10⁹ K a 3 000 K). Protones blanco cálido, electrones azul hielo, helio dorado |
| Se hace la luz | Naranja que pasa a rojo y a negro; la luz libre en trazos del color de la temperatura |
| Edad oscura | Negro de verdad; gas azul frío muy tenue; la materia oscura en lámina punteada |
| Primeras estrellas | Azul blanco (~100 000 K), burbujas de hidrógeno ionizado rosadas (H-alfa), restos de supernova en CPK de Potencias (carbono lila, oxígeno rojo, hierro naranja) |
| Ahora | La Tierra de verdad: océano azul profundo, tierras verdes y ocres, hielo gris azulado, atmósfera azul en el borde |
| Futuro lejano | Rojos de enanas rojas, blancos que se apagan a gris, anillos de luz de agujeros negros (por definir) |

## Tipografía
- **Instrument Serif:** nombres de momentos (cursiva) y el exponente grande.
- **Geist:** interfaz.
- **Geist Mono:** cifras, unidades y etiquetas. Ojo: Geist Mono no trae los superíndices ⁴–⁹; los exponentes se dibujan elevados a mano (`rotuloPot`).

## Los tres relojes (HUD)
- Grande, en Instrument Serif: **t = 10¹³ s**, con el exponente como protagonista. En el zoom de «Ahora» el eje cambia de origen: **hace 10⁶ años**, **hace 10⁷ s**; al llegar, **Ahora**; después, **dentro de 10³ años**.
- Debajo, en Geist Mono: «380 000 años después del inicio · hace 13 787 millones de años», la temperatura del universo y el tamaño del trocito que hoy es nuestro universo observable (une Tiempo con Potencias).
- La tercera línea, tenue: el **calendario cósmico** de Sagan («1 de enero, 00:14»).
- En «Ahora»: la hora real del visitante y la edad del universo contando los segundos desde que entró (con su ± 20 millones de años).

## La regla de la derecha: el cono del tiempo
Vertical, estrecho arriba (el inicio) y ensanchándose hacia abajo; **relleno con el color del universo en cada momento** (el mismo cálculo de Planck: blanco y naranja arriba, negro después); bordes continuos, discontinuos o punteados según la certeza; dos ramas punteadas se abren donde la física deja de estar segura (los finales). El marcador azul es «estás aquí»; solo se nombra la era donde estás.

## Movimiento y cámara
- La cámara se queda en nuestro lugar. Se mueve para los momentos y vuelve.
- El mouse inclina la vista unos grados (paralaje), nunca más.
- El tiempo avanza **lineal en el exponente**, pero puede detenerse cuando la acción lo pide (la vida de una estrella cabe en una centésima de orden de magnitud).
- Lo que pasa demasiado rápido se ve como exposición larga, no como parpadeo.

## Sonido
- Opcional y apagado al empezar (tecla **S**). Generado en el navegador, sin archivos.
- **El tono baja con la temperatura:** agudo y brillante en el plasma, más grave a medida que el universo se enfría.
- **«El universo sonaba»:** las oscilaciones acústicas del plasma, transpuestas a lo audible, son el único momento musical con razón física.
- Una campana suave al llegar a cada momento, afinada según la temperatura. En el futuro lejano, el sonido se vacía hasta el silencio: la última luz es la última campana.
- Ambiente, no música.

## Los extremos
Antes del tiempo de Planck y después de la última luz, lo medible da paso a lo hipotético: estilo de lámina, y los números como efecto (10^(10^…) años). El final se parece al principio (Penrose): la última lámina se vuelve la portada y la página entra en bucle.

## Técnica (reglas del motor)
- Todo es función del **progreso del scroll** → pistas de la línea de tiempo. Reversible siempre.
- Pista principal **`lt`** (log₁₀ del tiempo en segundos); de ella salen la temperatura, el color del fondo y el tamaño de nuestro trozo de universo (`src/lib/cosmo.ts`, `src/lib/cuerpo-negro.ts`). El zoom de «Ahora» usa **`lb`** (log₁₀ de los años hacia atrás) y **`ah`** (hacia adelante).
- **Materia persistente:** un conjunto de partículas cuyos atributos se redirigen de una era a la siguiente; las eras son módulos (spec + generate + assemble + coreografía, como los mundos de Potencias). El protón protagonista es un índice fijo, siempre visible.
- **Doble precisión relativa a un pivote**, como en Potencias: ni el tiempo ni el tamaño llegan crudos a la GPU.
- 60 fps en escritorio, generación pesada en workers, calidad adaptable, modo liviano en teléfonos, respeto de «reducir movimiento».
