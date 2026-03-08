#!/usr/bin/env node
// @ts-nocheck
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { renderMermaidAscii } from 'beautiful-mermaid';
import { highlight, supportsLanguage, plain } from 'cli-highlight';
import chalk from 'chalk';
import { program } from 'commander';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

// HSL color utilities for deriving muted variants from base hex colors
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Mute a hex color: reduce saturation and shift lightness toward middle
function mute(hex, satMul = 0.55, lightShift = 0.85) {
  const [h, s, l] = hexToHsl(hex);
  const newS = s * satMul;
  const newL = l * lightShift;
  return hslToHex(h, Math.min(newS, 100), Math.max(Math.min(newL, 100), 0));
}

// Build theme from base palette: markdown gets vivid colors, code blocks get muted variants
function buildTheme(colors) {
  const m = (hex) => mute(hex); // muted variant for code block elements
  return {
    highlight: {
      keyword: chalk.hex(m(colors.keyword)),
      built_in: chalk.hex(m(colors.type)).italic,
      type: chalk.hex(m(colors.type)),
      literal: chalk.hex(m(colors.literal)),
      number: chalk.hex(m(colors.number)),
      regexp: chalk.hex(m(colors.string)),
      string: chalk.hex(m(colors.string)),
      subst: chalk.hex(m(colors.fg)),
      symbol: chalk.hex(m(colors.literal)),
      class: chalk.hex(m(colors.type)),
      function: chalk.hex(m(colors.func)),
      title: chalk.hex(m(colors.func)),
      params: chalk.hex(m(colors.param)).italic,
      comment: chalk.hex(m(colors.comment)).italic,
      doctag: chalk.hex(m(colors.comment)).bold,
      meta: chalk.hex(m(colors.comment)),
      'meta-keyword': chalk.hex(m(colors.keyword)),
      'meta-string': chalk.hex(m(colors.string)),
      tag: chalk.hex(m(colors.keyword)),
      name: chalk.hex(m(colors.keyword)),
      attr: chalk.hex(m(colors.func)),
      attribute: chalk.hex(m(colors.func)),
      variable: chalk.hex(m(colors.fg)),
      addition: chalk.hex(m(colors.added)),
      deletion: chalk.hex(m(colors.deleted)),
      default: plain,
    },
    markdown: {
      firstHeading: chalk.hex(colors.heading1).underline.bold,
      heading: chalk.hex(colors.heading2).bold,
      code: chalk.hex(colors.string),
      codespan: chalk.hex(colors.string),
      blockquote: chalk.hex(colors.comment).italic,
      strong: chalk.hex(colors.fg).bold,
      em: chalk.hex(colors.param).italic,
      del: chalk.hex(colors.comment).strikethrough,
      link: chalk.hex(colors.type),
      href: chalk.hex(colors.type).underline,
    },
  };
}

