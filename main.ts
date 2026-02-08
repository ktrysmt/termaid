import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { renderMermaidAscii } from 'beautiful-mermaid';

// Mermaid blocks in markdown を ASCII art に変換する
function convertMermaidToAscii(markdown: string): string {
  const mermaidRegex = /```mermaid\s+([\s\S]+?)```/g;

  return markdown.replace(mermaidRegex, (_, code) => {
    try {
      const asciiArt = renderMermaidAscii(code.trim(), {});
      // marked-terminal が警告を出さないように、言語指定なしのコードブロックにする
      return `\`\`\`text\n${asciiArt}\n\`\`\``;
    } catch (error) {
      // 変換に失敗した場合は元の mermaid block を返す
      return `\`\`\`mermaid\n${code.trim()}\n\`\`\``;
    }
  });
}

// marked-terminal を使用して markdown を terminal 表示用に変換
marked.use(markedTerminal());

// markdown をパースして出力
function renderMdmd(markdown: string): void {
  const processedMarkdown = convertMermaidToAscii(markdown);
  const result = marked.parse(processedMarkdown);
  console.log(result);
}

export { renderMdmd, convertMermaidToAscii };

// 使い方の例
const exampleMarkdown = `
# Hello

This is **markdown** printed in the \`terminal\`.

\`\`\`mermaid
flowchart TD
    A[Start] --> B{Decision?}
    B -->|Yes| C[Action]
    B -->|No| D[End]
    C --> D
\`\`\`

More text after the diagram.
`;

renderMdmd(exampleMarkdown);
