import type { PermissionRunner } from './permissionCommand';
import { PrivatePermissionError, type PermissionReason, type PermissionTarget, type PrincipalKind } from './permissionFailure';

// Fixed code only. The literal path travels as JSON on stdin, never as PowerShell code.
const READ_ACL = `
$ErrorActionPreference = 'Stop'
try {
  [Console]::InputEncoding = [System.Text.Encoding]::UTF8
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $acl = [System.IO.File]::GetAccessControl([string]$request.file, [System.Security.AccessControl.AccessControlSections]::Access)
} catch { [Console]::Out.Write('{"error":"ACL read"}'); exit 0 }
try {
  $raw = [System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
  if ($null -ne $raw.DiscretionaryAcl -and $raw.DiscretionaryAcl.Count -gt 64) { throw 'too many rules' }
  $entries = @()
  foreach ($ace in $raw.DiscretionaryAcl) {
    if ($ace -is [System.Security.AccessControl.CommonAce]) {
      $entries += @{ sid = $ace.SecurityIdentifier.Value; kind = [int]$ace.AceType; flags = [int]$ace.AceFlags; mask = [int]$ace.AccessMask }
    } else { $entries += @{ sid = ''; kind = -1; flags = 0; mask = 0 } }
  }
  $result = @{ protected = (($raw.ControlFlags -band [System.Security.AccessControl.ControlFlags]::DiscretionaryAclProtected) -ne 0); present = ($null -ne $raw.DiscretionaryAcl); aces = @($entries) }
  [Console]::Out.Write(($result | ConvertTo-Json -Compress -Depth 4))
} catch { [Console]::Out.Write('{"error":"ACL parse"}'); exit 0 }
`;

export function readWindowsAcl(file: string, run: PermissionRunner): Promise<string> {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(READ_ACL, 'utf16le').toString('base64')], JSON.stringify({ file }));
}

const NUMERIC_SID = /^S-1-\d+(?:-\d+){1,15}$/;
const FULL_CONTROL = 0x1f01ff;

/** All principals originate as Windows SecurityIdentifier.Value, never display names/SDDL aliases. */
export function verifyWindowsAcl(response: string, userSid: string, target: PermissionTarget = 'private file'): void {
  const fail = (reason: PermissionReason, principal: PrincipalKind = 'not-reached', step: 'ACL read' | 'ACL parse' | 'verify' = 'verify') => new PrivatePermissionError(target, { step, command: 'powershell.exe', category: 'validation', exitCode: 0, reason, principal });
  let value: unknown;
  try { if (response.length > 16_384) throw new Error('oversized'); value = JSON.parse(response); }
  catch { throw fail('invalid ACL response', 'not-reached', 'ACL parse'); }
  if (!record(value)) throw fail('invalid ACL response', 'not-reached', 'ACL parse');
  if (value['error'] === 'ACL read') throw fail('ACL unavailable', 'not-reached', 'ACL read');
  if (value['error'] === 'ACL parse') throw fail('invalid ACL response', 'unresolved', 'ACL parse');
  if (Object.keys(value).sort().join(',') !== 'aces,present,protected' || typeof value['protected'] !== 'boolean' || typeof value['present'] !== 'boolean' || !Array.isArray(value['aces']) || value['aces'].length > 64) throw fail('invalid ACL response', 'not-reached', 'ACL parse');
  if (!value['protected']) throw fail('unprotected DACL');
  if (!value['present']) throw fail('missing DACL');
  let fullControl = false;
  for (const ace of value['aces']) {
    if (!record(ace) || Object.keys(ace).sort().join(',') !== 'flags,kind,mask,sid' || typeof ace['sid'] !== 'string' || !Number.isSafeInteger(ace['kind']) || !Number.isSafeInteger(ace['flags']) || !Number.isSafeInteger(ace['mask'])) throw fail('invalid ACL response', 'not-reached', 'ACL parse');
    const sid = ace['sid']; const kind = principalKind(sid, userSid);
    if (ace['kind'] !== 0) throw fail('unsupported ACE', kind);
    if (ace['flags'] !== 0) throw fail('inherited ACE', kind);
    if (!NUMERIC_SID.test(sid)) throw fail('unresolved principal', 'unresolved');
    if (kind === 'other') throw fail('principal not allowed', kind);
    const mask = ace['mask'] as number;
    if (mask < 0 || mask > FULL_CONTROL || (mask & ~FULL_CONTROL) !== 0) throw fail('unsupported ACE', kind);
    if (sid === userSid && mask === FULL_CONTROL) fullControl = true;
  }
  if (!fullControl) throw fail('missing user FullControl', 'current-user');
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function principalKind(sid: string, userSid: string): PrincipalKind {
  if (!NUMERIC_SID.test(sid)) return 'unresolved';
  if (sid === userSid) return 'current-user';
  if (sid === 'S-1-5-18') return 'system';
  if (sid === 'S-1-5-32-544') return 'administrators';
  return 'other';
}
