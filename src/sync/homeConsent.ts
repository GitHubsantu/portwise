import type { KeyValueStore } from '../profiles/models';

/** Remembered account/login consent only. Config writes use fresh command dialogs. */
export class HomeConsent {
  constructor(private readonly state: KeyValueStore, private readonly key: string) {}

  async confirm(home: string, ask: (target: string) => Promise<boolean>): Promise<boolean> {
    if (this.grantedHomes().includes(home)) return true;
    if (!await ask(home)) return false;
    await this.state.update(this.key, [...this.grantedHomes(), home]);
    return true;
  }

  async runWithConsent(home: string, ask: (target: string) => Promise<boolean>, write: () => Promise<void>): Promise<boolean> {
    if (!await this.confirm(home, ask)) return false;
    await write();
    return true;
  }

  private grantedHomes(): string[] {
    const value = this.state.get<unknown>(this.key);
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
  }
}

export function consentMessage(home: string): string {
  return `Portwise will write its managed gateway entry to config.toml and PORTWISE_GATEWAY_TOKEN to .env in this exact Codex home:\n\n${home}\n\nContinue?`;
}
