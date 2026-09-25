import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderTermsMarkdown } from '../../terms';

describe('TERMS.md', () => {
  it('matches the in-app Terms of Use (run `npm run terms:md` after editing src/terms.ts)', () => {
    expect(readFileSync(new URL('../../../TERMS.md', import.meta.url), 'utf8')).toBe(renderTermsMarkdown());
  });
});
