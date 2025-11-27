// quick-save.js - shared helpers for capturing metadata + building links
import { uid, normaliseUrl, faviconFor, checkImage } from "./utils.js";
import { t } from "./languages/i18n.js";

export function fallbackTitleFromUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    return (u.hostname || url).replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export async function collectActiveTabMetadata() {
  if (typeof chrome === "undefined" || !chrome?.tabs?.query) {
    return fallbackMetadataFromDocument();
  }

  let activeTab = null;
  try {
    const tabs = await new Promise((resolve, reject) => {
      try {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (res) => {
          if (chrome.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(res || []);
        });
      } catch (err) {
        reject(err);
      }
    });
    activeTab = (tabs && tabs[0]) || null;
  } catch {
    return fallbackMetadataFromDocument();
  }

  if (!activeTab) return fallbackMetadataFromDocument();

  const meta = {
    title: activeTab.title || "",
    url: activeTab.url || "",
    favicon: activeTab.favIconUrl || "",
    image: ""
  };

  if (chrome?.scripting?.executeScript && activeTab.id != null && isInjectableUrl(meta.url)) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
          const pickIcon = () => {
            const selectors = [
              "link[rel='icon']",
              "link[rel='shortcut icon']",
              "link[rel='apple-touch-icon']",
              "link[rel='apple-touch-icon-precomposed']",
              "link[rel^='icon']"
            ];
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el && el.href) return el.href;
            }
            return "";
          };

          const pickImage = () => {
            const selectors = [
              "meta[property='og:image']",
              "meta[name='og:image']",
              "meta[property='twitter:image']",
              "meta[name='twitter:image']",
              "meta[name='image']"
            ];
            for (const sel of selectors) {
              const tag = document.querySelector(sel);
              if (tag && tag.content) return tag.content;
            }
            return "";
          };

          return {
            title: document.title || "",
            url: location.href,
            favicon: pickIcon(),
            image: pickImage()
          };
        }
      });
      if (result && result.result) {
        const injected = result.result;
        if (injected.title) meta.title = injected.title;
        if (injected.url) meta.url = injected.url;
        if (injected.favicon) meta.favicon = injected.favicon;
        if (injected.image) meta.image = injected.image;
      }
    } catch (err) {
      console.warn("[quickSave] executeScript failed", err);
    }
  }

  return meta;
}

export function fallbackMetadataFromDocument() {
  const doc = typeof document !== "undefined" ? document : null;
  const win = typeof window !== "undefined" ? window : null;

  const meta = {
    title: doc?.title || "",
    url: win?.location?.href || "",
    favicon: "",
    image: ""
  };

  try {
    const icon = doc?.querySelector("link[rel='icon'], link[rel='shortcut icon']");
    if (icon?.href) meta.favicon = icon.href;
  } catch {}

  return meta;
}

export function isInjectableUrl(url = "") {
  if (typeof url !== "string") return false;
  return !/^(chrome|edge|about|devtools):/i.test(url);
}

export async function selectBestIconForQuickSave(meta = {}) {
  const candidates = [];
  const baseUrl = meta.url || "";

  const metaImage = resolveAssetUrl(meta.image, baseUrl);
  if (metaImage) candidates.push(metaImage);

  const metaFavicon = resolveAssetUrl(meta.favicon, baseUrl);
  if (metaFavicon) candidates.push(metaFavicon);

  if (baseUrl) {
    try {
      const fallbackIcon = faviconFor(baseUrl);
      if (fallbackIcon) candidates.push(fallbackIcon);
    } catch {}
  }

  const seen = new Set();
  for (const candidate of candidates) {
    const clean = (candidate || "").trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    if (/^(chrome|edge|about|devtools):/i.test(clean)) continue;
    try {
      if (await checkImage(clean)) return clean;
    } catch {}
  }

  return "";
}

export function resolveAssetUrl(candidate, baseUrl) {
  if (!candidate) return "";
  const value = String(candidate).trim();
  if (!value) return "";
  if (/^data:/i.test(value)) return value;
  if (/^[a-z][a-z0-9+\-.]*:/i.test(value)) return value;
  try {
    if (baseUrl) return new URL(value, baseUrl).toString();
    return new URL(value).toString();
  } catch {
    return value;
  }
}

export function buildQuickSaveLink(meta = {}) {
  const normalisedUrl = normaliseUrl(meta.url || "");
  if (!normalisedUrl) throw new Error("missing-url");
  const title = (meta.title || "").trim() || fallbackTitleFromUrl(normalisedUrl) || t("Untitled");
  const iconUrl = meta.bestIcon || "";

  const payload = {
    id: uid("lnk"),
    title,
    url: normalisedUrl,
    iconType: iconUrl ? "url" : "auto"
  };

  if (iconUrl) payload.iconUrl = iconUrl;
  else delete payload.iconUrl;

  return payload;
}
