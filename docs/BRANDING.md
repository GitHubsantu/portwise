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
| `icon.png` | 256×256 PNG | Marketplace icon (`package.json` → `icon`). PNG is required, SVG is rejected. |
| `icon.svg` | vector | master artwork; edit this, then regenerate the PNG |
| `activity.svg` | 24×24, `currentColor` | sidebar view-container icon; monochrome so VS Code can theme it |

Motif: three sources merge into one route, one highlighted (the active profile), ending in a port. Keep it simple at 16 px.

Regenerating the PNG: render `icon.svg` at 256×256 with any SVG tool (Inkscape, `rsvg-convert`, or a browser screenshot) and save as `images/icon.png`. Keep the transparent corners.

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
