import { describe, it, expect } from 'vitest'
import { launchTerminal } from 'tuistory'
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAIN = path.join(__dirname, '..', 'main.js')

async function run(args, { waitFor = null } = {}) {
  const session = await launchTerminal({
    command: 'node',
    args: [MAIN, ...args],
    cols: 80,
    rows: 30,
    waitForData: false,
  })
  const waitText = waitFor ?? (t => t.trim().length > 0)
  const output = await session.text({ waitFor: waitText, timeout: 8000 })
  return output.trim()
}

function runSync(args) {
  return execSync(`node ${MAIN} ${args}`, { encoding: 'utf-8', timeout: 15000 })
}

describe('memd CLI', () => {
  it('--version', async () => {
    const output = await run(['-v'])
    expect(output).toContain('2.0.1')
  })

  it('--help', async () => {
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
      { waitFor: t => t.includes('More text.') },
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

  it('renders test2.md (complex mermaid diagram)', async () => {
    const output = await run(
      ['--no-pager', '--no-color', '--width', '80', 'test/test2.md'],
      { waitFor: t => t.includes('More text after the diagram.') },
    )
    expect(output).toContain('Start')
    expect(output).toContain('Decision?')
    expect(output).toContain('Action')
    expect(output).toContain('End')
    expect(output).toContain('More text after the diagram.')
  })

  it('--ascii renders ASCII-only diagram', async () => {
    const output = await run(
      ['--no-pager', '--no-color', '--width', '80', '--ascii', 'test/test1.md'],
      { waitFor: t => t.includes('More text.') },
    )
    expect(output).toContain('+---+')
    expect(output).toContain('---->')
    expect(output).not.toContain('┌')
    expect(output).not.toContain('►')
  })

  it('--no-color strips ANSI escape codes', async () => {
    const output = await run(
      ['--no-pager', '--no-color', '--width', '80', 'test/test1.md'],
      { waitFor: t => t.includes('More text.') },
    )
    // eslint-disable-next-line no-control-regex
    expect(output).not.toMatch(/\x1b\[[\d;]*m/)
  })

  it('error on missing file', async () => {
    const session = await launchTerminal({
      command: 'node',
      args: [MAIN, '--no-pager', 'test/nonexistent.md'],
      cols: 80,
      rows: 10,
      waitForData: false,
    })
    const output = (await session.text({
      waitFor: t => t.includes('Error'),
      timeout: 8000,
    })).trim()
    expect(output).toContain('Error reading file')
    expect(output).toContain('nonexistent.md')
  })

  it('renders test-br.md (<br> tag line breaks)', async () => {
    const output = await run(
      ['--no-pager', '--no-color', '--width', '80', 'test/test-br.md'],
      { waitFor: t => t.includes('All three variants') },
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

  it('renders test-cjk.md (Japanese labels)', async () => {
    const output = await run(
      ['--no-pager', '--no-color', '--width', '80', 'test/test-cjk.md'],
      { waitFor: t => t.includes('Japanese labels') },
    )
    expect(output).toContain('開始')
    expect(output).toContain('判定')
    expect(output).toContain('実行')
    expect(output).toContain('終了')
    expect(output).toContain('はい')
    expect(output).toContain('いいえ')
  })

  it('reads markdown from stdin via shell', async () => {
    const session = await launchTerminal({
      command: 'sh',
      args: ['-c', `echo '# stdin test' | node ${MAIN} --no-pager --no-color`],
      cols: 80,
      rows: 10,
      waitForData: false,
    })
    const output = (await session.text({
      waitFor: t => t.includes('stdin test'),
      timeout: 8000,
    })).trim()
    expect(output).toContain('stdin test')
  })

  // --html output tests
  describe('--html output', () => {
    it('--html + file -> stdout', () => {
      const output = runSync('--html test/test1.md')
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
      const output = runSync('--html test/test3.md')
      expect(output).toContain('<svg')
      // Check for prefixed marker IDs (m0-, m1-, etc.)
      expect(output).toMatch(/id="m0-/)
      expect(output).toMatch(/id="m1-/)
    })

    it('--html + multiple files -> combined single HTML', () => {
      const output = runSync('--html test/test1.md test/test2.md')
      expect(output).toContain('<!DOCTYPE html>')
      // Content from both files
      expect(output).toContain('Hello')
      expect(output).toContain('More text after the diagram.')
      // Only one HTML document
      const doctypeCount = (output.match(/<!DOCTYPE html>/g) || []).length
      expect(doctypeCount).toBe(1)
    })
  })

  // Theme tests (HTML path)
  describe('theme (HTML path)', () => {
    it('--html --theme dracula uses dracula colors', () => {
      const output = runSync('--html --theme dracula test/test1.md')
      expect(output).toContain('#282a36') // bg
      expect(output).toContain('#f8f8f2') // fg
    })

    it('--html --theme tokyo-night uses tokyo-night colors', () => {
      const output = runSync('--html --theme tokyo-night test/test1.md')
      expect(output).toContain('#1a1b26') // bg
      expect(output).toContain('#a9b1d6') // fg
    })

    it('--html --theme nonexistent exits with error', () => {
      expect(() => {
        execSync(`node ${MAIN} --html --theme nonexistent test/test1.md`, { encoding: 'utf-8', timeout: 15000, stdio: 'pipe' })
      }).toThrow()
    })

    it('--html --no-color outputs full color HTML (silently ignored)', () => {
      const output = runSync('--html --no-color test/test1.md')
      expect(output).toContain('<!DOCTYPE html>')
      expect(output).toContain('#2e3440')
    })
  })

  // Theme tests (terminal path)
  describe('theme (terminal path)', () => {
    it('--theme dracula renders terminal output', async () => {
      const output = await run(
        ['--no-pager', '--no-color', '--theme', 'dracula', 'test/test1.md'],
        { waitFor: t => t.includes('More text.') },
      )
      expect(output).toContain('Hello')
      expect(output).toContain('More text.')
    })

    it('--theme tokyo-night (no highlight) renders terminal output', async () => {
      const output = await run(
        ['--no-pager', '--no-color', '--theme', 'tokyo-night', 'test/test1.md'],
        { waitFor: t => t.includes('More text.') },
      )
      expect(output).toContain('Hello')
      expect(output).toContain('More text.')
    })

    it('--theme one-dark renders terminal output', async () => {
      const output = await run(
        ['--no-pager', '--no-color', '--theme', 'one-dark', 'test/test1.md'],
        { waitFor: t => t.includes('More text.') },
      )
      expect(output).toContain('Hello')
      expect(output).toContain('More text.')
    })

    it('--theme nonexistent exits with error', async () => {
      const session = await launchTerminal({
        command: 'node',
        args: [MAIN, '--no-pager', '--no-color', '--theme', 'nonexistent', 'test/test1.md'],
        cols: 80,
        rows: 10,
        waitForData: false,
      })
      const output = (await session.text({
        waitFor: t => t.includes('Unknown theme'),
        timeout: 8000,
      })).trim()
      expect(output).toContain('Unknown theme')
      expect(output).toContain('Available themes')
    })

    it('default theme is nord', async () => {
      const output = await run(
        ['--no-pager', '--no-color', 'test/test1.md'],
        { waitFor: t => t.includes('More text.') },
      )
      expect(output).toContain('Hello')
      expect(output).toContain('More text.')
    })
  })

  // chalk.level = 0 + Shiki: verify no ANSI codes for all themes
  describe('--no-color strips ANSI from all themes', () => {
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
          { waitFor: t => t.includes('TypeScript') },
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

  it('unknown language falls back to plain text without errors', async () => {
    const session = await launchTerminal({
      command: 'sh',
      args: ['-c', `echo '# Test\n\n\`\`\`unknownlang\nsome code\n\`\`\`' | node ${MAIN} --no-pager --no-color`],
      cols: 80,
      rows: 10,
      waitForData: false,
    })
    const output = (await session.text({
      waitFor: t => t.includes('some code'),
      timeout: 8000,
    })).trim()
    expect(output).toContain('some code')
    expect(output).not.toContain('Error')
    expect(output).not.toContain('Could not find the language')
  })

  it('cli-highlight is not invoked (no highlight.js errors in output)', async () => {
    const session = await launchTerminal({
      command: 'sh',
      args: ['-c', `echo '# Test\n\n\`\`\`rust\nfn main() {}\n\`\`\`' | node ${MAIN} --no-pager`],
      cols: 80,
      rows: 10,
      waitForData: false,
    })
    const output = (await session.text({
      waitFor: t => t.includes('fn main'),
      timeout: 8000,
    })).trim()
    expect(output).toContain('fn main')
    expect(output).not.toContain('Could not find the language')
  })
})
