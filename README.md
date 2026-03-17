# memd

> Render markdown with mermaid diagrams

## Install

```bash
npm install -g memd-cli
```

## Usage


```sh
Usage: memd [options] [command] [files...]

Render markdown with mermaid diagrams

Arguments:
  files             markdown file(s) to render

Options:
  -v, --version     output the version number
  --no-pager        disable pager (less)
  --no-mouse        disable mouse scroll in pager
  --no-color        disable colored output
  --width <number>  terminal width override
  --ascii           use pure ASCII mode for diagrams (default: unicode)
  --html            output as standalone HTML (mermaid diagrams rendered as inline SVG)
  --theme <name>    color theme (env: MEMD_THEME)
                    nord, dracula, one-dark, github-dark, github-light, solarized-dark, solarized-light, catppuccin-mocha, catppuccin-latte, tokyo-night, tokyo-night-storm, tokyo-night-light, nord-light,
                    zinc-dark, zinc-light (default: "catppuccin-mocha")
  -h, --help        display help for command

Commands:
  serve [options]   Start HTTP server to serve .md files as HTML
```


## Example

### File input

```
$ memd test/test1.md
# Hello

This is markdown with mermaid:

    ┌───┐     ┌───┐
    │   │     │   │
    │ A ├────►│ B │
    │   │     │   │
    └───┘     └───┘

More text.

```

### test2.md - flowchart with decision

```
$ memd test/test2.md
# Hello

This is markdown printed in the terminal.

    ┌───────────┐
    │           │
    │   Start   │
    │           │
    └─────┬─────┘
          │
          │
          │
          │
          ▼
    ┌───────────┐
    │           │
    │ Decision? ├──No────┐
    │           │        │
    └─────┬─────┘        │
          │              │
          │              │
         Yes             │
          │              │
          ▼              ▼
    ┌───────────┐     ┌─────┐
    │           │     │     │
    │   Action  ├────►│ End │
    │           │     │     │
    └───────────┘     └─────┘

More text after the diagram.

```

### test3.md - Complex Mermaid diagrams (English)

```
$ memd test/test3.md
# Complex Mermaid Diagrams Test

## flowchart LR Test

    ┌────────────────┐     ┌──────────┐     ┌──────────┐     ┌─────┐
    │                │     │          │     │          │     │     │
    │ Starting Point ├────►│ Decision ├─Yes►│ Action 1 ├────►│ End │
    │                │     │          │     │          │     │     │
    └────────────────┘     └─────┬────┘     └──────────┘     └─────┘
                                 │                              ▲
                                 │                              │
                                 │                              │
                                No                              │
                                 │                              │
                                 │          ┌──────────┐        │
                                 │          │          │        │
                                 └─────────►│ Action 2 ├────────┘
                                            │          │
                                            └──────────┘

    ┌──────────┐     ┌────────────────┐     ┌────────────┐     ┌───────┐
    │          │     │                │     │            │     │       │
    │ Database ├────►│ Authentication ├────►│ API Server ├◄───►┤ Redis │
    │          │     │                │     │            │     │       │
    └──────────┘     └────────────────┘     └──────┬─────┘     └───────┘
          ▲                                        │
          └────────────────────────────────────────┘


## Sequence Diagram

    ┌────────┐              ┌────────┐  ┌──────────┐   ┌───────┐
    │ Client │              │ Server │  │ Database │   │ Cache │
    └────┬───┘              └────┬───┘  └─────┬────┘   └───┬───┘
         │                       │            │            │
         │  HTTP GET /api/data   │            │            │
         │───────────────────────▶            │            │
         │                       │      HGET user:123      │
         │                       │─────────────────────────▶
         │                       │            │            │
         │                       │       data (hit)        │
         │                       ◀╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│
         │                       │            │            │
         │        200 OK         │            │            │
         ◀───────────────────────│            │            │
         │                       │            │            │
    ┌────┴───┐              ┌────┴───┐  ┌─────┴────┐   ┌───┴───┐
    │ Client │              │ Server │  │ Database │   │ Cache │
    └────────┘              └────────┘  └──────────┘   └───────┘

## Class Diagram

    ┌───────────────┐
    │ Animal        │
    ├───────────────┤
    │ +name: String │
    ├───────────────┤
    │ +eat          │
    │ +sleep        │
    └───────────────┘
            △
          ┌─└────────────┐
          │              │
    ┌──────────┐    ┌────────┐
    │ Bird     │    │ Fish   │
    ├──────────┤    ├────────┤
    │          │    │        │
    ├──────────┤    ├────────┤
    │ +fly     │    │ +swim  │
    │ +layEggs │    │ +gills │
    └──────────┘    └────────┘


## State Diagram

    ┌────────┐
    │        │
    │        │
    │        │
    └────┬───┘
         │
         │
         │
         │
         ▼
    ┌────────┐
    │        │
    │ Still  │
    │        │
    └────┬───┘
         ▲
         │
         │
         │
         ▼
    ┌────┴───┐
    │        │
    │ Moving │
    │        │
    └────┬───┘
         │
         │
         │
         │
         ▼
    ┌────────┐
    │        │
    │ Crash  │
    │        │
    └────┬───┘
         │
         │
         │
         │
         ▼
    ┌────────┐
    │        │
    │        │
    │        │
    └────────┘

## Error Handling Example

    ┌──────────────┐
    │              │
    │    Start     │
    │              │
    └───────┬──────┘
            │
            │
            │
            │
            ▼
    ┌──────────────┐
    │              │
    │ Check Error? ├─────No──────┐
    │              │             │
    └───────┬──────┘             │
            │                    │
            │                    │
           Yes                   │
            │                    │
            ▼                    ▼
    ┌──────────────┐     ┌───────────────┐
    │              │     │               │
    │  Log Error   │◄─┐  │  Process Data │
    │              │  │  │               │
    └───────┬──────┘  │  └───────┬───────┘
            │         │          │
            │         │          │
            │         └──────────┤
            │                   No
            ▼                    ▼
    ┌──────────────┐     ┌───────┴───────┐
    │              │     │    Success?   │
    │ Show Message │     │               │
    │              │     │               │
    └───────┬──────┘     └───────┬───────┘
            │                    │
            │                    │
            │                   Yes
            │                    │
            ▼                    ▼
    ┌──────────────┐     ┌───────────────┐
    │              │     │               │
    │ Return Null  │     │ Return Result │
    │              │     │               │
    └──────────────┘     └───────────────┘

## Gantt Chart (not supported by beautiful-mermaid)

    gantt
        title Project Development
        dateFormat  YYYY-MM-DD
        section Section
        Task 1           :a1, 2024-01-01, 30d
        Task 2           :after a1  , 20d
        section Another
        Task 3           :2024-01-12  , 12d
        Task 4           : 24d

## Regular Text

This is regular text between mermaid diagrams.

    * Point 1
    * Point 2
    * Point 3

`Inline code` is also supported.

**Bold** and *italic* text work fine.

```

