import type { KeyValueStore } from '../profiles/models';

const CONSENT_KEY = 'portwise.codexHomeConsent';

/** Persists explicit write consent by resolved Codex-home path, never by a global switch. */
export class HomeConsent {
  constructor(private readonly state: KeyValueStore) {}

  async confirm(home: string, ask: (target: string) => Promise<boolean>): Promise<boolean> {
    if (this.grantedHomes().includes(home)) return true;
    if (!await ask(home)) return false;
    await this.state.update(CONSENT_KEY, [...this.grantedHomes(), home]);
    return true;
  }

  async runWithConsent(home: string, ask: (target: string) => Promise<boolean>, write: () => Promise<void>): Promise<boolean> {
    if (!await this.confirm(home, ask)) return false;
    await write();
    return true;
  }

  private grantedHomes(): string[] {
    const value = this.state.get<unknown>(CONSENT_KEY);
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
  }
}

export function consentMessage(home: string): string {
  return `Portwise will write its managed gateway entry to config.toml and PORTWISE_GATEWAY_TOKEN to .env in this exact Codex home:\n\n${home}\n\nContinue?`;
}
