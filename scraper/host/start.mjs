// The supervisor of the always-on host. It starts the gateway and the
// drainer as two child processes of one process group. When either one dies,
// the Machine stops, because a half-running host is worse than a stopped
// one. See docs/scraper-runbook.md.

import { spawn } from 'node:child_process';

const children = [];
let stopping = false;

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
  }
  // Give the children a moment to close, then leave.
  setTimeout(() => process.exit(code), 5000).unref();
}

function start(name, args) {
  console.log(`starting ${name}`);
  const child = spawn('node', args, { cwd: '/app', stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    console.log(`${name} stopped with code ${code} and signal ${signal}`);
    stopAll(code ?? 1);
  });
  children.push(child);
}

process.on('SIGTERM', () => stopAll(0));
process.on('SIGINT', () => stopAll(0));

// The gateway reads its configuration from the environment.
start('gateway', ['server/dist/index.js']);
// The drainer pulls the queued images from the Worker.
start('drainer', ['/app/drainer.mjs']);
