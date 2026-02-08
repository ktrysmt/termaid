import { renderMermaid, renderMermaidAscii } from 'beautiful-mermaid';

const mermaidCode = `
flowchart TD
    A[Start] --> B{Decision?}
    B -->|Yes| C[Action]
    B -->|No| D[End]
    C --> D
`;

// const asciiArt = await renderMermaid(mermaidCode, {
//   bg: "#27272A",
//   fg: "#FFFFFF",
// });
const asciiArt = await renderMermaidAscii(mermaidCode, {});

console.log(asciiArt);
