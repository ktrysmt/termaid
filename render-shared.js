import crypto from 'node:crypto';
import { Marked } from 'marked';
import { renderMermaidSVG } from '@ktrysmt/beautiful-mermaid';
import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledThemes } from 'shiki/themes';
import { bundledLanguages } from 'shiki/langs';
import { escapeHtml, resolveThemeColors } from './render-utils.js';

const SHIKI_THEME_IDS = [
  'nord', 'dracula', 'one-dark-pro',
  'github-dark', 'github-light',
  'solarized-dark', 'solarized-light',
  'catppuccin-mocha', 'catppuccin-latte',
  'tokyo-night', 'one-light',
  'everforest-light', 'min-dark', 'min-light',
];

const SHIKI_LANG_IDS = [
  'javascript', 'typescript', 'python', 'shellscript',
  'go', 'rust', 'java', 'c', 'cpp',
  'ruby', 'php', 'html', 'css', 'json',
  'yaml', 'toml', 'sql', 'markdown', 'diff',
];

let _hl = null;

export async function initHighlighter() {
  if (_hl) return;
  const [themes, langs] = await Promise.all([
    Promise.all(SHIKI_THEME_IDS.map(id => bundledThemes[id]().then(m => m.default))),
    Promise.all(SHIKI_LANG_IDS.map(id => bundledLanguages[id]().then(m => m.default))),
  ]);
  _hl = createHighlighterCoreSync({
    themes,
    langs,
    engine: createJavaScriptRegexEngine(),
  });
}

export const WIDTH_TOGGLE_SCRIPT = "(function(){var b=document.body,g=document.querySelector('.memd-width-toggle');if(!g)return;var sb=document.querySelector('.memd-sidebar');if(sb){sb.insertBefore(g,sb.firstChild);g.style.position='static';g.style.margin='0 0 0.5rem 0';g.style.width='auto'}var btns=g.querySelectorAll('.memd-wt-btn');function u(){var f=b.classList.contains('memd-full-width');btns.forEach(function(n){n.classList.toggle('active',n.dataset.mode===(f?'full':'smart'))})}if(localStorage.getItem('memd-width')==='full')b.classList.add('memd-full-width');u();btns.forEach(function(n){n.onclick=function(){if(n.dataset.mode==='full'){b.classList.add('memd-full-width');localStorage.setItem('memd-width','full')}else{b.classList.remove('memd-full-width');localStorage.setItem('memd-width','smart')}u()}})})();";

export const MERMAID_MODAL_SCRIPT = [
  "document.addEventListener('click',function(e){var d=e.target.closest('.mermaid-diagram');if(d){var o=document.createElement('div');o.className='mermaid-modal';o.innerHTML=d.querySelector('svg').outerHTML;o.onclick=function(){o.remove()};document.body.appendChild(o)}});",
  "document.addEventListener('keydown',function(e){if(e.key==='Escape'){var m=document.querySelector('.mermaid-modal');if(m)m.remove()}});",
].join('');

export const OUTLINE_SCRIPT = "(function(){var c=document.querySelector('.memd-content')||document.body;var o=document.querySelector('.memd-outline');if(!o)return;var hs=c.querySelectorAll('h1,h2,h3,h4,h5,h6');if(!hs.length){o.style.display='none';var btn=document.querySelector('.memd-toggle-outline');if(btn)btn.style.display='none';return}var ul=o.querySelector('ul');if(!ul)return;function ease(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}function smoothScroll(el){var start=window.scrollY;var end=el.getBoundingClientRect().top+start-20;var dist=end-start;var dur=Math.min(400,Math.max(150,Math.abs(dist)*0.3));var t0=null;function step(ts){if(!t0)t0=ts;var p=Math.min((ts-t0)/dur,1);window.scrollTo(0,start+dist*ease(p));if(p<1)requestAnimationFrame(step)}requestAnimationFrame(step)}var items=[];hs.forEach(function(h,i){if(!h.id)h.id='heading-'+i;var lv=parseInt(h.tagName.charAt(1));var li=document.createElement('li');li.setAttribute('data-level',lv);var a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;a.onclick=function(e){e.preventDefault();smoothScroll(h);history.replaceState(null,null,'#'+h.id)};li.appendChild(a);ul.appendChild(li);items.push({el:h,link:a})});var ticking=false;function upd(){var sy=window.scrollY+80;var cur=null;for(var i=0;i<items.length;i++){if(items[i].el.offsetTop<=sy)cur=i}items.forEach(function(it,idx){it.link.classList.toggle('active',idx===cur)});ticking=false}window.addEventListener('scroll',function(){if(!ticking){requestAnimationFrame(upd);ticking=true}});upd()})();";

