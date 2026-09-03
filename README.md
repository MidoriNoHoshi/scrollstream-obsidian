# Timeline Gallery

An Obsidian plugin that renders inline image entries as a vertical timeline —
matching the `TimelineItem` component from an Astro blog (timestamp + section
tag + image grid + caption, connected by a line down the page).

## Install (manual)

1. Copy `main.js`, `manifest.json`, and `styles.css` into a new folder in your
   vault: `<vault>/.obsidian/plugins/timeline-gallery/`
2. Reload Obsidian (or restart it).
3. Settings → Community plugins → enable **Timeline Gallery**.

## Usage

Add a fenced code block with the language `timeline` anywhere in a note:

    ```timeline
    timestamp: 2026-08-03
    section: Motivation
    columns: 2
    image: attachments/silver-knights-march.png | Silver Knights March Kazimierz
    image: attachments/small-chen-rain.webp | Rain and grime
    caption: Arknights art.
    ```

Rendered in reading view, this becomes a timeline entry with a small marker
dot, a connecting line down to the next entry, the timestamp and section as
small monospace tags, an image grid, and the caption underneath.

### Fields

| Field       | Notes                                                                 |
| ----------- | ---------------------------------------------------------------------|
| `image`     | Repeat this line per image. Optional `\| alt text` after the path.   |
| `images`    | Shorthand: comma-separated list of paths, no alt text.                |
| `timestamp` | Free text, shown in monospace (e.g. `2026-08-03`).                    |
| `section`   | Shown as a small tag; also written to the block's `data-section`.     |
| `caption`   | One line of caption text below the images.                            |
| `columns`   | Grid column count for this entry's images (default 2).                |

Image paths are resolved the same way Obsidian resolves internal links, so
you can use vault-relative paths or paste them from drag-and-drop (drop an
image into the note first to get the correct path, then move it into the
`image:` line).

### Multiple images, no caption

    ```timeline
    timestamp: 2026-07-20
    section: Architecture + Iteration
    columns: 3
    images: brainstorm1.jpg, brainstorm2.jpg, graphview.png
    ```

### Consecutive entries

Just stack multiple ` ```timeline ` blocks one after another in the note —
each one draws its own segment of the vertical line, so back-to-back blocks
read as one continuous timeline, the same way sections stack on the website.

## Development

```bash
npm install
npm run dev    # watch mode, rebuilds main.js on change
npm run build  # production build
```

## Ideas for later

- A settings tab for default columns / date format.
- A "Timeline" view that aggregates blocks from an entire folder or vault
  by date, rather than only within a single note.
- Click-to-zoom / lightbox on images.
