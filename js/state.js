// state.js — default state, theme application, persistence helpers
import { debounce } from "./utils.js";

const randomId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

const setLinkPlace = (name, url, icon) => ({
  id: randomId("lnk"),
  title: name,
  url,
  iconType: "url",
  iconUrl: icon
});

export function createDefaultState() {
  const state = {
    settings: {
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
    pages: [
      {
        id: randomId("page"),
        name: "Home",
        groups: [
          {
            id: randomId("grp"),
            name: "General",
            links: [
              // Router (TP-Link logo)
              setLinkPlace("Router", "http://192.168.1.1", "https://pub-4864254888164cbeb1a8e4282a00434c.r2.dev/TP-Link%20Logo.jpeg"),

              // Unraid (official logo)
              setLinkPlace("Unraid", "http://192.168.1.95", "https://pub-4864254888164cbeb1a8e4282a00434c.r2.dev/Logo%20API%20Unraid.jpeg"),

              // Plex (you provided the logo.dev URL)
              setLinkPlace("Plex", "https://plex.tv", "https://pub-4864254888164cbeb1a8e4282a00434c.r2.dev/Logo%20API%20Plex.jpeg"),

              // BusinessDaddy (use provided Cloudinary image)
              setLinkPlace("BusinessDaddy", "https://businessdaddy.org/", "https://res.cloudinary.com/bettercast/image/upload/v1728737295/businessdaddy/fezm6dxyqnbscofnz8el.png"),

              // Donate (Stripe link with your StackDash image)
              setLinkPlace("Donate", "https://buy.stripe.com/cNi14oeVFaj7639avb5AQ0e", "assets/icon/stackdash.svg")
            ],
            widgets: [],
            programs: []
          }
        ]
      }
    ],
    selectedPageId: null
  };

  if (!state.selectedPageId && state.pages.length) {
    state.selectedPageId = state.pages[0].id;
  }

  return state;
}

export const DEFAULT_STATE = createDefaultState();
export let STATE = structuredClone(DEFAULT_STATE);

/** Load state from chrome.storage, applying light migrations. */
export async function loadState() {
  let storedState = null;
  try {
    const res = await chrome.storage.local.get(["state"]);
    storedState = res?.state ?? null;
  } catch {
    storedState = null;
  }

  if (isPersistedStateValid(storedState)) {
    STATE = storedState;
  } else {
    STATE = createDefaultState();
    try {
      await chrome.storage.local.set({ state: STATE });
    } catch {}
  }
  if (!STATE.selectedPageId && STATE.pages.length) {
    STATE.selectedPageId = STATE.pages[0].id;
  }
  if (STATE.settings) {
    if (STATE.settings.uptimeAlertsEnabled === undefined) STATE.settings.uptimeAlertsEnabled = true;
    if (!Array.isArray(STATE.settings.uptimeAlertLogs)) STATE.settings.uptimeAlertLogs = [];
    if (typeof STATE.settings.uptimeAlertIntervalMinutes !== 'number' || STATE.settings.uptimeAlertIntervalMinutes <= 0) {
      STATE.settings.uptimeAlertIntervalMinutes = 5;
    }
  }
  // lightweight migration: ensure each group has programs array
  try {
    STATE.pages.forEach(p => p.groups?.forEach(g => {
      if (!Array.isArray(g.programs)) g.programs = [];
      g.programs.forEach(pr => {
        if (!pr.launchMethod) pr.launchMethod = 'scheme';
        if (pr.launchMethod === 'native') {
          if (typeof pr.nativeCommand !== 'string') pr.nativeCommand = '';
          if (!Array.isArray(pr.nativeArgs)) pr.nativeArgs = [];
        }
      });
    }));
  } catch {}
  applyTheme();
  // Apply persisted glow preferences
  try {
    const gs = STATE.settings;
    if (gs) {
      if (gs.glowColor) document.documentElement.style.setProperty('--glow-color', gs.glowColor);
      document.body?.classList.toggle('disable-glow', gs.glowEnabled === false);
    }
    // Contrast safeguard: if glow-color is too light (luminance heuristic), darken slightly
    if (gs?.glowColor) {
      const hex = gs.glowColor.replace('#','');
      if (hex.length === 6) {
        const r=parseInt(hex.slice(0,2),16), g=parseInt(hex.slice(2,4),16), b=parseInt(hex.slice(4,6),16);
        const lum = (0.2126*r + 0.7152*g + 0.0722*b)/255; // relative luminance approx
        if (lum > 0.82) { // very light; clamp
          const nr = Math.round(r*0.75), ng=Math.round(g*0.75), nb=Math.round(b*0.75);
          const safe = '#' + [nr,ng,nb].map(v=>v.toString(16).padStart(2,'0')).join('');
          document.documentElement.style.setProperty('--glow-color', safe);
        }
      }
      // Maintain derived rings (optional centralization)
      const style = document.documentElement.style;
      style.setProperty('--glow-ring-1', '0 0 0 1px color-mix(in srgb, var(--glow-color) 60%, transparent)');
      style.setProperty('--glow-ring-2', '0 0 0 6px color-mix(in srgb, var(--glow-color) 35%, transparent)');
      style.setProperty('--glow-bloom', '0 0 28px -4px color-mix(in srgb, var(--glow-color) 55%, transparent)');
    }
  } catch {}
}

// Migration: remove deprecated openInNewTab setting if present
export function migrateSettings() {
  try {
    if ('openInNewTab' in (STATE.settings||{})) {
      delete STATE.settings.openInNewTab;
      saveStateNow();
    }
  } catch {}
}

/** Debounced persistence (coalesces rapid updates). */
export const saveState = debounce(async () => {
  await chrome.storage.local.set({ state: STATE });
}, 150);

/** Immediate persistence (non-debounced). */
export async function saveStateNow() {
  await chrome.storage.local.set({ state: STATE });
}

/** Apply theme setting (system/light/dark) to <html>. */
export function applyTheme() {
  const root = document.documentElement;
  const theme = STATE.settings?.theme || "system";
  if (theme === "system") root.removeAttribute("data-theme");
  else if (["light","dark","crimson"].includes(theme)) root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

// shared getters
/** Return currently selected page object. */
export function getSelectedPage() {
  return STATE.pages.find(p => p.id === STATE.selectedPageId);
}

function isPersistedStateValid(state) {
  return !!(state && typeof state === "object" && Array.isArray(state.pages));
}
