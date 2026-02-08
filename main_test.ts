import { renderMdmd } from './main.ts';

// Markdownを描画（MermaidはASCII artに変換）
const md = `
# タイトル

\`\`\`mermaid
flowchart LR
    A --> B
\`\`\`
`;

renderMdmd(md);  // terminalで表示
