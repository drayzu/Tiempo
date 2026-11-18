import './marco.css';

/**
 * El marco de Horizontes: la interfaz que comparten las siete obras (marco/maqueta.html).
 *
 * - La marca, arriba a la izquierda: el nombre de la obra; al pasar, los siete puntos de la serie;
 *   con un clic, el mapa.
 * - La barra, arriba a la derecha: lámina (I), sonido (S), reproducir (A), pantalla completa (F) e
 *   idioma (L). Lo que una obra todavía no tiene queda tenue y dice «pronto».
 * - El progreso: un pelo abajo, de borde a borde.
 * - El reposo: a los 3,5 s sin tocar nada se apaga todo lo que no es la obra (también la regla de la
 *   obra, si escucha `body.marco-quieto` o lee `marco.reposo`).
 * - «Desliza para empezar», bajo el punto.
 * - La tarjeta final, «Continúa en», que con ▷ puesto se llena como cuenta regresiva y lleva sola a
 *   la obra siguiente (nunca hacia ni desde Abismo). La de Abismo lleva la línea de ayuda como enlace.
 * - El mapa de la serie.
 *
 * Este archivo es la fuente: cada obra lleva una copia en `src/marco/`. Si se cambia, se copia de
 * nuevo a las siete.
 */

export type ObraId = 'espacio' | 'tiempo' | 'destino' | 'infinito' | 'mente' | 'abismo' | 'vida';
type Lang = 'es' | 'en';

interface Obra {
  id: ObraId;
  n: string;
  nombre: string;
  q: Record<Lang, string>;
  color: string;
  /** Sin dirección: todavía no está publicada. */
  url?: string;
}

export const SERIE: Obra[] = [
  { id: 'espacio', n: '01', nombre: 'Espacio', q: { es: '¿Dónde estamos?', en: 'Where are we?' }, color: '#ff5b2e', url: 'https://drayzu.github.io/Espacio/' },
  { id: 'tiempo', n: '02', nombre: 'Tiempo', q: { es: '¿Cuándo estamos?', en: 'When are we?' }, color: '#8fb4ff', url: 'https://drayzu.github.io/Tiempo/' },
  { id: 'destino', n: '03', nombre: 'Destino', q: { es: '¿Adónde podemos llegar?', en: 'How far can we go?' }, color: '#6fe3c1', url: 'https://drayzu.github.io/Destino/' },
  { id: 'infinito', n: '04', nombre: 'Infinito', q: { es: '¿Qué hay más allá?', en: 'What lies beyond?' }, color: '#c9b4ff', url: 'https://drayzu.github.io/Infinito/' },
  { id: 'mente', n: '05', nombre: 'Mente', q: { es: '¿Quién mira?', en: 'Who is watching?' }, color: '#ffd180', url: 'https://drayzu.github.io/Mente/' },
  { id: 'abismo', n: '06', nombre: 'Abismo', q: { es: '¿Para qué seguir?', en: 'Why go on?' }, color: '#ff6f91', url: 'https://drayzu.github.io/Abismo/' },
  { id: 'vida', n: '07', nombre: 'Vida', q: { es: '¿Qué hacemos con ella?', en: 'What do we do with it?' }, color: '#ffc4a3' },
];

const TXT: Record<Lang, Record<string, string>> = {
  es: {
    lamina: 'Lámina', sonido: 'Sonido', play: 'Reproducir', pausa: 'Pausa', pantalla: 'Pantalla completa', salir: 'Salir de pantalla completa',
    idioma: 'English', pronto: 'pronto', desliza: 'Desliza para empezar', oTecla: 'o presiona <kbd>A</kbd> y mira', oToca: 'o toca ▷ y mira',
    continua: 'Continúa en', vuelve: 'Vuelve a empezar', entrar: 'Entrar', denuevo: 'Ver de nuevo', mapa: 'Horizontes', volver: 'Volver al mapa',
    aqui: 'Estás aquí', lema: 'Todo, desde aquí.', atlas: 'El Atlas', cerrar: 'Cerrar', abrirMapa: 'Abrir el mapa de Horizontes',
    ayuda: 'Si lo estás pensando, habla hoy con alguien.', ayuda2: 'líneas de ayuda en tu país, gratis', chile: 'En Chile: *4141, gratis, a toda hora',
  },
  en: {
    lamina: 'Plate', sonido: 'Sound', play: 'Play', pausa: 'Pause', pantalla: 'Full screen', salir: 'Exit full screen',
    idioma: 'Español', pronto: 'soon', desliza: 'Scroll to begin', oTecla: 'or press <kbd>A</kbd> and watch', oToca: 'or tap ▷ and watch',
    continua: 'Continues in', vuelve: 'Starts again', entrar: 'Enter', denuevo: 'Watch again', mapa: 'Horizontes', volver: 'Back to the map',
    aqui: 'You are here', lema: 'Everything, from here.', atlas: 'The Atlas', cerrar: 'Close', abrirMapa: 'Open the map of Horizontes',
    ayuda: 'If you are thinking about it, talk to someone today.', ayuda2: 'helplines in your country, free', chile: 'In Chile: *4141, free, any time',
  },
};

