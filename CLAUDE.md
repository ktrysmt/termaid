# memd

Markdown viewer CLI with Mermaid diagram support. Terminal rendering and HTTP serve mode.

## Structure

```
memd/
  main.js            # CLI entry point (commander). Terminal render + `serve` sub-command
  render-shared.js   # HTML rendering: Mermaid SVG conversion, marked HTML output
  render-utils.js    # Pure helpers: escapeHtml, mixHex, resolveThemeColors
  render-worker.js   # Worker thread for serve mode (calls renderToHTML)
  package.json
  pnpm-lock.yaml
  .npmrc
  test/
    memd.test.js     # vitest tests (CLI, HTML output, serve, TTY, theme)
    test1.md         # basic markdown + mermaid
    test2.md         # complex mermaid diagram
    test3.md         # multiple mermaid blocks (marker ID uniqueness)
    complex.md       # graph TD with <br>, special chars, edge labels
    test-br.md       # <br> tag line breaks in mermaid nodes
    test-cjk.md      # Japanese labels in mermaid
    test-highlight.md # syntax highlighting test
    poc_md.ts         # PoC script
    poc_mermaid.ts    # PoC script
    pixel.png         # test image for static file serving
```

## Commands

```bash
pnpm install          # install dependencies
pnpm test             # run tests (vitest run --maxConcurrency=20)
```

## Manual testing

```bash
node main.js test/test1.md
node main.js test/test2.md
node main.js test/complex.md
node main.js --html test/test1.md          # HTML output to stdout
node main.js serve test --port 3000        # HTTP serve mode (directory)
node main.js serve test/test1.md           # HTTP serve mode (single file)
```

## Key CLI flags

- `--no-pager` -- disable pager (less)
- `--no-color` -- strip ANSI escape codes
- `--ascii` -- ASCII-only diagram rendering
- `--html` -- output HTML instead of terminal
- `--theme <name>` -- color theme (default: `nord`)
- `--width <n>` -- terminal width override

## Environment variables

- `MEMD_THEME` -- default theme (overridden by `--theme` flag)
- `FORCE_COLOR=3` -- force truecolor ANSI output

## Available themes

nord, dracula, one-dark, github-dark, github-light, solarized-dark, solarized-light,
catppuccin-mocha, catppuccin-latte, tokyo-night, tokyo-night-storm, tokyo-night-light,
nord-light, zinc-dark, zinc-light

## Architecture notes

- `main.js` handles both terminal rendering (marked + marked-terminal + shiki) and `serve` sub-command (HTTP server with worker pool)
- `render-shared.js` converts Mermaid fenced blocks to SVG via `@ktrysmt/beautiful-mermaid`, then renders full HTML with `marked`
- `render-worker.js` runs `renderToHTML` in a worker thread for non-blocking serve mode
- `render-utils.js` provides theme color resolution and HTML escaping (shared by main.js and render-shared.js)
- Serve mode supports: directory or single-file serving, directory listing, ETag/304 caching, gzip, static file serving (images/css), sidebar navigation, `--watch` with SSE live reload, CSP nonce
- Single-file mode (`serve foo.md`): sets baseDir to the file's parent directory, root `/` redirects to `/<filename>`
