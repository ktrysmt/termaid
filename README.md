# mema - mermaid-ed markdown viewer

Markdown with Mermaid diagrams to terminal output.

## Author

[ktrysmt](https://github.com/ktrysmt)

## Install

```bash
npm install -g ktrysmt/mema
# Or
npm install -g git+https://github.com/ktrysmt/mema.git
```


## Usage

### File input

```bash
mema <markdown-file>
mema file1.md file2.md file3.md
```

### Stdin input

```bash
echo "# Hello\n\n```mermaid\nflowchart LR\n    A-->B\n```" | mema
cat README.md | mema
```

### Uninstall

```bash
npm remove -g @ktrysmt/mema
```
