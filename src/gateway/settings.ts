import { PortwiseError } from '../core/errors';

export type SettingSource = 'default' | 'global' | 'workspace' | 'folder';
export interface GatewaySettings { port: number; autoStart: boolean; portSource: SettingSource; autoStartSource: SettingSource; }
interface Configuration {
  get<T>(key: string, fallback: T): T;
  inspect?<T>(key: string): { globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T } | undefined;
}
export function readGatewaySettings(config: Configuration): GatewaySettings {
  const port = config.get('gatewayPort', 47831); const autoStart = config.get('autoStartGateway', true);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || typeof autoStart !== 'boolean') throw new PortwiseError('Gateway settings are invalid. Set a port from 1 to 65535 and a boolean autoStartGateway value, then retry.', 'gateway_settings_invalid');
  const source = (key: string): SettingSource => {
    const value = config.inspect?.(key);
    return value?.workspaceFolderValue !== undefined ? 'folder' : value?.workspaceValue !== undefined ? 'workspace' : value?.globalValue !== undefined ? 'global' : 'default';
  };
  return { port, autoStart, portSource: source('gatewayPort'), autoStartSource: source('autoStartGateway') };
}
export function assertGatewaySettings(expected: GatewaySettings, current: GatewaySettings): void {
  if (expected.port !== current.port || expected.autoStart !== current.autoStart || expected.portSource !== current.portSource || expected.autoStartSource !== current.autoStartSource) throw settingsChanged();
}
export function settingsChanged(): PortwiseError { return new PortwiseError('Gateway settings changed during startup. Check portwise.gatewayPort and portwise.autoStartGateway, then retry Start Gateway.', 'gateway_settings_changed'); }
