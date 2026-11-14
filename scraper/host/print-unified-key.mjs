// Prints the unified key of the gateway. The runbook uses it as a check that
// the gateway came up with its database. The key stays on the host; this
// script only prints it when an operator asks for it.

import { readUnifiedKey } from './unified-key.mjs';

const key = readUnifiedKey();
if (!key) {
  console.error('the gateway has no unified key yet');
  process.exit(1);
}
console.log(key);
