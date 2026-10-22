// Standalone contract checks for the icons/motion delivery. The shared app files
// are intentionally untouched until the main owner wires these components in.
// No model or seller calls are made; all assistant states below are component props.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const qaDir = path.join(repoRoot, '.local', 'qa', 'icons-motion');
const iconNames = [
  'AlertTriangleIcon', 'BatteryIcon', 'CameraIcon', 'CheckIcon', 'ChevronLeftIcon',
  'ChevronRightIcon', 'ClockIcon', 'CloseIcon', 'CompareIcon', 'CreditCardIcon',
  'CrosshairIcon', 'MapPinIcon', 'PlusIcon', 'RefreshIcon', 'RestartIcon',
  'SearchIcon', 'SparklesIcon', 'StopCircleIcon', 'StoreIcon',
];

async function mountStandalone(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const React = (await import('/@id/react')).default;
    const { createRoot } = (await import('/@id/react-dom/client')).default;
    const icons = await import('/src/presentation/icons-motion/icons.tsx');
    const activity = await import('/src/presentation/icons-motion/AssistantActivity.tsx');
    await import('/src/presentation/icons-motion/motion.css');

    const host = document.createElement('section');
    host.id = 'tia-standalone';
    host.dir = 'rtl';
    host.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:12px;max-width:100%;overflow-wrap:anywhere;color:#b52331';
    const gallery = document.createElement('div');
    gallery.id = 'tia-gallery';
    gallery.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:center';
    const activityHost = document.createElement('div');
    activityHost.id = 'tia-activity-host';
    host.append(gallery, activityHost);
    document.body.append(host);

    createRoot(gallery).render(React.createElement(React.Fragment, null, Object.entries(icons).map(([name, Icon]) =>
      React.createElement('span', { key: name, 'data-icon': name }, React.createElement(Icon, { size: 24 })))));
    const activityRoot = createRoot(activityHost);
    window.__tiaActivityRoot = activityRoot;
    window.__tiaSetPhase = phase => activityRoot.render(React.createElement(activity.AssistantActivity, { phase }));
    window.__tiaIconNames = Object.keys(icons);
    window.__tiaSetPhase('checking');
  });
  await expect(page.locator('#tia-gallery svg')).toHaveCount(iconNames.length);
  await expect(page.locator('#tia-activity-host [role="status"]')).toHaveCount(1);
}

const setPhase = (page, phase) => page.evaluate(value => window.__tiaSetPhase(value), phase);

