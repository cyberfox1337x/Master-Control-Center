// settings.js — render & wire settings panel (import/export/theme/edit mode/logo.dev key)
import { $, on } from "./utils.js";
import { STATE, saveState, saveStateNow, applyTheme } from "./state.js";
import { renderGroups } from "./render-groups.js";
import { FONT_CATALOG, getFontMeta } from './fonts.js';
import { SUPPORTED_LANGUAGES, setLanguage } from "./languages/i18n.js";

const REPAIR_LIBRARY = [
  {
    id: 'network',
    title: 'Network and Internet repair',
    commands: [
      { id: 'net-restart', title: 'Restart network adapters', ps: 'Restart-NetAdapter -Name "*"', description: 'Cycle all adapters to refresh drivers and clear transient link issues.', validationHint: 'Adapters restarted. Reconnect to Wi-Fi/Ethernet if needed.' },
      { id: 'net-reset-ip', title: 'Reset IP addressing', ps: 'Reset-NetIPAddress -InterfaceAlias "*"', description: 'Flush IP bindings and re-request addressing.', validationHint: 'IPs reset. If still offline, re-run DHCP enable.' },
      { id: 'net-enable-dhcp', title: 'Enable DHCP on all interfaces', ps: 'Set-NetIPInterface -InterfaceAlias "*" -Dhcp Enabled', description: 'Force adapters back to automatic IP assignment.', validationHint: 'DHCP re-enabled. Test connectivity again.' },
      { id: 'net-dns-flush', title: 'Clear DNS cache', ps: 'Clear-DnsClientCache', description: 'Flush DNS to remove stale records.', validationHint: 'DNS cache cleared.' },
      { id: 'net-test-basic', title: 'Test network reachability', ps: 'Test-NetConnection', description: 'Runs a basic connectivity test on default route.', validationHint: 'Connectivity test complete. See output for route status.' },
      { id: 'net-test-443', title: 'Test HTTPS to google.com:443', ps: 'Test-NetConnection google.com -Port 443', description: 'Checks HTTPS reachability and TLS port status.', validationHint: 'HTTPS probe finished.' },
      { id: 'net-tcp-open', title: 'List active TCP connections', ps: 'Get-NetTCPConnection', description: 'Shows open TCP sessions for quick inspection.', validationHint: 'TCP table captured.' }
    ]
  },
  {
    id: 'system-file',
    title: 'System file repair',
    commands: [
      { id: 'dism-restorehealth', title: 'Repair component store (RestoreHealth)', ps: 'Repair-WindowsImage -Online -RestoreHealth', description: 'Runs DISM to repair component store corruption.', validationHint: 'DISM RestoreHealth finished. Reboot if repairs were applied.' },
      { id: 'dism-scanhealth', title: 'Scan component store (ScanHealth)', ps: 'Repair-WindowsImage -Online -ScanHealth', description: 'Scans for corruption without applying fixes.', validationHint: 'Scan completed. If corruption found, run RestoreHealth next.' },
      { id: 'dism-clean', title: 'Start component cleanup', ps: 'Repair-WindowsImage -Online -StartComponentCleanup', description: 'Cleans superseded components to free space.', validationHint: 'Component cleanup done. Reboot to finalize if pending.' }
    ]
  },
  {
    id: 'disk',
    title: 'Disk and storage repair',
    commands: [
      { id: 'disk-volumes', title: 'List volumes', ps: 'Get-Volume', description: 'Summarizes all volumes for quick checks.', validationHint: 'Volume list captured.' },
      { id: 'disk-physical', title: 'List physical disks', ps: 'Get-PhysicalDisk', description: 'Shows physical disk health and status.', validationHint: 'Physical disk list captured.' },
      { id: 'disk-repair-scan', title: 'Scan C: (online)', ps: 'Repair-Volume -DriveLetter C -Scan', description: 'Online scan for file system issues on C:.', validationHint: 'Scan completed. If issues found, run OfflineScanAndFix.' },
      { id: 'disk-repair-offline', title: 'Offline scan and fix C:', ps: 'Repair-Volume -DriveLetter C -OfflineScanAndFix', description: 'Offline scan/fix queued for next restart.', validationHint: 'Offline scan queued. Reboot to complete repairs.' },
      { id: 'disk-repair-spot', title: 'Spot fix C:', ps: 'Repair-Volume -DriveLetter C -SpotFix', description: 'Quick targeted fix for detected issues.', validationHint: 'SpotFix queued or completed.' }
    ]
  },
  {
    id: 'wu',
    title: 'Windows Update repair',
    commands: [
      { id: 'wu-restart-wuauserv', title: 'Restart Windows Update service', ps: 'Restart-Service wuauserv', description: 'Restart core update service to clear stuck states.', validationHint: 'wuauserv restarted.' },
      { id: 'wu-restart-bits', title: 'Restart BITS service', ps: 'Restart-Service bits', description: 'Restarts Background Intelligent Transfer Service.', validationHint: 'BITS restarted.' },
      { id: 'wu-restart-cryptsvc', title: 'Restart Cryptographic service', ps: 'Restart-Service cryptsvc', description: 'Restarts crypto service used by updates.', validationHint: 'Cryptographic service restarted.' },
      { id: 'wu-log', title: 'Generate Windows Update log', ps: 'Get-WindowsUpdateLog', description: 'Exports merged Windows Update log to Desktop.', validationHint: 'Log generation requested. Review the .log on Desktop.' }
    ]
  },
  {
    id: 'defender',
    title: 'Windows Defender repair',
    commands: [
      { id: 'wd-update', title: 'Update Defender signatures', ps: 'Update-MpSignature', description: 'Pull latest malware definitions.', validationHint: 'Signature update requested.' },
      { id: 'wd-quick-scan', title: 'Quick scan', ps: 'Start-MpScan -ScanType QuickScan', description: 'Run a quick malware scan.', validationHint: 'Quick scan triggered. Keep the window open until complete.' },
      { id: 'wd-full-scan', title: 'Full scan', ps: 'Start-MpScan -ScanType FullScan', description: 'Run a full system scan (long).', validationHint: 'Full scan started. This may take a while.' },
      { id: 'wd-status', title: 'Defender status', ps: 'Get-MpComputerStatus', description: 'Show Defender protection status.', validationHint: 'Status captured.' }
    ]
  },
  {
    id: 'services',
    title: 'Service and system recovery',
    commands: [
      { id: 'svc-list', title: 'List services', ps: 'Get-Service', description: 'Quick service inventory.', validationHint: 'Service list captured.' },
      { id: 'svc-restart-all', title: 'Restart all services', ps: 'Restart-Service -Name "*"', description: 'Attempt a bulk restart of running services.', validationHint: 'Bulk restart attempted. Some services may refuse.', confirmText: 'Restart all services? Services with dependencies may briefly interrupt apps.' },
      { id: 'svc-wu-auto', title: 'Set Windows Update to Automatic', ps: 'Set-Service -Name "wuauserv" -StartupType Automatic', description: 'Ensure Windows Update starts automatically.', validationHint: 'Startup type set to Automatic for wuauserv.' },
      { id: 'svc-bits-auto', title: 'Set BITS to Automatic', ps: 'Set-Service -Name "bits" -StartupType Automatic', description: 'Ensure BITS starts automatically.', validationHint: 'Startup type set to Automatic for BITS.' },
      { id: 'svc-stop-all-proc', title: 'Stop all processes (danger)', ps: 'Stop-Process -Name "*"', description: 'Stops all processes. Use only if you know what you are doing.', validationHint: 'Process stop issued. System may close running apps.', confirmText: 'This will attempt to stop all processes and can disrupt the system. Continue?', danger: true }
    ]
  },
  {
    id: 'perf',
    title: 'Performance and memory diagnostics',
    commands: [
      { id: 'perf-top-cpu', title: 'Top 20 by CPU', ps: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 20', description: 'List CPU-heavy processes.', validationHint: 'CPU-heavy process list captured.' },
      { id: 'perf-top-ram', title: 'Top 20 by memory', ps: 'Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 20', description: 'List RAM-heavy processes.', validationHint: 'Memory-heavy process list captured.' },
      { id: 'perf-clear-host', title: 'Clear host buffer', ps: 'Clear-Host', description: 'Clear PowerShell host output.', validationHint: 'Host buffer cleared.' }
    ]
  },
  {
    id: 'drivers',
    title: 'Driver and device reset',
    commands: [
      { id: 'pnp-list', title: 'List Plug and Play devices', ps: 'Get-PnpDevice', description: 'Enumerate devices and status.', validationHint: 'PnP device list captured.' },
      { id: 'pnp-disable', title: 'Disable device by InstanceId', ps: 'Disable-PnpDevice -InstanceId "<ID>" -Confirm:$false', description: 'Disables a device. Requires exact InstanceId.', validationHint: 'Disable command issued.', inputLabel: 'InstanceId', confirmText: 'Disable this device? Ensure you selected the correct InstanceId.', danger: true },
      { id: 'pnp-enable', title: 'Enable device by InstanceId', ps: 'Enable-PnpDevice -InstanceId "<ID>" -Confirm:$false', description: 'Re-enables a device. Requires exact InstanceId.', validationHint: 'Enable command issued.', inputLabel: 'InstanceId' }
    ]
  },
  {
    id: 'events',
    title: 'Event log and crash diagnosis',
    commands: [
      { id: 'evt-system', title: 'System event log (latest 200)', ps: 'Get-EventLog -LogName System -Newest 200', description: 'Fetch latest System events.', validationHint: 'System event sample captured.' },
      { id: 'evt-app', title: 'Application event log (latest 200)', ps: 'Get-EventLog -LogName Application -Newest 200', description: 'Fetch latest Application events.', validationHint: 'Application event sample captured.' },
      { id: 'evt-winevent', title: 'WinEvent (System, 200)', ps: 'Get-WinEvent -LogName System -MaxEvents 200', description: 'Alternative WinEvent query for system log.', validationHint: 'WinEvent sample captured.' }
    ]
  },
  {
    id: 'cleanup',
    title: 'System cleanup',
    commands: [
      { id: 'cleanup-temp-user', title: 'Clean user temp', ps: 'Remove-Item -Path "$env:TEMP\\*" -Recurse -Force', description: 'Delete user temp files.', validationHint: 'User temp cleanup requested.', confirmText: 'Delete all user temp files now?', danger: true },
      { id: 'cleanup-temp-windows', title: 'Clean Windows temp', ps: 'Remove-Item -Path "C:\\Windows\\Temp\\*" -Recurse -Force', description: 'Delete Windows temp files (may need admin).', validationHint: 'Windows temp cleanup requested.', confirmText: 'Delete Windows temp files now?', danger: true }
    ]
  }
];
const REPAIR_LOG_LIMIT = 30;
const REPAIR_INPUT_REGEX = /^[A-Za-z0-9_.:\\\-{}\\\\]+$/;
const REPAIR_HOST_NAME = 'com.stackdash.launcher';

/**
 * Render current settings into the slide-out UI.
 * All fields are guarded in case the corresponding controls are not present in the DOM.
 */
export function renderPrefs() {
  const openNew = $("#prefOpenNewTab");
  const themeSel = $("#prefTheme");
  const keyEl   = $("#prefLogoDevKey");
  const editToggle = $("#prefEditMode");
  const pruneAge = $("#prefPruneAge");
  const pruneEntries = $("#prefPruneEntries");
  const perfPanel = $("#prefPerfPanel");
  const fontSel = $('#prefFont');
  const glowToggle = $('#prefGlowEnabled');
  const glowColor = $('#prefGlowColor');
  const languageSel = $("#prefInterfaceLanguage");
  const uptimeToggle = $("#prefUptimeAlerts");
  const uptimeInterval = $("#prefUptimeAlertInterval");
  const uptimeIntervalLabel = $("#prefUptimeAlertIntervalLabel");
  const uptimeLogClear = $("#uptimeLogClear");
  const exportJsonBtn = $("#uptimeExportJson");
  const exportTxtBtn = $("#uptimeExportTxt");
  const exportPdfBtn = $("#uptimeExportPdf");

  if (openNew)  openNew.checked = !!STATE.settings.openInNewTab;
  if (themeSel) themeSel.value  = STATE.settings.theme ?? "system";
  if (keyEl)    keyEl.value     = STATE.settings.logoDevApiKey || "";
  if (editToggle) editToggle.checked = STATE.settings.editMode !== false; // default true
  if (fontSel) fontSel.value = STATE.settings.selectedFont || 'inter';
  if (glowToggle) glowToggle.checked = STATE.settings.glowEnabled !== false;
  if (glowColor && typeof STATE.settings.glowColor === 'string') glowColor.value = STATE.settings.glowColor;
  // Apply immediately for live preview
  if (STATE.settings.glowColor) document.documentElement.style.setProperty('--glow-color', STATE.settings.glowColor);
  document.body.classList.toggle('disable-glow', STATE.settings.glowEnabled === false);
  // advanced perf settings (stored in localStorage, not STATE)
  try {
    const cfg = JSON.parse(localStorage.getItem('__sdPruneCfg')||'{}');
    if (pruneAge) pruneAge.value = cfg.maxAgeMs ? Math.round(cfg.maxAgeMs/3600000) : '';
    if (pruneEntries) pruneEntries.value = cfg.maxEntries || '';
  } catch {}
  try { if (perfPanel) perfPanel.checked = localStorage.getItem('sdPerfPanel') === '1'; } catch {}
  if (languageSel) {
    const lang = (STATE.settings.interfaceLanguage || 'en').toLowerCase();
    languageSel.value = lang;
  }
  if (uptimeToggle) uptimeToggle.checked = STATE.settings.uptimeAlertsEnabled !== false;
  if (uptimeInterval) {
    const val = Math.min(60, Math.max(1, STATE.settings.uptimeAlertIntervalMinutes || 5));
    uptimeInterval.value = val;
    if (uptimeIntervalLabel) uptimeIntervalLabel.textContent = `${val} min`;
    updateUptimeSliderVisual(val);
  }
  if (uptimeLogClear) {
    uptimeLogClear.addEventListener('click', () => {
      const list = document.getElementById('uptimeLogList');
      if (list) list.innerHTML = '<div class="uptime-log-empty">Log view cleared. Summary data retained.</div>';
    });
  }
  if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => downloadLogs('json'));
  if (exportTxtBtn) exportTxtBtn.addEventListener('click', () => downloadLogs('txt'));
  if (exportPdfBtn) exportPdfBtn.addEventListener('click', () => downloadLogs('pdf'));
  renderUptimeLogList();
  renderUptimeStatsChart();
}

