#!/usr/bin/env node
// @ts-nocheck
import { marked, Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { renderMermaidASCII, renderMermaidSVG, THEMES as MERMAID_THEMES } from 'beautiful-mermaid';
import chalk from 'chalk';
import { program } from 'commander';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledThemes } from 'shiki/themes';
import { bundledLanguages } from 'shiki/langs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

// Shiki theme IDs used by memd (keys into bundledThemes)
const SHIKI_THEME_IDS = [
  'nord', 'dracula', 'one-dark-pro',
  'github-dark', 'github-light',
  'solarized-dark', 'solarized-light',
  'catppuccin-mocha', 'catppuccin-latte',
  'tokyo-night', 'one-light',
  'everforest-light', 'min-dark', 'min-light',
];

// Language IDs to preload (top 19 for >95% real-world coverage)
const SHIKI_LANG_IDS = [
  'javascript', 'typescript', 'python', 'shellscript',
  'go', 'rust', 'java', 'c', 'cpp',
  'ruby', 'php', 'html', 'css', 'json',
  'yaml', 'toml', 'sql', 'markdown', 'diff',
];

let _highlighter;
async function getHighlighter() {
  if (!_highlighter) {
    const [themes, langs] = await Promise.all([
      Promise.all(SHIKI_THEME_IDS.map(id => bundledThemes[id]().then(m => m.default))),
      Promise.all(SHIKI_LANG_IDS.map(id => bundledLanguages[id]().then(m => m.default))),
    ]);
    _highlighter = createHighlighterCoreSync({
      themes,
      langs,
      engine: createJavaScriptRegexEngine(),
    });
  }
  return _highlighter;
}

// Maps memd theme name -> { shikiTheme: string (Shiki theme ID), mermaidTheme: string }
const THEME_MAP = {
  'nord':              { shikiTheme: 'nord',              mermaidTheme: 'nord' },
  'dracula':           { shikiTheme: 'dracula',           mermaidTheme: 'dracula' },
  'one-dark':          { shikiTheme: 'one-dark-pro',      mermaidTheme: 'one-dark' },
  'github-dark':       { shikiTheme: 'github-dark',       mermaidTheme: 'github-dark' },
  'github-light':      { shikiTheme: 'github-light',      mermaidTheme: 'github-light' },
  'solarized-dark':    { shikiTheme: 'solarized-dark',    mermaidTheme: 'solarized-dark' },
  'solarized-light':   { shikiTheme: 'solarized-light',   mermaidTheme: 'solarized-light' },
  'catppuccin-mocha':  { shikiTheme: 'catppuccin-mocha',  mermaidTheme: 'catppuccin-mocha' },
  'catppuccin-latte':  { shikiTheme: 'catppuccin-latte',  mermaidTheme: 'catppuccin-latte' },
  'tokyo-night':       { shikiTheme: 'tokyo-night',       mermaidTheme: 'tokyo-night' },
  'tokyo-night-storm': { shikiTheme: 'tokyo-night',       mermaidTheme: 'tokyo-night-storm' },
  'tokyo-night-light': { shikiTheme: 'one-light',         mermaidTheme: 'tokyo-night-light' },
  'nord-light':        { shikiTheme: 'everforest-light',  mermaidTheme: 'nord-light' },
  'zinc-dark':         { shikiTheme: 'min-dark',          mermaidTheme: 'zinc-dark' },
  'zinc-light':        { shikiTheme: 'min-light',         mermaidTheme: 'zinc-light' },
};

// Single source of truth for available theme names (used in --help and validation)
const THEME_NAMES = Object.keys(THEME_MAP);

