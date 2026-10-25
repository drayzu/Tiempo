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
  // The page.
  'Desliza para empezar': 'Scroll to begin',
  'Lámina': 'Plate',
  'Sonido': 'Sound',
  'Reproducir': 'Play',
};
