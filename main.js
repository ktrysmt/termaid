#!/usr/bin/env node
// @ts-nocheck
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { renderMermaidASCII, THEMES as MERMAID_THEMES } from '@ktrysmt/beautiful-mermaid';
import chalk from 'chalk';
import { program } from 'commander';
import { spawn } from 'child_process';
import { createServer } from 'http';
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import crypto from 'node:crypto';
import { gzip as gzipCb } from 'node:zlib';
import { promisify } from 'node:util';
const gzipAsync = promisify(gzipCb);
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { escapeHtml, mixHex, MIX, resolveThemeColors } from './render-utils.js';

function envInt(name, fallback) {
  const v = process.env[name];
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

const STATIC_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.css': 'text/css',
};

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


// Gentle desaturation by blending toward neutral gray (#808080) in sRGB space.
// amount=0.15 means 15% toward gray.
function softenHex(hex, amount = 0.15) {
  return mixHex('#808080', hex, amount * 100);
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

function isPathWithinBase(baseDir, resolvedPath) {
  if (resolvedPath === baseDir) return true;
  const prefix = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  return resolvedPath.startsWith(prefix);
}

// CLI command: directory traversal is intentionally allowed.
// The CLI runs locally as the invoking user, so OS file permissions are the
// sole access-control layer -- same as cat, less, or any other local tool.
// The serve subcommand does NOT allow traversal; it confines all access to
// --dir via resolveServePath + checkSymlinkEscape to prevent network-exposed
// path traversal (DNS rebinding, SSRF, etc.).
function readMarkdownFile(filePath) {
  const absolutePath = path.resolve(filePath);
  try {
    return fs.readFileSync(fs.realpathSync(absolutePath), 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('File not found: ' + absolutePath);
    throw e;
  }
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


function etagMatch(ifNoneMatch, etag) {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch === etag) return true;
  return ifNoneMatch.split(',').some(t => t.trim() === etag);
}

function createRenderPool(workerPath, poolSize, opts = {}) {
  const workers = [];
  const activeRequest = new Map();
  const deadWorkers = new Set();
  const deadTimestamps = new Map();
  const terminatingWorkers = new Set();
  const waitQueue = [];
  let nextId = 0;
  let terminated = false;

  const RESPAWN_MAX = opts.respawnMax ?? 5;
  const RESPAWN_WINDOW_MS = opts.respawnWindowMs ?? 60_000;
  const RENDER_TIMEOUT_MS = opts.renderTimeoutMs ?? 30_000;
  const respawnTimestamps = new Map();

  function spawnWorker(idx) {
    const w = new Worker(workerPath);
    w.on('message', (msg) => handleMessage(idx, msg));
    w.on('error', (err) => console.error(`Worker ${idx} error: ${err.message}`));
    w.on('exit', (code) => handleExit(idx, code));
    return w;
  }

  function handleMessage(workerIndex, { id, html, error }) {
    const req = activeRequest.get(workerIndex);
    if (!req || req.id !== id) return;
    clearTimeout(req.timer);
    activeRequest.delete(workerIndex);
    error ? req.reject(new Error(error)) : req.resolve(html);
    drainWaitQueue();
  }

  function findAvailableWorker() {
    for (let i = 0; i < workers.length; i++) {
      if (deadWorkers.has(i) || terminatingWorkers.has(i)) continue;
      if (!activeRequest.has(i)) return i;
    }
    return -1;
  }

  function dispatch(workerIndex, markdown, diagramColors) {
    const id = nextId;
    nextId = (nextId + 1) % Number.MAX_SAFE_INTEGER;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        activeRequest.delete(workerIndex);
        terminatingWorkers.add(workerIndex);
        workers[workerIndex].terminate();
        reject(new Error('Render timed out'));
      }, RENDER_TIMEOUT_MS);
      activeRequest.set(workerIndex, { id, resolve, reject, timer });
      workers[workerIndex].postMessage({ id, markdown, diagramColors });
    });
  }

  function drainWaitQueue() {
    while (waitQueue.length > 0) {
      const idx = findAvailableWorker();
      if (idx === -1) break;
      const entry = waitQueue.shift();
      clearTimeout(entry.timer);
      dispatch(idx, entry.markdown, entry.diagramColors).then(entry.resolve, entry.reject);
    }
  }

  function handleExit(workerIndex, code) {
    const req = activeRequest.get(workerIndex);
    if (req) {
      clearTimeout(req.timer);
      req.reject(new Error(`Worker exited with code ${code}`));
      activeRequest.delete(workerIndex);
    }
    terminatingWorkers.delete(workerIndex);
    if (terminated) return;

    const now = Date.now();
    const history = (respawnTimestamps.get(workerIndex) || []).filter(t => now - t < RESPAWN_WINDOW_MS);
    if (history.length >= RESPAWN_MAX) {
      console.error(`Worker ${workerIndex} crashed ${RESPAWN_MAX} times in ${RESPAWN_WINDOW_MS / 1000}s, not respawning`);
      deadWorkers.add(workerIndex);
      deadTimestamps.set(workerIndex, Date.now());
      drainWaitQueue();
      return;
    }
    history.push(now);
    respawnTimestamps.set(workerIndex, history);
    workers[workerIndex] = spawnWorker(workerIndex);
    drainWaitQueue();
  }

  for (let i = 0; i < poolSize; i++) {
    workers.push(spawnWorker(i));
  }

  const DEAD_RECOVERY_MS = opts.deadRecoveryMs ?? 5 * 60_000;
  const DEAD_RECOVERY_CHECK_MS = 30_000;

  function recoverDeadWorkers(force = false) {
    let recovered = false;
    for (const idx of [...deadWorkers]) {
      const deadTime = deadTimestamps.get(idx);
      if (force || (deadTime && Date.now() - deadTime >= DEAD_RECOVERY_MS)) {
        deadWorkers.delete(idx);
        deadTimestamps.delete(idx);
        respawnTimestamps.delete(idx);
        workers[idx] = spawnWorker(idx);
        console.log(`Worker ${idx} recovered after cooldown`);
        recovered = true;
      }
    }
    if (recovered) drainWaitQueue();
  }

  const recoveryTimer = setInterval(() => {
    if (!terminated && deadWorkers.size > 0) {
      recoverDeadWorkers();
    }
  }, DEAD_RECOVERY_CHECK_MS);
  recoveryTimer.unref();

  return {
    render(markdown, diagramColors) {
      if (deadWorkers.size + terminatingWorkers.size >= workers.length) {
        recoverDeadWorkers(true);
      }
      const idx = findAvailableWorker();
      if (idx !== -1) {
        return dispatch(idx, markdown, diagramColors);
      }
      // waitQueue has no size limit. Each entry is small and has a timeout, so memory
      // growth is bounded by (concurrent requests * RENDER_TIMEOUT_MS). This is fine for
      // a dev server; HTTP server.requestTimeout provides an additional upper bound.
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const pos = waitQueue.findIndex(e => e.resolve === resolve);
          if (pos !== -1) waitQueue.splice(pos, 1);
          reject(new Error('All workers are unavailable'));
        }, RENDER_TIMEOUT_MS);
        waitQueue.push({ markdown, diagramColors, resolve, reject, timer });
      });
    },
    terminate() {
      terminated = true;
      clearInterval(recoveryTimer);
      for (const entry of waitQueue) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Pool terminated'));
      }
      waitQueue.length = 0;
      for (const w of workers) w.terminate();
    },
  };
}