// Color mixing: blend hex1 into hex2 at pct% (sRGB linear interpolation)
// Equivalent to CSS color-mix(in srgb, hex1 pct%, hex2)
function mixHex(hex1, hex2, pct) {
  const p = pct / 100;
  const parse = (h, o) => parseInt(h.slice(o, o + 2), 16);
  const mix = (c1, c2) => Math.round(c1 * p + c2 * (1 - p));
  const toHex = x => x.toString(16).padStart(2, '0');
  const r = mix(parse(hex1, 1), parse(hex2, 1));
  const g = mix(parse(hex1, 3), parse(hex2, 3));
  const b = mix(parse(hex1, 5), parse(hex2, 5));
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// MIX ratios from beautiful-mermaid theme.ts:64-87
const MIX = { line: 50, arrow: 85, textSec: 60, nodeStroke: 20 };

// Gentle desaturation by blending toward neutral gray (#808080) in sRGB space.
// amount=0.15 means 15% toward gray. Replaces the old mute() (HSL-based) with a simpler,
// more predictable sRGB blend that avoids hue shifts from HSL rounding.
function softenHex(hex, amount = 0.15) {
  const parse = (h, o) => parseInt(h.slice(o, o + 2), 16);
  const mix = (c, gray) => Math.round(c * (1 - amount) + gray * amount);
  const toHex = x => x.toString(16).padStart(2, '0');
  const r = mix(parse(hex, 1), 128);
  const g = mix(parse(hex, 3), 128);
  const b = mix(parse(hex, 5), 128);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function tokensToAnsi(lines) {
  if (chalk.level === 0) {
    // --no-color: return plain text without ANSI codes
    return lines.map(line => line.map(t => t.content).join('')).join('\n');
  }
  return lines.map(line =>
    line.map(token => {
      if (!token.color) return token.content;
      const r = parseInt(token.color.slice(1, 3), 16);
      const g = parseInt(token.color.slice(3, 5), 16);
      const b = parseInt(token.color.slice(5, 7), 16);
      return `\x1b[38;2;${r};${g};${b}m${token.content}\x1b[39m`;
    }).join('')
  ).join('\n');
}

function highlightWithShikiSync(hl, code, lang, shikiThemeName) {
  const loadedLangs = hl.getLoadedLanguages();
  const effectiveLang = loadedLangs.includes(lang) ? lang : 'text';

  if (effectiveLang === 'text') {
    return code;
  }

  const tokens = hl.codeToTokensBase(code, {
    lang: effectiveLang,
    theme: shikiThemeName,
  });
  return tokensToAnsi(tokens);
}

function extractMarkdownStyleSync(hl, shikiThemeName) {
  const theme = hl.getTheme(shikiThemeName);

  const findColor = (...scopes) => {
    for (const scope of scopes) {
      const setting = theme.settings?.find(s => {
        if (!s.scope) return false;
        const scopeList = Array.isArray(s.scope) ? s.scope : [s.scope];
        return scopeList.some(sc => sc === scope || sc.startsWith(scope + '.'));
      });
      if (setting?.settings?.foreground) return setting.settings.foreground;
    }
    return theme.fg;
  };

  const accent = softenHex(findColor('entity.name.function', 'support.function', 'keyword'));
  const string = softenHex(findColor('string', 'string.quoted'));
  const comment = softenHex(findColor('comment', 'punctuation.definition.comment'));
  const type = softenHex(findColor('entity.name.type', 'support.type', 'storage.type'));
  const param = softenHex(findColor('variable.parameter', 'variable.other', 'entity.name.tag'));
  const fg = theme.fg;

  return {
    firstHeading: chalk.hex(accent).underline.bold,
    heading:      chalk.hex(accent).bold,
    code:         chalk.hex(string),
    codespan:     chalk.hex(string),
    blockquote:   chalk.hex(comment).italic,
    strong:       chalk.hex(fg).bold,
    em:           chalk.hex(param).italic,
    del:          chalk.hex(comment).strikethrough,
    link:         chalk.hex(type),
    href:         chalk.hex(type).underline,
  };
}

// DiagramColors -> AsciiTheme conversion (equivalent to beautiful-mermaid's internal diagramColorsToAsciiTheme)
function diagramColorsToAsciiTheme(colors) {
  const line = colors.line ?? mixHex(colors.fg, colors.bg, MIX.line);
  const border = colors.border ?? mixHex(colors.fg, colors.bg, MIX.nodeStroke);
  return {
    fg: colors.fg,
    bg: colors.bg,
    line,
    border,
    arrow: colors.accent ?? mixHex(colors.fg, colors.bg, MIX.arrow),
    accent: colors.accent,
    corner: line,
    junction: border,
  };
}

// Resolve optional DiagramColors fields for HTML template CSS
function resolveThemeColors(colors) {
  return {
    bg: colors.bg,
    fg: colors.fg,
    line: colors.line ?? mixHex(colors.fg, colors.bg, MIX.line),
    accent: colors.accent ?? mixHex(colors.fg, colors.bg, MIX.arrow),
    muted: colors.muted ?? mixHex(colors.fg, colors.bg, MIX.textSec),
    border: colors.border ?? mixHex(colors.fg, colors.bg, MIX.nodeStroke),
  };
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

  // Resolve symlinks and re-check to prevent symlink-based traversal
  const realPath = fs.realpathSync(absolutePath);
  const realRelative = path.relative(currentDirResolved, realPath);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error('Invalid path: access outside current directory is not allowed');
  }

  return fs.readFileSync(realPath, 'utf-8');
}

function convertMermaidToAscii(markdown, { useAscii = false, colorMode, theme } = {}) {
  const mermaidRegex = /```mermaid\s+([\s\S]+?)```/g;

  return markdown.replace(mermaidRegex, function (_, code) {
    try {
      const mermaidOptions = {};
      if (useAscii) mermaidOptions.useAscii = true;
      if (colorMode !== undefined) mermaidOptions.colorMode = colorMode;
      if (theme) mermaidOptions.theme = theme;
      const asciiArt = renderMermaidASCII(code.trim(), mermaidOptions);
      return '```text\n' + asciiArt + '\n```';
    } catch (error) {
      // Warn user about conversion failure (helps with debugging)
      console.warn(`Warning: Mermaid diagram conversion failed: ${error.message}`);
      // Return as text block if conversion fails (not mermaid, to avoid highlight errors)
      return '```text\n' + code.trim() + '\n```';
    }
  });
}

function convertMermaidToSVG(markdown, diagramTheme) {
  const mermaidRegex = /```mermaid\s+([\s\S]+?)```/g;
  let svgIndex = 0;
  return markdown.replace(mermaidRegex, (_, code) => {
    try {
      const prefix = `m${svgIndex++}`;
      let svg = renderMermaidSVG(code.trim(), diagramTheme);
      svg = svg.replace(/@import url\([^)]+\);\s*/g, '');
      // Prefix all id="..." and url(#...) to avoid cross-SVG collisions
      // Note: regex uses ` id=` (with leading space) to avoid matching `data-id`
      svg = svg.replace(/ id="([^"]+)"/g, ` id="${prefix}-$1"`);
      svg = svg.replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`);
      return svg;
    } catch (e) {
      return `<pre class="mermaid-error">${escapeHtml(e.message)}\n\n${escapeHtml(code.trim())}</pre>`;
    }
  });
}

function renderToHTML(markdown, diagramColors) {
  const processed = convertMermaidToSVG(markdown, diagramColors);
  const htmlMarked = new Marked();
  const body = htmlMarked.parse(processed);
  const t = resolveThemeColors(diagramColors);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { background: ${t.bg}; color: ${t.fg}; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
a { color: ${t.accent}; }
hr { border-color: ${t.line}; }
blockquote { border-left: 3px solid ${t.line}; color: ${t.muted}; padding-left: 1rem; }
svg { max-width: 100%; height: auto; }
pre { background: color-mix(in srgb, ${t.fg} 8%, ${t.bg}); padding: 1rem; border-radius: 6px; overflow-x: auto; }
code { font-size: 0.9em; color: ${t.accent}; }
pre code { color: inherit; }
table { border-collapse: collapse; }
th, td { border: 1px solid ${t.line}; padding: 0.4rem 0.8rem; }
th { background: color-mix(in srgb, ${t.fg} 5%, ${t.bg}); }
.mermaid-error { background: color-mix(in srgb, ${t.accent} 10%, ${t.bg}); border: 1px solid color-mix(in srgb, ${t.accent} 40%, ${t.bg}); color: ${t.fg}; padding: 1rem; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; }
</style>
</head>
<body>
${body.trimEnd()}
</body>
</html>
`;
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
  const pagerArgs = pagerCmd === 'less' ? ['-R', ...(options.mouse !== false ? ['--mouse', '--wheel-lines=5'] : [])] : [];

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

  // Ignore EPIPE on stdin - expected when user quits pager before all content is consumed
  pager.stdin.on('error', (err) => {
    if (err.code !== 'EPIPE') throw err;
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
    .description('Render markdown with mermaid diagrams')
    .argument('[files...]', 'markdown file(s) to render')
    .option('--no-pager', 'disable pager (less)')
    .option('--no-mouse', 'disable mouse scroll in pager')
    .option('--no-color', 'disable colored output')
    .option('--width <number>', 'terminal width override', Number)
    .option('--ascii', 'use pure ASCII mode for diagrams (default: unicode)')
    .option('--html', 'output as standalone HTML (mermaid diagrams rendered as inline SVG)')
    .option('--theme <name>', `color theme\n${THEME_NAMES.join(', ')}`, 'nord')
    .action(async (files, options) => {
      // 1. Validate theme via THEME_MAP (unified for both paths)
      if (!(options.theme in THEME_MAP)) {
        const names = Object.keys(THEME_MAP).join(', ');
        console.error(`Unknown theme: ${options.theme}\nAvailable themes: ${names}`);
        process.exit(1);
      }
      const themeEntry = THEME_MAP[options.theme];
      const diagramColors = MERMAID_THEMES[themeEntry.mermaidTheme];
      if (!diagramColors) {
        console.error(`Internal error: mermaid theme '${themeEntry.mermaidTheme}' not found in beautiful-mermaid`);
        process.exit(1);
      }

      // 2. Read input (common): files or stdin -> markdownParts[]
      const markdownParts = [];

      if (files.length === 0) {
        // Read from stdin
        if (process.stdin.isTTY) {
          program.help();
        }

        const stdinData = await readStdin();
        if (stdinData.trim()) {
          markdownParts.push(stdinData);
        } else {
          program.help();
        }
      } else {
        let exitCode = 0;
        for (const filePath of files) {
          try {
            markdownParts.push(readMarkdownFile(filePath));
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

      if (options.html) {
        // 3a. HTML path
        const combined = markdownParts.join('\n\n');
        const html = renderToHTML(combined, diagramColors);
        process.stdout.write(html);
      } else {
        // 3b. Terminal path

        // --no-color: disable all ANSI output at the root via chalk.level = 0
        const useColor = options.color !== false && !process.env.NO_COLOR;
        if (!useColor) {
          chalk.level = 0;
        }

        const shikiThemeName = themeEntry.shikiTheme;

        // Initialize Shiki highlighter (async load, then used synchronously)
        const hl = await getHighlighter();

        // Extract markdown element styling from Shiki theme (with softenHex desaturation)
        const markdownStyle = extractMarkdownStyleSync(hl, shikiThemeName);

        // Pass null for highlightOptions to marked-terminal.
        // The code renderer override below intercepts all code blocks before
        // marked-terminal's internal highlight function is reached.
        marked.use(markedTerminal({
          reflowText: true,
          width: options.width ?? process.stdout.columns ?? 80,
          ...markdownStyle,
        }, null));

        // Override link renderer to avoid OSC 8 escape sequences (fixes tmux display issues)
        marked.use({
          renderer: {
            link(token) {
              return token.text + (token.text !== token.href ? ` (${token.href})` : '');
            }
          }
        });

        // Override code renderer to use Shiki instead of cli-highlight.
        // This marked.use() call MUST come after markedTerminal() so that it takes
        // precedence over marked-terminal's internal code renderer (marked v17+
        // applies later overrides first).
        marked.use({
          renderer: {
            code(token) {
              const lang = token.lang || '';
              const code = typeof token === 'string' ? token : (token.text || token);
              const highlighted = highlightWithShikiSync(hl, String(code), lang, shikiThemeName);
              const lines = highlighted.split('\n');
              const indented = lines.map(line => '    ' + line).join('\n');
              return indented + '\n';
            }
          }
        });

        // Convert DiagramColors to AsciiTheme for terminal rendering
        const asciiTheme = diagramColorsToAsciiTheme(diagramColors);
        const colorMode = useColor ? undefined : 'none';

        const parts = [];
        for (const markdown of markdownParts) {
          const processed = convertMermaidToAscii(markdown, {
            useAscii: options.ascii,
            colorMode,
            theme: asciiTheme,
          });
          parts.push(marked.parse(processed));
        }

        const fullText = parts.join('\n\n') + '\n';

        // Use pager if needed
        if (shouldUsePager(fullText, options)) {
          spawnPager(fullText, options);
        } else {
          process.stdout.write(fullText);
        }
      }
    });

  program.parse();
}

main();