export const PANEL_TOGGLE_SCRIPT = "(function(){var b=document.body;var sb=document.querySelector('.memd-toggle-sidebar');var s=document.querySelector('.memd-sidebar');if(sb&&s){var stored=localStorage.getItem('memd-sidebar');var isMobile=window.matchMedia('(max-width:768px)').matches;if(stored==='hidden'||(stored===null&&isMobile))b.classList.add('memd-sidebar-hidden');sb.onclick=function(){b.classList.toggle('memd-sidebar-hidden');localStorage.setItem('memd-sidebar',b.classList.contains('memd-sidebar-hidden')?'hidden':'visible')}}var ob=document.querySelector('.memd-toggle-outline');var o=document.querySelector('.memd-outline');if(ob&&o){if(localStorage.getItem('memd-outline')==='hidden')b.classList.add('memd-outline-hidden');ob.onclick=function(){b.classList.toggle('memd-outline-hidden');localStorage.setItem('memd-outline',b.classList.contains('memd-outline-hidden')?'hidden':'visible')}}})();";

export const RESIZE_SCRIPT = "(function(){var de=document.documentElement,b=document.body,MIN=140,MAX=520;function clamp(v){return Math.max(MIN,Math.min(MAX,v))}function load(k,prop){var v=parseInt(localStorage.getItem(k)||'',10);if(!isNaN(v))de.style.setProperty(prop,clamp(v)+'px')}load('memd-sidebar-w','--memd-sidebar-w');load('memd-outline-w','--memd-outline-w');function setup(h,side){if(!h)return;var sx,sw;function mv(e){var dx=e.clientX-sx,w;if(side==='l'){w=clamp(sw+dx);de.style.setProperty('--memd-sidebar-w',w+'px');localStorage.setItem('memd-sidebar-w',w)}else{w=clamp(sw-dx);de.style.setProperty('--memd-outline-w',w+'px');localStorage.setItem('memd-outline-w',w)}}function up(){document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);b.classList.remove('memd-resizing')}h.addEventListener('mousedown',function(e){e.preventDefault();sx=e.clientX;var prop=side==='l'?'--memd-sidebar-w':'--memd-outline-w';sw=parseInt(getComputedStyle(de).getPropertyValue(prop),10)||220;b.classList.add('memd-resizing');document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up)});h.addEventListener('dblclick',function(){var prop=side==='l'?'--memd-sidebar-w':'--memd-outline-w',k=side==='l'?'memd-sidebar-w':'memd-outline-w';de.style.removeProperty(prop);localStorage.removeItem(k)})}setup(document.querySelector('.memd-sidebar-resizer'),'l');setup(document.querySelector('.memd-outline-resizer'),'r')})();";

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
export function renderToHTML(markdown, diagramColors, shikiTheme) {
  const processed = convertMermaidToSVG(markdown, diagramColors);
  // Protect trusted SVGs/error blocks from HTML sanitization by replacing with placeholders
  const nonce = crypto.randomUUID();
  const svgStore = [];
  const withPlaceholders = processed.replace(/<svg[\s\S]*?<\/svg>|<pre class="mermaid-error">[\s\S]*?<\/pre>/g, (match) => {
    const id = svgStore.length;
    svgStore.push(match);
    return `MEMD_SVG_${nonce}_${id}`;
  });
  let markedInstance = htmlMarked;
  if (shikiTheme && _hl) {
    markedInstance = new Marked();
    markedInstance.use({
      renderer: {
        code({ text, lang }) {
          const loadedLangs = _hl.getLoadedLanguages();
          const effectiveLang = (lang && loadedLangs.includes(lang)) ? lang : null;
          if (effectiveLang) {
            return _hl.codeToHtml(text, { lang: effectiveLang, theme: shikiTheme });
          }
          return `<pre><code class="language-${escapeHtml(lang || '')}">${escapeHtml(text)}</code></pre>`;
        }
      }
    });
  }
  let body = markedInstance.parse(withPlaceholders);
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
body { background: ${t.bg}; color: ${t.fg}; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 70%; margin: 0 auto; padding: 2rem 1rem; }
@media (max-width: 1024px) { body { max-width: 85%; } }
@media (max-width: 768px) { body { max-width: 100%; } }
body.memd-full-width { max-width: none; margin: 0; }
.memd-width-toggle { position: fixed; top: 0.5rem; left: 0.5rem; z-index: 11; display: inline-flex; border-radius: 6px; overflow: hidden; border: 1px solid ${t.line}; font-size: 0; }
.memd-wt-btn { background: color-mix(in srgb, ${t.fg} 5%, ${t.bg}); border: none; color: ${t.muted}; padding: 0.25rem 0.5rem; cursor: pointer; font-size: 0.7rem; display: inline-flex; align-items: center; gap: 0.25rem; line-height: 1; }
.memd-wt-btn + .memd-wt-btn { border-left: 1px solid ${t.line}; }
.memd-wt-btn:hover { background: color-mix(in srgb, ${t.fg} 12%, ${t.bg}); }
.memd-wt-btn.active { background: color-mix(in srgb, ${t.accent} 18%, ${t.bg}); color: ${t.accent}; }
.memd-wt-btn svg { width: 12px; height: 12px; flex-shrink: 0; }
a { color: ${t.accent}; }
hr { border-color: ${t.line}; }
blockquote { border-left: 3px solid ${t.line}; color: ${t.muted}; padding-left: 1rem; }
svg { max-width: 100%; height: auto; }
.mermaid-diagram { cursor: zoom-in; text-align: center; }
.mermaid-modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 9999; display: flex; align-items: center; justify-content: center; cursor: zoom-out; padding: 2rem; }
.mermaid-modal svg { max-width: calc(100vw - 4rem); max-height: calc(100vh - 4rem); }
pre { background: color-mix(in srgb, ${t.fg} 8%, ${t.bg}); padding: 1rem; border-radius: 6px; overflow-x: auto; border: 1px solid ${t.line}; }
code { font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.95rem; color: ${t.accent}; background: color-mix(in srgb, ${t.fg} 8%, ${t.bg}); padding: 0.15em 0.35em; border-radius: 3px; }
pre code { color: inherit; background: none; padding: 0; border-radius: 0; font-size: 0.95rem; }
pre.shiki { padding: 1rem; border-radius: 6px; overflow-x: auto; border: 1px solid ${t.line}; }
pre.shiki code { font-size: 0.95rem; }
table { border-collapse: collapse; }
th, td { border: 1px solid ${t.line}; padding: 0.4rem 0.8rem; }
th { background: color-mix(in srgb, ${t.fg} 5%, ${t.bg}); }
.mermaid-error { background: color-mix(in srgb, ${t.accent} 10%, ${t.bg}); border: 1px solid color-mix(in srgb, ${t.accent} 40%, ${t.bg}); color: ${t.fg}; padding: 1rem; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; }
:root { --memd-sidebar-w: 220px; --memd-outline-w: 220px; }
.memd-sidebar, .memd-outline { position: sticky; top: 0; height: 100vh; overflow-y: auto; padding: 2.5rem 0.75rem 1rem; background: color-mix(in srgb, ${t.fg} 4%, ${t.bg}); box-sizing: border-box; font-size: 0.85rem; }
.memd-sidebar { border-right: 1px solid ${t.line}; }
.memd-outline { border-left: 1px solid ${t.line}; }
.memd-sidebar ul, .memd-outline ul { list-style: none; padding: 0; margin: 0; }
.memd-sidebar li, .memd-outline li { padding: 0.1rem 0; }
.memd-sidebar a, .memd-outline a { display: block; padding: 0.2rem 0.5rem; border-radius: 4px; color: ${t.muted}; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.memd-sidebar a:hover, .memd-outline a:hover { color: ${t.fg}; background: color-mix(in srgb, ${t.fg} 7%, ${t.bg}); }
.memd-sidebar a[aria-current="page"], .memd-outline a.active { color: ${t.accent}; background: color-mix(in srgb, ${t.accent} 14%, ${t.bg}); }
.memd-outline li[data-level="2"] { padding-left: 0.75rem; }
.memd-outline li[data-level="3"] { padding-left: 1.5rem; }
.memd-outline li[data-level="4"] { padding-left: 2.25rem; }
.memd-outline li[data-level="5"] { padding-left: 3rem; }
.memd-outline li[data-level="6"] { padding-left: 3.75rem; }
.memd-resizer { position: absolute; top: 0; bottom: 0; width: 6px; cursor: col-resize; z-index: 6; background: transparent; transition: background 0.15s; }
.memd-sidebar-resizer { right: -3px; }
.memd-outline-resizer { left: -3px; }
.memd-resizer:hover, body.memd-resizing .memd-resizer { background: color-mix(in srgb, ${t.accent} 35%, transparent); }
body.memd-resizing, body.memd-resizing * { cursor: col-resize !important; user-select: none !important; }
@media (max-width: 768px) { .memd-resizer { display: none; } }
.memd-panel-toggle { position: fixed; top: 0.5rem; z-index: 11; background: color-mix(in srgb, ${t.fg} 8%, ${t.bg}); border: 1px solid ${t.line}; color: ${t.muted}; cursor: pointer; border-radius: 4px; padding: 0.25rem; display: flex; align-items: center; justify-content: center; line-height: 0; }
body:has(.memd-breadcrumb) .memd-panel-toggle { top: 2.3rem; }
.memd-breadcrumb { position: fixed; top: 0; left: 0; right: 0; z-index: 10; background: color-mix(in srgb, ${t.fg} 3%, ${t.bg}); border-bottom: 1px solid ${t.line}; padding: 0.3rem 1rem; font-size: 0.8rem; color: ${t.muted}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; backdrop-filter: blur(8px); }
body:has(.memd-breadcrumb) { --memd-bc-h: 1.9rem; }
body:has(.memd-breadcrumb) .memd-sidebar, body:has(.memd-breadcrumb) .memd-outline { top: var(--memd-bc-h); height: calc(100vh - var(--memd-bc-h)); }
body:has(.memd-breadcrumb) .memd-layout { padding-top: var(--memd-bc-h); }
.memd-breadcrumb a { color: ${t.muted}; text-decoration: none; }
.memd-breadcrumb a:hover { color: ${t.accent}; text-decoration: underline; }
.memd-bc-current { color: ${t.fg}; }
.memd-bc-sep { margin: 0 0.4em; color: ${t.line}; }
.memd-bc-root { display: inline; }
.memd-bc-root:hover .memd-bc-sep { color: ${t.accent}; }
.memd-panel-toggle:hover { background: color-mix(in srgb, ${t.fg} 15%, ${t.bg}); color: ${t.fg}; }
.memd-panel-toggle svg { width: 16px; height: 16px; }
.memd-toggle-sidebar { left: 0.5rem; }
.memd-toggle-outline { right: 0.5rem; }
</style>
<!--memd:head-->
</head>
<body>
<div class="memd-width-toggle" role="group" aria-label="Width toggle"><button class="memd-wt-btn" data-mode="smart"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8h5m4 0h5"/><path d="M4 5l3 3-3 3m8-6l-3 3 3 3"/></svg>Smart</button><button class="memd-wt-btn" data-mode="full"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8h14"/><path d="M4 5L1 8l3 3m8-6l3 3-3 3"/></svg>Full</button></div>
<!--memd:content-->
${body.trimEnd()}
<!--/memd:content-->
<!--memd:scripts-->
</body>
</html>
`;
}
