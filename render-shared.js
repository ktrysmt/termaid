import crypto from 'node:crypto';
import { Marked } from 'marked';
import { renderMermaidSVG } from '@ktrysmt/beautiful-mermaid';
import { escapeHtml, resolveThemeColors } from './render-utils.js';

export const MERMAID_MODAL_SCRIPT = [
  "document.addEventListener('click',function(e){var d=e.target.closest('.mermaid-diagram');if(d){var o=document.createElement('div');o.className='mermaid-modal';o.innerHTML=d.querySelector('svg').outerHTML;o.onclick=function(){o.remove()};document.body.appendChild(o)}});",
  "document.addEventListener('keydown',function(e){if(e.key==='Escape'){var m=document.querySelector('.mermaid-modal');if(m)m.remove()}});",
].join('');

export function convertMermaidToSVG(markdown, diagramTheme) {
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

const htmlMarked = new Marked();

// NOTE: Raw HTML in markdown (CSS, HTML tags) is passed through unsanitized.
// JavaScript in markdown IS executable via inline HTML. This is intentional for a
// development-only tool; CSS/HTML authoring in markdown is a useful feature.
// The serve path mitigates XSS via CSP nonce-based script-src.
export function renderToHTML(markdown, diagramColors) {
  const processed = convertMermaidToSVG(markdown, diagramColors);
  // Protect trusted SVGs/error blocks from HTML sanitization by replacing with placeholders
  const nonce = crypto.randomUUID();
  const svgStore = [];
  const withPlaceholders = processed.replace(/<svg[\s\S]*?<\/svg>|<pre class="mermaid-error">[\s\S]*?<\/pre>/g, (match) => {
    const id = svgStore.length;
    svgStore.push(match);
    return `MEMD_SVG_${nonce}_${id}`;
  });
  let body = htmlMarked.parse(withPlaceholders);
  // Restore SVGs and wrap Mermaid diagrams in scrollable containers
  for (let i = 0; i < svgStore.length; i++) {
    const stored = svgStore[i];
    const wrapped = stored.startsWith('<svg')
      ? `<div class="mermaid-diagram">${stored}</div>`
      : stored;
    body = body.replace(`MEMD_SVG_${nonce}_${i}`, wrapped);
  }
  // Unwrap <p> tags around block-level mermaid containers
  body = body.replace(/<p>\s*(<div class="mermaid-diagram">[\s\S]*?<\/div>)\s*<\/p>/g, '$1');
  const t = resolveThemeColors(diagramColors);

  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${title ? `<title>${escapeHtml(title)}</title>` : ''}
<style>
body { background: ${t.bg}; color: ${t.fg}; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
a { color: ${t.accent}; }
hr { border-color: ${t.line}; }
blockquote { border-left: 3px solid ${t.line}; color: ${t.muted}; padding-left: 1rem; }
svg { max-width: 100%; height: auto; }
.mermaid-diagram { cursor: zoom-in; text-align: center; }
.mermaid-modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 9999; display: flex; align-items: center; justify-content: center; cursor: zoom-out; padding: 2rem; }
.mermaid-modal svg { max-width: calc(100vw - 4rem); max-height: calc(100vh - 4rem); }
pre { background: color-mix(in srgb, ${t.fg} 8%, ${t.bg}); padding: 1rem; border-radius: 6px; overflow-x: auto; }
code { font-size: 0.9em; color: ${t.accent}; }
pre code { color: inherit; }
table { border-collapse: collapse; }
th, td { border: 1px solid ${t.line}; padding: 0.4rem 0.8rem; }
th { background: color-mix(in srgb, ${t.fg} 5%, ${t.bg}); }
.mermaid-error { background: color-mix(in srgb, ${t.accent} 10%, ${t.bg}); border: 1px solid color-mix(in srgb, ${t.accent} 40%, ${t.bg}); color: ${t.fg}; padding: 1rem; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; }
</style>
<!--memd:head-->
</head>
<body>
<!--memd:content-->
${body.trimEnd()}
<!--/memd:content-->
<!--memd:scripts-->
</body>
</html>
`;
}
