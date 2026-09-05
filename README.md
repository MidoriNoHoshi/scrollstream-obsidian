# ScrollStream

Stream notes, media, derivations, and marginalia in tandem with relevant chapters as you read and write. Works with **Live Preview** as well.

---

## Features

- **Bidirectional View Sync**: Keeps auxiliary cards aligned with headings as you scroll through your document.

- **Frontmatter Overrides**: Customize track orientation, split ratio, card gap, font size, and image corner rounding per note via YAML.

- **Media Galleries & Lightbox**: Embed multi-column image layouts with click-to-expand lightbox view.

- **Native Markdown & Math**: Supports standard Obsidian markdown, callouts, and LaTeX math blocks ($inline$ and $$display$$).

---

## Syntax

Declare stream nodes anywhere in your document using the `scrollstream` codeblock:

```scrollstream
section: Vectors
timestamp: Derivation 1.2
columns: 2
image: attachments/vector-projection.png | Projection Diagram
---
#### Orthogonal Projection
The vector projection of $\vec{u}$ onto $\vec{v}$ is given by:
$$P_{\vec{v}}(\vec{u}) = \frac{\vec{u} \cdot \vec{v}}{\|\vec{v}\|^2}\vec{v}$$
```

### Block Attributes

| Key                   | Description                                                                                   | Default              |
| :-------------------- | :-------------------------------------------------------------------------------------------- | :------------------- |
| `section` / `chapter` | Heading to associate to. Set to `auto` or omit to associate to the nearest preceding heading. | Preceding heading    |
| `timestamp` / `date`  | Timestamp or label string displayed in the item header.                                       | Optional             |
| `image`               | Single image reference (`path \| alt text` or `[[wiki-link]]`).                               | Optional             |
| `images`              | Comma-separated list of image paths or wikilinks.                                             | Optional             |
| `columns`             | Number of columns for image grid rendering.                                                   | `2`                  |
| `---`                 | Divider separating attribute declarations from markdown content.                              | Required before body |

## Per-Note Frontmatter Customization

Override default appearance and layout rules on a per-note basis using YAML frontmatter:

```yaml
---
scrollstream-orientation: vertical
scrollstream-ratio: 65
scrollstream-font-size: 13px
scrollstream-gap: 24px
scrollstream-radius: 8px
---
```

| Frontmatter Key            | Type / Values                             | Description                                                                                      |
| :------------------------- | :---------------------------------------- | :----------------------------------------------------------------------------------------------- |
| `scrollstream-orientation` | `vertical` \| `horizontal`                | `vertical` splits editor and sidebar side-by-side. `horizontal` places the track below the text. |
| `scrollstream-ratio`       | Number (`20` – `80`)                      | Percentage of width (or height) allocated to the main editor column.                             |
| `scrollstream-font-size`   | CSS dimension (e.g. `12px`, `0.85em`)     | Controls text size inside the stream item body.                                                  |
| `scrollstream-gap`         | CSS dimension (e.g. `20px`, `1.5rem`)     | Vertical spacing between timeline items and connector spine height.                              |
| `scrollstream-radius`      | CSS dimension (e.g. `6px`, `12px`, `0px`) | Border corner radius for embedded gallery media.                                                 |

---

## Settings

- **Split orientation**: Default orientation (`Vertical` or `Horizontal`) when not defined in frontmatter.

- **Main column width percentage**: Default split ratio slider (`20%` to `80%`).

- **Timestamp style**: Visual preset for node header timestamps:
  - _Accent color_: High contrast using your active theme accent.
  - _Badge_: Bordered pill container.
  - _Dynamic sync_: Muted by default; highlights when the node is in active focus.
  - _Default_: Faint monospace text.

---

## Development

```bash
# Setup dependencies and vault symlink
./dev.sh setup

# Run watch compiler for live reload
./dev.sh dev

# Run TypeScript compiler check, ESLint, and build
./dev.sh check

# Stage distribution assets in ./dist
./dev.sh release
```

---

#### License

[MIT](LICENSE)

```

```
