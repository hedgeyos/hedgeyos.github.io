# HedgeyOS

Mac OS 9-inspired desktop experiment for the web.

## What's here
- Single-page source in `index.html` with inline CSS that defines the OS 9 chrome (menu bar, beveled controls, title bars, Finder-style panes, modal scaffolding, and app/notes/browser window shells).
- Light/dark palette variables and responsive tweaks aimed at tablet and phone widths.
- No HTML body or JS is present yet; the current snapshot is styling only and the responsive block at the bottom of `index.html` is still unfinished.

## Run locally
- Open `index.html` directly in a browser, or serve the folder with `python3 -m http.server 8000` and visit `http://localhost:8000`.
- The CSS references `fonts/ChicagoKare-Regular.woff2`; add it under `fonts/` or expect the Chicago-style fallback stack to be used instead.

## Deploy
- GitHub Pages can host this by enabling Pages on the default branch, making it available at `https://hedgeyos.github.io/`.

## Next steps
- Add markup/JS that wires up the desktop (icon grid, windows, menu interactions).
- Finish the truncated responsive media query at the end of `index.html`.
- Include the ChicagoKare webfont or adjust the font stack. 
