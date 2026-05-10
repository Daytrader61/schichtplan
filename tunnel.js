// Simple persistent SSH tunnel with auto-restart
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG = path.join(__dirname, 'tunnel-status.txt');
const URL = path.join(__dirname, 'tunnel-url.txt');

function log(msg) {
  const ts = new Date().toISOString().slice(0,19).replace('T',' ');
  const line = ts + ' ' + msg;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

function startTunnel() {
  log('Starting SSH tunnel...');

  const ssh = spawn('ssh', [
    '-N',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ExitOnForwardFailure=yes',
    '-R', '80:localhost:3000',
    'nokey@localhost.run'
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });

  let collected = '';
  
  ssh.stderr.on('data', (chunk) => {
    collected += chunk.toString();
    const match = collected.match(/https?:\/\/[a-z0-9]+\.lhr\.life/);
    if (match) {
      log('TUNNEL READY: ' + match[0]);
      fs.writeFileSync(URL, match[0]);
    }
    // Clean up collected string to avoid memory growth
    if (collected.length > 5000) collected = collected.slice(-2000);
  });

  ssh.on('error', (err) => {
    log('SSH error: ' + err.message);
  });

  ssh.on('close', (code) => {
    log('SSH exited with code ' + code + '. Restart in 5s...');
    setTimeout(startTunnel, 5000);
  });

  // Keep stdin open
  setInterval(() => {
    try { ssh.stdin.write('\n'); } catch(e) {}
  }, 30000);

  return ssh;
}

log('=== Tunnel Manager Started ===');
startTunnel();
