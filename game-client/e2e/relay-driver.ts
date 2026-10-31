// Runs the client's real (patched) HubConnection against a hub URL, one
// connection per session id, and prints the hub events it receives as JSON lines.
import { HubConnection } from '../.build/chia-gaming/front-end/src/services/HubConnection';

const [hubUrl, ...sids] = process.argv.slice(2);
const out = (event: string, sid: string, extra: unknown = {}) =>
  console.log(JSON.stringify({ event, sid: sid.slice(0, 6), ...(extra as object) }));

for (const sid of sids) {
  new HubConnection(hubUrl, sid, {
    onAdvisoryStart: (p) => out('advisory_start', sid, { peer_alias: p.peer_alias, my_amount: p.my_amount }),
    onPeerMessage: () => out('peer_message', sid),
    onDeliveryFailure: () => out('delivery_failure', sid),
    onRegistered: (id) => out('registered', sid, { player_id: id }),
    onAliasUpdated: (a) => out('alias_updated', sid, { alias: a }),
    onPeerAvailable: () => {},
    onPeerUnavailable: () => {},
    onClosed: () => out('closed', sid),
    onHubAttention: () => {},
    onHubDisconnected: () => out('disconnected', sid),
    onHubReconnected: () => {},
    onHubActivity: () => {},
    getPresence: () => ({ busy: false }),
  });
}
