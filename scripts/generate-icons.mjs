// Renders the app icon, favicons, and iOS splash screens with headless Chromium.
// Run with: npm run icons   (set PW_CHROMIUM_PATH if Playwright's bundled browser is missing)
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const svg = readFileSync(new URL('scripts/icon.svg', root), 'utf8');
const out = (p) => new URL(`public/${p}`, root);
mkdirSync(out('icons'), { recursive: true });
mkdirSync(out('splash'), { recursive: true });

// Portrait CSS size and pixel ratio for current iPhones and iPads.
const DEVICES = [
  [440, 956, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2], [320, 568, 2],
  [1032, 1376, 2], [1024, 1366, 2], [834, 1210, 2], [834, 1194, 2], [820, 1180, 2], [810, 1080, 2], [768, 1024, 2], [744, 1133, 2],
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const page = await browser.newPage();

async function renderIcon(file, size, inset = 0) {
  const inner = size * (1 - inset * 2);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#4a2f22;display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: out(file).pathname, omitBackground: false });
}

await renderIcon('icons/icon-512.png', 512);
await renderIcon('icons/icon-192.png', 192);
await renderIcon('icons/apple-touch-icon.png', 180);
await renderIcon('icons/icon-maskable-512.png', 512, 0.1);
await renderIcon('favicon-32.png', 32);
writeFileSync(out('favicon.svg'), svg.replace('<rect width="512" height="512" fill="#4a2f22"/>', '<rect width="512" height="512" rx="112" fill="#4a2f22"/>'));

const links = [];
for (const [w, h, dpr] of DEVICES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  const icon = Math.round(Math.min(w, h) * 0.28);
  await p.setContent(`<html><body style="margin:0;background:#f4ede3;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:18px;font-family:-apple-system,system-ui,sans-serif">
    <div style="width:${icon}px;height:${icon}px;border-radius:${icon * 0.22}px;overflow:hidden">${svg.replace('<svg ', `<svg width="${icon}" height="${icon}" `)}</div>
    <div style="font-size:${Math.round(icon * 0.2)}px;font-weight:700;color:#4a2f22;letter-spacing:-0.01em">Coffee Inc 3</div></body></html>`);
  const name = `splash/${w * dpr}x${h * dpr}.png`;
  await p.screenshot({ path: out(name).pathname });
  await ctx.close();
  links.push(
    `    <link rel="apple-touch-startup-image" media="screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" href="/${name}" />`,
  );
}
await browser.close();

const indexUrl = new URL('index.html', root);
const html = readFileSync(indexUrl, 'utf8');
const block = `<!-- splash:start -->\n${links.join('\n')}\n    <!-- splash:end -->`;
const next = html.includes('<!-- splash:start -->')
  ? html.replace(/<!-- splash:start -->[\s\S]*<!-- splash:end -->/, block)
  : html.replace('<!-- SPLASH_LINKS -->', block);
writeFileSync(indexUrl, next);
console.log(`Wrote icons and ${DEVICES.length} splash screens.`);