### HTML output

HTML is written to stdout. Use shell redirection to save to a file.

```
$ memd doc.md --html > out.html
$ memd doc.md --html --theme dracula > out.html
$ memd a.md b.md --html > combined.html
```

### Stdin input

```
$ echo '# Hello\n\n```mermaid\nflowchart LR\n    A --> B\n```' | memd
# Hello

    ┌───┐     ┌───┐
    │   │     │   │
    │ A ├────►│ B │
    │   │     │   │
    └───┘     └───┘
```

### Serve

Start a local HTTP server that renders `.md` files as HTML on the fly.

```sh
$ memd serve --help
Usage: memd serve [options]

Start HTTP server to serve .md files as HTML

Options:
  -d, --dir <path>     directory to serve (default: ".")
  -p, --port <number>  port number (0-65535) (default: 8888)
  --host <string>      host to bind (default: "127.0.0.1")
  --workers <number>   number of render workers (default: min(cpus-1, 4))
  --watch              watch for file changes and live-reload
  --theme <name>       color theme (env: MEMD_THEME)
                       nord, dracula, one-dark, github-dark, github-light, solarized-dark,
                       solarized-light, catppuccin-mocha, catppuccin-latte, tokyo-night,
                       tokyo-night-storm, tokyo-night-light, nord-light, zinc-dark, zinc-light (default:
                       "catppuccin-mocha")
  -h, --help           display help for command
```

Example:

```
$ memd serve
memd serve
  Directory: /home/ubuntu/docs
  Theme:     nord
  URL:       http://localhost:8888/

$ memd serve --dir ./docs --port 3000 --theme dracula
$ memd serve --workers 2
$ memd serve --watch
```

Note:

* Specifying `--host 0.0.0.0` binds the server to all network interfaces. Since there is no authentication mechanism, `.md` files in the directory will be accessible over the network. Use only within trusted networks.
* The serve command has a small timing gap (TOCTOU) between path validation and file reading. Use on trusted filesystems only.
* Serve serves `.md` files, images (png, jpg, gif, svg, webp, ico, avif), and CSS. JavaScript and other file types are not served.
* Each worker loads the Mermaid rendering library in an independent V8 isolate. Each worker consumes approximately 80-120 MB of memory. The default is `min(num_CPUs-1, 4)` workers. In memory-constrained environments, specify `--workers 1`. Recommended memory: 512 MB + (number of workers x 120 MB).


## Author

[ktrysmt](https://github.com/ktrysmt)
