const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const process = require('node:process');
const console = require('node:console');

exports.run = async () => {
  const root = process.env.PORTWISE_FIXTURE_ROOT;
  assert.ok(root && process.env.PORTWISE_LIFECYCLE_MODULE && process.env.PORTWISE_GATEWAY_SCRIPT, 'Isolated runner configuration is required.');
  const { GatewayController } = require(process.env.PORTWISE_LIFECYCLE_MODULE);
  const home = path.join(root, 'codex-home');
  const storage = path.join(root, 'gateway-storage');
  assert.equal(process.env.CODEX_HOME, home);
  assert.deepEqual(await fs.readdir(home), []);
  await fs.mkdir(storage);
  assert.deepEqual(await fs.readdir(storage), []);
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const children = [];
  const token = 'test-extension-host-token-0000';
  const options = { storageDirectory: storage, gatewayScript: process.env.PORTWISE_GATEWAY_SCRIPT, port, token, version: 'test', spawnProcess: (command, args, settings) => {
    assert.equal(command, process.execPath);
    assert.deepEqual(args, [process.env.PORTWISE_GATEWAY_SCRIPT]);
    assert.equal(settings.shell, false); assert.equal(settings.detached, true); assert.equal(settings.windowsHide, true);
    assert.equal(JSON.stringify([args, settings]).includes(token), false);
    const child = spawn(command, args, { ...settings, env: { ...process.env, CODEX_HOME: home } });
    children.push(child); return child;
  } };
  const controller = new GatewayController(options);
  try {
    const first = await controller.start();
    assert.equal(first.port, port);
    assert.deepEqual(await controller.status(), first);
    assert.deepEqual(await new GatewayController(options).start(), first);
    assert.equal(children.length, 1, 'Reuse must not spawn a second daemon.');
    const next = await controller.restart();
    assert.notEqual(next.instanceId, first.instanceId);
    assert.deepEqual(await controller.status(), next);
    assert.equal(children.length, 2);
    await controller.stop();
    assert.equal(await controller.status(), undefined);
    await assert.rejects(fs.stat(path.join(storage, 'gateway.json')), { code: 'ENOENT' });
    await new Promise((resolve, reject) => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); reject(new Error('Stopped daemon still owns its fixture port.')); });
      socket.once('error', error => { socket.destroy(); if (error.code === 'ECONNREFUSED') resolve(); else reject(new Error('Port release could not be verified.')); });
      socket.setTimeout(1000, () => { socket.destroy(); reject(new Error('Port release check timed out.')); });
    });
    assert.deepEqual(await fs.readdir(home), [], 'Lifecycle must not write any Codex file.');
    console.log('Portwise Extension Host: command registration and real gateway lifecycle passed.');
  } finally {
    // Only children created by this fixture may be terminated, including failed starts.
    for (const child of children) if (child.exitCode === null) child.kill();
    await Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(resolve => child.once('close', resolve))));
  }
};
