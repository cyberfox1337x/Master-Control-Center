// service-worker.js — Background script (MV3)
// Responsibilities:
//  - (Optional) Bridge to native messaging host for launching local programs
//  - Open the dashboard page when the extension icon is clicked
// Notes:
//  - All heavy logic lives in the UI; this worker stays lean to avoid wakeup overhead.
//  - Guards are structured to return early and reduce branching cost when receiving unrelated messages.

const NATIVE_HOST_NAME = 'com.stackdash.launcher';
const REPAIR_INPUT_REGEX = /^[A-Za-z0-9_.:\\\-{}\\\\]+$/;
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

function buildRepairCommand(commandId, inputValue) {
  const base = REPAIR_COMMANDS[commandId];
  if (!base) return null;
  if (base.includes('<ID>')) {
    if (!inputValue || !REPAIR_INPUT_REGEX.test(inputValue)) return null;
    return base.replace('<ID>', inputValue);
  }
  return base;
}

/**
 * Handle messages from the dashboard UI.
 * Supported:
 *  - launchProgram (mode === 'native'): forwards to native host, returns response
 *  - launchProgram (non-native): acknowledged (scheme handling is in page)
 *  - runRepairCommand: forwards curated PowerShell repair commands to native host
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return; // ignore unrelated messages quickly

  if (msg.type === 'checkNativeAvailable') {
    const hasFn = typeof chrome?.runtime?.sendNativeMessage === 'function';
    if (!hasFn) {
      sendResponse({ ok: false, error: 'nativeMessaging unavailable in this context. Reload the packaged extension and ensure nativeMessaging permission is granted.' });
      return;
    }
    chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, { type: 'ping', ts: Date.now() }, (resp) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse(resp || { ok: false, error: 'No response from native host.' });
      }
    });
    return true;
  }

  if (msg.type === 'runRepairCommand') {
    try {
      const command = buildRepairCommand(msg.commandId, msg.inputValue);
      if (!command) {
        sendResponse({ ok: false, error: 'unknown_or_invalid_command' });
        return;
      }
      if (typeof chrome?.runtime?.sendNativeMessage !== 'function') {
        sendResponse({ ok: false, error: 'nativeMessaging unavailable. Ensure extension is loaded (not a standalone file) and nativeMessaging permission is present.' });
        return;
      }
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
        type: 'repair',
        commandId: msg.commandId,
        command,
        inputValue: msg.inputValue || null,
        ts: Date.now()
      }, (resp) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(resp || { ok: false, error: 'no_response' });
        }
      });
      return true; // keep channel open
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || 'runtime_error' });
      return;
    }
  }

  if (msg.type !== 'launchProgram') return;

  if (msg.mode === 'native') {
    // Native messaging path
    chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
      command: msg.command,
      args: Array.isArray(msg.args) ? msg.args : [],
      programId: msg.programId || null,
      ts: Date.now()
    }, (resp) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok:false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse(resp || { ok:true });
      }
    });

    return true; // keep channel open for async response
  }

  // Non-native launch (scheme handled directly in content/UI layer)
  sendResponse({ ok:true, handled:'scheme' });
});

// Open dashboard when the user clicks the extension icon.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});