// Theme color palettes
const THEMES = {
  default: { highlight: null, markdown: {} },
  monokai: buildTheme({
    keyword:  '#F92672', func:    '#A6E22E', string:  '#E6DB74',
    type:     '#66D9EF', number:  '#AE81FF', literal: '#AE81FF',
    param:    '#FD971F', comment: '#75715E', fg:      '#F8F8F2',
    heading1: '#F92672', heading2:'#A6E22E',
    added:    '#A6E22E', deleted: '#F92672',
  }),
  dracula: buildTheme({
    keyword:  '#FF79C6', func:    '#50FA7B', string:  '#F1FA8C',
    type:     '#8BE9FD', number:  '#BD93F9', literal: '#BD93F9',
    param:    '#FFB86C', comment: '#6272A4', fg:      '#F8F8F2',
    heading1: '#BD93F9', heading2:'#FF79C6',
    added:    '#50FA7B', deleted: '#FF5555',
  }),
  'github-dark': buildTheme({
    keyword:  '#FF7B72', func:    '#D2A8FF', string:  '#A5D6FF',
    type:     '#FFA657', number:  '#79C0FF', literal: '#79C0FF',
    param:    '#C9D1D9', comment: '#8B949E', fg:      '#C9D1D9',
    heading1: '#FFFFFF', heading2:'#79C0FF',
    added:    '#7EE787', deleted: '#FF7B72',
  }),
  solarized: buildTheme({
    keyword:  '#859900', func:    '#268BD2', string:  '#2AA198',
    type:     '#B58900', number:  '#D33682', literal: '#2AA198',
    param:    '#93A1A1', comment: '#586E75', fg:      '#93A1A1',
    heading1: '#CB4B16', heading2:'#268BD2',
    added:    '#859900', deleted: '#DC322F',
  }),
  nord: buildTheme({
    keyword:  '#81A1C1', func:    '#88C0D0', string:  '#A3BE8C',
    type:     '#8FBCBB', number:  '#B48EAD', literal: '#81A1C1',
    param:    '#D8DEE9', comment: '#616E88', fg:      '#D8DEE9',
    heading1: '#88C0D0', heading2:'#81A1C1',
    added:    '#A3BE8C', deleted: '#BF616A',
  }),
};

const THEME_NAMES = Object.keys(THEMES);

function readMarkdownFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const currentDir = process.cwd();
  const currentDirResolved = path.resolve(currentDir);
  const relativePath = path.relative(currentDirResolved, absolutePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Invalid path: access outside current directory is not allowed');
  }

  if (!fs.existsSync(absolutePath)) {
    throw new Error('File not found: ' + absolutePath);
  }

  return fs.readFileSync(absolutePath, 'utf-8');
}

function convertMermaidToAscii(markdown, options = {}) {
  const mermaidRegex = /```mermaid\s+([\s\S]+?)```/g;

  return markdown.replace(mermaidRegex, function (_, code) {
    try {
      // Pass width option to beautiful-mermaid if provided
      const mermaidOptions = {};
      if (options.width) {
        mermaidOptions.maxWidth = options.width;
      }
      if (options.ascii) {
        mermaidOptions.useAscii = true;
      }
      const asciiArt = renderMermaidAscii(code.trim(), mermaidOptions);
      return '```text\n' + asciiArt + '\n```';
    } catch (error) {
      // Warn user about conversion failure (helps with debugging)
      console.warn(`Warning: Mermaid diagram conversion failed: ${error.message}`);
      // Return as text block if conversion fails (not mermaid, to avoid highlight errors)
      return '```text\n' + code.trim() + '\n```';
    }
  });
}

function renderToString(markdown, options = {}) {
  const processedMarkdown = convertMermaidToAscii(markdown, options);
  let result = marked.parse(processedMarkdown);

  // Strip ANSI color codes if --no-color is specified
  if (options.color === false) {
    // Remove ANSI escape codes (color, style, etc.)
    result = result.replace(/\x1b\[[0-9;]*m/g, '');
  }

  return result;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    process.stdin.on('error', reject);
  });
}

function shouldUsePager(text, options) {
  // Check TTY first - most important (prevents pager on pipes/redirects)
  if (!process.stdout.isTTY) return false;

  // User explicitly disabled pager (--no-pager sets options.pager to false)
  if (options.pager === false) return false;

  // NO_PAGER environment variable
  if (process.env.NO_PAGER) return false;

  // Check if output exceeds 90% of terminal height
  const lines = text.split('\n').length;
  const terminalRows = process.stdout.rows ?? 24;
  return lines > terminalRows * 0.9;
}

