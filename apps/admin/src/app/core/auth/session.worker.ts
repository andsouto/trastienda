/// <reference lib="webworker" />
import { SessionOwner } from './session-owner';
import { serveSession, sharedOwner } from './session-port';

declare const self: SharedWorkerGlobalScope;

// One owner for every tab of the admin: the refresh token never leaves this
// worker's memory, and tabs get an access token for each API request.
const ownerFor = sharedOwner(config => new SessionOwner(config, self.location.origin));

self.addEventListener('connect', (event) => {
  for (const port of event.ports) {
    serveSession(port, ownerFor);
  }
});