test('favicon and touch icons are unique, resolvable, and internally consistent', async ({ page, request }) => {
  const readLinks = () => page.evaluate(() => [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')]
    .map(link => ({ rel: link.getAttribute('rel'), href: link.getAttribute('href'), type: link.getAttribute('type'), sizes: link.getAttribute('sizes') })));

  await page.goto('/');
  const links = await readLinks();
  expect(links.map(link => link.href)).toEqual([
    '/icons/favicon.svg',
    '/favicon.ico',
    '/icons/apple-touch-icon.png',
  ]);
  expect(links.filter(link => link.rel === 'icon')).toHaveLength(2);
  expect(new Set(links.map(link => link.href)).size).toBe(links.length);

  const svgResponse = await request.get('/icons/favicon.svg');
  expect(svgResponse.status()).toBe(200);
  expect(svgResponse.headers()['content-type']).toContain('image/svg+xml');
  const svg = await svgResponse.text();
  expect(svg).toContain('viewBox="0 0 64 64"');
  expect(svg).toContain('#b52331');
  expect(svg).not.toMatch(/<text\b|font-family|href="https?:/i);

  const icoResponse = await request.get('/favicon.ico');
  expect(icoResponse.status()).toBe(200);
  expect(icoResponse.headers()['content-type']).toMatch(/image\/(x-icon|vnd\.microsoft\.icon)/);
  const ico = await icoResponse.body();
  expect(ico.readUInt16LE(0)).toBe(0);
  expect(ico.readUInt16LE(2)).toBe(1);
  const count = ico.readUInt16LE(4);
  expect(count).toBe(3);
  const icoSizes = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = ico[entry] === 0 ? 256 : ico[entry];
    const height = ico[entry + 1] === 0 ? 256 : ico[entry + 1];
    const bytes = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    expect(width).toBe(height);
    expect(offset + bytes).toBeLessThanOrEqual(ico.length);
    const png = ico.subarray(offset, offset + bytes);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(width);
    expect(png.readUInt32BE(20)).toBe(height);
    icoSizes.push(width);
  }
  expect(icoSizes).toEqual([16, 32, 48]);

  const appleResponse = await request.get('/icons/apple-touch-icon.png');
  expect(appleResponse.status()).toBe(200);
  expect(appleResponse.headers()['content-type']).toContain('image/png');
  const apple = await appleResponse.body();
  expect(apple.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(apple.readUInt32BE(16)).toBe(180);
  expect(apple.readUInt32BE(20)).toBe(180);
  expect(apple[25]).toBe(2);

  expect(await page.locator('link[rel="manifest"]').count()).toBe(0);
  const manifestResponse = await request.get('/manifest.json');
  expect(manifestResponse.headers()['content-type'] ?? '').not.toContain('application/manifest+json');
  expect(await manifestResponse.text()).not.toContain('"start_url"');

  await page.reload();
  expect(await readLinks()).toHaveLength(links.length);
});

test('icon components are decorative, coherent, and inherit the surrounding color', async ({ page }) => {
  await mountStandalone(page);
  const names = await page.evaluate(() => window.__tiaIconNames);
  expect([...names].sort()).toEqual([...iconNames].sort());

  const svgs = page.locator('#tia-gallery svg');
  const attributes = await svgs.evaluateAll(nodes => nodes.map(node => ({
    viewBox: node.getAttribute('viewBox'),
    ariaHidden: node.getAttribute('aria-hidden'),
    focusable: node.getAttribute('focusable'),
    width: node.getAttribute('width'),
    height: node.getAttribute('height'),
    strokeWidth: node.getAttribute('stroke-width'),
    stroke: getComputedStyle(node).stroke,
    transform: getComputedStyle(node).transform,
    hasTitle: Boolean(node.querySelector('title')),
  })));
  for (const icon of attributes) {
    expect(icon.viewBox).toBe('0 0 24 24');
    expect(icon.ariaHidden).toBe('true');
    expect(icon.focusable).toBe('false');
    expect(icon.width).toBe('24');
    expect(icon.height).toBe('24');
    expect(icon.strokeWidth).toBe('1.75');
    expect(icon.stroke).toBe('rgb(181, 35, 49)');
    expect(icon.transform).toBe('none');
    expect(icon.hasTitle).toBe(false);
  }

  await page.locator('#tia-standalone').screenshot({ path: path.join(qaDir, 'standalone-icons-activity.png') });
});

test('assistant activity keeps one live region and stops without inventing stages', async ({ page }) => {
  const apiCalls = [];
  await mountStandalone(page);
  const host = page.locator('#tia-activity-host');
  const status = host.locator('[role="status"]');
  const spinner = host.locator('.tia-motion-spinner');

  await expect(status).toHaveCount(1);
  await expect(host).toHaveText('در حال بررسی دسترسی دستیار…');
  await expect(spinner).toHaveCount(1);
  expect(await spinner.evaluate(node => getComputedStyle(node).animationName)).toBe('tia-motion-spin');

  page.on('request', request => { if (request.url().includes('/api/')) apiCalls.push(request.url()); });
  await setPhase(page, 'pending');
  await expect(host).toHaveText('در حال بررسی درخواست…');
  await expect(status).toHaveCount(1);
  expect(await host.innerText()).not.toMatch(/فروشنده|موجودی|درصد|تماس/);

  for (const phase of ['success', 'error', 'cancelled', 'idle']) {
    await setPhase(page, phase);
    await expect(status).toHaveCount(0);
    await expect(spinner).toHaveCount(0);
  }

  await setPhase(page, 'pending');
  await expect(status).toHaveCount(1);
  await setPhase(page, 'cancelled');
  await setPhase(page, 'success');
  await expect(status).toHaveCount(0);
  expect(apiCalls).toEqual([]);

  await setPhase(page, 'checking');
  await expect(status).toHaveCount(1);
  await page.evaluate(() => window.__tiaActivityRoot.unmount());
  await expect(host).toBeEmpty();
});

test('reduced motion keeps status text and removes nonessential motion', async ({ page }) => {
  await mountStandalone(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setPhase(page, 'pending');

  const host = page.locator('#tia-activity-host');
  await expect(host.locator('[role="status"]')).toBeVisible();
  await expect(host).toHaveText('در حال بررسی درخواست…');
  expect(await host.locator('.tia-motion-spinner').evaluate(node => getComputedStyle(node).animationName)).toBe('none');

  const motion = await page.evaluate(() => {
    const press = document.createElement('button');
    press.className = 'tia-motion-press';
    press.textContent = 'آزمایش';
    const enter = document.createElement('div');
    enter.className = 'tia-motion-enter';
    document.body.append(press, enter);
    const result = {
      transitionDuration: getComputedStyle(press).transitionDuration,
      enterAnimation: getComputedStyle(enter).animationName,
    };
    press.remove();
    enter.remove();
    return result;
  });
  expect(motion.transitionDuration).toBe('0s');
  expect(motion.enterAnimation).toBe('none');
});

test('motion css stays scoped, uses motion-only tokens, and avoids broad transitions', async () => {
  const css = await readFile(new URL('../src/presentation/icons-motion/motion.css', import.meta.url), 'utf8');
  for (const token of ['--tia-motion-duration-fast', '--tia-motion-duration-base',
    '--tia-motion-ease-standard', '--tia-motion-distance-enter', '--tia-motion-press-scale']) {
    expect(css).toContain(token);
  }
  expect(css).toContain('prefers-reduced-motion: reduce');
  expect(css).not.toMatch(/transition:\s*all/i);
  expect(css).not.toContain('will-change');
  expect(css).not.toMatch(/(^|[}\s])(html|body|button|input|textarea)\s*[{,]/m);
  expect(css).not.toMatch(/--(accent|border|radius|space|font|color)\s*:/);
  expect(css).toMatch(/\.tia-motion-enter/);
  expect(css).toMatch(/\.tia-motion-spinner/);
  expect(css).toMatch(/@keyframes tia-motion-enter/);
});

test('standalone icon and activity surface does not overflow target widths', async ({ page }) => {
  await mountStandalone(page);
  for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => {
      const host = document.getElementById('tia-standalone');
      return {
        document: document.documentElement.scrollWidth - window.innerWidth,
        host: host.scrollWidth - host.clientWidth,
      };
    });
    expect(overflow.document, `document overflow at ${width}px`).toBeLessThanOrEqual(0);
    expect(overflow.host, `standalone surface overflow at ${width}px`).toBeLessThanOrEqual(0);
  }
});