function spawnPager(text, options) {
  // Respect $PAGER environment variable (like glow, bat, mdcat)
  const pagerCmd = process.env.PAGER || 'less';
  const pagerArgs = pagerCmd === 'less' ? ['-R', ...(options.mouse !== false ? ['--mouse'] : [])] : [];

  const pager = spawn(pagerCmd, pagerArgs, {
    stdio: ['pipe', 'inherit', 'inherit']
  });

  pager.on('error', (err) => {
    // Fallback if pager is not found
    if (err.code === 'ENOENT') {
      process.stdout.write(text);
    } else {
      console.error(`Pager error: ${err.message}`);
      process.exit(1);
    }
  });

  pager.stdin.write(text);
  pager.stdin.end();

  pager.on('close', code => {
    process.exit(code ?? 0);
  });
}

async function main() {
  program
    .name('memd')
    .version(packageJson.version, '-v, --version', 'output the version number')
    .description('Render markdown with mermaid diagrams to terminal output')
    .argument('[files...]', 'markdown file(s) to render')
    .option('--no-pager', 'disable pager (less)')
    .option('--no-mouse', 'disable mouse scroll in pager')
    .option('--no-color', 'disable colored output')
    .option('--width <number>', 'terminal width override', Number)
    .option('--ascii', 'use pure ASCII mode for diagrams (default: unicode)')
    .option('--theme <name>', `syntax highlight theme (${THEME_NAMES.join(', ')})`, 'default')
    .action(async (files, options) => {
      // Validate theme option
      const themeName = options.theme || 'default';
      if (!(themeName in THEMES)) {
        console.error(`Unknown theme: ${themeName}\nAvailable themes: ${THEME_NAMES.join(', ')}`);
        process.exit(1);
      }

      // Check if color should be disabled (--no-color or NO_COLOR env var)
      const useColor = options.color !== false && !process.env.NO_COLOR;

      // Configure syntax highlighting options (passed to cli-highlight)
      const shouldHighlight = useColor;

      // Configure marked with terminal renderer
      const selectedTheme = THEMES[themeName];
      const highlightOptions = shouldHighlight
        ? {
            ignoreIllegals: true,
            ...(selectedTheme.highlight ? { theme: selectedTheme.highlight } : {}),
          }
        : undefined;

      marked.use(markedTerminal({
        reflowText: true,
        width: options.width ?? process.stdout.columns ?? 80,
        ...selectedTheme.markdown,
      }, highlightOptions));

      // Override link renderer to avoid OSC 8 escape sequences (fixes tmux display issues)
      marked.use({
        renderer: {
          link(token) {
            // URLとテキストを両方表示する場合
            return token.text + (token.text !== token.href ? ` (${token.href})` : '');
          }
        }
      });

      // If highlighting is disabled, override the code renderer to bypass cli-highlight
      if (!shouldHighlight) {
        marked.use({
          renderer: {
            code(token) {
              // Extract code text from token
              const codeText = typeof token === 'string' ? token : (token.text || token);
              // Return plain code without highlighting
              // Note: We still need to format it as marked-terminal would
              const lines = String(codeText).split('\n');
              const indented = lines.map(line => '    ' + line).join('\n');
              return indented + '\n';
            }
          }
        });
      }

      const parts = [];

      if (files.length === 0) {
        // Read from stdin
        if (process.stdin.isTTY) {
          program.help();
        }

        const stdinData = await readStdin();
        if (stdinData.trim()) {
          parts.push(renderToString(stdinData, options));
        } else {
          program.help();
        }
      } else {
        // Read from files
        let exitCode = 0;
        for (const filePath of files) {
          try {
            const markdown = readMarkdownFile(filePath);
            parts.push(renderToString(markdown, options));
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Error reading file ${filePath}: ${errorMessage}`);
            exitCode = 1;
          }
        }

        if (exitCode !== 0) {
          process.exit(exitCode);
        }
      }

      // Combine all output
      const fullText = parts.join('\n\n') + '\n';

      // Use pager if needed
      if (shouldUsePager(fullText, options)) {
        spawnPager(fullText, options);
      } else {
        process.stdout.write(fullText);
      }
    });

  program.parse();
}

main();
