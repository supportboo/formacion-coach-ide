/* Brandooers · portadas de libros. Carga la cubierta de cada .bcover[data-book]
   desde Open Library (sin clave ni cuota), con Google Books como respaldo.
   Sustituye al cargador antiguo (Google Books estaba limitado a 429). */
(function () {
  "use strict";
  function setCover(el, url) { el.style.backgroundImage = 'url("' + url + '")'; el.setAttribute('data-cov', '1'); }
  function fromGoogle(el, q) {
    fetch('https://www.googleapis.com/books/v1/volumes?q=' + encodeURIComponent(q) + '&maxResults=1')
      .then(function (r) { return r.json(); }).then(function (d) {
        var vi = d.items && d.items[0] && d.items[0].volumeInfo;
        var img = vi && vi.imageLinks && (vi.imageLinks.thumbnail || vi.imageLinks.smallThumbnail);
        if (img) setCover(el, img.replace(/^http:/, 'https:'));
      }).catch(function () {});
  }
  function load(el) {
    if (el.getAttribute('data-cov')) return;
    var q = el.getAttribute('data-book'); if (!q) return;
    fetch('https://openlibrary.org/search.json?q=' + encodeURIComponent(q) + '&limit=1&fields=cover_i,isbn')
      .then(function (r) { return r.json(); }).then(function (d) {
        var doc = d && d.docs && d.docs[0]; if (!doc) throw 0;
        var url = doc.cover_i ? ('https://covers.openlibrary.org/b/id/' + doc.cover_i + '-M.jpg')
          : (doc.isbn && doc.isbn[0]) ? ('https://covers.openlibrary.org/b/isbn/' + doc.isbn[0] + '-M.jpg') : null;
        if (url) setCover(el, url); else throw 0;
      }).catch(function () { fromGoogle(el, q); });
  }
  var obs;
  try { obs = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { obs.unobserve(e.target); load(e.target); } }); }, { rootMargin: '400px' }); } catch (e) {}
  function scan() { document.querySelectorAll('.bcover[data-book]').forEach(function (el) { if (el.getAttribute('data-cov')) return; if (obs) obs.observe(el); else load(el); }); }
  if (document.readyState !== 'loading') scan(); else document.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('load', scan);
  try { new MutationObserver(scan).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
})();
