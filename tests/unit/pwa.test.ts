import { describe, expect, it } from 'vitest';
import { buildScript } from '../../src/platform/pwa';

describe('update check', () => {
  it('finds the build script in the page', () => {
    const html = '<script type="module" crossorigin src="./assets/index-B6_x9Qz1.js"></script>';
    expect(buildScript(html)).toBe('assets/index-B6_x9Qz1.js');
    expect(buildScript('<html></html>')).toBeNull();
  });
});
