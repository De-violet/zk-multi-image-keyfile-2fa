import { fork } from 'node:child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class NodeWorkerProcessBridge {
  constructor(scriptPath = null) {
    const targetScript = scriptPath || path.resolve(__dirname, 'workerProcess.js');
    this.cp = fork(targetScript);
    this.terminated = false;
    this.onmessage = null;
    this.onerror = null;

    this.cp.on('message', (data) => {
      if (this.onmessage && !this.terminated) {
        this.onmessage({ data });
      }
    });

    this.cp.on('error', (err) => {
      if (this.onerror && !this.terminated) {
        this.onerror(err);
      }
    });
  }

  postMessage(message) {
    if (this.terminated) {
      throw new Error('Tidak dapat mengirim pesan ke worker yang telah di-terminate.');
    }
    this.cp.send(message);
  }

  terminate() {
    this.terminated = true;
    if (this.cp) {
      if (this.cp.connected) {
        this.cp.disconnect();
      }
      this.cp.kill();
      if (typeof this.cp.unref === 'function') {
        this.cp.unref();
      }
    }
  }
}
