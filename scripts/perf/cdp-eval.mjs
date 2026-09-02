// 用法: node cdp-eval.mjs '<js expression>'  (可回傳 Promise)
import { connectPage, evalJs } from './cdplib.mjs';
const expr = process.argv[2];
const c = await connectPage();
try {
  const v = await evalJs(c, expr);
  console.log(typeof v === 'string' ? v : JSON.stringify(v));
} finally { c.close(); }