/**
 * Apply glow color across document. Also recompute ring variables, respect contrast safeguard,
 * and update body class for enabled/disabled state. Mirrors logic in loadState so runtime
 * changes stay consistent.
 */
function applyDynamicGlowColor(raw) {
  // Simple luminance check (duplicated from state.js) keep in sync if that logic changes
  const hex = raw.replace('#','');
  if (hex.length < 6) return; // ignore shorthand for now
  const r = parseInt(hex.slice(0,2),16);
  const g = parseInt(hex.slice(2,4),16);
  const b = parseInt(hex.slice(4,6),16);
  const lum = (0.2126*r + 0.7152*g + 0.0722*b)/255;
  let adjusted = raw;
  if (lum > 0.80) { // too bright -> darken
    const factor = 0.55; // darkening multiplier
    const dr = Math.round(r*factor).toString(16).padStart(2,'0');
    const dg = Math.round(g*factor).toString(16).padStart(2,'0');
    const db = Math.round(b*factor).toString(16).padStart(2,'0');
    adjusted = `#${dr}${dg}${db}`;
  }
  const root = document.documentElement.style;
  root.setProperty('--glow-color', adjusted);
  // Derive ring variables used by components (fallback if CSS hasn't defined them)
  root.setProperty('--glow-ring-1', `0 0 0 1px ${adjusted}55`);
  root.setProperty('--glow-ring-2', `0 0 0 2px ${adjusted}22`);
  root.setProperty('--glow-bloom', `0 0 6px 2px ${adjusted}55`);
}

