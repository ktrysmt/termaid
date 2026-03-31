import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { launchTerminal } from 'tuistory'
import { execSync, execFile, execFileSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAIN = path.join(__dirname, '..', 'main.js')

// Strip MEMD_THEME from env so tests always get the built-in default (nord)
delete process.env.MEMD_THEME

function run(args) {
  return new Promise((resolve) => {
    execFile('node', [MAIN, ...args], { encoding: 'utf-8', timeout: 15000 }, (err, stdout, stderr) => {
      resolve(((stdout ?? '') + (stderr ?? '')).trim())
    })
  })
}

function runSync(args) {
  return execFileSync('node', [MAIN, ...args], { encoding: 'utf-8', timeout: 15000 })
}

describe('memd CLI', () => {
  it.concurrent('--version', async () => {
    const output = await run(['-v'])
    expect(output).toContain('3.5.2')
  })

  it.concurrent('--help', async () => {
    const output = await run(['--help'])
    expect(output).toContain('Usage: memd')
    expect(output).toContain('--no-pager')
    expect(output).toContain('--no-color')
    expect(output).toContain('--ascii')
    expect(output).toContain('--html')
    expect(output).toContain('"nord"')
  })

  it('renders test1.md (basic markdown + mermaid)', async () => {
    const output = await run(
      ['--no-pager', '--no-color', '--width', '80', 'test/test1.md'],
    )
    expect(output).toMatchInlineSnapshot(`
      "# Hello

      This is markdown with mermaid:

          ┌───┐     ┌───┐
          │   │     │   │
          │ A ├────►│ B │
          │   │     │   │
          └───┘     └───┘
      More text."
    `)
  })

  it.concurrent('renders test2.md (complex mermaid diagram)', async () => {
    const output = await run(
      ['--no-pager', '--no-color', '--width', '80', 'test/test2.md'],
    )
    expect(output).toContain('Start')
    expect(output).toContain('Decision?')
    expect(output).toContain('Action')
    expect(output).toContain('End')
    expect(output).toContain('More text after the diagram.')
  })

  it.concurrent('--ascii renders ASCII-only diagram', async () => {
    const output = await run(
      ['--no-pager', '--no-color', '--width', '80', '--ascii', 'test/test1.md'],
    )
    expect(output).toContain('+---+')
    expect(output).toContain('---->')
    expect(output).not.toContain('┌')
    expect(output).not.toContain('►')
  })

  it.concurrent('--no-color strips ANSI escape codes', async () => {
    const output = await run(
      ['--no-pager', '--no-color', '--width', '80', 'test/test1.md'],
    )
    // eslint-disable-next-line no-control-regex
    expect(output).not.toMatch(/\x1b\[[\d;]*m/)
  })

  it.concurrent('error on missing file', async () => {
    const output = await run(['--no-pager', 'test/nonexistent.md'])
    expect(output).toContain('Error reading file')
    expect(output).toContain('nonexistent.md')
  })

  it.concurrent('renders test-br.md (<br> tag line breaks)', async () => {
    const output = await run(
      ['--no-pager', '--no-color', '--width', '80', 'test/test-br.md'],
    )
    // Each node should have its label split across two lines
    expect(output).toContain('Line1')
    expect(output).toContain('Line2')
    expect(output).toContain('Hello')
    expect(output).toContain('World')
    expect(output).toContain('Foo')
    expect(output).toContain('Bar')
    // <br> tags should NOT appear in the diagram portion (extract diagram area)
    const diagramStart = output.indexOf('Line1')
    const diagramEnd = output.indexOf('Bar') + 3
    const diagramSection = output.slice(diagramStart, diagramEnd)
    expect(diagramSection).not.toMatch(/<br\s*\/?>/)
  })

  it.concurrent('renders test-cjk.md (Japanese labels)', async () => {
    const output = await run(
      ['--no-pager', '--no-color', '--width', '80', 'test/test-cjk.md'],
    )
    expect(output).toContain('開始')
    expect(output).toContain('判定')
    expect(output).toContain('実行')
    expect(output).toContain('終了')
    expect(output).toContain('はい')
    expect(output).toContain('いいえ')
  })

  it.concurrent('renders complex.md (graph TD with <br> and special chars)', async () => {
    const output = await run(
      ['--no-pager', '--no-color', '--width', '80', 'test/complex.md'],
    )
    // Node labels with <br> should render as multi-line text
    expect(output).toContain('AAA')
    expect(output).toContain('keita')
    expect(output).toContain('BBB')
    expect(output).toContain('yuriko')
    // Leaf nodes
    expect(output).toContain('1 / 2')
    expect(output).toContain('XXX')
    expect(output).toContain('YYY ZZZ')
    // Decision node and edge labels
    expect(output).toContain('F?')
    expect(output).toContain('Yes')
    expect(output).toContain('No')
    expect(output).toContain('High level')
    expect(output).toContain('Dumb Tr')
    // <br> tags should not appear in rendered output
    expect(output).not.toMatch(/<br\s*\/?>/)
  })

  it.concurrent('renders dotted.md (dotted arrow with spaced label)', async () => {
    const output = await run(
      ['--no-pager', '--no-color', '--width', '100', 'test/dotted.md'],
    )
    // Dotted arrow line character (unicode mode)
    expect(output).toContain('\u2506')
    // Edge label
    expect(output).toContain('docker pull')
    // Key nodes
    expect(output).toContain('Push to GHCR')
    expect(output).toContain('devcontainer up')
    expect(output).toContain('Inside devcontainer')
  })

  it('reads markdown from stdin via shell', () => {
    const output = execSync(
      `echo '# stdin test' | node ${MAIN} --no-pager --no-color`,
      { encoding: 'utf-8', timeout: 15000 },
    ).trim()
    expect(output).toContain('stdin test')
  })

  // --html output tests
  describe('--html output', () => {
    it('--html + file -> stdout', () => {
      const output = runSync(['--html', 'test/test1.md'])
      expect(output).toContain('<!DOCTYPE html>')
      expect(output).toContain('<svg')
      // Contains theme CSS colors (nord default: bg=#2e3440, fg=#d8dee9)
      expect(output).toContain('#2e3440')
      expect(output).toContain('#d8dee9')
      // Ends with newline (POSIX)
      expect(output.endsWith('\n')).toBe(true)
    })

    it('--html + stdin -> stdout', () => {
      const output = execSync(`echo '# hello' | node ${MAIN} --html`, { encoding: 'utf-8', timeout: 15000 })
      expect(output).toContain('<!DOCTYPE html>')
      expect(output).toContain('hello')
    })

    it('--html + Mermaid error shows mermaid-error block', () => {
      const input = '# Test\n\n```mermaid\ngantt\n    title Test\n    dateFormat YYYY-MM-DD\n    section S\n    Task :a1, 2024-01-01, 30d\n```'
      const output = execSync(`node ${MAIN} --html`, { input, encoding: 'utf-8', timeout: 15000 })
      expect(output).toContain('mermaid-error')
    })

    it('--html + multiple Mermaid blocks have unique marker IDs', () => {
      const output = runSync(['--html', 'test/test3.md'])
      expect(output).toContain('<svg')
      // Check for prefixed marker IDs (m0-, m1-, etc.)
      expect(output).toMatch(/id="m0-/)
      expect(output).toMatch(/id="m1-/)
    })

    it('--html contains segmented width toggle with Smart/Full buttons', () => {
      const output = runSync(['--html', 'test/test1.md'])
      // Segmented toggle container
      expect(output).toContain('class="memd-width-toggle"')
      // Two buttons with data-mode attributes
      expect(output).toContain('class="memd-wt-btn" data-mode="smart"')
      expect(output).toContain('class="memd-wt-btn" data-mode="full"')
      // SVG icons present in each button
      const btnMatches = output.match(/memd-wt-btn/g)
      expect(btnMatches.length).toBeGreaterThanOrEqual(4) // 2 in HTML + 2+ in CSS
      // Toggle script sets active class
      expect(output).toContain("classList.toggle('active'")
    })

    it('--html + multiple files -> combined single HTML', () => {
      const output = runSync(['--html', 'test/test1.md', 'test/test2.md'])
      expect(output).toContain('<!DOCTYPE html>')
      // Content from both files
      expect(output).toContain('Hello')
      expect(output).toContain('More text after the diagram.')
      // Only one HTML document
      const doctypeCount = (output.match(/<!DOCTYPE html>/g) || []).length
      expect(doctypeCount).toBe(1)
    })

    it('--html highlights code blocks with shiki', () => {
      const output = runSync(['--html', 'test/test-highlight.md'])
      expect(output).toContain('class="shiki')
      // Shiki outputs styled spans with color
      expect(output).toMatch(/style="[^"]*color/)
    })

    it('--html --theme dracula highlights code with shiki', () => {
      const output = runSync(['--html', '--theme', 'dracula', 'test/test-highlight.md'])
      expect(output).toContain('class="shiki')
    })
  })

  // Theme tests (HTML path)
  describe('theme (HTML path)', () => {
    it('--html --theme dracula uses dracula colors', () => {
      const output = runSync(['--html', '--theme', 'dracula', 'test/test1.md'])
      expect(output).toContain('#282a36') // bg
      expect(output).toContain('#f8f8f2') // fg
    })

    it('--html --theme tokyo-night uses tokyo-night colors', () => {
      const output = runSync(['--html', '--theme', 'tokyo-night', 'test/test1.md'])
      expect(output).toContain('#1a1b26') // bg
      expect(output).toContain('#a9b1d6') // fg
    })

    it('--html --theme nonexistent exits with error', () => {
      expect(() => {
        execSync(`node ${MAIN} --html --theme nonexistent test/test1.md`, { encoding: 'utf-8', timeout: 15000, stdio: 'pipe' })
      }).toThrow()
    })

    it('--html --no-color outputs full color HTML (silently ignored)', () => {
      const output = runSync(['--html', '--no-color', 'test/test1.md'])
      expect(output).toContain('<!DOCTYPE html>')
      expect(output).toContain('#2e3440')
    })
  })

  // Theme tests (terminal path)
  describe('theme (terminal path)', () => {
    it.concurrent('--theme dracula renders terminal output', async () => {
      const output = await run(
        ['--no-pager', '--no-color', '--theme', 'dracula', 'test/test1.md'],
      )
      expect(output).toContain('Hello')
      expect(output).toContain('More text.')
    })

    it.concurrent('--theme tokyo-night (no highlight) renders terminal output', async () => {
      const output = await run(
        ['--no-pager', '--no-color', '--theme', 'tokyo-night', 'test/test1.md'],
      )
      expect(output).toContain('Hello')
      expect(output).toContain('More text.')
    })

    it.concurrent('--theme one-dark renders terminal output', async () => {
      const output = await run(
        ['--no-pager', '--no-color', '--theme', 'one-dark', 'test/test1.md'],
      )
      expect(output).toContain('Hello')
      expect(output).toContain('More text.')
    })

    it.concurrent('--theme nonexistent exits with error', async () => {
      const output = await run(['--no-pager', '--no-color', '--theme', 'nonexistent', 'test/test1.md'])
      expect(output).toContain('Unknown theme')
      expect(output).toContain('Available themes')
    })

    it.concurrent('default theme is nord', async () => {
      const output = await run(
        ['--no-pager', '--no-color', 'test/test1.md'],
      )
      expect(output).toContain('Hello')
      expect(output).toContain('More text.')
    })

    it('MEMD_THEME env sets default theme (HTML path)', () => {
      const output = execSync(`node ${MAIN} --html test/test1.md`, {
        encoding: 'utf-8',
        timeout: 15000,
        env: { ...process.env, MEMD_THEME: 'dracula' },
      })
      expect(output).toContain('#282a36') // dracula bg
      expect(output).toContain('#f8f8f2') // dracula fg
    })

    it('--theme flag overrides MEMD_THEME env', () => {
      const output = execSync(`node ${MAIN} --html --theme tokyo-night test/test1.md`, {
        encoding: 'utf-8',
        timeout: 15000,
        env: { ...process.env, MEMD_THEME: 'dracula' },
      })
      expect(output).toContain('#1a1b26') // tokyo-night bg
      expect(output).not.toContain('#282a36') // not dracula bg
    })

    it('invalid MEMD_THEME env exits with error', () => {
      expect(() => {
        execSync(`node ${MAIN} --html test/test1.md`, {
          encoding: 'utf-8',
          timeout: 15000,
          stdio: 'pipe',
          env: { ...process.env, MEMD_THEME: 'nonexistent' },
        })
      }).toThrow()
    })
  })

  // chalk.level = 0 + Shiki: verify no ANSI codes for all themes
  describe.concurrent('--no-color strips ANSI from all themes', () => {
    const themes = [
      'nord', 'dracula', 'one-dark', 'github-dark', 'github-light',
      'solarized-dark', 'solarized-light', 'catppuccin-mocha', 'catppuccin-latte',
      'tokyo-night', 'tokyo-night-storm', 'tokyo-night-light',
      'nord-light', 'zinc-dark', 'zinc-light',
    ]

    for (const theme of themes) {
      it(`--theme ${theme} --no-color has no ANSI codes`, async () => {
        const output = await run(
          ['--no-pager', '--no-color', '--theme', theme, 'test/test-highlight.md'],
        )
        // eslint-disable-next-line no-control-regex
        expect(output).not.toMatch(/\x1b\[[\d;]*m/)
      })
    }
  })

  it('syntax highlighting produces truecolor ANSI for known languages', () => {
    const output = execSync(
      `FORCE_COLOR=3 node ${MAIN} --no-pager --theme nord test/test-highlight.md`,
      { encoding: 'utf-8', timeout: 15000 },
    )
    // Truecolor ANSI escape: ESC[38;2;R;G;Bm
    // eslint-disable-next-line no-control-regex
    expect(output).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/)
  })

  it('unknown language falls back to plain text without errors', () => {
    const output = execSync(`node ${MAIN} --no-pager --no-color`, {
      encoding: 'utf-8',
      timeout: 15000,
      input: '# Test\n\n```unknownlang\nsome code\n```',
    }).trim()
    expect(output).toContain('some code')
    expect(output).not.toContain('Error')
    expect(output).not.toContain('Could not find the language')
  })

  it('cli-highlight is not invoked (no highlight.js errors in output)', () => {
    const output = execSync(`node ${MAIN} --no-pager --no-color`, {
      encoding: 'utf-8',
      timeout: 15000,
      input: '# Test\n\n```rust\nfn main() {}\n```',
    }).trim()
    expect(output).toContain('fn main')
    expect(output).not.toContain('Could not find the language')
  })

  // marked v17 + marked-terminal v7 integration tests
  // Exercises marked-terminal renderer paths that could break on marked major version changes
  describe('marked-terminal renderer integration (marked v17)', () => {
    it('renders unordered lists', () => {
      const out = execSync(`node ${MAIN} --no-pager --no-color --width 80`, {
        encoding: 'utf-8',
        timeout: 15000,
        input: '- Item A\n- Item B\n- Item C\n',
      }).trim()
      expect(out).toContain('Item A')
      expect(out).toContain('Item B')
      expect(out).toContain('Item C')
    })

    it('renders ordered lists', () => {
      const out = execSync(`node ${MAIN} --no-pager --no-color --width 80`, {
        encoding: 'utf-8',
        timeout: 15000,
        input: '1. First\n2. Second\n3. Third\n',
      }).trim()
      expect(out).toContain('First')
      expect(out).toContain('Second')
      expect(out).toContain('Third')
    })

    it('renders links as text with URL', () => {
      const out = execSync(`node ${MAIN} --no-pager --no-color --width 80`, {
        encoding: 'utf-8',
        timeout: 15000,
        input: 'Visit [Example](https://example.com) for more.\n',
      }).trim()
      expect(out).toContain('Example')
      expect(out).toContain('https://example.com')
    })

    it('renders blockquotes', () => {
      const out = execSync(`node ${MAIN} --no-pager --no-color --width 80`, {
        encoding: 'utf-8',
        timeout: 15000,
        input: '> This is a quote\n> spanning lines\n',
      }).trim()
      expect(out).toContain('This is a quote')
      expect(out).toContain('spanning lines')
    })

    it('renders tables', () => {
      const out = execSync(`node ${MAIN} --no-pager --no-color --width 80`, {
        encoding: 'utf-8',
        timeout: 15000,
        input: '| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |\n',
      }).trim()
      expect(out).toContain('Name')
      expect(out).toContain('Age')
      expect(out).toContain('Alice')
      expect(out).toContain('Bob')
    })

    it('renders inline code', () => {
      const out = execSync(`node ${MAIN} --no-pager --no-color --width 80`, {
        encoding: 'utf-8',
        timeout: 15000,
        input: 'Use `console.log()` for debugging.\n',
      }).trim()
      expect(out).toContain('console.log()')
    })

    it('renders bold and italic', () => {
      const out = execSync(`node ${MAIN} --no-pager --no-color --width 80`, {
        encoding: 'utf-8',
        timeout: 15000,
        input: 'This is **bold** and *italic* text.\n',
      }).trim()
      expect(out).toContain('bold')
      expect(out).toContain('italic')
    })

    it('renders horizontal rule', () => {
      const out = execSync(`node ${MAIN} --no-pager --no-color --width 80`, {
        encoding: 'utf-8',
        timeout: 15000,
        input: 'Above\n\n---\n\nBelow\n',
      }).trim()
      expect(out).toContain('Above')
      expect(out).toContain('Below')
      // Horizontal rule should produce some separator between Above and Below
      const aboveIdx = out.indexOf('Above')
      const belowIdx = out.indexOf('Below')
      expect(belowIdx).toBeGreaterThan(aboveIdx)
    })

    it('renders nested lists', () => {
      const out = execSync(`node ${MAIN} --no-pager --no-color --width 80`, {
        encoding: 'utf-8',
        timeout: 15000,
        input: '- Parent\n  - Child A\n  - Child B\n- Sibling\n',
      }).trim()
      expect(out).toContain('Parent')
      expect(out).toContain('Child A')
      expect(out).toContain('Child B')
      expect(out).toContain('Sibling')
    })

    it('renders complex document with mixed elements', () => {
      const input = [
        '# Title',
        '',
        'A paragraph with **bold**, *italic*, and `code`.',
        '',
        '> A blockquote',
        '',
        '- List item 1',
        '- List item 2',
        '',
        '| Col1 | Col2 |',
        '|------|------|',
        '| A    | B    |',
        '',
        '---',
        '',
        'Final paragraph.',
      ].join('\n')
      const out = execSync(`node ${MAIN} --no-pager --no-color --width 80`, {
        encoding: 'utf-8',
        timeout: 15000,
        input,
      }).trim()
      expect(out).toContain('Title')
      expect(out).toContain('bold')
      expect(out).toContain('italic')
      expect(out).toContain('code')
      expect(out).toContain('blockquote')
      expect(out).toContain('List item 1')
      expect(out).toContain('Col1')
      expect(out).toContain('Final paragraph')
    })
  })
})

describe('TTY behavior (PTY required)', () => {
  it('auto-detects color in TTY (no --no-color)', async () => {
    const session = await launchTerminal({
      command: 'node',
      args: [MAIN, '--no-pager', '--width', '80', 'test/test-highlight.md'],
      cols: 80,
      rows: 30,
      waitForData: false,
    })
    await session.text({ waitFor: t => t.includes('TypeScript'), timeout: 8000 })
    const data = await session.getTerminalData()
    const hasColor = data.lines.some(line =>
      line.spans.some(span => span.fg !== null)
    )
    expect(hasColor).toBe(true)
  })

  it('pager activates for long output in TTY (no --no-pager)', async () => {
    // test3.md is long enough to exceed terminal rows
    const session = await launchTerminal({
      command: 'node',
      args: [MAIN, '--no-color', '--width', '80', 'test/test3.md'],
      cols: 80,
      rows: 10,
      waitForData: false,
    })
    const output = await session.text({ timeout: 8000 })
    // less shows ':' or '(END)' prompt; partial output means pager is holding
    expect(output).not.toContain('Error Handling Example')
    await session.write('q')
  })

  it('pager quit with q exits cleanly', async () => {
    const session = await launchTerminal({
      command: 'node',
      args: [MAIN, '--no-color', '--width', '80', 'test/test3.md'],
      cols: 80,
      rows: 10,
      waitForData: false,
    })
    await session.text({ timeout: 8000 })
    await session.write('q')
    // After quitting, session should end without error
    await session.waitIdle({ timeout: 3000 })
  })
})

describe('memd serve', () => {
  const PORT = 19876
  const BASE_URL = `http://127.0.0.1:${PORT}`
  let serverProcess

  beforeAll(async () => {
    serverProcess = spawn('node', [MAIN, 'serve', __dirname, '--port', String(PORT), '--host', '127.0.0.1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    await new Promise((resolve, reject) => {
      serverProcess.stdout.on('data', (data) => {
        if (data.toString().includes('http://')) resolve()
      })
      serverProcess.on('error', reject)
      setTimeout(() => reject(new Error('Server did not start in time')), 10000)
    })
  })

  afterAll(async () => {
    if (serverProcess) {
      const exited = new Promise((resolve, reject) => {
        serverProcess.on('close', resolve)
        setTimeout(() => {
          serverProcess.kill('SIGKILL')
          reject(new Error('Server did not exit within 5s after SIGTERM'))
        }, 5000)
      })
      serverProcess.kill('SIGTERM')
      await exited
    }
  })

  it('serve --help shows options', () => {
    const output = runSync(['serve', '--help'])
    expect(output).toContain('[path]')
    expect(output).toContain('--port')
    expect(output).toContain('--host')
    expect(output).toContain('--watch')
    expect(output).toContain('--theme')
  })

  it('serves directory listing at root', async () => {
    const res = await fetch(`${BASE_URL}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const body = await res.text()
    expect(body).toContain('Index of /')
    expect(body).toContain('test1.md')
    expect(body).toContain('test2.md')
  })

  it('serves .md file as HTML', async () => {
    const res = await fetch(`${BASE_URL}/test1.md`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const body = await res.text()
    expect(body).toContain('<!DOCTYPE html>')
    expect(body).toContain('<svg')
  })

  it('serves extensionless URL as .md', async () => {
    const res = await fetch(`${BASE_URL}/test1`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<!DOCTYPE html>')
  })

  it('returns 304 on matching ETag', async () => {
    const res1 = await fetch(`${BASE_URL}/test1`)
    const etag = res1.headers.get('etag')
    expect(etag).toBeTruthy()
    const res2 = await fetch(`${BASE_URL}/test1`, {
      headers: { 'If-None-Match': etag },
    })
    expect(res2.status).toBe(304)
  })

  it('returns 404 for missing file', async () => {
    const res = await fetch(`${BASE_URL}/nonexistent`)
    expect(res.status).toBe(404)
  })

  it('blocks path traversal', async () => {
    const res = await fetch(`${BASE_URL}/%2e%2e/package.json`)
    expect([403, 404]).toContain(res.status)
  })

  it('returns 404 for non-.md static files', async () => {
    const res = await fetch(`${BASE_URL}/memd.test.js`)
    expect(res.status).toBe(404)
  })

  it('handles concurrent rendering without blocking', async () => {
    const urls = [
      `${BASE_URL}/test1.md`,
      `${BASE_URL}/test2.md`,
      `${BASE_URL}/test1`,
      `${BASE_URL}/test2`,
    ]
    const results = await Promise.all(urls.map(u => fetch(u)))
    for (const res of results) {
      expect(res.status).toBe(200)
      const body = await res.text()
      expect(body).toContain('<!DOCTYPE html>')
    }
  })

  // 4a. Static file serving
  it('serves image files with correct Content-Type', async () => {
    const res = await fetch(`${BASE_URL}/pixel.png`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
  })

  it('returns ETag header for static files', async () => {
    const res = await fetch(`${BASE_URL}/pixel.png`)
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).toBeTruthy()
  })

  it('returns 304 on matching ETag for static files', async () => {
    const res1 = await fetch(`${BASE_URL}/pixel.png`)
    const etag = res1.headers.get('etag')
    expect(etag).toBeTruthy()
    const res2 = await fetch(`${BASE_URL}/pixel.png`, {
      headers: { 'If-None-Match': etag },
    })
    expect(res2.status).toBe(304)
  })

  // 4b. Worker error recovery
  it('server continues to respond after an error', async () => {
    const res1 = await fetch(`${BASE_URL}/test1`)
    expect(res1.status).toBe(200)
    await res1.text()
    const res2 = await fetch(`${BASE_URL}/nonexistent-error-test`)
    expect(res2.status).toBe(404)
    await res2.text()
    const res3 = await fetch(`${BASE_URL}/test1`)
    expect(res3.status).toBe(200)
    const body = await res3.text()
    expect(body).toContain('<!DOCTYPE html>')
  })

  // 4c. Cache behavior
  it('second request for same .md returns same ETag (cache hit)', async () => {
    const res1 = await fetch(`${BASE_URL}/test1`)
    await res1.text()
    const etag1 = res1.headers.get('etag')
    const res2 = await fetch(`${BASE_URL}/test1`)
    await res2.text()
    const etag2 = res2.headers.get('etag')
    expect(etag1).toBeTruthy()
    expect(etag1).toBe(etag2)
  })

  it('modified .md file returns updated content (cache invalidation)', async () => {
    const tmpFile = path.join(__dirname, 'test-cache-tmp.md')
    fs.writeFileSync(tmpFile, '# Original')
    try {
      const res1 = await fetch(`${BASE_URL}/test-cache-tmp`)
      expect(res1.status).toBe(200)
      const body1 = await res1.text()
      expect(body1).toContain('Original')
      await new Promise(r => setTimeout(r, 50))
      fs.writeFileSync(tmpFile, '# Updated')
      const res2 = await fetch(`${BASE_URL}/test-cache-tmp`)
      expect(res2.status).toBe(200)
      const body2 = await res2.text()
      expect(body2).toContain('Updated')
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  // 4d. Non-watch mode SSE
  it('non-watch mode returns 404 for /_memd/events', async () => {
    const res = await fetch(`${BASE_URL}/_memd/events`)
    expect(res.status).toBe(404)
  })

  // 4f. Directory redirect
  it('directory without trailing slash returns 302', async () => {
    const tmpDir = path.join(__dirname, 'tmpsubdir')
    fs.mkdirSync(tmpDir, { recursive: true })
    try {
      const res = await fetch(`${BASE_URL}/tmpsubdir`, { redirect: 'manual' })
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('/tmpsubdir/')
    } finally {
      fs.rmdirSync(tmpDir)
    }
  })

  // 4g. Path traversal vectors
  it('../ encoded traversal returns 403 or 404', async () => {
    const res = await fetch(`${BASE_URL}/%2e%2e/package.json`)
    expect([403, 404]).toContain(res.status)
  })

  it('..%2f encoded traversal returns 403 or 404', async () => {
    const res = await fetch(`${BASE_URL}/..%2fpackage.json`)
    expect([403, 404]).toContain(res.status)
  })

  it('null byte in URL path returns 400 or 403', async () => {
    const res = await fetch(`${BASE_URL}/test%00.md`)
    expect([400, 403]).toContain(res.status)
  })

  // Sidebar
  it('.md file response contains sidebar', async () => {
    const res = await fetch(`${BASE_URL}/test1.md`)
    const body = await res.text()
    expect(body).toContain('memd-sidebar')
    expect(body).toContain('memd-layout')
    expect(body).toContain('aria-current="page"')
  })

  // isDotPath design: '..' allowed by isDotPath, caught by resolveServePath
  describe('isDotPath and resolveServePath interaction', () => {
    it('isDotPath allows .. (traversal caught by resolveServePath)', async () => {
      const res = await fetch(`${BASE_URL}/../package.json`)
      expect([403, 404]).toContain(res.status)
    })

    it('isDotPath blocks dotfiles like .hidden', async () => {
      const res = await fetch(`${BASE_URL}/.hidden`)
      expect(res.status).toBe(403)
    })

    it('isDotPath blocks .git paths', async () => {
      const res = await fetch(`${BASE_URL}/.git/config`)
      expect(res.status).toBe(403)
    })
  })
})

// 4d. Watch mode SSE
describe('memd serve --watch', () => {
  const WATCH_PORT = 19877
  const WATCH_URL = `http://127.0.0.1:${WATCH_PORT}`
  let watchProcess

  beforeAll(async () => {
    watchProcess = spawn('node', [MAIN, 'serve', __dirname, '--port', String(WATCH_PORT), '--host', '127.0.0.1', '--watch'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    await new Promise((resolve, reject) => {
      watchProcess.stdout.on('data', (data) => {
        if (data.toString().includes('http://')) resolve()
      })
      watchProcess.on('error', reject)
      setTimeout(() => reject(new Error('Watch server did not start in time')), 10000)
    })
  })

  afterAll(async () => {
    if (watchProcess) {
      const exited = new Promise((resolve, reject) => {
        watchProcess.on('close', resolve)
        setTimeout(() => {
          watchProcess.kill('SIGKILL')
          reject(new Error('Watch server did not exit within 5s after SIGTERM'))
        }, 5000)
      })
      watchProcess.kill('SIGTERM')
      await exited
    }
  })

  it('/_memd/events returns text/event-stream content type', async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    try {
      const res = await fetch(`${WATCH_URL}/_memd/events`, { signal: controller.signal })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/event-stream')
    } finally {
      clearTimeout(timeout)
      controller.abort()
    }
  })
})

