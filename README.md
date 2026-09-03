# Tandem

Notes stream in tandem with relevant chapters as you read your document.

---

## Features

- **Heading Synchronization**: Links timeline blocks to specific headings or auto-binds them to the preceding chapter.

- **Scrolling**: Automatically scrolls the associated timeline items into view.

- **Flexible Layouts**: Switch between a side-by-side vertical split (customizable split ratio) and a stacked horizontal orientation.

- **Dynamic Timestamps**: Format timestamps with multiple visual presets (High-contrast accent, Pill/Badge, or Active-state highlight).

- **Multi-Column Media Galleries**: Embed single or multi-column image grids with alt text.

- **Native Markdown & Math**: Supports standard Markdown rendering and LaTeX math blocks inside the timeline.

---

## Syntax

Declare auxiliary nodes anywhere in your document using the `timeline` codeblock:

```timeline
section: Vectors
timestamp: Derivation 1.2
columns: 2
image: attachments/vector-projection.png | Projection Diagram
---
#### Orthogonal Projection
The vector projection of $\vec{u}$ onto $\vec{v}$ is given by:
$$P_{\vec{v}}(\vec{u}) = \frac{\vec{u} \cdot \vec{v}}{\|\vec{v}\|^2}\vec{v}$$
```

### Block Configuration

| Key                   | Description                                                                           | Default                      |
| :-------------------- | :------------------------------------------------------------------------------------ | :--------------------------- |
| `section` / `chapter` | Specific heading to associate to. Set to `auto` to bind to the preceding `#` heading. | Preceding heading            |
| `timestamp` / `date`  | Text or date string rendered in the node header.                                      | Optional                     |
| `image`               | Single image reference (`path                                                         | alt text`or`[[wiki-link]]`). | Optional |
| `images`              | Comma-separated list of image paths or wikilinks.                                     | Optional                     |
| `columns`             | Number of columns for image grid rendering.                                           | `2`                          |
| `---`                 | Divider line separating metadata attributes from the node body.                       | Required before body         |

Everything placed below the `---` separator is parsed and rendered as standard Obsidian Markdown and LaTeX.

---

## Settings

- **Split orientation**: Toggle between `Vertical (side-by-side)` or `Horizontal (stacked)`.

- **Main column width percentage**: Adjust the width ratio between the main text editor and the sidecar track (30% to 70% by default).

- **Timestamp style**: Select visual presentation:
  - _Accent color_: High contrast using your theme's active accent color.
  - _Badge_: Bordered pill container.
  - _Dynamic sync_: Muted by default; turns accent when the node is in active focus.
  - _Default_: Monospace faint text.

---

#### License

[MIT](LICENSE)
