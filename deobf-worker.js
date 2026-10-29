'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const { deobfuscate } = require('./src/index');

try {
  const result = deobfuscate(workerData.source, {
    name: workerData.filename,
    onProgress: () => {},
  });
  const codeBytes = Buffer.byteLength(result.code, 'latin1');
  parentPort.postMessage({
    ok: true,
    code: result.code,
    codeBytes,
    notes: (result.notes || []).map(String).slice(0, 5),
    warnings: (result.warnings || []).map(String).slice(0, 5),
  });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: String(error && error.message || error).slice(0, 1000),
  });
}
