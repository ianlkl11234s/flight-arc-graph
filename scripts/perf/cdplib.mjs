// 零依賴 CDP client（Node >= 22 全域 WebSocket）
export async function findPageTarget(port = 9333, urlPrefix = 'http://localhost:5199') {
  const list = await (await fetch(`http://localhost:${port}/json`)).json();
  const t = list.find(t => t.type === 'page' && t.url.startsWith(urlPrefix));
  if (!t) throw new Error('page target not found: ' + JSON.stringify(list.map(t => [t.type, t.url])));
  return t;
}

export class CDP {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); this.listeners = new Map(); }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id); this.pending.delete(msg.id);
        if (!p) return;
        msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
      } else if (msg.method) {
        const ls = this.listeners.get(msg.method); if (ls) for (const l of ls) l(msg.params);
      }
    };
    return this;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params }; if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  on(method, fn) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(fn); }
  once(method) { return new Promise(res => { const fn = (p) => { const ls = this.listeners.get(method); ls.splice(ls.indexOf(fn), 1); res(p); }; this.on(method, fn); }); }
  close() { this.ws.close(); }
}

export async function connectPage(port = 9333) {
  const t = await findPageTarget(port);
  const c = await new CDP(t.webSocketDebuggerUrl).connect();
  return c;
}

export async function evalJs(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('eval exception: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
  return r.result.value;
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
