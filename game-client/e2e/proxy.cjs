// Stand-in for a Discord Activity origin: serves a parent page at "/" and maps
// "/hub/bow/*" to the hub with the prefix stripped (HTTP and WebSocket), the
// way a Discord URL mapping does.
const http = require('http');
const net = require('net');

const HUB_PORT = 5801;
const PREFIX = '/hub/bow';

const parentPage = (src) => `<!doctype html><meta charset="utf-8">
<body style="margin:0;background:#000">
<iframe id="hub" src="${src}" style="width:100%;height:96vh;border:0"></iframe>
<script>
  const sessionId = new URLSearchParams(location.search).get('sid') || crypto.randomUUID().replace(/-/g, '');
  const iframe = document.getElementById('hub');
  const target = new URL(iframe.src).origin;
  const send = () => iframe.contentWindow.postMessage({ type: 'hub-auth', sessionId }, target);
  iframe.addEventListener('load', send);
  window.addEventListener('message', (e) => {
    if (e.source === iframe.contentWindow && e.data && e.data.type === 'hub-auth-request') send();
  });
</script>`;

function stripPrefix(url) {
  return url.slice(PREFIX.length) || '/';
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/?')) {
    const direct = new URL(req.url, 'http://x').searchParams.has('direct');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(parentPage(direct ? `http://localhost:${HUB_PORT}/` : `${PREFIX}/`));
    return;
  }
  if (req.url === PREFIX || req.url.startsWith(PREFIX + '/')) {
    const up = http.request(
      { host: 'localhost', port: HUB_PORT, method: req.method, path: stripPrefix(req.url), headers: req.headers },
      (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); },
    );
    req.pipe(up);
    return;
  }
  // anything else would be the Activity's own app: the lobby must never fetch here
  console.log('UNMAPPED', req.method, req.url);
  res.writeHead(404);
  res.end('not mapped');
});

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith(PREFIX + '/')) {
    console.log('UNMAPPED-WS', req.url);
    socket.destroy();
    return;
  }
  const upstream = net.connect(HUB_PORT, 'localhost', () => {
    const lines = [`${req.method} ${stripPrefix(req.url)} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    upstream.write(lines.join('\r\n') + '\r\n\r\n');
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  console.log('WS', req.url, '->', stripPrefix(req.url));
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(8095, () => console.log('proxy on 8095'));
