// Two players match on a hub, once behind a /hub/bow path prefix and once at
// the hub root. Lobby: real hub-frontend in a browser. Game relay: the
// client's real (patched) HubConnection, run in Node by relay-driver.cjs.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const crypto = require('crypto');

const sid = () => crypto.randomBytes(16).toString('hex');

function startRelays(hubUrl, sids) {
  const proc = spawn('node', ['relay-driver.cjs', hubUrl, ...sids]);
  const events = [];
  let buf = '';
  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try { events.push(JSON.parse(line)); } catch { /* client log line */ }
    }
  });
  const waitFor = async (pred, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (events.some(pred)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('relay event timeout; got ' + JSON.stringify(events));
  };
  return { proc, events, waitFor };
}

async function joinAs(browser, url, name) {
  const page = await (await browser.newContext({ viewport: { width: 520, height: 900 } })).newPage();
  await page.goto(url);
  const hub = page.frameLocator('#hub');
  await hub.getByPlaceholder('Your name').fill(name);
  await hub.getByRole('button', { name: 'Join Hub' }).click();
  return { page, hub };
}

async function matchFlow(browser, label, pageUrl, relayHubUrl, a, b) {
  const [sa, sb] = [sid(), sid()];
  const relays = startRelays(relayHubUrl, [sa, sb]);
  try {
    await relays.waitFor((e) => e.event === 'registered' && e.sid === sa.slice(0, 6));
    await relays.waitFor((e) => e.event === 'registered' && e.sid === sb.slice(0, 6));
    const sep = pageUrl.includes('?') ? '&' : '?';
    const A = await joinAs(browser, `${pageUrl}${sep}sid=${sa}`, a);
    const B = await joinAs(browser, `${pageUrl}${sep}sid=${sb}`, b);
    await A.hub.getByText(b, { exact: true }).waitFor({ timeout: 20000 });
    // challenge the named player, not whoever is listed first
    const row = A.hub.locator('div', { has: A.hub.getByText(b, { exact: true }) }).filter({ has: A.hub.getByRole('button', { name: 'Challenge' }) }).last();
    await row.getByRole('button', { name: 'Challenge' }).click();
    await A.hub.getByRole('button', { name: 'Send Challenge' }).click();
    await B.hub.getByRole('button', { name: 'Accept' }).waitFor({ timeout: 20000 });
    if (label === 'prefix') await B.page.screenshot({ path: 'prefix-challenge.png' });
    await B.hub.getByRole('button', { name: 'Accept' }).click();
    await relays.waitFor((e) => e.event === 'advisory_start');
    await new Promise((r) => setTimeout(r, 500));
    return {
      lobby_url: A.page.frames()[1].url(),
      relay_events: relays.events.map((e) => `${e.sid} ${e.event}${e.peer_alias ? ' from ' + e.peer_alias : ''}`),
    };
  } finally {
    relays.proc.kill();
    for (const ctx of browser.contexts()) await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  const prefix = await matchFlow(browser, 'prefix', 'http://localhost:8095/', 'http://localhost:8095/hub/bow', 'Alice', 'Bob');
  const root = await matchFlow(browser, 'root', 'http://localhost:8095/?direct', 'http://localhost:5801', 'Carol', 'Dave');
  console.log(JSON.stringify({ prefix, root }, null, 1));
  await browser.close();
})().catch((e) => {
  console.error('E2E FAILED:', e.message.slice(0, 600));
  process.exit(1);
});
