# Branding

## Identity

- **Name:** Portwise
- **Marketplace display title:** Portwise: Codex Account & Provider Switcher (brand word first, search words after it)
- **Tagline:** Switch Codex accounts and providers. Always on the right port.
- **One-line description (Marketplace):** Switch Codex accounts and manage OpenAI-compatible providers, with a local gateway that stays on the right port.
- **Why this name:** it speaks to the exact problem the tool solves (ports, routing) and does not reuse the word "Codex" as the product name. The name was checked only against a quick web search; **before publishing, search the VS Code Marketplace and Open VSX yourself**, and rename (one search-and-replace of `portwise`/`Portwise`) if there is a clash.

## Identifiers

| Thing | Value |
|---|---|
| Extension id | `santu-dev.portwise` |
| Command prefix | `portwise.` |
| Setting prefix | `portwise.` |
| View container / view | `portwise` / `portwise.panel` |
| Output channel | `Portwise` |
| Repo | `github.com/GitHubsantu/portwise` |

## Colour tokens (brand only; the UI itself uses VS Code theme variables)

| Token | Hex | Use |
|---|---|---|
| Ink | `#0B1F2A` | icon background, dark surfaces |
| Signal amber | `#FFB547` | the active route, primary accent in the icon |
| Mint | `#3DDBB0` | inactive routes and nodes |
| White | `#FFFFFF` | text on Ink |

## Assets (in `images/`)

| File | Size | Use |
|---|---|---|
| `icon-128.png` | 128×128 PNG, 5,026 bytes | Extension icon (`package.json` → `icon`), rendered from the original SVG |
| `icon.png` | 256×256 PNG, 12,931 bytes | Original raster asset retained unchanged; README continues to reference it |
| `icon.svg` | 256×256, viewBox `0 0 256 256`, 741 bytes | Original fixed-colour master artwork, retained unchanged |
| `activity.svg` | 24×24, viewBox `0 0 24 24`, 420 bytes | Existing monochrome `currentColor` view-container icon, retained unchanged |

Motif: three sources merge into one route, one highlighted (the active profile), ending in a port. Keep it simple at 16 px.

The new PNG was generated with the already-installed ImageMagick 7.1.2-27; no project dependency was added. It preserves the original SVG design, colours and transparent corners. The status bar keeps its existing codicon. The Portwise container is contributed through `viewsContainers.activitybar`, using the unchanged monochrome `activity.svg`; its webview remains `portwise.panel`.

Reproduce the new file without overwriting any original:

```powershell
magick.exe -background none -density 192 images/icon.svg -resize 128x128 -strip -depth 8 PNG32:images/icon-128.png
```

`test/iconPackaging.test.ts` checks PNG dimensions and every manifest-referenced local icon against the real `vsce` file list with dependency packaging disabled, including `.vscodeignore` processing. A temporary-package negative test confirms icon exclusion is detected. `images/` is not excluded by the current `.vscodeignore`.

## Voice

Calm, precise, plain English. Say what happened, which hop, and what to do next. No hype, no exclamation marks, no blame. Example: "The gateway is running, but Codex is sending an old token. Repair credential delivery."

## Marketplace listing

- **Categories:** AI, Other (vsce accepts both; confirm the Marketplace lists "AI" when you publish)
- **Keywords:** codex, openai, account switcher, multi account, provider, gateway, proxy, profiles
- **Gallery banner (add to `package.json` when publishing):** `{ "color": "#0B1F2A", "theme": "dark" }`
- **Screenshots (add in Phase 8):** panel with two profiles; diagnostics report all green; status-bar item.

## Disclaimer (use verbatim in README and the listing)

> Portwise is an independent community extension. It is not affiliated with, endorsed by, or sponsored by OpenAI or Microsoft. "Codex" is used only to describe compatibility.

## Don'ts

- No OpenAI or Codex logos, no lookalike marks, no screenshots of OpenAI's UI in the icon.
- Do not imply official status.
