// Tiny Server-Sent-Events hub: every open screen gets a "changed" ping and
// refetches, so phones, the counter PC and the TV all stay in sync.
const clients = new Set();

export function sseHandler(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const client = { res };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(client); });
}

let pending = new Set();
let timer = null;
/** Debounced broadcast — many writes in one request become one event. */
export function emit(topic) {
  pending.add(topic);
  if (timer) return;
  timer = setTimeout(() => {
    const data = JSON.stringify({ topics: [...pending], at: Date.now() });
    pending = new Set();
    timer = null;
    for (const c of clients) c.res.write(`event: changed\ndata: ${data}\n\n`);
  }, 80);
}
