const assert = require('node:assert/strict');
const vscode = require('vscode');
const manifest = require('../../package.json');

async function run() {
  const extension = vscode.extensions.all.find(
    (candidate) => candidate.packageJSON.name === manifest.name && candidate.packageJSON.publisher === manifest.publisher,
  );
  assert.ok(extension, 'Portwise extension must be discoverable in the Extension Development Host.');

  await extension.activate();
  const registeredCommands = new Set(await vscode.commands.getCommands(true));
  for (const command of manifest.contributes.commands) {
    assert.ok(registeredCommands.has(command.command), `Command was not registered after activation: ${command.command}`);
  }
  await require('./gateway.cjs').run();
  await require('./commandGateway.cjs').run();
}

exports.run = run;
