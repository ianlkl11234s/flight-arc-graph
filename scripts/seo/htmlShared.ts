/** 機場頁與長文頁共用的 HTML 小工具（純函式）。 */

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON-LD 內嵌於 <script>：避免字串中的 </script> 或 <!-- 提早結束 */
export function jsonLd(obj: unknown): string {
  return JSON.stringify(obj, null, 2).replace(/</g, "\\u003c");
}

export const BASE_STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0b0f17;color:#e6e9ef;font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif}
main{max-width:860px;margin:0 auto;padding:20px 16px 48px}
a{color:#ffb454}
nav.crumbs{font-size:14px;color:#9aa4b5;margin-bottom:12px}
nav.crumbs a{color:#9aa4b5}
h1{font-size:26px;line-height:1.3;margin:8px 0 12px}
h2{font-size:19px;margin:32px 0 10px;padding-top:8px;border-top:1px solid #1f2733}
.lead{font-size:17px}
.cta{display:inline-block;margin:12px 0 4px;padding:10px 18px;border-radius:8px;background:#ffb454;color:#1a1204;font-weight:700;text-decoration:none}
dl.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0}
dl.stats div{background:#121926;border:1px solid #1f2733;border-radius:8px;padding:10px 12px}
dl.stats dt{font-size:13px;color:#9aa4b5}
dl.stats dd{margin:2px 0 0;font-size:20px;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{padding:7px 8px;border-bottom:1px solid #1f2733;text-align:left}
th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}
.tablewrap{overflow-x:auto}
.note{font-size:14px;color:#9aa4b5}
footer{margin-top:40px;padding-top:16px;border-top:1px solid #1f2733;font-size:14px;color:#9aa4b5}
ul.plain{padding-left:20px}
ul.cols{columns:2 260px;padding-left:20px}
`.trim();
