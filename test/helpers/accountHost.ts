import { AccountStore } from '../../src/accounts/accountStore';
import { AccountSwitcher } from '../../src/accounts/accountSwitcher';

/** Child extension-host fixture: credentials come only from the parent's temporary home. */
async function run(): Promise<void> {
  const home = process.argv[2]; if (!home) throw new Error('missing temporary home');
  const state = new Map<string, unknown>(); const secrets = new Map<string, string>();
  const store = new AccountStore({
    get: <T>(key: string) => state.get(key) as T | undefined,
    update: async (key, value) => { state.set(key, value); },
  }, {
    get: async (key) => secrets.get(key), store: async (key, value) => { secrets.set(key, value); }, delete: async (key) => { secrets.delete(key); },
  });
  const switcher = new AccountSwitcher({ codexHome: home, store });
  await switcher.captureCurrent('Child fixture');
  const account = store.list(home)[0]; if (!account) throw new Error('missing fixture');
  await switcher.switchTo(account.id, async () => {
    process.on('message', () => undefined); // Keep the host alive with its notification still open.
    process.send?.('restart-notification');
    await new Promise<void>(() => undefined);
  });
}
void run().catch(() => { process.exitCode = 1; });
