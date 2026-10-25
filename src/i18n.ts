/**
 * Languages. The journey is written in Spanish; English is a dictionary keyed by the Spanish text,
 * applied where text reaches the screen (the worlds' names, sentences and notes, the moments'
 * captions, the page's own copy). A missing entry simply shows the Spanish.
 *
 * The language: `?lang=en|es`, else the visitor's last choice, else the browser's language
 * (Spanish for Spanish speakers, English for everyone else).
 */

export type Lang = 'es' | 'en';
const KEY = 'tiempo.lang';

export const lang: Lang = (() => {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null;
  if (q === 'en' || q === 'es') return q;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return nav.toLowerCase().startsWith('es') ? 'es' : 'en';
})();

/** The text in the current language. */
export const tx = (es: string) => (lang === 'en' ? (EN[es] ?? es) : es);

/** Switches language (remembered) and reloads in place. */
export function switchLang() {
  const next: Lang = lang === 'en' ? 'es' : 'en';
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage unavailable */
  }
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  location.replace(url.toString());
}

const EN: Record<string, string> = {
  // ---- The page.
  'Un solo scroll que recorre todo el tiempo: de antes del Big Bang a la última luz.': 'One scroll through all of time: from before the Big Bang to the last light.',
  'De antes del Big Bang a la última luz.': 'From before the Big Bang to the last light.',
  'Desliza para empezar': 'Scroll to begin',
  'Lámina': 'Plate',
  'Sonido': 'Sound',
  'Reproducir': 'Play',
  'Eras': 'Eras',
  'era provisional': 'provisional era',
  'De aquí en adelante, la física no está segura': 'From here on, physics is not sure',
  '¿Cómo termina?': 'How does it end?',
  'Frío': 'Cold',
  'lo más probable': 'the most likely',
  'Gran Desgarro': 'Big Rip',
  'si la energía oscura crece': 'if dark energy grows',
  'Gran Colapso': 'Big Crunch',
  'si se debilita': 'if it weakens',
  'Vacío que decae': 'Vacuum decay',
  'si nuestro vacío no es estable': 'if our vacuum is not stable',
  'Y todo vuelve a empezar': 'And it all begins again',
  'Un universo frío y vacío, sin nada que mida el tiempo, se parece a un comienzo.': 'A cold, empty universe, with nothing left to measure time, looks like a beginning.',

  // ---- The acts.
  'Antes del tiempo': 'Before time',
  'El primer segundo': 'The first second',
  'La niebla': 'The fog',
  'Oscuridad y amanecer': 'Darkness and dawn',
  'Nosotros': 'Us',
  'El futuro cercano': 'The near future',
  'El largo final': 'The long ending',
  'El final': 'The end',
  'Después del tiempo': 'After time',

  // ---- Before time, Planck, inflation.
  'Nadie sabe qué hubo antes. Hipótesis: burbujas de una inflación eterna, el final de un universo anterior, un rebote.': 'Nobody knows what came before. Hypotheses: bubbles of an eternal inflation, the end of an earlier universe, a bounce.',
  'antes': 'before',
  'La época de Planck': 'The Planck epoch',
  'El primer instante que la física puede nombrar. Hipótesis: el espacio burbujea, y quizá todo sean cuerdas vibrando.': 'The first instant physics can name. Hypotheses: space foams, and perhaps everything is vibrating strings.',
  'Inflación': 'Inflation',
  'inflación': 'inflation',
  'En menos tiempo del que la luz tarda en cruzar un protón, el espacio crece unas 10²⁶ veces.': 'In less time than light takes to cross a proton, space grows some 10²⁶ times.',
  'En menos tiempo del que la luz tarda en cruzar un protón, el espacio crece unas 10²⁶ veces. Sus arrugas cuánticas quedan estiradas: serán las galaxias.': 'In less time than light takes to cross a proton, space grows some 10²⁶ times. Its quantum wrinkles are stretched out: they will be the galaxies.',
  'Las semillas': 'The seeds',
  'Las arrugas del vacío, estiradas a escala cósmica, quedan congeladas: de ellas nacerán las galaxias.': 'The wrinkles of the vacuum, stretched to cosmic size, freeze in place: the galaxies will grow from them.',

  // ---- Quarks, annihilation, nuclei.
  'El plasma de quarks': 'The quark plasma',
  'quarks': 'quarks',
  'Quarks y gluones sueltos a billones de grados: ni siquiera existen los protones.': 'Free quarks and gluons at trillions of degrees: not even protons exist yet.',
  'Quarks y gluones sueltos a billones de grados. Hacia la millonésima de segundo quedan presos de a tres: nace nuestro protón.': 'Free quarks and gluons at trillions of degrees. Around a millionth of a second they are caught in threes: our proton is born.',
  'quark up': 'up quark',
  'quark down': 'down quark',
  'Los quarks quedan presos': 'The quarks are caught',
  'De a tres, sus colores se suman en blanco: nacen los protones y los neutrones. Uno de ellos es nuestro protón.': 'In threes, their colours add up to white: protons and neutrons are born. One of them is our proton.',
  'Una de cada mil millones': 'One in a billion',
  'aniquilación': 'annihilation',
  'La materia y la antimateria se aniquilan en destellos de luz. Sobra una partícula de cada mil millones: todo lo que existe es ese sobrante.': 'Matter and antimatter annihilate in flashes of light. One particle in a billion is left over: everything that exists is that remainder.',
  'La materia y la antimateria se aniquilan en un destello. Sobra una partícula de cada mil millones: todo lo que existe es ese sobrante.': 'Matter and antimatter annihilate in a flash. One particle in a billion is left over: everything that exists is that remainder.',
  'aquí sobrevive 1 de cada 30 · en realidad, 1 de cada 1 000 millones': 'here 1 in 30 survives · in reality, 1 in 1,000,000,000',
  'Los electrones también': 'Electrons too',
  'Hacia el primer segundo les toca a los electrones y a sus antipartículas. Sobra, otra vez, uno de cada mil millones: uno por cada protón.': 'Around the first second it is the turn of electrons and their antiparticles. Again, one in a billion is left: one for every proton.',
  'Veinte minutos de cocina': 'Twenty minutes of cooking',
  'núcleos': 'nuclei',
  'Protones y neutrones se juntan en núcleos de helio. Nuestro protón queda solo: será hidrógeno.': 'Protons and neutrons come together into helium nuclei. Our proton stays alone: it will be hydrogen.',
  'Se forman los núcleos de helio. Queda, en masa, tres cuartos de hidrógeno y un cuarto de helio, como hoy.': 'Helium nuclei form. By mass, three quarters hydrogen and one quarter helium are left, as today.',
  'helio: 2 protones + 2 neutrones': 'helium: 2 protons + 2 neutrons',
  'hidrógeno: un protón solo': 'hydrogen: a lone proton',
  'Un cuarto de helio': 'A quarter helium',
  'Tres cuartos de hidrógeno y un cuarto de helio, en masa: la misma mezcla que se mide hoy en las estrellas más viejas.': 'Three quarters hydrogen and one quarter helium by mass: the same mix measured today in the oldest stars.',

  // ---- The fog, the light.
  'la niebla': 'the fog',
  'Todo es un plasma incandescente: la luz choca con los electrones libres y no puede avanzar.': 'Everything is a glowing plasma: light bumps into free electrons and cannot get through.',
  'protón': 'proton',
  'electrón': 'electron',
  'helio': 'helium',
  'El universo sonaba': 'The universe rang',
  'Un plasma incandescente donde la luz no puede avanzar, que vibra con ondas de sonido reales. Con sonido (S) se oyen, unas cincuenta octavas más agudas.': 'A glowing plasma that light cannot cross, ringing with real sound waves. With sound on (S) you can hear them, some fifty octaves higher.',
  'Se hace la luz': 'Let there be light',
  'Los electrones caen en los protones: nace el hidrógeno, y la luz por fin puede viajar.': 'Electrons fall onto protons: hydrogen is born, and light can travel at last.',
  'El universo deja de brillar': 'The universe stops glowing',
  'Esa luz se enfría: naranja, rojo, infrarrojo. Hacia los tres millones de años ya no se ve. Hoy es el fondo de microondas.': 'That light cools: orange, red, infrared. By three million years it can no longer be seen. Today it is the microwave background.',
  'lo que alcanza a viajar la luz': 'how far light gets',
  'la luz ya viaja sin chocar': 'light now travels freely',
  'LA LUZ DEL UNIVERSO, POR COLOR': 'THE LIGHT OF THE UNIVERSE, BY COLOUR',
  'ultravioleta': 'ultraviolet',
  'visible': 'visible',
  'infrarrojo': 'infrared',

  // ---- The dark, the first stars, galaxies.
  'El gas se enfría': 'The gas cools',
  'gas frío': 'cold gas',
  'Ya no hay luz que ver. El gas, frío y casi uniforme, guarda arrugas diminutas: la gravedad las agranda.': 'There is no light left to see. The cold, almost even gas keeps tiny wrinkles: gravity makes them grow.',
  'Ya no hay luz que ver. El gas, frío y casi uniforme, guarda arrugas diminutas: las que estiró la inflación.': 'There is no light left to see. The cold, almost even gas keeps tiny wrinkles: the ones inflation stretched.',
  'La edad oscura': 'The dark ages',
  'Nada brilla. La materia oscura, que no se ve, arma una red, y el gas cae en ella.': 'Nothing shines. Dark matter, which cannot be seen, builds a web, and the gas falls into it.',
  'primera estrella': 'first star',
  'materia oscura: no brilla': 'dark matter: does not shine',
  'La primera estrella': 'The first star',
  'Cien veces el Sol, tan caliente que brilla azul. Vivirá unos tres millones de años.': 'A hundred times the Sun, so hot it shines blue. It will live about three million years.',
  'población III · ~100 soles · ~100 000 K': 'population III · ~100 suns · ~100,000 K',
  'frente de ionización': 'ionisation front',
  'onda de la supernova: carbono, oxígeno, hierro': 'supernova blast: carbon, oxygen, iron',
  'Muere joven': 'It dies young',
  'Estalla y siembra el gas con los primeros átomos pesados: carbono, oxígeno, hierro.': 'It explodes and seeds the gas with the first heavy atoms: carbon, oxygen, iron.',
  'El amanecer': 'The dawn',
  'En otros nudos de la red se encienden otras: el universo vuelve a tener luz propia.': 'In other knots of the web others light up: the universe has its own light again.',
  'Las burbujas se tocan': 'The bubbles touch',
  'galaxias': 'galaxies',
  'La luz de las primeras galaxias ioniza burbujas de gas que crecen hasta tocarse y fundirse, como un queso suizo.': 'The light of the first galaxies ionises bubbles of gas that grow until they touch and merge, like a Swiss cheese.',
  'La luz de las primeras galaxias ioniza burbujas de gas que crecen y se funden, como un queso suizo. El JWST ve galaxias a menos de 300 millones de años del inicio.': 'The light of the first galaxies ionises bubbles of gas that grow and merge, like a Swiss cheese. JWST sees galaxies less than 300 million years after the beginning.',
  'Más temprano de lo esperado': 'Earlier than expected',
  'El telescopio James Webb ve galaxias brillantes a menos de 300 millones de años del inicio: se formaron antes de lo que se creía.': 'The James Webb telescope sees bright galaxies less than 300 million years after the beginning: they formed earlier than anyone thought.',

  // ---- The Milky Way, the Sun.
  'La Vía Láctea': 'The Milky Way',
  'La Vía Láctea se arma': 'The Milky Way comes together',
  'Vía Láctea': 'Milky Way',
  'Nuestra galaxia crece tragándose galaxias más pequeñas. Nuestro protón viaja en el gas del disco.': 'Our galaxy grows by swallowing smaller galaxies. Our proton travels in the gas of the disc.',
  'Nuestra galaxia se arma con fusiones de galaxias más pequeñas. Nuestro protón viaja en el gas del disco.': 'Our galaxy comes together from mergers of smaller galaxies. Our proton travels in the gas of the disc.',
  'aquí nacerá el Sol': 'the Sun will be born here',
  'bulbo': 'bulge',
  'La expansión acelera': 'The expansion speeds up',
  'Hace unos cinco mil millones de años la energía oscura toma el mando: desde entonces el universo crece cada vez más rápido.': 'About five billion years ago dark energy takes over: since then the universe has grown faster and faster.',
  'Nace el Sol': 'The Sun is born',
  'el Sol': 'the Sun',
  'Una nube de gas y polvo colapsa en un disco. En su centro se enciende el Sol.': 'A cloud of gas and dust collapses into a disc. At its centre the Sun lights up.',
  'Una nube de gas, con restos de estrellas muertas, colapsa en un disco. En el centro se enciende el Sol; nuestro protón cae con el agua del disco.': "A cloud of gas, with the remains of dead stars, collapses into a disc. At the centre the Sun lights up; our proton falls in with the disc's water.",
  'aquí se forma la Tierra': 'the Earth forms here',
  'Restos de estrellas muertas': 'Remains of dead stars',
  'Una supernova cercana siembra la nube con carbono, oxígeno y hierro. Su hidrógeno, como nuestro protón, viene del principio.': 'A nearby supernova seeds the cloud with carbon, oxygen and iron. Its hydrogen, like our proton, comes from the beginning.',
  'Se enciende el Sol': 'The Sun lights up',
  'Hace 4 600 millones de años, en el centro del disco, empieza a fusionar hidrógeno. El polvo de alrededor se junta en anillos: ahí nacen los planetas.': '4.6 billion years ago, at the centre of the disc, it starts fusing hydrogen. The dust around it gathers into rings: that is where the planets are born.',

  // ---- Now.
  'Ahora': 'Now',
  'ahora': 'now',
  'Cada gesto, diez veces menos tiempo: mil millones de años, un millón, mil, un año, un segundo.': 'Each step, ten times less time: a billion years, a million, a thousand, a year, a second.',
  'Hacia ahora': 'Towards now',
  'Este protón está en ti': 'This proton is in you',
  'Nació en la primera millonésima de segundo. Hoy es parte del agua de tu cuerpo.': 'It was born in the first millionth of a second. Today it is part of the water in your body.',
  'Y el tiempo sigue': 'And time goes on',
  'Desde aquí el eje se abre de nuevo, hacia el futuro.': 'From here the axis opens again, towards the future.',
  'edad de hielo': 'ice age',
  'los continentes estaban en otro lugar': 'the continents were somewhere else',
  'tú, ahora': 'you, now',
  '104,5°': '104.5°',
  'se forma la Tierra': 'the Earth forms',
  'el aire se llena de oxígeno': 'the air fills with oxygen',
  'las primeras algas multicelulares': 'the first multicellular algae',
  'la explosión del Cámbrico': 'the Cambrian explosion',
  'los primeros animales salen del agua': 'the first animals leave the water',
  'los primeros dinosaurios': 'the first dinosaurs',
  'el asteroide: fin de los dinosaurios': 'the asteroid: the end of the dinosaurs',
  'los primeros homínidos': 'the first hominins',
  'las primeras herramientas de piedra': 'the first stone tools',
  'Homo sapiens': 'Homo sapiens',
  'el último máximo glacial': 'the last glacial maximum',
  'termina la glaciación; nace la agricultura': 'the ice age ends; farming begins',
  'la escritura': 'writing',
  'Copérnico: la Tierra gira alrededor del Sol': 'Copernicus: the Earth goes around the Sun',
  'Hubble: el universo se expande': 'Hubble: the universe is expanding',
  'se descubre la luz más antigua': 'the oldest light is discovered',
  'llegamos a la Luna': 'we reach the Moon',
  'se oyen ondas gravitacionales': 'gravitational waves are heard',
  'hace un año, hoy': 'a year ago today',
  'ayer a esta hora': 'yesterday at this time',
  'hace una hora': 'an hour ago',
  'llegaste a esta página': 'you arrived at this page',

  // ---- The Sun goes out, Andromeda.
  'El Sol se apaga': 'The Sun goes out',
  'el Sol se apaga': 'the Sun goes out',
  'futuro': 'future',
  'Mercurio': 'Mercury',
  'Venus': 'Venus',
  'la Tierra': 'Earth',
  'Marte': 'Mars',
  'Júpiter': 'Jupiter',
  'El Sol brillará cada vez más, se hinchará y se apagará: le quedan unos cinco mil millones de años.': 'The Sun will grow brighter, swell up and go out: it has about five billion years left.',
  'En unos cinco mil millones de años el Sol se hinchará como gigante roja y quedará como enana blanca. Andrómeda, quizá, se habrá fundido con nosotros.': 'In about five billion years the Sun will swell into a red giant and end as a white dwarf. Andromeda may have merged with us by then.',
  'La Tierra pierde sus océanos': 'The Earth loses its oceans',
  'El Sol brilla cada vez más. En unos mil millones de años el agua de la Tierra se evapora y escapa al espacio. Nuestro protón se va con ella.': "The Sun keeps brightening. In about a billion years the Earth's water boils off and escapes into space. Our proton leaves with it.",
  'Gigante roja': 'Red giant',
  'En unos cinco mil millones de años el Sol se hincha hasta casi la órbita de la Tierra y se traga a Mercurio y a Venus. Quizá también a la Tierra.': "In about five billion years the Sun swells almost to the Earth's orbit and swallows Mercury and Venus. Perhaps the Earth too.",
  'Nebulosa planetaria': 'Planetary nebula',
  'Suelta sus capas en una nube de colores. Queda una enana blanca del tamaño de la Tierra, que se enfriará durante billones de años.': 'It sheds its layers in a coloured cloud. What remains is a white dwarf the size of the Earth, which will cool for trillions of years.',
  'Andrómeda': 'Andromeda',
  'Andrómeda viene hacia nosotros. Quizá choquemos.': 'Andromeda is coming towards us. We may collide.',
  'probabilidad de fusión ≈ 50 % en 10 000 millones de años (Sawala et al., 2025)': 'chance of a merger ≈ 50% within 10 billion years (Sawala et al., 2025)',
  'Un cielo con una sola galaxia': 'A sky with a single galaxy',
  'Las demás galaxias se alejan cada vez más rápido y cruzan el horizonte. Un astrónomo del futuro no podría saber que hubo un Big Bang.': 'All other galaxies recede faster and faster and cross the horizon. An astronomer of the future could not know there was a Big Bang.',
  'La última estrella': 'The last star',
  'Las estrellas se apagan una a una, las más grandes primero. Hacia los 10¹⁴ años se apaga la última enana roja.': 'The stars go out one by one, the biggest first. Around 10¹⁴ years the last red dwarf goes out.',

  // ---- The long ending (cold).
  'Las estrellas muertas': 'The dead stars',
  'restos': 'remains',
  'Quedan enanas blancas que se enfrían hasta volverse negras, estrellas de neutrones y agujeros negros. La galaxia se evapora.': 'White dwarfs are left, cooling until they turn black, with neutron stars and black holes. The galaxy evaporates.',
  'Un fuego raro': 'A rare fire',
  'A veces dos enanas marrones chocan y encienden una estrella nueva, por un rato.': 'Now and then two brown dwarfs collide and light a new star, for a while.',
  '¿Mueren los protones?': 'Do protons die?',
  'protones': 'protons',
  'Nadie ha visto morir uno: viven más de 10³⁴ años. Si mueren, nuestro protón se irá en un destello.': 'Nobody has seen one die: they live more than 10³⁴ years. If they do die, our proton will go in a flash.',
  'si los protones no decaen, el nuestro sigue aquí, para siempre': 'if protons do not decay, ours stays here, forever',
  'Adiós': 'Goodbye',
  'Desde la primera millonésima de segundo hasta aquí: unos 10⁴⁰ años. Fue hidrógeno, agua, parte de ti.': 'From the first millionth of a second to here: some 10⁴⁰ years. It was hydrogen, water, part of you.',
  'La última luz': 'The last light',
  'última luz': 'last light',
  'Solo quedan agujeros negros, que se evaporan muy, muy despacio. El último termina en un destello hacia los 10¹⁰⁰ años.': 'Only black holes are left, evaporating very, very slowly. The last one ends in a flash around 10¹⁰⁰ years.',
  'El último agujero negro se evapora en un destello. Después, nada vuelve a brillar.': 'The last black hole evaporates in a flash. After that, nothing ever shines again.',
  'La oscuridad': 'The dark',
  'oscuridad': 'dark',
  'Un universo frío, vacío y en calma. Ya nada cambia: solo los números siguen corriendo.': 'A cold, empty, quiet universe. Nothing changes any more: only the numbers keep running.',
  'final': 'end',
  'Las estrellas se apagan una a una; quedan enanas negras y agujeros negros, que se evaporan. La última luz, hacia los 10¹⁰⁰ años.': 'The stars go out one by one; black dwarfs and black holes are left, and the holes evaporate. The last light, around 10¹⁰⁰ years.',

  // ---- The other endings.
  'El Gran Desgarro': 'The Big Rip',
  'desgarro': 'rip',
  'Si la energía oscura crece sin freno, la expansión acaba rompiéndolo todo, de lo más grande a lo más pequeño: Potencias al revés.': 'If dark energy keeps growing, the expansion ends up tearing everything apart, from the largest to the smallest: Potencias in reverse.',
  'Faltan 60 millones de años': '60 million years to go',
  'La galaxia se deshace: sus estrellas se alejan unas de otras cada vez más rápido.': 'The galaxy comes apart: its stars fly away from each other faster and faster.',
  'planetas': 'planets',
  'Faltan tres meses: los planetas se sueltan de su estrella.': 'Three months to go: the planets break loose from their star.',
  'Faltan tres meses': 'Three months to go',
  'Los planetas se sueltan de su estrella.': 'The planets break loose from their star.',
  'planeta': 'planet',
  'Faltan treinta minutos: los planetas se rompen en pedazos.': 'Thirty minutes to go: the planets break into pieces.',
  'Faltan treinta minutos': 'Thirty minutes to go',
  'Los planetas se rompen en pedazos.': 'The planets break into pieces.',
  'átomo': 'atom',
  'Faltan 10⁻¹⁹ segundos: los átomos se rompen. Después, el espacio mismo.': '10⁻¹⁹ seconds to go: atoms break apart. Then space itself.',
  'Faltan 10⁻¹⁹ segundos': '10⁻¹⁹ seconds to go',
  'Los átomos se rompen. Después, el espacio mismo.': 'Atoms break apart. Then space itself.',
  'el tiempo se acaba': 'time runs out',
  'El Gran Colapso': 'The Big Crunch',
  'colapso': 'crunch',
  'Si la energía oscura se debilita, la expansión podría frenar e invertirse: todo vuelve a caer, y a calentarse.': 'If dark energy weakens, the expansion could stop and turn around: everything falls back, and heats up.',
  'Todo vuelve a caer': 'Everything falls back',
  'Las galaxias dejan de alejarse y regresan, cada vez más rápido. Su luz se corre al azul y el cielo empieza a brillar.': 'The galaxies stop receding and come back, faster and faster. Their light shifts to blue and the sky begins to glow.',
  'De vuelta a la niebla': 'Back to the fog',
  'El universo vuelve a ser un plasma incandescente, como antes de la primera luz. ¿Un final, o el comienzo de un rebote?': 'The universe is a glowing plasma again, as before the first light. An ending, or the start of a bounce?',
  'El vacío que decae': 'Vacuum decay',
  'vacío': 'vacuum',
  'Si nuestro vacío no es el más estable, una burbuja de vacío verdadero podría nacer en cualquier punto y crecer casi a la velocidad de la luz.': 'If our vacuum is not the most stable one, a bubble of true vacuum could appear anywhere and grow at almost the speed of light.',
  'la pared de la burbuja, dibujada: viaja a la velocidad de la luz y nadie la vería venir': "the bubble's wall, drawn: it travels at the speed of light and nobody would see it coming",
  'Sin aviso': 'Without warning',
  'Dentro, las leyes de la física serían otras. Nada de lo que conocemos podría existir.': 'Inside, the laws of physics would be different. Nothing we know could exist.',

  // ---- After time.
  'después': 'after',
  'Hipótesis: si se espera lo suficiente, todo vuelve a pasar; quizá nacen universos de otros; quizá el final es un comienzo.': 'Hypotheses: wait long enough and everything happens again; perhaps universes are born from others; perhaps the end is a beginning.',
};