// Serve subcommand: directory traversal is intentionally blocked.
// Unlike the CLI command, serve exposes files over HTTP and may be reachable
// from the network (--host 0.0.0.0). Allowing traversal would risk leaking
// arbitrary files via DNS rebinding, SSRF, or direct network access.
function resolveServePath(baseDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null; // invalid URI encoding
  }
  if (decoded.includes('\0')) return null;
  const resolved = path.resolve(path.join(baseDir, decoded));
  return isPathWithinBase(baseDir, resolved) ? resolved : null;
}

async function checkSymlinkEscape(baseDir, fsPath) {
  try {
    const real = await fs.promises.realpath(fsPath);
    return !isPathWithinBase(baseDir, real);
  } catch {
    return true;
  }
}

// '.' and '..' are excluded from dot-path blocking because they are valid path components;
// '..' traversal is separately caught by resolveServePath's prefix check.
function isDotPath(urlPath) {
  try {
    return decodeURIComponent(urlPath).split('/').some(seg => seg.startsWith('.') && seg !== '.' && seg !== '..');
  } catch {
    return true;
  }
}

async function readDirResolved(baseDir, dirPath) {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const resolved = await Promise.all(entries.map(async (e) => {
    if (e.isSymbolicLink()) {
      const target = path.join(dirPath, e.name);
      if (await checkSymlinkEscape(baseDir, target)) return null;
      try {
        const st = await fs.promises.stat(target);
        return { name: e.name, isDirectory: () => st.isDirectory(), isFile: () => st.isFile() };
      } catch { return null; }
    }
    return e;
  }));
  return resolved.filter(Boolean);
}

function buildDirEntryItems(urlPath, dirEntries, activeFileName) {
  const visible = dirEntries.filter(e => !e.name.startsWith('.'));
  const dirs = visible.filter(e => e.isDirectory()).map(e => e.name).sort();
  const mdFiles = visible.filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name).sort();
  const items = [];
  if (urlPath !== '/') {
    items.push('<li><a href="../">../</a></li>');
  }
  const dirNames = new Set(dirs);
  for (const d of dirs) {
    items.push(`<li><a href="${encodeURIComponent(d)}/">${escapeHtml(d)}/</a></li>`);
  }
  for (const f of mdFiles) {
    const base = f.slice(0, -3);
    const href = dirNames.has(base) ? encodeURIComponent(f) : encodeURIComponent(base);
    const attrs = activeFileName === f ? ' aria-current="page"' : '';
    items.push(`<li><a href="${href}"${attrs}>${escapeHtml(f)}</a></li>`);
  }
  return items;
}

