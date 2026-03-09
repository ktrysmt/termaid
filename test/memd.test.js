import { describe, it, expect } from 'vitest'
import { launchTerminal } from 'tuistory'
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

describe('memd CLI', () => {
  it('--version', async () => {
    const output = await run(['-v'])
    expect(output).toContain('1.5.0')
  })

  it('--help', async () => {
    const output = await run(['--help'])
    expect(output).toContain('Usage: memd')
    expect(output).toContain('--no-pager')
    expect(output).toContain('--no-color')
    expect(output).toContain('--ascii')
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
})