/** Ensure required settings keys exist and are valid. */
function normaliseSettingsObject(s) {
  const out = Object.assign(
    {
      openInNewTab: true,
      theme: "system",
      logoDevApiKey: "",
      editMode: true,
      selectedFont: "inter",
      glowEnabled: true,
      glowColor: "#8b1234",
      interfaceLanguage: "en",
      uptimeAlertsEnabled: true,
      uptimeAlertLogs: [],
      uptimeAlertIntervalMinutes: 5
    },
    (s && typeof s === "object") ? s : {}
  );

  if (!["system", "light", "dark", "crimson"].includes(out.theme)) out.theme = "system";
  out.openInNewTab = !!out.openInNewTab;
  if (typeof out.logoDevApiKey !== "string") out.logoDevApiKey = "";
  out.editMode = out.editMode !== false; // coerce to boolean default true
  if (typeof out.selectedFont !== 'string' || !out.selectedFont.trim()) out.selectedFont = 'inter';
  out.glowEnabled = out.glowEnabled !== false; // default true
  if (typeof out.glowColor !== 'string' || !/^#([0-9a-f]{3,8})$/i.test(out.glowColor)) out.glowColor = '#8b1234';
  if (typeof out.interfaceLanguage !== 'string') {
    out.interfaceLanguage = 'en';
  } else {
    out.interfaceLanguage = out.interfaceLanguage.toLowerCase();
    if (!SUPPORTED_LANGUAGES.includes(out.interfaceLanguage)) out.interfaceLanguage = 'en';
  }
  out.uptimeAlertsEnabled = out.uptimeAlertsEnabled !== false;
  if (!Array.isArray(out.uptimeAlertLogs)) out.uptimeAlertLogs = [];
  if (typeof out.uptimeAlertIntervalMinutes !== 'number' || out.uptimeAlertIntervalMinutes <= 0) out.uptimeAlertIntervalMinutes = 5;
  // If previous selection points to removed font, fallback to original_default
  const validIds = new Set((window?.FONT_CATALOG || []).map(f=>f.fontName));
  try {
    if (validIds.size && !validIds.has(out.selectedFont)) out.selectedFont = 'original_default';
  } catch {}

  return out;
}

/** Validate/normalise an imported state JSON payload. */
function normaliseImportedState(data) {
  if (!data || typeof data !== "object") throw new Error("Invalid file: not an object");
  if (!Array.isArray(data.pages)) throw new Error("Invalid file: missing pages[]");

  const normalised = { ...data };
  normalised.settings = normaliseSettingsObject(data.settings);

  // Ensure each page/group/links array is well-formed (do not mutate structure beyond safety)
  normalised.pages = data.pages.map(p => ({
    id: p?.id ?? `page_${Math.random().toString(36).slice(2, 8)}`,
    name: typeof p?.name === "string" ? p.name : "Page",
    groups: Array.isArray(p?.groups) ? p.groups.map(g => ({
      id: g?.id ?? `grp_${Math.random().toString(36).slice(2, 8)}`,
      name: typeof g?.name === "string" ? g.name : "Group",
      links: Array.isArray(g?.links) ? g.links.map(l => ({
        id: l?.id ?? `lnk_${Math.random().toString(36).slice(2, 8)}`,
        title: typeof l?.title === "string" ? l.title : "Untitled",
        url: typeof l?.url === "string" ? l.url : "",
        // Include 'logo' type (new) plus legacy values
        iconType: ["auto", "url", "upload", "logo"].includes(l?.iconType) ? l.iconType : "auto",
        iconUrl: typeof l?.iconUrl === "string" ? l.iconUrl : "",
        iconData: typeof l?.iconData === "string" ? l.iconData : "",
        logoDomain: typeof l?.logoDomain === 'string' ? l.logoDomain : ''
      })) : [],
      widgets: Array.isArray(g?.widgets) ? g.widgets.map(w => {
        const type = (typeof w?.type === 'string') ? w.type : 'uptime-robot';
        let opts = (w && typeof w.options === 'object') ? {...w.options} : {};
        if (type === 'covid') {
          if (typeof opts.country !== 'string') opts.country = '';
          if (typeof opts.refreshMins !== 'number' || opts.refreshMins < 5) opts.refreshMins = 60;
        }
        if (type === 'iframe') { // ensure new iframe fields have sane defaults
          if (opts.autoHeight && typeof opts.height === 'number') delete opts.height;
          if (opts.span && typeof opts.span !== 'string' && typeof opts.span !== 'number') delete opts.span;
        }
        return {
          id: w?.id ?? `wdg_${Math.random().toString(36).slice(2,8)}`,
          type,
          options: opts
        };
      }) : [],
      programs: Array.isArray(g?.programs) ? g.programs.map(pr => ({
        id: pr?.id ?? `prg_${Math.random().toString(36).slice(2,8)}`,
        title: typeof pr?.title === 'string' ? pr.title : 'Program',
        launchMethod: typeof pr?.launchMethod === 'string' ? pr.launchMethod : 'scheme',
        schemeOrCommand: typeof pr?.schemeOrCommand === 'string' ? pr.schemeOrCommand : (typeof pr?.scheme === 'string' ? pr.scheme : ''),
        nativeCommand: typeof pr?.nativeCommand === 'string' ? pr.nativeCommand : '',
        nativeArgs: Array.isArray(pr?.nativeArgs) ? pr.nativeArgs : (typeof pr?.nativeArgs === 'string' ? pr.nativeArgs.split(/\s+/).filter(Boolean) : []),
        iconType: ['logo','url','upload'].includes(pr?.iconType) ? pr.iconType : 'logo',
        iconUrl: typeof pr?.iconUrl === 'string' ? pr.iconUrl : '',
        iconData: typeof pr?.iconData === 'string' ? pr.iconData : '',
        logoDomain: typeof pr?.logoDomain === 'string' ? pr.logoDomain : '',
        notes: typeof pr?.notes === 'string' ? pr.notes : ''
      })) : [],
      // Preserve group-level sizing fields (new)
      tileMin: (typeof g?.tileMin === 'number' && g.tileMin > 40) ? g.tileMin : undefined,
      span: (typeof g?.span === 'number' && g.span >=1 && g.span <= 12) ? g.span : undefined
    })) : []
  }));

  // selectedPageId fallback
  if (!normalised.selectedPageId && normalised.pages.length) {
    normalised.selectedPageId = normalised.pages[0].id;
  }

  return normalised;
}

function getRepairCommand(id) {
  for (const cat of REPAIR_LIBRARY) {
    const found = cat.commands.find(c => c.id === id);
    if (found) return found;
  }
  return null;
}

function escapePre(str) {
  return (str == null ? "" : String(str)).replace(/[&<>"']/g, s => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[s]));
}

function escapeAttr(str) {
  return (str == null ? "" : String(str)).replace(/["&<>]/g, s => ({
    '"': "&quot;",
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  }[s]));
}

function truncateOutput(str, max = 1800) {
  if (!str) return "";
  const clean = String(str);
  return clean.length > max ? clean.slice(0, max) + "\n...truncated..." : clean;
}

function appendRepairLog(entry) {
  const log = document.getElementById('repairLog');
  if (!log) return;
  if (log.dataset.empty !== '0') { log.innerHTML = ''; log.dataset.empty = '0'; }
  const el = document.createElement('div');
  el.className = 'repair-log-entry';
  const ts = entry.timestamp || new Date().toLocaleTimeString();
  const stdout = truncateOutput(entry.stdout || "");
  const stderr = truncateOutput(entry.stderr || "");
  let payload = stdout || stderr ? `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}` : "";
  if (!payload && entry.error) payload = `[error]\n${entry.error}`;
  if (!payload) payload = "No output returned.";
  el.innerHTML = `
    <div class="timestamp">${ts}</div>
    <div class="validation">${escapePre(entry.label || 'Command')} — ${escapePre(entry.validation || '')}</div>
    ${entry.exitCode !== undefined ? `<div class="validation" style="font-weight:500;">Exit code: ${entry.exitCode}</div>` : ""}
    <pre>${escapePre(payload)}</pre>
  `;
  log.prepend(el);
  while (log.children.length > REPAIR_LOG_LIMIT) log.removeChild(log.lastChild);
}

function buildValidation(cmd, resp, ok) {
  if (resp?.needsElevation) return "Needs elevated PowerShell (run as Administrator).";
  if (resp?.error) return `Failed: ${resp.error}`;
  if (!ok) {
    if (resp?.error) return `Failed: ${resp.error}`;
    if (typeof resp?.exitCode === 'number') return `Failed (exit ${resp.exitCode}). Review output.`;
    return "Failed to run. Check native helper.";
  }
  return cmd?.validationHint || "Command completed.";
}

function renderUptimeLogList() {
  const list = document.getElementById('uptimeLogList');
  if (!list) return;
  const logs = Array.isArray(STATE.settings.uptimeAlertLogs) ? STATE.settings.uptimeAlertLogs.slice() : [];
  if (!logs.length) { list.innerHTML = '<div class="uptime-log-empty">No down events logged yet.</div>'; return; }
  const sorted = logs.sort((a,b)=> (b.dateTimeDown||'').localeCompare(a.dateTimeDown||''));
  list.innerHTML = '';
  sorted.forEach(entry => {
    const wrap = document.createElement('div');
    wrap.className = 'uptime-log-entry';
    wrap.innerHTML = `
      <div class="log-title">${escapeHtml(entry.monitorName || 'Monitor')}</div>
      <div class="log-line"><strong>Endpoint:</strong> ${escapeHtml(entry.ipOrUrl || '')}</div>
      <div class="log-line"><strong>Status:</strong> down</div>
      <div class="log-line"><strong>Down at:</strong> ${escapeHtml(entry.dateTimeDown || '')}</div>
    `;
    list.appendChild(wrap);
  });
}

function updateUptimeSliderVisual(val) {
  const slider = document.getElementById('prefUptimeAlertInterval');
  if (!slider) return;
  const pct = Math.min(100, Math.max(0, ((val - slider.min) / (slider.max - slider.min)) * 100));
  const gradient = `linear-gradient(90deg, var(--danger) 0%, orange 50%, var(--ok) 100%)`;
  slider.style.background = `${gradient}`;
  slider.style.backgroundSize = `${pct}% 100%`;
  slider.style.backgroundRepeat = 'no-repeat';
}

function formatLogsPlain(logs) {
  return logs.map(l => {
    const name = l.monitorName || 'Monitor';
    const target = l.ipOrUrl || '';
    const dt = l.dateTimeDown || '';
    return `${name}\nEndpoint: ${target}\nStatus: down\nDown at: ${dt}\n`;
  }).join('\n');
}

function downloadLogs(format) {
  const logs = Array.isArray(STATE.settings.uptimeAlertLogs) ? STATE.settings.uptimeAlertLogs : [];
  if (!logs.length) {
    alert('No log entries to export.');
    return;
  }
  let blob;
  const now = new Date().toISOString().replace(/[:T]/g,'-').slice(0,19);
  if (format === 'json') {
    blob = new Blob([JSON.stringify(logs, null, 2)], { type:'application/json' });
    triggerDownload(blob, `uptime-logs-${now}.json`);
  } else if (format === 'txt') {
    blob = new Blob([formatLogsPlain(logs)], { type:'text/plain' });
    triggerDownload(blob, `uptime-logs-${now}.txt`);
  } else if (format === 'pdf') {
    // simple text-based PDF export (not formatted), stored with pdf mime for convenience
    const text = formatLogsPlain(logs);
    const header = '%PDF-1.4\n';
    const body = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length ${text.length + 91} >>\nstream\nBT\n/F1 12 Tf\n50 750 Td\n(${text.replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/\n/g,') Tj\n0 -16 Td\n(')}) Tj\nET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000062 00000 n \n0000000115 00000 n \n0000000276 00000 n \n0000000455 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n550\n%%EOF`;
    blob = new Blob([header + body], { type:'application/pdf' });
    triggerDownload(blob, `uptime-logs-${now}.pdf`);
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function renderUptimeStatsChart() {
  const canvas = document.getElementById('uptimePieCanvas');
  const legend = document.getElementById('uptimePieLegend');
  const totalsEl = document.getElementById('uptimeChartTotals');
  if (!canvas || !legend) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const logs = Array.isArray(STATE.settings.uptimeAlertLogs) ? STATE.settings.uptimeAlertLogs : [];
  const devices = new Set(logs.map(l => (l?.ipOrUrl || '').trim()).filter(Boolean)).size;
  const pings = logs.length;
  const tabs = Array.isArray(STATE.pages) ? STATE.pages.length : 0;
  const data = [
    { label:'Devices', value: devices, color:'#36CFC9' },
    { label:'Pings', value: pings, color:'#FF9F43' },
    { label:'Tabs', value: tabs, color:'#7367F0' }
  ].filter(d => d.value > 0);
  const total = data.reduce((a,b)=>a+b.value,0);
  if (totalsEl) totalsEl.textContent = total ? `${total} total` : 'No data';
  if (!total) {
    legend.innerHTML = '<div class="uptime-log-empty">No data yet.</div>';
    return;
  }
  // draw pie
  let start = -Math.PI/2;
  const cx = canvas.width/2;
  const cy = canvas.height/2;
  const r = Math.min(cx,cy) - 8;
  const slices = [];
  data.forEach(slice => {
    const angle = (slice.value/total) * Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,start,start+angle);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
    slices.push({ start, end:start+angle, ...slice });
    start += angle;
  });
  legend.innerHTML = '';
  data.forEach(slice => {
    const row = document.createElement('div');
    row.className = 'uptime-legend-row';
    row.innerHTML = `<span class="uptime-legend-swatch" style="background:${slice.color};"></span><span>${slice.label}: ${slice.value}</span>`;
    legend.appendChild(row);
  });

  // hover tooltip
  let tooltip = document.getElementById('uptimePieTooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'uptimePieTooltip';
    tooltip.className = 'uptime-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
  }
  const showTip = (text, x, y) => {
    tooltip.textContent = text;
    tooltip.style.left = `${x + 12}px`;
    tooltip.style.top = `${y + 12}px`;
    tooltip.style.display = 'block';
  };
  const hideTip = () => { tooltip.style.display = 'none'; };
  canvas.onmouseleave = hideTip;
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - cx;
    const y = e.clientY - rect.top - cy;
    const dist = Math.sqrt(x*x + y*y);
    if (dist > r) { hideTip(); return; }
    let angle = Math.atan2(y,x);
    if (angle < -Math.PI/2) angle += Math.PI*2;
    for (const sl of slices) {
      if (angle >= sl.start && angle <= sl.end) {
        const pct = ((sl.value/total)*100).toFixed(1);
        showTip(`${sl.label}: ${pct}%`, e.clientX, e.clientY);
        return;
      }
    }
    hideTip();
  };
}

async function handleRepairRun(cmd) {
  if (!cmd) return;
  if (!chrome?.runtime?.sendMessage) {
    alert("Browser runtime unavailable; cannot run commands.");
    return;
  }
  let inputValue = null;
  if (cmd.inputLabel) {
    const raw = prompt(`Enter ${cmd.inputLabel}:`);
    if (!raw) return;
    inputValue = raw.trim();
    if (!REPAIR_INPUT_REGEX.test(inputValue)) {
      alert("Invalid value. Use the exact InstanceId (alphanumeric, :, \\, ., -, _ only).");
      return;
    }
  }
  if (cmd.confirmText && !confirm(cmd.confirmText)) return;
  const btn = document.querySelector(`[data-repair-id="${cmd.id}"]`);
  if (btn) { btn.disabled = true; btn.textContent = "Running..."; btn.dataset.running = "true"; }
  let resp = null;
  try {
    resp = await chrome.runtime.sendMessage({
      type: "runRepairCommand",
      commandId: cmd.id,
      inputValue
    });
  } catch (err) {
    resp = { ok: false, error: err?.message || String(err) };
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Run"; btn.dataset.running = "false"; }
  }
  const response = resp || { ok: false, error: 'Native helper not reachable (no response).' };
  const ok = !!response.ok && (response.exitCode === undefined || response.exitCode === 0);
  const validation = buildValidation(cmd, response, ok);
  appendRepairLog({
    label: cmd.title,
    validation,
    stdout: response.stdout,
    stderr: response.stderr,
    exitCode: response.exitCode,
    error: response.error,
    timestamp: new Date().toLocaleTimeString()
  });
}

async function checkNativeHelper() {
  const el = document.getElementById('repairStatus');
  if (!el) return;
  el.className = 'repair-status repair-status--checking';
  el.textContent = 'Checking native helper...';
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'checkNativeAvailable' });
    if (resp?.ok) {
      el.textContent = `Native helper ready (${resp.host || 'host'})`;
      el.className = 'repair-status repair-status--ok';
    } else {
      el.textContent = resp?.error ? `Native helper not reachable: ${resp.error}` : 'Native helper not reachable. Install/verify host manifest.';
      el.className = 'repair-status repair-status--error';
    }
  } catch (err) {
    el.textContent = `Native helper not reachable: ${err?.message || err}`;
    el.className = 'repair-status repair-status--error';
  }
}

function ensureRepairTabBuilt() {
  const container = document.getElementById('repairCommandGroups');
  if (!container || container.dataset.built) return;
  container.dataset.built = '1';

    const status = document.createElement('div');
    status.id = 'repairStatus';
    status.className = 'repair-status repair-status--checking';
    status.textContent = 'Checking native helper...';
    container.parentElement.insertBefore(status, container);

  REPAIR_LIBRARY.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'repair-card';
    const header = document.createElement('div');
    header.className = 'repair-category';
    header.innerHTML = `<div><h4>${cat.title}</h4><div class="repair-category-sub">Curated PowerShell actions</div></div><span class="repair-badge" title="PowerShell commands">PowerShell</span>`;
    card.appendChild(header);

    const list = document.createElement('div');
    cat.commands.forEach(cmd => {
      const row = document.createElement('div');
      row.className = 'repair-command-row';
      const descNote = cmd.inputLabel ? ` Requires ${cmd.inputLabel}.` : '';
      const psTitle = escapeAttr(cmd.ps);
      row.innerHTML = `
        <div>
          <div class="repair-command-title">${cmd.title}</div>
          <p class="repair-meta">${cmd.description || ''}${descNote}</p>
        </div>
        <div class="repair-actions">
          <span class="repair-badge ${cmd.danger ? 'danger' : 'safe'}" title="${psTitle}">${cmd.danger ? 'Caution' : 'Safe'}</span>
          <button class="btn small repair-run" type="button" data-repair-id="${cmd.id}" title="${psTitle}">Run</button>
        </div>
      `;
      list.appendChild(row);
    });
    card.appendChild(list);
    container.appendChild(card);
  });

  const log = document.getElementById('repairLog');
  if (log) { log.textContent = 'No commands run yet.'; log.dataset.empty = '1'; }
  const clearBtn = document.getElementById('repairLogClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const target = document.getElementById('repairLog');
      if (target) {
        target.innerHTML = '';
        target.textContent = 'Log cleared.';
        target.dataset.empty = '1';
      }
    });
  }

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-repair-id]');
    if (!btn) return;
    const cmd = getRepairCommand(btn.dataset.repairId);
    handleRepairRun(cmd);
  });

  // Native helper health check
  checkNativeHelper();
}

/**
 * Attach settings listeners (null-safe via `on()`).
 * Keeps legacy toggles optional (if you've removed them from the HTML, no issue).
 */
export function initSettingsBindings() {
  window.addEventListener('uptimeLogUpdated', renderUptimeLogList);
  window.addEventListener('uptimeLogUpdated', renderUptimeStatsChart);
  ensureRepairTabBuilt();
  // Populate font select dynamically (allows future catalog changes without editing HTML)
  const fontSelectEl = document.getElementById('prefFont');
  const fontSearchEl = document.getElementById('prefFontSearch');
  if (fontSelectEl && !fontSelectEl.dataset.populated) {
    const sorted = [...FONT_CATALOG].sort((a,b)=> a.displayName.localeCompare(b.displayName, undefined, {sensitivity:'base'}));
    sorted.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.fontName; opt.textContent = f.displayName;
      fontSelectEl.appendChild(opt);
    });
    fontSelectEl.dataset.populated = '1';
  }

  // Simple fuzzy filtering (case-insensitive contains)
  if (fontSearchEl && fontSelectEl) {
    fontSearchEl.addEventListener('input', ()=>{
      const q = fontSearchEl.value.trim().toLowerCase();
      Array.from(fontSelectEl.options).forEach(o => {
        if (!q) { o.hidden = false; return; }
        const txt = o.textContent.toLowerCase();
        o.hidden = !txt.includes(q);
      });
      // If current selection is hidden due to filter, auto-select first visible
      if (fontSelectEl.selectedOptions[0]?.hidden) {
        const firstVisible = Array.from(fontSelectEl.options).find(o=>!o.hidden);
        if (firstVisible) { fontSelectEl.value = firstVisible.value; fontSelectEl.dispatchEvent(new Event('change')); }
      }
    });
  }

  const ensureFontLoaded = async (fontId) => {
    const meta = getFontMeta(fontId);
    const head = document.head;
    let linkId = 'gf-'+meta.fontName;
    if (meta.provider === 'google' && meta.gf) {
      if (!document.getElementById(linkId)) {
        const l = document.createElement('link');
        l.id = linkId;
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family='+meta.gf+'&display=swap';
        head.appendChild(l);
      }
    }
    // Apply to root via CSS variable so global styles remain centralized
    document.documentElement.style.setProperty('--app-font-stack', meta.cssStack);
  // Dynamic selector accent: derive a color hash from font name to create consistent hue
  const h = [...meta.fontName].reduce((a,c)=>a + c.charCodeAt(0),0) % 360;
  // Removed dynamic accent color; font select now uses fixed burgundy styling
    // Attempt detection after a short delay (FontFaceSet not fully reliable for remote CSS)
    setTimeout(()=>{
      try {
        if (document.documentElement.hasAttribute('data-font-fallback')) return; // already handled
        if (document.fonts && meta.displayName) {
          const checkName = meta.displayName.split(' ')[0];
          const loaded = Array.from(document.fonts).some(ff => ff.family.toLowerCase().includes(checkName.toLowerCase()));
          if (!loaded) throw new Error('font not confirmed loaded');
        }
      } catch {
        document.documentElement.style.setProperty('--app-font-stack', 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif');
        document.documentElement.setAttribute('data-font-fallback','1');
        window.dispatchEvent(new CustomEvent('sdFontFallback', { detail: { error: 'Selected font unavailable, reverted to default font.' } }));
      }
    }, 900);
  };

  // Manual test utility: trigger font fallback path once for verification.
  if (!window.__sdTestFontFallback) {
    window.__sdTestFontFallback = () => {
      if (document.documentElement.hasAttribute('data-font-fallback')) {
        console.info('[font-fallback-test] already in fallback state');
        return false;
      }
      document.documentElement.style.setProperty('--app-font-stack', 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif');
      document.documentElement.setAttribute('data-font-fallback','1');
      const detail = { error: 'Selected font unavailable, reverted to default font. (simulated)' };
      window.dispatchEvent(new CustomEvent('sdFontFallback', { detail }));
      console.info('[font-fallback-test] dispatched simulated sdFontFallback');
      return true;
    };
  }

  // Initial apply (in case of persisted value)
  try { ensureFontLoaded(STATE.settings.selectedFont || 'inter'); } catch {}

  // Simple diagnostic to verify selected font renders distinctly and not blurry (heuristic based on width diffs)
  function testFontReadability(fontId){
    const meta = getFontMeta(fontId);
    const sample = 'Dashboard Quick Vixen Jumps 1234567890';
    const probe = document.createElement('canvas');
    probe.width = 800; probe.height = 80;
    const ctx = probe.getContext('2d');
    // Render with target font
    ctx.font = '24px '+meta.cssStack.split(',')[0].replace(/"/g,'');
    ctx.fillStyle = '#fff';
    ctx.fillText(sample, 10, 40);
    // Compute edge contrast heuristic
    const img = ctx.getImageData(0,0,probe.width,60).data;
    let transitions=0; for(let i=4;i<img.length;i+=4){ // alpha channel skip simplification
      const prev = img[i-4]; const cur = img[i]; if ((prev>200)!==(cur>200)) transitions++; }
    const score = transitions / sample.length;
    return { font: meta.displayName, transitions: transitions, score: score };
  }

  const testBtn = document.getElementById('prefFontTest');
  if (testBtn) {
    testBtn.addEventListener('click', ()=>{
      const current = STATE.settings.selectedFont;
      const diag = testFontReadability(current);
      console.info('[font-test]', diag);
      if (diag.score < 2) {
        console.warn(JSON.stringify({ error: 'Selected font may render poorly (low edge contrast).'}));
      } else {
        console.log(JSON.stringify({ ok: 'Font rendering passed heuristic.' }));
      }
    });
  }
  // Tabs logic (idempotent)
  const tabsRoot = document.querySelector('.settings-tabs');
  if (tabsRoot && !tabsRoot.__wired) {
    tabsRoot.__wired = true;
    const allTabs = Array.from(tabsRoot.querySelectorAll('[role=tab]'));
    const selectTab = (id, focus=false) => {
      allTabs.forEach(t => {
        const active = t.dataset.tab === id;
        t.setAttribute('aria-selected', active ? 'true':'false');
        const panel = document.getElementById('panel-' + t.dataset.tab);
        if (panel) {
          if (active) panel.removeAttribute('hidden'); else panel.setAttribute('hidden','');
          panel.classList.toggle('active', active);
        }
      });
      try { localStorage.setItem('__sdSettingsTab', id); } catch {}
      if (focus) {
        const btn = allTabs.find(t=>t.dataset.tab===id); if (btn) btn.focus();
      }
    };
    tabsRoot.addEventListener('click', e => {
      const btn = e.target.closest('[role=tab]');
      if (!btn) return;
      selectTab(btn.dataset.tab);
    });
    tabsRoot.addEventListener('keydown', e => {
      const current = document.activeElement.closest('[role=tab]');
      if (!current) return;
      const idx = allTabs.indexOf(current);
      if (['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key === 'ArrowRight') selectTab(allTabs[(idx+1)%allTabs.length].dataset.tab, true);
      else if (e.key === 'ArrowLeft') selectTab(allTabs[(idx-1+allTabs.length)%allTabs.length].dataset.tab, true);
      else if (e.key === 'Home') selectTab(allTabs[0].dataset.tab, true);
      else if (e.key === 'End') selectTab(allTabs[allTabs.length-1].dataset.tab, true);
    });
    // restore last tab
    let last = 'general';
    try { last = localStorage.getItem('__sdSettingsTab') || 'general'; } catch {}
    if (!allTabs.some(t=>t.dataset.tab===last)) last = 'general';
    selectTab(last);
  }
  // Import JSON
  on("#importJsonFile", "change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      console.info('[importJson] top-level keys:', Object.keys(data));
      const normalised = normaliseImportedState(data);
      try {
        const pc = Array.isArray(normalised.pages) ? normalised.pages.length : 0;
        const progc = (normalised.pages || []).reduce((acc,p) => acc + (p.groups || []).reduce((gacc,g) => gacc + ((g.programs||[]).length),0), 0);
        const wgc = (normalised.pages || []).reduce((acc,p) => acc + (p.groups || []).reduce((gacc,g) => gacc + ((g.widgets||[]).length),0), 0);
        console.info('[importJson] normalized counts:', { pages: pc, programs: progc, widgets: wgc });
      } catch(e){}

      // Shallow replace STATE’s top-level keys without breaking references
      Object.keys(STATE).forEach(k => delete STATE[k]);
      Object.assign(STATE, normalised);

      await saveStateNow();
      renderGroups();          // reflect imported pages/groups/links
      renderPrefs();           // reflect imported settings
      applyTheme();            // apply imported theme
      $("#settingsPanel")?.classList.remove("open");
    } catch (err) {
      alert("Import failed: " + (err?.message || String(err)));
    } finally {
      e.target.value = ""; // reset file input
    }
  });

  on("#prefInterfaceLanguage", "change", (e) => {
    const raw = (e.target.value || "en").toLowerCase();
    const lang = SUPPORTED_LANGUAGES.includes(raw) ? raw : "en";
    STATE.settings.interfaceLanguage = lang;
    saveState();
    setLanguage(lang);
  });

  on("#prefUptimeAlerts", "change", (e) => {
    STATE.settings.uptimeAlertsEnabled = !!e.target.checked;
    saveState();
  });

  on("#prefUptimeAlertInterval", "input", (e) => {
    const label = document.getElementById('prefUptimeAlertIntervalLabel');
    const val = Math.min(60, Math.max(1, parseInt(e.target.value, 10) || 5));
    STATE.settings.uptimeAlertIntervalMinutes = val;
    if (label) label.textContent = `${val} min`;
    updateUptimeSliderVisual(val);
    saveState();
  });

  // Optional legacy toggles (OK if the controls were removed from the DOM)
  // (Removed) Link behaviour toggle deleted from UI; retain state key for backward compatibility.

  on("#prefTheme", "change", (e) => {
    STATE.settings.theme = e.target.value;
    applyTheme();
    saveState();
  });

  // Manual glow reset button
  on('#prefGlowReset','click', ()=>{
    const DEFAULT_GLOW = '#8b1234';
    STATE.settings.glowColor = DEFAULT_GLOW;
    const colorInput = document.getElementById('prefGlowColor');
    if (colorInput) colorInput.value = DEFAULT_GLOW;
    applyDynamicGlowColor(DEFAULT_GLOW);
    saveState();
  });

  // NEW: logo.dev publishable key
  on("#prefLogoDevKey", "input", (e) => {
    STATE.settings.logoDevApiKey = e.target.value.trim();
    saveState();
  });

  on("#prefEditMode", "change", (e) => {
    STATE.settings.editMode = !!e.target.checked;
    saveState();
    // re-render groups & pages to hide/show UI affordances
    import("./render-groups.js").then(m => m.renderGroups());
    import("./render-pages.js").then(m => m.renderPagesBar());
  });

  on('#prefFont','change', (e)=>{
    STATE.settings.selectedFont = e.target.value;
    saveState();
    ensureFontLoaded(STATE.settings.selectedFont);
  });

  on('#prefGlowEnabled','change', (e)=>{
    STATE.settings.glowEnabled = !!e.target.checked;
    document.body.classList.toggle('disable-glow', !STATE.settings.glowEnabled);
    if (STATE.settings.glowEnabled && STATE.settings.glowColor) {
      applyDynamicGlowColor(STATE.settings.glowColor);
    }
    saveState();
  });
  on('#prefGlowColor','input', (e)=>{
    const val = e.target.value;
    if (!/^#([0-9a-f]{3,8})$/i.test(val)) return;
    STATE.settings.glowColor = val;
    applyDynamicGlowColor(val);
    saveState();
  });


  on('#prefPruneAge','change',(e)=>{
    const hrs = parseInt(e.target.value,10);
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('__sdPruneCfg')||'{}'); } catch {}
    if (!cfg || typeof cfg !== 'object') cfg={};
    if (isFinite(hrs) && hrs>0) cfg.maxAgeMs = hrs*3600000; else delete cfg.maxAgeMs;
    localStorage.setItem('__sdPruneCfg', JSON.stringify(cfg));
    window.__sdPruneCfg = cfg; // live apply
  });
  on('#prefPruneEntries','change',(e)=>{
    const val = parseInt(e.target.value,10);
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('__sdPruneCfg')||'{}'); } catch {}
    if (!cfg || typeof cfg !== 'object') cfg={};
    if (isFinite(val) && val>0) cfg.maxEntries = val; else delete cfg.maxEntries;
    localStorage.setItem('__sdPruneCfg', JSON.stringify(cfg));
    window.__sdPruneCfg = cfg;
  });
  on('#prefPerfPanel','change',(e)=>{
    try {
      if (e.target.checked) localStorage.setItem('sdPerfPanel','1'); else localStorage.removeItem('sdPerfPanel');
    } catch {}
    import('./render-groups.js').then(m=>m.renderGroups());
  });
}
