# mema

> mermaid-ed markdown viewer

Markdown with Mermaid diagrams to terminal output.


## Install/Update

```bash
npm install -g ktrysmt/mema
# Or
npm install -g git+https://github.com/ktrysmt/mema.git
```


## Usage

### File input

```
$ mema test/test1.md
# Hello

This is markdown with mermaid:

    ┌───┐     ┌───┐
    │   │     │   │
    │ A ├────►│ B │
    │   │     │   │
    └───┘     └───┘

More text.

```

### Stdin input

```
$ echo '# Hello\n\n```mermaid\nflowchart LR\n    A --> B\n```' | mema
# Hello

    ┌───┐     ┌───┐
    │   │     │   │
    │ A ├────►│ B │
    │   │     │   │
    └───┘     └───┘
```

### Uninstall

```bash
npm remove -g @ktrysmt/mema
```

## Debug

```bash
# tag
npm install -g git+https://github.com/ktrysmt/mema.git#v1.0.0
npm install -g git+https://github.com/ktrysmt/mema.git#v1.0.1
# branch
npm install -g git+https://github.com/ktrysmt/mema.git#master
npm install -g git+https://github.com/ktrysmt/mema.git#feature
# hash
npm install -g git+https://github.com/ktrysmt/mema.git#a52a596
```

## Author

[ktrysmt](https://github.com/ktrysmt)