function renderDirectoryListing(urlPath, dirEntries, themeColors) {
  const t = resolveThemeColors(themeColors);
  const items = buildDirEntryItems(urlPath, dirEntries);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Index of ${escapeHtml(urlPath)}</title>
<style>
body { background: ${t.bg}; color: ${t.fg}; font-family: system-ui, -apple-system, sans-serif; line-height: 1.8; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
a { color: ${t.accent}; text-decoration: none; }
a:hover { text-decoration: underline; }
h1 { font-size: 1.4rem; border-bottom: 1px solid ${t.line}; padding-bottom: 0.5rem; }
ul { list-style: none; padding: 0; }
li { padding: 0.2rem 0; }
</style>
</head>
<body>
<h1>Index of ${escapeHtml(urlPath)}</h1>
<ul>
${items.join('\n')}
</ul>
<!--memd:scripts-->
</body>
</html>`;
}

function buildSidebarHtml(dirUrlPath, activeFileName, dirEntries) {
  const items = buildDirEntryItems(dirUrlPath, dirEntries, activeFileName);
  return `<nav class="memd-sidebar"><ul>\n${items.join('\n')}\n</ul></nav>`;
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
    .enablePositionalOptions()
    .argument('[files...]', 'markdown file(s) to render')
    .option('--no-pager', 'disable pager (less)')
    .option('--no-mouse', 'disable mouse scroll in pager')
    .option('--no-color', 'disable colored output')
    .option('--width <number>', 'terminal width override', Number)
    .option('--ascii', 'use pure ASCII mode for diagrams (default: unicode)')
    .option('--html', 'output as standalone HTML (mermaid diagrams rendered as inline SVG)')
    .option('--theme <name>', `color theme (env: MEMD_THEME)\n${THEME_NAMES.join(', ')}`, process.env.MEMD_THEME || 'nord')
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
        const { renderToHTML, MERMAID_MODAL_SCRIPT } = await import('./render-shared.js');
        const combined = markdownParts.join('\n\n');
        let html = renderToHTML(combined, diagramColors);
        html = html.replace('<!--memd:scripts-->', html.includes('mermaid-diagram') ? `<script>${MERMAID_MODAL_SCRIPT}</script>` : '');
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

  program
    .command('serve')
    .description('Start HTTP server to serve .md files as HTML')
    .argument('[path]', 'directory or .md file to serve', '.')
    .option('-p, --port <number>', 'port number (0-65535)', Number, 8888)
    .option('--host <string>', 'host to bind', '127.0.0.1')
    .option('--workers <number>', 'number of render workers (default: min(cpus-1, 4))', Number)
    .option('--watch', 'watch for file changes and live-reload')
    .option('--theme <name>', `color theme (env: MEMD_THEME)\n${THEME_NAMES.join(', ')}`, process.env.MEMD_THEME || 'nord')
    .action(async (servePath, options) => {
      if (!(options.theme in THEME_MAP)) {
        const names = Object.keys(THEME_MAP).join(', ');
        console.error(`Unknown theme: ${options.theme}\nAvailable themes: ${names}`);
        process.exit(1);
      }
      const themeEntry = THEME_MAP[options.theme];
      const diagramColors = MERMAID_THEMES[themeEntry.mermaidTheme];
      if (!diagramColors) {
        console.error(`Internal error: mermaid theme '${themeEntry.mermaidTheme}' not found`);
        process.exit(1);
      }

      if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
        console.error('Invalid --port: must be an integer between 0 and 65535');
        process.exit(1);
      }

      let baseDir;
      let singleFile = null; // basename of .md file in single-file mode
      let resolvedServePath;
      try {
        resolvedServePath = fs.realpathSync(path.resolve(servePath));
      } catch {
        console.error(`Path not found: ${servePath}`);
        process.exit(1);
      }
      const serveStat = fs.statSync(resolvedServePath);
      if (serveStat.isFile()) {
        if (!resolvedServePath.endsWith('.md')) {
          console.error(`Not a .md file: ${servePath}`);
          process.exit(1);
        }
        singleFile = path.basename(resolvedServePath);
        baseDir = path.dirname(resolvedServePath);
      } else if (serveStat.isDirectory()) {
        baseDir = resolvedServePath;
      } else {
        console.error(`Not a file or directory: ${servePath}`);
        process.exit(1);
      }
      if (baseDir === '/') {
        console.error('Serving the filesystem root (/) is not allowed. Use a subdirectory instead.');
        process.exit(1);
      }

      if (options.workers !== undefined && (!Number.isInteger(options.workers) || options.workers < 1)) {
        console.error('Invalid --workers: must be a positive integer');
        process.exit(1);
      }
      const { MERMAID_MODAL_SCRIPT: mermaidModalScript } = await import('./render-shared.js');
      const poolSize = options.workers ?? Math.min(Math.max(1, os.cpus().length - 1), 4);
      const workerPath = new URL('./render-worker.js', import.meta.url);
      const pool = createRenderPool(workerPath, poolSize, {
        respawnMax: envInt('MEMD_SERVE_RESPAWN_MAX', 5),
        respawnWindowMs: envInt('MEMD_SERVE_RESPAWN_WINDOW_MS', 60_000),
        renderTimeoutMs: envInt('MEMD_SERVE_RENDER_TIMEOUT_MS', 30_000),
        deadRecoveryMs: envInt('MEMD_SERVE_DEAD_RECOVERY_MS', 5 * 60_000),
      });

      // Render cache: stores rawHtml (without sidebar) keyed by file path.
      // LRU eviction; byte tracking includes per-entry overhead (~256 bytes for Map entry + key + metadata).
      const CACHE_ENTRY_OVERHEAD = 256;
      const renderCache = new Map();
      let renderCacheBytes = 0;
      const inflight = new Map();
      const CACHE_MAX_ENTRIES = envInt('MEMD_SERVE_CACHE_MAX_ENTRIES', 200);
      const CACHE_MAX_BYTES = envInt('MEMD_SERVE_CACHE_MAX_BYTES', 50 * 1024 * 1024);
      const MD_MAX_SIZE = envInt('MEMD_SERVE_MD_MAX_SIZE', 10 * 1024 * 1024);
      const sseClients = new Set();

      // Directory entry cache: stores readdir results keyed by dir path (LRU, max 100).
      const dirEntryCache = new Map();
      const DIR_ENTRY_CACHE_MAX = 100;
      // Directory listing HTML cache: keyed by dir path (LRU, max 100).
      const dirListCache = new Map();
      const DIR_LIST_CACHE_MAX = 100;
      // Sidebar HTML cache: keyed by (dirPath + dirMtimeMs + activeFile), LRU max 200.
      const sidebarHtmlCache = new Map();
      const SIDEBAR_CACHE_MAX = 200;
      // Gzip cache: stores compressed Buffer keyed by etag (LRU, max 200).
      // Stale entries (from changed files) are never served because etag changes;
      // they are evicted naturally by LRU.
      const gzipCache = new Map();
      const GZIP_CACHE_MAX = envInt('MEMD_SERVE_GZIP_CACHE_MAX', 200);
      // Session-stable CSP nonce. Using a per-session nonce (instead of per-request)
      // allows gzip results to be cached. This is safe for a dev server: the nonce
      // prevents inline scripts in markdown from executing, and an attacker would need
      // filesystem access to observe it.
      const sessionNonce = crypto.randomBytes(16).toString('base64');

      const t = resolveThemeColors(diagramColors);

      // No rate limiting or connection limit is applied; this is a development-only server
      // not intended for production use. Do not expose to untrusted networks.

      function entryBytes(key, rawHtmlBytes) {
        return rawHtmlBytes + key.length + CACHE_ENTRY_OVERHEAD;
      }

      function renderCacheGet(key) {
        const entry = renderCache.get(key);
        if (entry) {
          renderCache.delete(key);
          renderCache.set(key, entry);
        }
        return entry;
      }

      function renderCacheSet(key, entry) {
        const old = renderCache.get(key);
        if (old) {
          renderCacheBytes -= old.totalBytes;
          renderCache.delete(key);
        }
        const totalBytes = entryBytes(key, entry.rawHtmlBytes);
        if (totalBytes > CACHE_MAX_BYTES) return;
        while (renderCache.size >= CACHE_MAX_ENTRIES || (renderCacheBytes + totalBytes > CACHE_MAX_BYTES && renderCache.size > 0)) {
          const oldestKey = renderCache.keys().next().value;
          const evicted = renderCache.get(oldestKey);
          renderCacheBytes -= evicted.totalBytes;
          renderCache.delete(oldestKey);
        }
        entry.totalBytes = totalBytes;
        renderCache.set(key, entry);
        renderCacheBytes += totalBytes;
      }

      function renderCacheDelete(key) {
        const entry = renderCache.get(key);
        if (entry) {
          renderCacheBytes -= entry.totalBytes;
          renderCache.delete(key);
        }
      }

      function lruGet(map, key) {
        const val = map.get(key);
        if (val !== undefined) {
          map.delete(key);
          map.set(key, val);
        }
        return val;
      }

      function lruSet(map, key, val, maxSize) {
        map.delete(key);
        if (map.size >= maxSize) {
          map.delete(map.keys().next().value);
        }
        map.set(key, val);
      }

      const sidebarCss = `.memd-layout { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
.memd-sidebar { position: sticky; top: 0; height: 100vh; overflow-y: auto; padding: 1rem; border-right: 1px solid ${t.line}; background: color-mix(in srgb, ${t.fg} 3%, ${t.bg}); box-sizing: border-box; }
.memd-sidebar ul { list-style: none; padding: 0; margin: 0; }
.memd-sidebar li { padding: 0.15rem 0; }
.memd-sidebar a { color: ${t.accent}; text-decoration: none; display: block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.9rem; }
.memd-sidebar a:hover { background: color-mix(in srgb, ${t.fg} 5%, ${t.bg}); }
.memd-sidebar a[aria-current="page"] { background: color-mix(in srgb, ${t.accent} 12%, ${t.bg}); }
.memd-content { max-width: 800px; padding: 2rem 1rem; }
body:has(.memd-layout) { max-width: none; margin: 0; padding: 0; }
.memd-hamburger { display: none; position: fixed; top: 0.5rem; left: 0.5rem; z-index: 10; background: color-mix(in srgb, ${t.fg} 8%, ${t.bg}); border: 1px solid ${t.line}; color: ${t.fg}; padding: 0.3rem 0.5rem; cursor: pointer; border-radius: 4px; font-size: 1.2rem; }
@media (max-width: 768px) {
  .memd-layout { grid-template-columns: 1fr; }
  .memd-sidebar { position: fixed; top: 0; left: 0; width: 260px; height: 100vh; z-index: 5; transform: translateX(-100%); transition: transform 0.2s; }
  .memd-sidebar.memd-sidebar-open { transform: translateX(0); }
  .memd-hamburger { display: block; }
  .memd-content { padding-top: 3rem; }
}`;
      function injectSidebar(html, sidebarHtml) {
        html = html.replace('<!--memd:head-->', `<style>${sidebarCss}</style>`);
        html = html.replace('<!--memd:content-->', `<button class="memd-hamburger" aria-label="Toggle sidebar">&#9776;</button><div class="memd-layout">${sidebarHtml}<main class="memd-content">`);
        html = html.replace('<!--/memd:content-->', '</main></div>');
        return html;
      }

      async function sendHtml(req, res, html, etag, hasSidebar = false, hasMermaid = false) {
        if (etag && etagMatch(req.headers['if-none-match'], etag)) {
          res.writeHead(304);
          res.end();
          return;
        }
        let scripts = '';
        if (options.watch) {
          scripts += 'new EventSource("/_memd/events").onmessage=function(){location.reload()};';
        }
        if (hasSidebar) {
          scripts += `document.querySelector('.memd-hamburger').onclick=function(){document.querySelector('.memd-sidebar').classList.toggle('memd-sidebar-open')};`;
        }
        if (hasMermaid) {
          scripts += mermaidModalScript;
        }
        let csp;
        if (scripts) {
          html = html.replace('<!--memd:scripts-->', `<script nonce="${sessionNonce}">${scripts}</script>`);
          csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${sessionNonce}'; connect-src 'self'; img-src 'self' https:; font-src 'self'; frame-ancestors 'self';`;
        } else {
          html = html.replace('<!--memd:scripts-->', '');
          csp = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https:; font-src 'self'; frame-ancestors 'self';";
        }
        const acceptEncoding = req.headers['accept-encoding'] || '';
        const useGzip = acceptEncoding.includes('gzip');
        let body;
        if (useGzip && etag) {
          const cachedGzip = lruGet(gzipCache, etag);
          if (cachedGzip) {
            body = cachedGzip;
          } else {
            body = await gzipAsync(html);
            lruSet(gzipCache, etag, body, GZIP_CACHE_MAX);
          }
        } else if (useGzip) {
          body = await gzipAsync(html);
        } else {
          body = Buffer.from(html);
        }
        const headers = {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': csp,
          'Content-Length': body.length,
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'Vary': 'Accept-Encoding',
          ...(useGzip ? { 'Content-Encoding': 'gzip' } : {}),
          ...(etag ? { 'ETag': etag, 'Cache-Control': 'no-cache' } : {}),
        };
        res.writeHead(200, headers);
        if (req.method === 'HEAD') { res.end(); return; }
        res.end(body);
      }

      async function getDirEntries(dirPath, dirMtimeMs) {
        const cached = lruGet(dirEntryCache, dirPath);
        if (cached && cached.mtimeMs === dirMtimeMs) {
          return cached.entries;
        }
        const entries = await readDirResolved(baseDir, dirPath);
        lruSet(dirEntryCache, dirPath, { entries, mtimeMs: dirMtimeMs }, DIR_ENTRY_CACHE_MAX);
        return entries;
      }

      // Compute ETag for a .md file (includes dirMtimeMs for sidebar consistency).
      // Used for early 304 checks before calling getRenderedHtml.
      async function computeMdEtag(fileStat, mdPath) {
        const dirPath = path.dirname(mdPath);
        let dirStat;
        try { dirStat = await fs.promises.stat(dirPath); } catch {}
        const dirMtimeMs = dirStat?.mtimeMs ?? 0;
        return `"${fileStat.mtimeMs}-${fileStat.size}-${dirMtimeMs}"`;
      }

      async function getRenderedHtml(mdPath, urlPath, fileStat) {
        const stat = fileStat || await fs.promises.stat(mdPath);
        if (stat.size > MD_MAX_SIZE) {
          throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MD_MAX_SIZE / 1024 / 1024} MB.`);
        }
        const dirPath = path.dirname(mdPath);
        let dirStat;
        try { dirStat = await fs.promises.stat(dirPath); } catch {}
        const dirMtimeMs = dirStat?.mtimeMs ?? 0;
        // ETag includes dirMtimeMs because the response contains the sidebar, which lists
        // directory entries. Any file addition/removal in the same directory changes the sidebar,
        // so all sibling .md ETags must be invalidated. This lowers browser cache hit rate but
        // ensures sidebar consistency. The server-side renderCache is NOT keyed by dirMtimeMs,
        // so re-rendering is only triggered when the .md file itself changes.
        const etag = `"${stat.mtimeMs}-${stat.size}-${dirMtimeMs}"`;

        // Check render cache (rawHtml without sidebar)
        const cached = renderCacheGet(mdPath);
        let rawHtml;
        let hasMermaid;
        if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
          rawHtml = cached.rawHtml;
          hasMermaid = cached.hasMermaid;
        } else {
          const inflightKey = `${mdPath}\0${stat.mtimeMs}-${stat.size}`;
          if (inflight.has(inflightKey)) {
            rawHtml = await inflight.get(inflightKey);
            hasMermaid = rawHtml.includes('mermaid-diagram');
          } else {
            // TOCTOU gap: checkSymlinkEscape resolves the symlink target via realpath
            // and verifies it is within baseDir, but between that check and the
            // subsequent readFile an attacker with filesystem access could swap the
            // symlink to point outside baseDir. Exploiting this requires:
            //   1. write access to the served directory (to create/replace a symlink), AND
            //   2. precise timing to win the race.
            // This is acceptable for a dev server on a trusted filesystem.
            if (await checkSymlinkEscape(baseDir, mdPath)) {
              throw Object.assign(new Error('Symlink escape detected'), { statusCode: 403 });
            }
            const renderPromise = fs.promises.readFile(mdPath, 'utf-8')
              .then(md => {
                if (Buffer.byteLength(md) > MD_MAX_SIZE) {
                  throw new Error(`File too large. Maximum size is ${MD_MAX_SIZE / 1024 / 1024} MB.`);
                }
                return pool.render(md, diagramColors);
              });
            inflight.set(inflightKey, renderPromise);
            try {
              rawHtml = await renderPromise;
              hasMermaid = rawHtml.includes('mermaid-diagram');
              renderCacheSet(mdPath, {
                rawHtml,
                rawHtmlBytes: Buffer.byteLength(rawHtml),
                mtimeMs: stat.mtimeMs,
                size: stat.size,
                hasMermaid,
              });
            } finally {
              inflight.delete(inflightKey);
            }
          }
        }

        // Build sidebar from dir entries. Sidebar HTML is cached per (dirPath, dirMtimeMs, activeFile).
        let html = rawHtml;
        const hasSidebar = !!dirStat;
        if (hasSidebar) {
          const entries = await getDirEntries(dirPath, dirMtimeMs);
          const activeFile = path.basename(mdPath);
          const dirUrlPath = urlPath.endsWith('/') ? urlPath : urlPath.replace(/\/[^/]*$/, '/');
          const sidebarKey = `${dirPath}\0${dirMtimeMs}\0${activeFile}`;
          const cachedSidebar = lruGet(sidebarHtmlCache, sidebarKey);
          let sidebarHtml;
          if (cachedSidebar) {
            sidebarHtml = cachedSidebar;
          } else {
            sidebarHtml = buildSidebarHtml(dirUrlPath, activeFile, entries);
            lruSet(sidebarHtmlCache, sidebarKey, sidebarHtml, SIDEBAR_CACHE_MAX);
          }
          html = injectSidebar(rawHtml, sidebarHtml);
        }
        return { html, etag, hasSidebar, hasMermaid };
      }

      const server = createServer(async (req, res) => {
        res.on('finish', () => {
          console.log(`${req.method} ${req.url} ${res.statusCode}`);
        });

        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { 'Content-Type': 'text/plain' });
          res.end('Method Not Allowed');
          return;
        }

        try {
          const parsedUrl = new URL(req.url, 'http://localhost');
          const urlPath = parsedUrl.pathname;

          if (options.watch && urlPath === '/_memd/events' && req.method === 'GET') {
            if (sseClients.size >= 100) {
              res.writeHead(503, { 'Content-Type': 'text/plain' });
              res.end('Too many SSE connections');
              return;
            }
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });
            res.write(':\n\n');
            sseClients.add(res);
            req.on('close', () => sseClients.delete(res));
            return;
          }

          // Single-file mode: redirect root to the served file
          if (singleFile && urlPath === '/') {
            const target = '/' + encodeURIComponent(singleFile) + parsedUrl.search;
            res.writeHead(302, { Location: target });
            res.end();
            return;
          }

          if (isDotPath(urlPath)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
          }
          const fsPath = resolveServePath(baseDir, urlPath);
          if (!fsPath) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
          }
          let stat;
          try { stat = await fs.promises.stat(fsPath); } catch (e) {
            if (e.code !== 'ENOENT') console.error(`stat error: ${fsPath} - ${e.message}`);
          }

          // TOCTOU gap: the symlink check (checkSymlinkEscape) and the subsequent
          // file read (createReadStream / getRenderedHtml) are not atomic. Between the
          // two operations, a symlink could be replaced to point outside baseDir.
          // Exploiting this requires write access to the served directory and precise
          // timing. Acceptable for a dev server on a trusted filesystem.
          if (stat && !fsPath.endsWith('.md')) {
            if (await checkSymlinkEscape(baseDir, fsPath)) {
              res.writeHead(403, { 'Content-Type': 'text/plain' });
              res.end('Forbidden');
              return;
            }
          }

          // Directory -> index.md or listing
          if (stat?.isDirectory()) {
            if (!urlPath.endsWith('/')) {
              res.writeHead(302, { Location: urlPath + '/' + parsedUrl.search });
              res.end();
              return;
            }
            const indexPath = path.join(fsPath, 'index.md');
            let indexStat;
            try { indexStat = await fs.promises.stat(indexPath); } catch {}
            if (indexStat?.isFile()) {
              const etag = await computeMdEtag(indexStat, indexPath);
              if (etagMatch(req.headers['if-none-match'], etag)) {
                res.writeHead(304);
                res.end();
                return;
              }
              const result = await getRenderedHtml(indexPath, urlPath, indexStat);
              await sendHtml(req, res, result.html, result.etag, result.hasSidebar, result.hasMermaid);
              return;
            }
            const dirEtag = `"dir-${stat.mtimeMs}"`;
            if (etagMatch(req.headers['if-none-match'], dirEtag)) {
              res.writeHead(304);
              res.end();
              return;
            }
            const dirCached = lruGet(dirListCache, fsPath);
            if (dirCached && dirCached.mtimeMs === stat.mtimeMs) {
              await sendHtml(req, res, dirCached.html, dirEtag);
              return;
            }
            const resolved = await readDirResolved(baseDir, fsPath);
            const html = renderDirectoryListing(urlPath, resolved, diagramColors);
            lruSet(dirListCache, fsPath, { html, mtimeMs: stat.mtimeMs }, DIR_LIST_CACHE_MAX);
            await sendHtml(req, res, html, dirEtag);
            return;
          }

          // .md file -> render as HTML
          if (stat?.isFile() && fsPath.endsWith('.md')) {
            const etag = await computeMdEtag(stat, fsPath);
            if (etagMatch(req.headers['if-none-match'], etag)) {
              res.writeHead(304);
              res.end();
              return;
            }
            const result = await getRenderedHtml(fsPath, urlPath, stat);
            await sendHtml(req, res, result.html, result.etag, result.hasSidebar, result.hasMermaid);
            return;
          }

          // Extensionless -> try .md fallback
          if (!stat) {
            const mdSafe = resolveServePath(baseDir, urlPath + '.md');
            if (mdSafe) {
              let mdStat;
              try { mdStat = await fs.promises.stat(mdSafe); } catch {}
              if (mdStat?.isFile()) {
                const etag = await computeMdEtag(mdStat, mdSafe);
                if (etagMatch(req.headers['if-none-match'], etag)) {
                  res.writeHead(304);
                  res.end();
                  return;
                }
                const result = await getRenderedHtml(mdSafe, urlPath, mdStat);
                await sendHtml(req, res, result.html, result.etag, result.hasSidebar, result.hasMermaid);
                return;
              }
            }
          }

          // Static file -> serve with allowed MIME types
          if (stat?.isFile()) {
            const ext = path.extname(fsPath).toLowerCase();
            const mime = STATIC_MIME[ext];
            if (mime) {
              const etag = `"${stat.mtimeMs}-${stat.size}"`;
              if (etagMatch(req.headers['if-none-match'], etag)) {
                res.writeHead(304);
                res.end();
                return;
              }
              const staticHeaders = {
                'Content-Type': mime,
                'Content-Length': stat.size,
                'Cache-Control': 'no-cache',
                'ETag': etag,
                'X-Content-Type-Options': 'nosniff',
                'Referrer-Policy': 'no-referrer',
                'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https:; font-src 'self'; frame-ancestors 'self';",
              };
              // SVG can contain <script>; force download and sandbox to prevent XSS
              if (ext === '.svg') {
                staticHeaders['Content-Disposition'] = 'attachment';
                staticHeaders['Content-Security-Policy'] = "default-src 'none'; sandbox;";
              }
              res.writeHead(200, staticHeaders);
              if (req.method === 'HEAD') { res.end(); return; }
              const stream = fs.createReadStream(fsPath);
              stream.on('error', (err) => { console.error(`Stream error: ${fsPath} - ${err.message}`); if (!res.writableEnded) res.end(); });
              stream.pipe(res);
              return;
            }
          }

          // 404
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        } catch (err) {
          console.error(`Error: ${req.method} ${req.url} - ${err.message}`);
          if (!res.headersSent) {
            const status = err.statusCode || 500;
            res.writeHead(status, { 'Content-Type': 'text/plain' });
            res.end(status === 403 ? 'Forbidden' : 'Internal Server Error');
          } else if (!res.writableEnded) {
            res.end();
          }
        }
      });

      server.requestTimeout = 60_000;
      server.headersTimeout = 10_000;

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`Port ${options.port} is already in use`);
        } else {
          console.error(`Server error: ${err.message}`);
        }
        process.exit(1);
      });

      let watcher;
      if (options.watch) {
        let watchDebounce;
        try {
          // On Linux, recursive fs.watch relies on inotify; large directory trees may hit
          // /proc/sys/fs/inotify/max_user_watches and silently stop watching new paths.
          // When the limit is reached, new watches may fail without emitting an 'error' event,
          // causing a "silent failure" where "Watch: enabled" is displayed but some files are
          // not monitored. There is no reliable cross-platform way to detect this at runtime
          // (reading /proc/sys/fs/inotify/max_user_watches is Linux-specific and the actual
          // count of consumed watches is not exposed). Manual refresh works as a fallback.
          watcher = fs.watch(baseDir, { recursive: true }, (eventType, filename) => {
            if (!filename) return;
            if (filename.split(path.sep).some(seg => seg === '..')) return;
            const fullPath = path.resolve(path.join(baseDir, filename));
            if (!isPathWithinBase(baseDir, fullPath)) return;
            // Only .md changes explicitly invalidate caches; non-.md changes still trigger
            // SSE reload but rely on natural mtime checks for cache freshness.
            if (filename.endsWith('.md')) {
              renderCacheDelete(fullPath);
              const parentDir = path.dirname(fullPath);
              dirListCache.delete(parentDir);
              dirEntryCache.delete(parentDir);
              // Sidebar cache entries for this directory are keyed by dirMtimeMs,
              // so stale entries are never served. LRU eviction handles cleanup.
            }
            clearTimeout(watchDebounce);
            watchDebounce = setTimeout(() => {
              for (const client of sseClients) {
                client.write('data: reload\n\n');
              }
            }, 100);
          });
          watcher.on('error', (err) => {
            console.error(`Watch error: ${err.message}`);
          });
        } catch (err) {
          console.error(`Warning: --watch failed to start (${err.message}). Live-reload disabled.`);
        }
      }

      server.listen(options.port, options.host, () => {
        const addr = server.address();
        let displayHost = options.host === '0.0.0.0' || options.host === '::' ? 'localhost' : options.host;
        if (displayHost.includes(':')) displayHost = `[${displayHost}]`;
        console.log(`memd serve`);
        if (singleFile) {
          console.log(`  File:      ${path.join(baseDir, singleFile)}`);
        } else {
          console.log(`  Directory: ${baseDir}`);
        }
        console.log(`  Theme:     ${options.theme}`);
        if (options.watch) console.log('  Watch:     enabled');
        console.log(`  URL:       http://${displayHost}:${addr.port}/`);
        if (options.host !== '127.0.0.1' && options.host !== 'localhost' && options.host !== '::1') {
          console.log('  WARNING: Server is exposed to the network. No authentication is enabled.');
        }
      });

      let shuttingDown = false;
      for (const signal of ['SIGTERM', 'SIGINT']) {
        process.on(signal, () => {
          if (shuttingDown) return;
          shuttingDown = true;
          if (watcher) watcher.close();
          for (const client of sseClients) client.end();
          server.close(() => {
            pool.terminate();
            process.exit(0);
          });
          setTimeout(() => {
            pool.terminate();
            server.closeAllConnections();
            process.exit(0);
          }, 3000);
        });
      }
    });

  program.parse();
}

main();
