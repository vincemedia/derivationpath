// Regenerates TERMS.md from src/terms.ts: npm run terms:md
import { writeFileSync } from 'node:fs';
import { renderTermsMarkdown } from '../src/terms';

writeFileSync(new URL('../TERMS.md', import.meta.url), renderTermsMarkdown());
console.log('wrote TERMS.md');
