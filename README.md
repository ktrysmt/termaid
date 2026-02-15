# asciimaid

> View mermaid-ed markdown in terminal

## Install/Update

```bash
npm install -g asciimaid-cli
```


## Usage

### File input

```
$ asciimaid test/test1.md
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
$ asciimaid test/test2.md
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
$ asciimaid test/test3.md
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

### Stdin input

```
$ echo '# Hello\n\n```mermaid\nflowchart LR\n    A --> B\n```' | asciimaid
# Hello

    ┌───┐     ┌───┐
    │   │     │   │
    │ A ├────►│ B │
    │   │     │   │
    └───┘     └───┘
```

## Uninstall

```bash
npm remove -g asciimaid-cli
```

## Debug

```bash
# tag
npm install -g git+https://github.com/ktrysmt/asciimaid.git#v1.0.4
# branch
npm install -g git+https://github.com/ktrysmt/asciimaid.git#master
npm install -g git+https://github.com/ktrysmt/asciimaid.git#feature
# hash
npm install -g git+https://github.com/ktrysmt/asciimaid.git#a52a596
```

## Author

[ktrysmt](https://github.com/ktrysmt)
