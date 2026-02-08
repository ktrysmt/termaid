import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

marked.use(markedTerminal());

const result = marked.parse('# Hello \n This is **markdown** printed in the `terminal`');
console.log(result);

