// 用法: node cdp-shot.mjs out.png
import { connectPage } from './cdplib.mjs';
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const c = await connectPage();
try {
  const r = await c.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(out, Buffer.from(r.data, 'base64'));
  console.log('saved', out);
} finally { c.close(); }
