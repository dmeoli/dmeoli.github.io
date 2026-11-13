# dmeoli.github.io

Personal page: <https://dmeoli.github.io>

A single static `index.html`, no build step and no dependencies beyond the two
Google Fonts it links. Edit the file, push to `main`, GitHub Pages serves it.

- `index.html` — the page
- `cv.pdf` — the compiled CV (drop it here; the page links to it)
- `research/`, `pubblicazioni/`, ... — one small page per section path, in
  English and in Italian, which gives the preview of a shared link and opens
  the section in `index.html`
- `robots.txt`, `sitemap.xml` — for search engines
- `papers/<name>/` — a page per publication, with its abstract, the
  metadata that Google Scholar reads and its BibTeX (`cite.bib`), which the
  BibTeX link of the home page copies
- `og.png` — the 1200x630 preview of a shared link; `photo.webp` and
  `photo-large.webp` are the portrait for the browsers that take WebP
