import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { parse } from 'toml';
import { canonicalCodexHome, checkedCodexTarget } from '../core/paths';
import { verifyPrivateFile } from '../core/privateFile';
import { validateProviderUrl } from '../core/urlValidate';
import type { GatewayProvider } from '../gateway/daemon/server';
import { gatewayChecks, type GatewayDiagnosticOptions } from './gatewayChecks';
import type { DiagnosticCheck, DiagnosticsReport } from './report';

export interface DiagnosticOptions extends GatewayDiagnosticOptions { codexHome: string; provider?: GatewayProvider; platform?: NodeJS.Platform; }

/** Explicit command only: reads config/.env, never auth.json, and never repairs files. */
export async function runDiagnostics(options: DiagnosticOptions): Promise<DiagnosticsReport> {
  const checks = await gatewayChecks(options);
  let home: string;
  try {
    home = await canonicalCodexHome(options.codexHome);
    await access(home, constants.R_OK | constants.W_OK);
    checks.push({ name: 'codex-home', status: (options.platform ?? process.platform) === 'win32' ? 'WARN' : 'PASS', hint: (options.platform ?? process.platform) === 'win32' ? 'Extension hop: target home exists and is readable. Windows write access is not proven without a write probe; diagnostics makes no home writes.' : 'Extension hop: target home passes the OS read/write access check; no files were changed.' });
  } catch {
    checks.push({ name: 'codex-home', status: 'FAIL', hint: 'Extension hop: target home is missing, linked or inaccessible. Set portwise.codexHome to an existing real directory with read/write access.' });
    checks.push({ name: 'config', status: 'WARN', hint: 'Extension hop: config check skipped because the target home is unavailable.' }, { name: 'credential-delivery', status: 'WARN', hint: 'Extension hop: credential check skipped because the target home is unavailable.' });
    checks.push(await providerCheck(options)); return { checks, restartRequired: true };
  }
  checks.push(await configCheck(home, options.port));
  try {
    const target = await checkedCodexTarget(home, '.env');
    const source = await readFile(target.file, 'utf8');
    const assignments = source.split(/\r?\n/).filter(line => /^\s*PORTWISE_GATEWAY_TOKEN=/.test(line));
    const delivered = assignments[0]?.slice((assignments[0]?.indexOf('=') ?? -1) + 1);
    const matches = assignments.length === 1 && !!options.token && !!delivered && equal(delivered, options.token);
    checks.push({ name: 'credential-delivery', status: matches ? 'PASS' : 'FAIL', hint: matches ? 'Extension hop: .env contains the current local gateway token exactly once. Restart Codex/VS Code to load it.' : 'Extension hop: .env local-token delivery is missing, duplicated or stale. Run Configure Codex for Gateway, then restart Codex/VS Code.' });
    try {
      await verifyPrivateFile(target.file);
      checks.push({ name: 'permissions', status: 'PASS', hint: 'Extension hop: .env private permissions were verified without changing them.' });
    } catch { checks.push({ name: 'permissions', status: 'FAIL', hint: 'Extension hop: .env private permissions could not be verified. Restrict access to your user account; diagnostics did not change permissions.' }); }
    await target.recheck();
  } catch {
    // A changing/linked/unreadable target invalidates any earlier point-in-time claim.
    for (let index = checks.length - 1; index >= 0; index--) if (['credential-delivery', 'permissions'].includes(checks[index]?.name ?? '')) checks.splice(index, 1);
    checks.push({ name: 'credential-delivery', status: 'FAIL', hint: 'Extension hop: .env is missing, linked, changed or unreadable. Check the exact home, then Configure Codex for Gateway and restart Codex/VS Code.' });
  }
  checks.push(await providerCheck(options));
  return { checks, restartRequired: true };
}

async function configCheck(home: string, port: number): Promise<DiagnosticCheck> {
  try {
    const target = await checkedCodexTarget(home, 'config.toml');
    const config: unknown = parse(await readFile(target.file, 'utf8')); await target.recheck();
    const providers = record(config) ? config['model_providers'] : undefined;
    const provider = record(providers) ? providers['portwise'] : undefined;
    const matches = record(provider) && Object.keys(provider).every(key => ['name', 'base_url', 'env_key', 'wire_api', 'requires_openai_auth', 'supports_websockets'].includes(key)) && provider['base_url'] === `http://127.0.0.1:${port}/v1` && provider['env_key'] === 'PORTWISE_GATEWAY_TOKEN' && provider['wire_api'] === 'responses' && provider['requires_openai_auth'] === false && provider['supports_websockets'] === false;
    if (!matches) return { name: 'config', status: 'FAIL', hint: 'Extension hop: Portwise provider settings are missing or stale. Start Gateway, then run Configure Codex for Gateway and confirm the exact path.' };
    if (!record(config) || config['model_provider'] !== 'portwise') return { name: 'config', status: 'WARN', hint: 'Extension hop: gateway settings match, but Codex selects another provider. Run Switch Codex to Portwise Gateway if you want to switch.' };
    return { name: 'config', status: 'PASS', hint: 'Extension hop: selected Portwise provider matches the configured gateway port and token variable.' };
  } catch { return { name: 'config', status: 'FAIL', hint: 'Extension hop: config.toml is missing, linked, changed, unreadable or invalid. Repair TOML or restore a known-good backup, then Configure Codex for Gateway.' }; }
}

async function providerCheck(options: DiagnosticOptions): Promise<DiagnosticCheck> {
  if (!options.provider?.enabled) return { name: 'provider', status: 'WARN', hint: 'Upstream hop: no provider is enabled. Add or enable a provider in the panel.' };
  try {
    const url = validateProviderUrl(options.provider.baseUrl); url.pathname = url.pathname.replace(/\/?$/, '/') + 'models';
    const response = await fetch(url, { headers: { authorization: `Bearer ${options.provider.token}` }, redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 5000) });
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) return { name: 'provider', status: 'FAIL', hint: 'Upstream hop: provider rejected authentication. Edit the provider token in the panel, then retry.' };
    return { name: 'provider', status: response.ok ? 'PASS' : 'FAIL', hint: response.ok ? 'Upstream hop: provider models request succeeded. No prompts or code were sent.' : `Upstream hop: provider models request returned HTTP ${response.status}. Check the configured provider URL and account access.` };
  } catch { return { name: 'provider', status: 'FAIL', hint: 'Upstream hop: provider models request failed, timed out, redirected or has an unsafe URL. Check the configured HTTPS URL (HTTP is allowed only for loopback) and network, then retry.' }; }
}
function equal(left: string, right: string): boolean { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
