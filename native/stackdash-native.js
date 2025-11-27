#!/usr/bin/env node
/**
 * StackDash native messaging host (Node.js example)
 * StdIO protocol: each message is a 4-byte little-endian length + JSON payload.
 * SECURITY: Very minimal; only executes whitelisted commands.
 */

const { spawn } = require('child_process');
const ALLOWED = new Set([
  'wireshark',
  'notepad',
  'code',
  'calc'
]);

const REPAIR_INPUT_REGEX = /^[A-Za-z0-9_.:\\-{}\\\\]+$/;
const REPAIR_COMMANDS = {
  'net-restart': 'Restart-NetAdapter -Name "*"',
  'net-reset-ip': 'Reset-NetIPAddress -InterfaceAlias "*"',
  'net-enable-dhcp': 'Set-NetIPInterface -InterfaceAlias "*" -Dhcp Enabled',
  'net-dns-flush': 'Clear-DnsClientCache',
  'net-test-basic': 'Test-NetConnection',
  'net-test-443': 'Test-NetConnection google.com -Port 443',
  'net-tcp-open': 'Get-NetTCPConnection',

  'dism-restorehealth': 'Repair-WindowsImage -Online -RestoreHealth',
  'dism-scanhealth': 'Repair-WindowsImage -Online -ScanHealth',
  'dism-clean': 'Repair-WindowsImage -Online -StartComponentCleanup',

  'disk-volumes': 'Get-Volume',
  'disk-physical': 'Get-PhysicalDisk',
  'disk-repair-scan': 'Repair-Volume -DriveLetter C -Scan',
  'disk-repair-offline': 'Repair-Volume -DriveLetter C -OfflineScanAndFix',
  'disk-repair-spot': 'Repair-Volume -DriveLetter C -SpotFix',

  'wu-restart-wuauserv': 'Restart-Service wuauserv',
  'wu-restart-bits': 'Restart-Service bits',
  'wu-restart-cryptsvc': 'Restart-Service cryptsvc',
  'wu-log': 'Get-WindowsUpdateLog',

  'wd-update': 'Update-MpSignature',
  'wd-quick-scan': 'Start-MpScan -ScanType QuickScan',
  'wd-full-scan': 'Start-MpScan -ScanType FullScan',
  'wd-status': 'Get-MpComputerStatus',

  'svc-list': 'Get-Service',
  'svc-restart-all': 'Restart-Service -Name "*"',
  'svc-wu-auto': 'Set-Service -Name "wuauserv" -StartupType Automatic',
  'svc-bits-auto': 'Set-Service -Name "bits" -StartupType Automatic',
  'svc-stop-all-proc': 'Stop-Process -Name "*"',

  'perf-top-cpu': 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 20',
  'perf-top-ram': 'Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 20',
  'perf-clear-host': 'Clear-Host',

  'pnp-list': 'Get-PnpDevice',
  'pnp-disable': 'Disable-PnpDevice -InstanceId "<ID>" -Confirm:$false',
  'pnp-enable': 'Enable-PnpDevice -InstanceId "<ID>" -Confirm:$false',

  'evt-system': 'Get-EventLog -LogName System -Newest 200',
  'evt-app': 'Get-EventLog -LogName Application -Newest 200',
  'evt-winevent': 'Get-WinEvent -LogName System -MaxEvents 200',

  'cleanup-temp-user': 'Remove-Item -Path "$env:TEMP\\*" -Recurse -Force',
  'cleanup-temp-windows': 'Remove-Item -Path "C:\\Windows\\Temp\\*" -Recurse -Force'
};

function readMessage() {
  const header = process.stdin.read(4);
  if (!header) return null;
  const len = header.readUInt32LE(0);
  const body = process.stdin.read(len);
  if (!body) return null;
  try { return JSON.parse(body.toString('utf8')); } catch { return null; }
}

function writeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4); header.writeUInt32LE(json.length,0);
  process.stdout.write(header); process.stdout.write(json);
}

function truncate(str, max = 3200) {
  if (!str) return '';
  const s = String(str);
  return s.length > max ? s.slice(0, max) + '\n...truncated...' : s;
}

function buildRepairCommand(commandId, inputValue) {
  const base = REPAIR_COMMANDS[commandId];
  if (!base) return null;
  if (base.includes('<ID>')) {
    if (!inputValue || !REPAIR_INPUT_REGEX.test(inputValue)) return null;
    return base.replace('<ID>', inputValue);
  }
  return base;
}

function runPowerShell(command) {
  return new Promise((resolve) => {
    try {
      const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
        windowsHide: true
      });
      let stdout = '', stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (e) => resolve({ ok: false, error: e.message }));
      child.on('close', (code) => resolve({ ok: true, exitCode: code ?? 0, stdout, stderr }));
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function processMessage(msg) {
  if (msg?.type === 'ping') {
    writeMessage({ ok: true, host: 'stackdash-native', ts: Date.now() });
    return;
  }

  if (msg?.type === 'repair') {
    const resolved = buildRepairCommand(msg.commandId, msg.inputValue);
    if (!resolved) {
      writeMessage({ ok: false, error: 'unknown_or_invalid_command', commandId: msg.commandId });
      return;
    }
    const startedAt = Date.now();
    const result = await runPowerShell(resolved);
    const exitCode = result.exitCode ?? null;
    const ok = result.ok && (exitCode === null || exitCode === 0);
    const stderr = truncate(result.stderr);
    const stdout = truncate(result.stdout);
    const needsElevation = /access is denied|administrator/i.test(stderr);
    writeMessage({
      ok,
      commandId: msg.commandId,
      exitCode,
      stdout,
      stderr,
      startedAt,
      endedAt: Date.now(),
      needsElevation,
      error: result.error || undefined
    });
    return;
  }

  if (msg?.command) {
    if (!ALLOWED.has(msg.command)) {
      writeMessage({ ok:false, error:'command_not_allowed', command:msg.command });
      return;
    }
    try {
      const child = spawn(msg.command, Array.isArray(msg.args)?msg.args:[], { detached:false, stdio:'ignore' });
      child.on('error', (e)=> writeMessage({ ok:false, error:e.message }));
      child.unref();
      writeMessage({ ok:true, launched:msg.command });
    } catch (e) {
      writeMessage({ ok:false, error:e.message });
    }
    return;
  }

  writeMessage({ ok:false, error:'no_command' });
}

function loop() {
  let msg; while ((msg = readMessage()) !== null) {
    const maybePromise = processMessage(msg);
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch((err) => writeMessage({ ok:false, error: err?.message || 'processing_error' }));
    }
  }
}

process.stdin.on('readable', loop);
process.stdin.on('end', () => process.exit(0));
