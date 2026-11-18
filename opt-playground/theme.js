// The theme and the language of dmeoli.github.io hold in the scenes too: same
// origin, same localStorage keys ('theme': light or dark, else the system;
// 'lang': en or it, else the browser). A change made on the site, also while a
// scene is open inside it, arrives here as a storage event and is applied at
// once: data-theme and data-lang on the root, and the events 'themechange' and
// 'langchange' on window for what the scenes draw themselves. When a scene is
// opened on its own, a small bar gives the same two choices and the way back.
(function () {
  var root = document.documentElement;
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
    window.dispatchEvent(new Event('themechange'));
  }
  // the title of the tab follows the language: the English one is the
  // <title> of the page, the Italian one the Italian heading of the scene
  var titleEn = document.title || null;
  function retitle() {
    var l = root.getAttribute('data-lang'), h = document.querySelector('h1 [data-l="it"]');
    if (titleEn === null) titleEn = document.title;
    if (h) document.title = l === 'it' ? h.textContent.trim() : titleEn;
  }
  function applyLang(l) {
    if (l !== 'it' && l !== 'en') l = (navigator.language || '').slice(0, 2).toLowerCase() === 'it' ? 'it' : 'en';
    root.setAttribute('data-lang', l); root.lang = l;
    if (document.readyState !== 'loading') retitle();
    window.dispatchEvent(new Event('langchange'));
  }
  applyTheme(read('theme')); applyLang(read('lang'));
  window.addEventListener('storage', function (e) {
    if (e.key === 'theme' || e.key === null) applyTheme(read('theme'));
    if (e.key === 'lang' || e.key === null) applyLang(read('lang'));
  });
  document.addEventListener('DOMContentLoaded', retitle);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { window.dispatchEvent(new Event('themechange')); });

  // the bar, only when the scene is not shown inside the site
  // a scene of Optimization that is also a form (<meta name="forms-mode"
  // content="print">) is the form, with its print panel (.print-only) and the
  // way back to Forms, only when its address asks for it with ?print
  var printOnly = document.querySelector('meta[name="forms-mode"][content="print"]'),
      printing = /[?&]print(&|=|$)/.test(location.search);
  if (printOnly && printing) root.classList.add('print-mode');
  var inside = false;
  try { inside = window.top !== window; } catch (e) { inside = true; }
  if (inside) { root.classList.add('embedded'); return; }
  function dark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  }
  // the way back goes to the section of the site that lists the scene: a form
  // says its group in <meta name="forms-group" content="nature">
  var path = location.pathname.replace(/\/$/, '/index.html'),
      back = /^\/opt-playground\/(games|arena)(-[a-z]+)?(\.html)?$/.test(path)
        ? '<a class="home" href="/games"><span data-l="en">&larr; Games</span><span data-l="it" lang="it">&larr; Giochi</span></a>'
        : /^\/opt-playground\/astro(-[a-z]+)?(\.html)?$/.test(path)
        ? '<a class="home" href="/sky"><span data-l="en">&larr; Sky</span><span data-l="it" lang="it">&larr; Cielo</span></a>'
        : /^\/opt-playground\/(index|components|benders|lp|lp3d|integer|polarity|packing-mip|simplex-path|lagrangian-dual)?(\.html)?$/.test(path)
        ? '<a class="home" href="/optimization"><span data-l="en">&larr; Optimization</span><span data-l="it" lang="it">&larr; Ottimizzazione</span></a>'
        : '<a class="home" href="/ml"><span data-l="en">&larr; Machine Learning</span><span data-l="it" lang="it">&larr; Machine learning</span></a>';
  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.createElement('div');
    bar.className = 'scenebar';
    var form = document.querySelector('meta[name="forms-group"]');
    if (form && (!printOnly || printing)) back = '<a class="home" href="/forms#' + form.content + '"><span data-l="en">&larr; Forms</span><span data-l="it" lang="it">&larr; Forme</span></a>';
    bar.innerHTML = back +
      '<button type="button" data-set="en">EN</button><span aria-hidden="true">&middot;</span>' +
      '<button type="button" data-set="it">IT</button>' +
      '<button type="button" class="theme">&#9680;</button>';
    document.body.prepend(bar);
    function mark() {
      var l = root.getAttribute('data-lang'), th = bar.querySelector('.theme'),
          say = l === 'it' ? 'Tema chiaro o scuro' : 'Light or dark theme';
      th.setAttribute('aria-label', say); th.title = say;
      bar.querySelectorAll('[data-set]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-set') === l); });
    }
    bar.querySelectorAll('[data-set]').forEach(function (b) {
      b.addEventListener('click', function () { var l = b.getAttribute('data-set'); write('lang', l); applyLang(l); mark(); });
    });
    bar.querySelector('.theme').addEventListener('click', function () {
      var t = dark() ? 'light' : 'dark'; write('theme', t); applyTheme(t);
    });
    window.addEventListener('langchange', mark); mark();
  });
})();
