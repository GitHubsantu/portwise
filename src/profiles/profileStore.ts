import { randomUUID } from 'node:crypto';
import { PortwiseError } from '../core/errors';
import { maskSecret } from '../core/redact';
import { validateProviderUrl } from '../core/urlValidate';
import type { KeyValueStore, ProviderInput, ProviderMetadata, ProviderView, SecretStore } from './models';

export const PROVIDER_METADATA_KEY = 'portwise.providers';
const MAX_NAME_LENGTH = 80;

export class ProfileStore {
  constructor(
    private readonly state: KeyValueStore,
    private readonly secrets: SecretStore,
    private readonly createId: () => string = randomUUID,
  ) {}

  async list(): Promise<ProviderView[]> {
    const metadata = this.readMetadata();
    return Promise.all(metadata.map(async (provider) => ({ ...provider, tokenMask: maskSecret((await this.secrets.get(providerSecretKey(provider.id)) ?? '')) })));
  }

  async create(input: ProviderInput): Promise<ProviderView> {
    const metadata = this.readMetadata();
    const provider = this.makeProvider(input, metadata, this.createId());
    const token = requiredToken(input.token);
    await this.secrets.store(providerSecretKey(provider.id), token);
    try {
      await this.writeMetadata([...metadata, provider]);
    } catch (error) {
      await this.rollbackSecretDelete(provider.id, error);
    }
    return { ...provider, tokenMask: maskSecret(token) };
  }

  async update(id: string, input: ProviderInput): Promise<ProviderView> {
    const metadata = this.readMetadata();
    const current = findProvider(metadata, id);
    const next = this.makeProvider(input, metadata.filter((provider) => provider.id !== id), id, current.enabled);
    const currentToken = await this.requireToken(id);
    const replacement = input.token?.trim() ? input.token.trim() : currentToken;
    if (replacement !== currentToken) await this.secrets.store(providerSecretKey(id), replacement);
    try {
      await this.writeMetadata(metadata.map((provider) => (provider.id === id ? next : provider)));
    } catch (error) {
      if (replacement !== currentToken) await this.rollbackSecretRestore(id, currentToken, error);
      throw error;
    }
    return { ...next, tokenMask: maskSecret(replacement) };
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const metadata = this.readMetadata();
    findProvider(metadata, id);
    await this.writeMetadata(metadata.map((provider) => (provider.id === id ? { ...provider, enabled } : provider)));
  }

  async delete(id: string): Promise<void> {
    const metadata = this.readMetadata();
    findProvider(metadata, id);
    const token = await this.requireToken(id);
    try {
      await this.secrets.delete(providerSecretKey(id));
    } catch {
      throw new PortwiseError('Could not remove the provider token. The profile was not changed.', 'provider_delete_failed');
    }
    try {
      await this.writeMetadata(metadata.filter((provider) => provider.id !== id));
    } catch (error) {
      await this.rollbackSecretRestore(id, token, error);
    }
  }

  async getToken(id: string): Promise<string> {
    findProvider(this.readMetadata(), id);
    return this.requireToken(id);
  }

  private makeProvider(input: ProviderInput, existing: ProviderMetadata[], id: string, enabled = true): ProviderMetadata {
    const name = normalizedName(input.name);
    if (existing.some((provider) => provider.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new PortwiseError('A provider with that name already exists.', 'provider_name_duplicate');
    }
    return { id, name, baseUrl: validateProviderUrl(input.baseUrl.trim()).toString(), enabled };
  }

  private readMetadata(): ProviderMetadata[] {
    const value = this.state.get<unknown>(PROVIDER_METADATA_KEY);
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every(isProviderMetadata)) {
      throw new PortwiseError('Saved provider metadata is invalid.', 'provider_metadata_invalid');
    }
    return value;
  }

  private async writeMetadata(providers: ProviderMetadata[]): Promise<void> {
    try {
      await this.state.update(PROVIDER_METADATA_KEY, providers);
    } catch {
      throw new PortwiseError('Could not save provider metadata.', 'provider_metadata_write_failed');
    }
  }

  private async requireToken(id: string): Promise<string> {
    const token = await this.secrets.get(providerSecretKey(id));
    if (!token) throw new PortwiseError('The provider token is missing. Add it again before testing this provider.', 'provider_token_missing');
    return token;
  }

  private async rollbackSecretDelete(id: string, cause: unknown): Promise<never> {
    try {
      await this.secrets.delete(providerSecretKey(id));
    } catch {
      throw new PortwiseError('Could not save the provider. Token cleanup also failed; remove the provider token in Secret Storage.', 'provider_rollback_failed');
    }
    throw cause;
  }

  private async rollbackSecretRestore(id: string, token: string, cause: unknown): Promise<never> {
    try {
      await this.secrets.store(providerSecretKey(id), token);
    } catch {
      throw new PortwiseError('Could not save provider metadata or restore its token.', 'provider_rollback_failed');
    }
    throw cause;
  }
}

export function providerSecretKey(id: string): string { return `portwise.provider.${id}`; }
function requiredToken(token: string | undefined): string { if (!token?.trim()) throw new PortwiseError('A provider token is required.', 'provider_token_required'); return token.trim(); }
function normalizedName(value: string): string { const name = value.trim(); if (!name) throw new PortwiseError('Provider name is required.', 'provider_name_required'); if (name.length > MAX_NAME_LENGTH) throw new PortwiseError(`Provider name must be ${MAX_NAME_LENGTH} characters or fewer.`, 'provider_name_too_long'); return name; }
function findProvider(providers: ProviderMetadata[], id: string): ProviderMetadata { const provider = providers.find((candidate) => candidate.id === id); if (!provider) throw new PortwiseError('Provider profile was not found.', 'provider_not_found'); return provider; }
function isProviderMetadata(value: unknown): value is ProviderMetadata { return typeof value === 'object' && value !== null && typeof (value as ProviderMetadata).id === 'string' && typeof (value as ProviderMetadata).name === 'string' && typeof (value as ProviderMetadata).baseUrl === 'string' && typeof (value as ProviderMetadata).enabled === 'boolean'; }
