import { validateProviderUrl } from '../../core/urlValidate';
import type { GatewayOptions, GatewayProvider } from './server';

export function isProvider(value: unknown): value is GatewayProvider {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item['baseUrl'] !== 'string' || item['baseUrl'].length > 8192 || typeof item['token'] !== 'string' || !item['token'].trim() || item['token'].length > 8192 || /[\r\n]/.test(item['token']) || typeof item['enabled'] !== 'boolean') return false;
  try { validateProviderUrl(item['baseUrl']); return true; } catch { return false; }
}
export function isGatewayOptions(value: unknown): value is GatewayOptions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item['token'] !== 'string' || item['token'].length < 8 || item['token'].length > 8192 || /[\r\n]/.test(item['token'])) return false;
  if (item['provider'] !== undefined && !isProvider(item['provider'])) return false;
  if (item['onShutdown'] !== undefined && typeof item['onShutdown'] !== 'function') return false;
  for (const [key, minimum, maximum] of [['port', 0, 65535], ['maxBodyBytes', 1, 256 * 1024 * 1024], ['totalTimeoutMs', 1, 24 * 60 * 60 * 1000], ['maxConnections', 1, 1024]] as const) {
    const option = item[key];
    if (option !== undefined && (typeof option !== 'number' || !Number.isSafeInteger(option) || option < minimum || option > maximum)) return false;
  }
  return item['instanceId'] === undefined || typeof item['instanceId'] === 'string' && item['instanceId'].length <= 200;
}
