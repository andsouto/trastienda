import { SessionOwner } from './session-owner';
import { serveSession } from './session-protocol';

declare const self: SharedWorkerGlobalScope;

// One owner for every tab of the admin: the refresh token never leaves this
// worker's memory, and tabs get an access token for each API request.
let owner: SessionOwner | undefined;

self.addEventListener('connect', (event) => {
  for (const port of event.ports) {
    // The first tab's config creates the owner; every later tab gets the same one.
    serveSession(port, config => owner ??= new SessionOwner(config, self.location.origin));
  }
});