const ICONO = {
  lamina: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
  sonido: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3l5 4V6L7 10H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5"/><path d="M18.5 7a7.5 7.5 0 0 1 0 10"/></svg>',
  play: '<svg class="marco-juega" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5-10-6.5Z"/></svg><svg class="marco-pausa" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>',
  pantalla: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
};

export interface Acciones {
  /** Pone o quita el modo automático (A). */
  play(): void;
  /** La lámina (I); devuelve si quedó puesta. Sin ella, el botón dice «pronto». */
  lamina?(): boolean;
  /** El sonido (S); devuelve si quedó puesto. Sin él, el botón dice «pronto». */
  sonido?(): boolean | Promise<boolean>;
  /** Cambia el idioma (L; la obra recarga). Sin él, el botón dice «pronto» y el marco habla español. */
  idioma?(): void;
}

export interface MarcoOpciones {
  obra: ObraId;
  lang?: Lang;
  acciones: Acciones;
}

/** Lo que la obra le dice al marco en cada cuadro. */
export interface Estado {
  /** Cuánto del viaje va, de 0 a 1. */
  p: number;
  playing: boolean;
  /** La marca, la barra y el progreso (0..1): la obra los apaga en su apertura y en su título. */
  cromo?: number;
  /** «Desliza para empezar» (0..1). */
  inicio?: number;
  /** La tarjeta final (0..1). */
  fin?: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function crearMarco(op: MarcoOpciones) {
  const obra = SERIE.find((o) => o.id === op.obra)!;
  const i = SERIE.indexOf(obra);
  const sig = SERIE[(i + 1) % SERIE.length];
  const lang: Lang = op.acciones.idioma ? (op.lang ?? 'es') : 'es';
  const t = TXT[lang];
  const conLang = (url: string, extra = '') => `${url}?lang=${lang}${extra}`;
  const tactil = matchMedia('(hover: none)').matches;
  const root = document.documentElement;
  root.style.setProperty('--marco-acento', obra.color);
  root.style.setProperty('--marco-sig', sig.color);

  const el = (tag: string, cls: string, html = '') => {
    const e = document.createElement(tag);
    e.className = cls;
    e.innerHTML = html;
    return e;
  };

  // --- La marca ---
  const marca = el('div', 'marco-marca');
  // Empieza apagada: la obra dice en su primer cuadro si se ve (no asoma bajo el título mientras carga).
  marca.style.opacity = '0';
  const nombre = el('button', 'marco-nombre', obra.nombre) as HTMLButtonElement;
  nombre.type = 'button';
  nombre.setAttribute('aria-label', `${obra.nombre} · ${t.abrirMapa}`);
  const serie = el(
    'span',
    'marco-serie',
    SERIE.map((o) => `<i${o === obra ? ' class="es"' : ` style="background:${o.color}"`}></i>`).join('') + `<b>HORIZONTES · ${obra.n}</b>`,
  );
  serie.setAttribute('aria-hidden', 'true');
  marca.append(nombre, serie);

  // --- La barra ---
  const barra = el('div', 'marco-barra');
  type Chip = 'lamina' | 'sonido' | 'play' | 'pantalla' | 'idioma';
  const TECLA: Record<Chip, string> = { lamina: 'I', sonido: 'S', play: 'A', pantalla: 'F', idioma: 'L' };
  const chips = {} as Record<Chip, HTMLButtonElement>;
  const etiqueta = (c: Chip, texto: string) => {
    chips[c].querySelector('.marco-t')!.innerHTML = `${texto} · <kbd>${TECLA[c]}</kbd>`;
    chips[c].setAttribute('aria-label', texto);
  };
  const pantallaPosible = !!document.fullscreenEnabled;
  for (const c of ['lamina', 'sonido', 'play', 'pantalla', 'idioma'] as Chip[]) {
    if (c === 'pantalla' && !pantallaPosible) continue;
    const icono = c === 'idioma' ? `<span class="marco-letra">${lang === 'es' ? 'EN' : 'ES'}</span>` : ICONO[c];
    const b = el('button', 'marco-chip', `${icono}<span class="marco-t"></span>`) as HTMLButtonElement;
    b.type = 'button';
    chips[c] = b;
    barra.append(b);
  }
  const falta = (c: Chip) => (c === 'lamina' && !op.acciones.lamina) || (c === 'sonido' && !op.acciones.sonido) || (c === 'idioma' && !op.acciones.idioma);
  const NOMBRE: Record<Chip, string> = { lamina: t.lamina, sonido: t.sonido, play: t.play, pantalla: t.pantalla, idioma: t.idioma };
  for (const c of Object.keys(chips) as Chip[]) {
    etiqueta(c, falta(c) ? `${NOMBRE[c]} · ${t.pronto}` : NOMBRE[c]);
    if (falta(c)) {
      chips[c].classList.add('is-soon');
      chips[c].setAttribute('aria-disabled', 'true');
    } else if (c !== 'pantalla' && c !== 'idioma') {
      chips[c].setAttribute('aria-pressed', 'false');
    }
  }
  const encender = (c: Chip, on: boolean) => {
    chips[c]?.classList.toggle('is-on', on);
    if (!falta(c)) chips[c]?.setAttribute('aria-pressed', String(on));
  };
  let avisado = 0;
  const avisar = (c: Chip) => {
    chips[c]?.classList.add('is-told');
    clearTimeout(avisado);
    avisado = window.setTimeout(() => chips[c]?.classList.remove('is-told'), 1800);
  };

  // --- El progreso, el inicio y el final ---
  const progreso = el('div', 'marco-progreso', '<i></i>');
  progreso.setAttribute('aria-hidden', 'true');
  const barraP = progreso.firstElementChild as HTMLElement;
  const cue = el('p', 'marco-cue', `<span class="marco-k">${t.desliza}</span><span class="marco-cue-l"></span><small>${tactil ? t.oToca : t.oTecla}</small>`);
  cue.setAttribute('aria-hidden', 'true');

  const fin = el('section', 'marco-fin');
  fin.setAttribute('aria-label', t.continua);
  const automatico = obra.id !== 'abismo' && sig.id !== 'abismo' && !!sig.url;
  const vuelta = sig.id === 'espacio';
  const titulo = sig.url ? `<a class="marco-fin-t" href="${conLang(sig.url)}">${sig.nombre}</a>` : `<span class="marco-fin-t">${sig.nombre}</span>`;
  if (obra.id === 'abismo') {
    // Sin pregunta (bajo «¿Para qué seguir?» se leería como respuesta) y sin cuenta regresiva.
    fin.classList.add('is-abismo');
    fin.innerHTML = `
      <div class="marco-ayuda">
        <p>${t.ayuda}</p>
        <span><a href="https://findahelpline.com" target="_blank" rel="noopener">findahelpline.com</a> · ${t.ayuda2}</span>
        <span>${t.chile}</span>
      </div>
      <p class="marco-k">${t.continua}</p>
      ${titulo}
      ${sig.url ? '' : `<span class="marco-pronto">${t.pronto}</span>`}
      <div class="marco-otros"><button type="button" data-ir="mapa">${t.volver}</button></div>`;
  } else {
    fin.innerHTML = `
      <p class="marco-k">${vuelta ? t.vuelve : t.continua}</p>
      ${titulo}
      <p class="marco-fin-q">${sig.q[lang]}</p>
      ${sig.url ? `<a class="marco-entrar" href="${conLang(sig.url)}">${t.entrar} →</a>` : `<span class="marco-pronto">${t.pronto}</span>`}
      <div class="marco-otros"><button type="button" data-ir="inicio">↺ ${t.denuevo}</button><button type="button" data-ir="mapa">◦ ${t.mapa}</button></div>`;
  }
  const entrar = fin.querySelector<HTMLElement>('.marco-entrar');

  // --- El mapa ---
  const mapa = el('div', 'marco-mapa');
  mapa.setAttribute('role', 'dialog');
  mapa.setAttribute('aria-modal', 'true');
  mapa.setAttribute('aria-label', 'Horizontes');
  mapa.innerHTML = `
    <div class="marco-mapa-k"><p class="marco-k">Horizontes</p><p class="marco-lema">${t.lema}</p></div>
    <ol>${SERIE.map((o) => {
      const dentro = `<span class="marco-pt"><i></i></span><span class="marco-n">${o.n}</span><span class="marco-o">${o.nombre}</span><span class="marco-q">${o.url ? o.q[lang] : t.pronto}</span>${o === obra ? `<span class="marco-aqui">${t.aqui}</span>` : ''}`;
      const cls = [o === obra ? 'es' : '', o.url ? '' : 'pronto'].join(' ');
      if (o === obra) return `<li class="${cls}" style="--c:${o.color}"><button type="button" data-cerrar>${dentro}</button></li>`;
      if (!o.url) return `<li class="${cls}" style="--c:${o.color}"><span class="marco-li">${dentro}</span></li>`;
      return `<li class="${cls}" style="--c:${o.color}"><a href="${conLang(o.url)}">${dentro}</a></li>`;
    }).join('')}</ol>
    <div class="marco-mapa-pie"><a href="https://drayzu.github.io/Atlas/" target="_blank" rel="noopener">${t.atlas} ↗</a><button type="button" data-cerrar>${t.cerrar} · Esc</button></div>`;

  document.body.append(marca, barra, cue, fin, progreso, mapa);

  // --- Lo que hacen ---
  let mapaAbierto = false;
  let antesDelMapa: Element | null = null;
  const abrirMapa = (abrir: boolean) => {
    mapaAbierto = abrir;
    mapa.classList.toggle('is-in', abrir);
    document.body.classList.toggle('marco-con-mapa', abrir);
    if (abrir) {
      antesDelMapa = document.activeElement;
      mapa.querySelector<HTMLElement>('li.es button')?.focus({ preventScroll: true });
    } else {
      (antesDelMapa as HTMLElement | null)?.focus?.({ preventScroll: true });
    }
  };
  nombre.addEventListener('click', () => abrirMapa(true));
  mapa.addEventListener('click', (ev) => {
    if ((ev.target as Element).closest('[data-cerrar]') || ev.target === mapa) abrirMapa(false);
  });
  fin.addEventListener('click', (ev) => {
    const ir = (ev.target as Element).closest<HTMLElement>('[data-ir]')?.dataset.ir;
    if (ir === 'mapa') abrirMapa(true);
    // De vuelta al comienzo, cargando la obra de nuevo (rebobinar todo el viaje en pantalla sería lento).
    if (ir === 'inicio') location.href = conLang(location.origin + location.pathname);
  });

  const hacer: Record<Chip, () => void> = {
    play: () => op.acciones.play(),
    lamina: () => (op.acciones.lamina ? encender('lamina', op.acciones.lamina()) : avisar('lamina')),
    sonido: () => {
      if (!op.acciones.sonido) return avisar('sonido');
      void Promise.resolve(op.acciones.sonido()).then((on) => encender('sonido', on));
    },
    pantalla: () => {
      if (!pantallaPosible) return;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void root.requestFullscreen().catch(() => {});
    },
    idioma: () => (op.acciones.idioma ? op.acciones.idioma() : avisar('idioma')),
  };
  for (const c of Object.keys(chips) as Chip[]) chips[c].addEventListener('click', hacer[c]);
  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    encender('pantalla', on);
    if (chips.pantalla) etiqueta('pantalla', on ? t.salir : t.pantalla);
  });
  addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if ((ev.target as Element | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
    const k = ev.key.toLowerCase();
    if (k === 'escape' && mapaAbierto) return abrirMapa(false);
    const c = ({ a: 'play', i: 'lamina', s: 'sonido', f: 'pantalla', l: 'idioma' } as Record<string, Chip>)[k];
    if (c) hacer[c]();
  });

  // El reposo, y la cuenta regresiva que cualquier gesto corta.
  let quieto = 0;
  let ultimoGesto = 0;
  const despierta = () => {
    document.body.classList.remove('marco-quieto');
    clearTimeout(quieto);
    quieto = window.setTimeout(() => document.body.classList.add('marco-quieto'), 3500);
  };
  for (const e of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const) addEventListener(e, despierta, { passive: true });
  // Mover el mouse no corta la cuenta regresiva; hacer algo, sí.
  for (const e of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) addEventListener(e, () => (ultimoGesto = performance.now()), { passive: true });
  despierta();

  let reposo = 0;
  let final = 0;
  let ultimoPlay = -1e9;
  let finVisto = false;
  let cuentaDesde = 0;
  let cuentaViva = false;
  let antes = performance.now();
  const llegada = new URLSearchParams(location.search).has('auto') && obra.id !== 'abismo';
  if (llegada) {
    // Viene de la obra anterior en modo automático: sigue sola, cuando la página ya tiene su largo.
    setTimeout(() => op.acciones.play(), 1200);
  }

  return {
    update(s: Estado) {
      const now = performance.now();
      const dt = Math.min(0.1, (now - antes) / 1000);
      antes = now;
      const cromo = s.cromo ?? 1;
      const enFin = (s.fin ?? 0) > 0.5;
      const quietoAhora = document.body.classList.contains('marco-quieto') && !enFin && !mapaAbierto && (s.inicio ?? 0) < 0.5;
      reposo += ((quietoAhora ? 1 : 0) - reposo) * Math.min(1, dt * (quietoAhora ? 1.4 : 6));
      final += ((enFin ? 1 : 0) - final) * Math.min(1, dt * 2.5);
      document.body.classList.toggle('marco-reposo', quietoAhora);
      // En el final, la tarjeta queda sola: la obra apaga su HUD y su regla con `body.marco-final`.
      document.body.classList.toggle('marco-final', enFin);

      marca.style.opacity = String(cromo);
      marca.style.pointerEvents = cromo > 0.5 ? '' : 'none';
      barraP.style.transform = `scaleX(${Math.min(1, Math.max(0, s.p))})`;
      progreso.style.opacity = String(cromo * (1 - (s.fin ?? 0)));
      cue.style.opacity = String((s.inicio ?? 0) * (s.playing ? 0 : 1));
      fin.classList.toggle('is-in', enFin);
      encender('play', s.playing);
      etiqueta('play', s.playing ? t.pausa : t.play);

      // ▷ puesto al llegar al final: ENTRAR se llena y la obra siguiente empieza sola.
      if (s.playing) ultimoPlay = now;
      if (enFin && !finVisto) {
        finVisto = true;
        cuentaViva = automatico && now - ultimoPlay < 4000;
        cuentaDesde = now;
      }
      if (!enFin) {
        finVisto = false;
        cuentaViva = false;
      }
      if (cuentaViva && ultimoGesto > cuentaDesde + 300 && !s.playing) cuentaViva = false;
      const k = cuentaViva ? Math.min(1, (now - cuentaDesde) / 10000) : 0;
      entrar?.style.setProperty('--k', String(k));
      if (cuentaViva && k >= 1 && sig.url) {
        cuentaViva = false;
        location.href = conLang(sig.url, '&auto=1');
      }
    },
    /** Refleja un cambio hecho por la obra misma. */
    lamina: (on: boolean) => encender('lamina', on),
    sonido: (on: boolean) => encender('sonido', on),
    /** 0 despierto … 1 en reposo, suavizado: para lo que la obra dibuja en su lienzo (la regla). */
    get reposo() {
      return reposo;
    },
    /** 0 … 1 mientras aparece la tarjeta final, suavizado: lo que la obra dibuja (HUD, regla) se apaga. */
    get final() {
      return final;
    },
    get mapaAbierto() {
      return mapaAbierto;
    },
    lang,
  };
}
