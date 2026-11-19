export interface ProviderMetadata {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
}

export interface ProviderView extends ProviderMetadata {
  tokenMask: string;
}

export interface ProviderInput {
  name: string;
  baseUrl: string;
  token?: string;
}

export interface KeyValueStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export interface SecretStore {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}
