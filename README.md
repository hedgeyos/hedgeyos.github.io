# HedgeyOS

Mac OS 9-inspired desktop experiment for the web.

## What's here
- Layout in `index.html`, styling in `styles.css`, and JS split across modules in `js/` (desktop UI, window manager, menus, storage, and boot).
- Light/dark palette variables and responsive tweaks aimed at tablet and phone widths.
- The fonts reference `fonts/ChicagoKare-Regular.woff2` for the OS 9 vibe.

## Run locally
- Open `index.html` directly in a browser, or serve the folder with `python3 -m http.server 8000` and visit `http://localhost:8000`.
- The CSS references `fonts/ChicagoKare-Regular.woff2`; add it under `fonts/` or expect the Chicago-style fallback stack to be used instead.

## Deploy
- GitHub Pages can host this by enabling Pages on the default branch, making it available at `https://hedgeyos.github.io/`.

## Next steps
- Add markup/JS that wires up the desktop (icon grid, windows, menu interactions).
- Finish the truncated responsive media query at the end of `index.html`.
- Include the ChicagoKare webfont or adjust the font stack. 
