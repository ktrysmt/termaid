#!/usr/bin/env node
// @ts-nocheck
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { renderMermaidAscii } from 'beautiful-mermaid';
import { highlight, supportsLanguage } from 'cli-highlight';
import { program } from 'commander';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

// Initialize marked configuration (will be configured in main function with color options)

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
  const pagerArgs = pagerCmd === 'less' ? ['-R'] : [];

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
    .name('asciimaid')
    .version(packageJson.version)
    .description('Render markdown with mermaid diagrams to terminal output')
    .argument('[files...]', 'markdown file(s) to render')
    .option('--no-pager', 'disable pager (less)')
    .option('--no-color', 'disable colored output')
    .option('--no-highlight', 'disable syntax highlighting')
    .option('--width <number>', 'terminal width override', Number, process.stdout.columns ?? 80)
    .action(async (files, options) => {
      // Check if color should be disabled (--no-color or NO_COLOR env var)
      const useColor = options.color !== false && !process.env.NO_COLOR;

      // Configure syntax highlighting options (passed to cli-highlight)
      const shouldHighlight = options.highlight !== false && useColor;

      // Configure marked with terminal renderer
      const highlightOptions = shouldHighlight ? { ignoreIllegals: true } : undefined;

      marked.use(markedTerminal({
        reflowText: true,
        width: options.width,
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
