// the theme chosen on dmeoli.github.io (light or dark) holds in the scenes too:
// same origin, same localStorage key; without a choice the system decides
(function () {
  var t;
  try { t = localStorage.getItem('theme'); } catch (e) {}
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
})();
