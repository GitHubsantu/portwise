const assert = require('node:assert/strict');
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const process = require('node:process');
const console = require('node:console');

exports.run = async () => {
  const config = vscode.workspace.getConfiguration('portwise');
  assert.equal(config.get('autoStartGateway'), false);
  const home = process.env.CODEX_HOME;
  assert.ok(home && process.env.PORTWISE_FIXTURE_ROOT);
  const stateFile = path.join(process.env.PORTWISE_FIXTURE_ROOT, 'vscode-data', 'User', 'globalStorage', 'santu-dev.portwise', 'gateway.json');
  await assert.rejects(fs.stat(stateFile), { code: 'ENOENT' });
  const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  await config.update('gatewayPort', port, vscode.ConfigurationTarget.Global);
  try {
    await Promise.all([vscode.commands.executeCommand('portwise.startGateway'), vscode.commands.executeCommand('portwise.startGateway')]);
    const first = JSON.parse(await fs.readFile(stateFile, 'utf8')); assert.equal(first.port, port);
    await vscode.commands.executeCommand('portwise.startGateway');
    assert.equal(JSON.parse(await fs.readFile(stateFile, 'utf8')).pid, first.pid);
    await vscode.commands.executeCommand('portwise.restartGateway');
    const next = JSON.parse(await fs.readFile(stateFile, 'utf8')); assert.equal(next.port, port); assert.notEqual(next.instanceId, first.instanceId);
    await vscode.commands.executeCommand('portwise.stopGateway');
    await assert.rejects(fs.stat(stateFile), { code: 'ENOENT' });
    assert.deepEqual(await fs.readdir(home), []);
    console.log('Portwise registered gateway commands: effective settings, overlap, restart and stop passed.');
  } finally { await vscode.commands.executeCommand('portwise.stopGateway'); }
};
