import { describe, expect, it } from 'vitest';
import { LoginPermit } from '../src/accounts/loginPermit';
import { temporaryDirectory } from './helpers/temporaryDirectory';

async function setup() {
  const directory = await temporaryDirectory('portwise-login-permit'); const values = new Map<string, unknown>();
  const state = { get: <T>(key: string) => values.get(key) as T | undefined, update: async (key: string, value: unknown) => { values.set(key, value); } };
  return { directory, values, permit: new LoginPermit(state, directory.path), state };
}

describe('LoginPermit', () => {
  it('refuses without a launch, consumes before capture and refuses reuse', async () => {
    const { directory, values, permit } = await setup();
    try {
      let captures = 0;
      await expect(permit.consumeAndCapture(async () => { captures++; })).rejects.toMatchObject({ code: 'login_required' });
      await permit.launch(() => undefined);
      await permit.consumeAndCapture(async () => { expect(values.get('portwise.pendingCodexLoginHome')).toBeUndefined(); captures++; });
      await expect(permit.consumeAndCapture(async () => { captures++; })).rejects.toMatchObject({ code: 'login_required' });
      expect(captures).toBe(1);
    } finally { await directory.dispose(); }
  });

  it('allows only one of two concurrent saves to capture', async () => {
    const { directory, permit } = await setup();
    try {
      await permit.launch(() => undefined); let captures = 0;
      const capture = async () => { captures++; await Promise.resolve(); };
      const results = await Promise.allSettled([permit.consumeAndCapture(capture), permit.consumeAndCapture(capture)]);
      expect(captures).toBe(1); expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    } finally { await directory.dispose(); }
  });

  it('keeps a failed capture consumed until another launch', async () => {
    const { directory, permit } = await setup();
    try {
      await permit.launch(() => undefined);
      await expect(permit.consumeAndCapture(async () => { throw new Error('injected capture failure'); })).rejects.toThrow('injected');
      await expect(permit.consumeAndCapture(async () => undefined)).rejects.toMatchObject({ code: 'login_required' });
      await permit.launch(() => undefined); await permit.consumeAndCapture(async () => undefined);
    } finally { await directory.dispose(); }
  });

  it('never captures when consuming cannot be persisted or the permit belongs to another home', async () => {
    const { directory, values, state } = await setup();
    try {
      const permit = new LoginPermit({ ...state, update: async () => { throw new Error('state write failed'); } }, directory.path);
      values.set('portwise.pendingCodexLoginHome', directory.path); let captures = 0;
      await expect(permit.consumeAndCapture(async () => { captures++; })).rejects.toThrow('state write failed');
      values.set('portwise.pendingCodexLoginHome', 'different-home');
      await expect(permit.consumeAndCapture(async () => { captures++; })).rejects.toMatchObject({ code: 'login_required' });
      expect(captures).toBe(0);
    } finally { await directory.dispose(); }
  });
});
