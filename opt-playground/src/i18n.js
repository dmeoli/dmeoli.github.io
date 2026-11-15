// The language of a scene (set by theme.js from the choice made on the site):
// static text is written twice in the page, as <span data-l="en"> and
// <span data-l="it">, and style.css shows one; text built by a script asks
// t(en, it), and redraws on 'langchange'.

export const lang = () => (document.documentElement.getAttribute('data-lang') === 'it' ? 'it' : 'en');
export const t = (en, it) => (lang() === 'it' ? it : en);
export const onLang = fn => window.addEventListener('langchange', fn);
export const onTheme = fn => window.addEventListener('themechange', fn);
// both languages at once, for innerHTML that holds bilingual spans
export const bi = (en, it) => `<span data-l="en">${en}</span><span data-l="it" lang="it">${it}</span>`;
