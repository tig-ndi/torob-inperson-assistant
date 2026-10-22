import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function luminance(hex) {
  const h = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
  const values = [1,3,5].map(i => parseInt(h.slice(i, i+2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
}
test('actual light and dark tokens meet normal-text contrast for the principal semantic pairs', () => {
  const css = readFileSync(new URL('../../src/app/base/tokens.css', import.meta.url), 'utf8');
  for (const selector of [':root', ':root[data-ui-theme=dark]']) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = css.match(new RegExp(escaped + '\\s*\\{([^}]+)\\}'))?.[1];
    assert.ok(block, selector);
    const colors = Object.fromEntries([...block.matchAll(/--ub-([\w-]+):\s*(#[\da-f]+)/gi)].map(m => [m[1], m[2]]));
    for (const [fg,bg] of [['ink','surface'],['muted','surface'],['on-brand','brand'],['brand','brand-soft'],['positive','positive-soft'],['warning','warning-soft']]) {
      const a = luminance(colors[fg]), b = luminance(colors[bg]);
      const ratio = (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
      assert.ok(ratio >= 4.5, `${selector} ${fg}/${bg}: ${ratio}`);
    }
  }
});
