import type { LockOptions } from '../core/fileLock';
import { withAccountOperation } from './accountOperation';
import type { KeyValueStore } from '../profiles/models';
import { AccountError } from './accountStore';

const PENDING = 'portwise.pendingCodexLoginHome';
export const LOGIN_REQUIRED = 'To save an account, first run “Portwise: Add Account via Codex Login” for that account. Each saved snapshot requires a fresh official login launch; Portwise never accepts passwords or auth.json contents.';

/** Serializes a one-use launch handoff with account switches for this Codex home. */
export class LoginPermit {
  constructor(private readonly state: KeyValueStore, private readonly home: string, private readonly lockOptions: LockOptions = {}) {}

  requirePending(): void { if (this.state.get<string>(PENDING) !== this.home) throw new AccountError(LOGIN_REQUIRED, 'login_required'); }

  async launch(launch: () => void): Promise<void> {
    await this.locked(async () => {
      launch();
      await this.state.update(PENDING, this.home);
    });
  }

  async consumeAndCapture(capture: () => Promise<void>): Promise<void> {
    await this.locked(async () => {
      this.requirePending();
      // Clear durably before reading/saving credentials. Never restore after capture failure.
      await this.state.update(PENDING, undefined);
      await capture();
    });
  }

  private async locked(operation: () => Promise<void>): Promise<void> {
    await withAccountOperation(this.home, this.lockOptions, operation);
  }
}
