import { type AppConfig } from '../config/app-config';
import { type SessionMethods, type SessionSource, type SessionView } from './session-owner';

/**
The first message on a port: the config the owner is built from, if it is the first tab.
*/
export interface Hello {
  config: Pick<AppConfig, 'clientId' | 'issuer'>;
}

/**
A tab calling one of the owner's methods.
*/
export type Call = {
  [M in keyof SessionMethods]: { id: number; method: M; parameters: Parameters<SessionMethods[M]> };
}[keyof SessionMethods];

/**
The owner answering a call; errors travel as their message.
*/
export type Reply = { error: string; id: number } | { id: number; result: unknown };

/**
The owner telling a tab the session changed, and what it is now on connecting.
*/
export interface Update {
  session: SessionView | null;
}

/**
 * Serves the session to one tab over its port. The owner is built from the
 * first tab's config; later tabs load the same config.json.
 */
export function serveSession(port: MessagePort, ownerFor: (config: Hello['config']) => SessionSource): void {
  let owner: SessionSource | undefined;

  port.addEventListener('message', (event: MessageEvent<Call | Hello>) => {
    const message = event.data;

    if ('config' in message) {
      owner ??= ownerFor(message.config);
      owner.subscribe((session) => {
        port.postMessage({ session } satisfies Update);
      });
    } else if (owner !== undefined) {
      void answer(port, owner, message);
    }
  });
  port.start();
}

/**
Builds the owner from the first tab's config, and hands every later tab the same one.
*/
export function sharedOwner(create: (config: Hello['config']) => SessionSource): (config: Hello['config']) => SessionSource {
  let owner: SessionSource | undefined;

  return config => owner ??= create(config);
}

async function answer(port: MessagePort, owner: SessionSource, call: Call): Promise<void> {
  try {
    port.postMessage({ id: call.id, result: await dispatch(owner, call) } satisfies Reply);
  } catch (error) {
    port.postMessage({ error: error instanceof Error ? error.message : String(error), id: call.id } satisfies Reply);
  }
}

function dispatch(owner: SessionMethods, call: Call): Promise<unknown> {
  switch (call.method) {
    case 'accessToken': {
      return owner.accessToken();
    }
    case 'beginLogin': {
      return owner.beginLogin(...call.parameters);
    }
    case 'completeLogin': {
      return owner.completeLogin(...call.parameters);
    }
    case 'logout': {
      return owner.logout();
    }
  }
}
