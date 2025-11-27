import {
  collectActiveTabMetadata,
  selectBestIconForQuickSave,
  buildQuickSaveLink,
  fallbackMetadataFromDocument
} from "./quick-save.js";
import { initI18n, t, applyTranslations } from "./languages/i18n.js";
import { escapeHtml } from "./utils.js";
import { createDefaultState } from "./state.js";

const els = {};

let groupEntries = [];
let currentState = null;

document.addEventListener("DOMContentLoaded", () => {
  bootstrapPopup();
});

async function bootstrapPopup() {
  Object.assign(els, {
    select: document.getElementById("quickSaveSelect"),
    save: document.getElementById("popupSave"),
    openDashboard: document.getElementById("popupOpenDashboard"),
    newCategoryInput: document.getElementById("popupNewCategory"),
    newCategoryButton: document.getElementById("popupCreateCategory"),
    empty: document.getElementById("popupEmpty"),
    status: document.getElementById("popupStatus"),
    explainButton: document.getElementById("popupExplainButton")
  });

  setStatus(t("Loading groups..."), "loading");
  if (els.save) els.save.disabled = true;
  if (els.select) els.select.disabled = true;

  currentState = await readState();
  const state = currentState;
  const lang = state?.settings?.interfaceLanguage || "en";
  initI18n(lang);
  applyTranslations(document);

  groupEntries = listGroupEntries(state);
  const defaultGroupId = getPreferredGroupId(state, groupEntries);
  renderOptions(groupEntries, defaultGroupId);

  const hasGroups = groupEntries.length > 0;
  toggleEmptyState(!hasGroups);
  if (els.select) els.select.disabled = !hasGroups;
  if (els.save) els.save.disabled = !hasGroups;

  setStatus(
    hasGroups ? t("Select a category to enable saving.") : t("No groups yet. Open the dashboard to add one."),
    hasGroups ? "idle" : "error"
  );

  els.select?.addEventListener("change", () => {
    if (!els.save || !els.select) return;
    els.save.disabled = !els.select.value;
    if (!els.select.value) setStatus(t("Select a category to enable saving."), "idle");
  });
  els.save?.addEventListener("click", handleSaveClick);
  els.openDashboard?.addEventListener("click", openDashboard);
  els.newCategoryButton?.addEventListener("click", handleCreateCategory);
  els.newCategoryInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateCategory();
    }
  });
  els.explainButton?.addEventListener("click", openExplainerWindow);
}

async function handleSaveClick() {
  const targetGroupId = els.select.value;
  if (!targetGroupId) {
    setStatus(t("Please choose a category."), "error");
    return;
  }

  els.save.disabled = true;
  setStatus(t("Collecting page details..."), "loading");

  let meta;
  try {
    meta = await collectActiveTabMetadata();
    if (!meta?.url) meta = fallbackMetadataFromDocument();
    meta.bestIcon = await selectBestIconForQuickSave(meta);
  } catch {
    meta = fallbackMetadataFromDocument();
    meta.bestIcon = meta.favicon || "";
  }

  try {
    await persistLink(targetGroupId, meta);
    setStatus(t("Saved!"), "success");
    window.setTimeout(() => window.close(), 1200);
  } catch (err) {
    console.error("[popup] quick save failed", err);
    setStatus(t("Failed to save link. Please try again."), "error");
    els.save.disabled = false;
  }
}

async function persistLink(groupId, meta) {
  const { state } = await chrome.storage.local.get(["state"]);
  if (!state || !Array.isArray(state.pages)) throw new Error("no-state");

  const entry = findGroupEntry(state, groupId);
  if (!entry) throw new Error("missing-group");

  if (!Array.isArray(entry.group.links)) entry.group.links = [];
  const link = buildQuickSaveLink(meta);
  entry.group.links.push(link);
  state.selectedPageId = entry.page.id;

  await chrome.storage.local.set({ state });
  try {
    chrome.runtime.sendMessage({ type: "sd-state-updated" });
  } catch {}
}

function renderOptions(entries, defaultGroupId) {
  if (!els.select) return;
  if (!entries.length) {
    els.select.innerHTML = "";
    return;
  }

  const grouped = new Map();
  entries.forEach((entry) => {
    if (!grouped.has(entry.page.id)) grouped.set(entry.page.id, { page: entry.page, groups: [] });
    grouped.get(entry.page.id).groups.push(entry.group);
  });

  let html = "";
  grouped.forEach(({ page, groups }) => {
    if (!groups.length) return;
    const pageLabel = escapeHtml(page.name || t("Untitled"));
    html += `<optgroup label="${pageLabel}">`;
    groups.forEach((group) => {
      const selected = group.id === defaultGroupId ? " selected" : "";
      const label = escapeHtml(group.name || t("Group"));
      html += `<option value="${group.id}"${selected}>${label}</option>`;
    });
    html += "</optgroup>";
  });

  els.select.innerHTML = html;
  if (defaultGroupId) els.select.value = defaultGroupId;
}

function listGroupEntries(state) {
  const entries = [];
  if (!state?.pages) return entries;
  state.pages.forEach((page) => {
    if (!Array.isArray(page.groups)) return;
    page.groups.forEach((group) => entries.push({ page, group }));
  });
  return entries;
}

function findGroupEntry(state, groupId) {
  for (const page of state.pages || []) {
    for (const group of page.groups || []) {
      if (group.id === groupId) return { page, group };
    }
  }
  return null;
}

function getPreferredGroupId(state, entries) {
  if (!entries.length) return null;
  const selectedPageId = state?.selectedPageId;
  const match = entries.find((entry) => entry.page.id === selectedPageId);
  return (match || entries[0]).group.id;
}

async function readState() {
  let state = null;
  try {
    const res = await chrome.storage.local.get(["state"]);
    state = res?.state ?? null;
  } catch {
    state = null;
  }

  if (isPersistedStateValid(state)) return state;

  const fallback = createDefaultState();
  try {
    await chrome.storage.local.set({ state: fallback });
  } catch {}
  return fallback;
}

function toggleEmptyState(show) {
  if (!els.empty) return;
  els.empty.hidden = !show;
}

function setStatus(message, variant = "idle") {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.classList.remove("success", "error", "loading");
  if (variant === "success") els.status.classList.add("success");
  else if (variant === "error") els.status.classList.add("error");
  else if (variant === "loading") els.status.classList.add("loading");
}

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  window.close();
}

async function handleCreateCategory() {
  if (!els.newCategoryInput) return;
  const raw = els.newCategoryInput.value.trim();
  if (!raw) {
    setStatus(t("Enter a category name to continue."), "error");
    els.newCategoryInput.focus();
    return;
  }

  if (els.newCategoryButton) els.newCategoryButton.disabled = true;
  setStatus(t("Creating category..."), "loading");

  try {
    const { groupId } = await createCategory(raw);
    groupEntries = listGroupEntries(currentState);
    renderOptions(groupEntries, groupId);
    toggleEmptyState(false);
    if (els.select) {
      els.select.disabled = false;
      els.select.value = groupId;
    }
    if (els.save) els.save.disabled = false;
    els.newCategoryInput.value = "";
    setStatus(t("Select a category to enable saving."), "idle");
  } catch (err) {
    console.error("[popup] create category failed", err);
    setStatus(t("Failed to create category. Try again."), "error");
  } finally {
    if (els.newCategoryButton) els.newCategoryButton.disabled = false;
  }
}

async function createCategory(name) {
  const state = currentState || (await readState());
  if (!Array.isArray(state.pages)) state.pages = [];

  const pageId = randomId("page");
  const groupId = randomId("grp");
  const newPage = {
    id: pageId,
    name,
    groups: [
      {
        id: groupId,
        name,
        links: [],
        widgets: [],
        programs: []
      }
    ]
  };

  state.pages.push(newPage);
  state.selectedPageId = pageId;
  currentState = state;

  await chrome.storage.local.set({ state });
  try {
    chrome.runtime.sendMessage({ type: "sd-state-updated" });
  } catch {}

  return { pageId, groupId };
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function isPersistedStateValid(state) {
  return !!(state && typeof state === "object" && Array.isArray(state.pages));
}

function openExplainerWindow() {
  try {
    const url = chrome.runtime.getURL("popup-explain.html");
    const width = 360;
    const height = 400;
    const left = Math.round((window.screen.width - width) / 2);
    const top = Math.round((window.screen.height - height) / 2);
    window.open(
      url,
      "mccExplain",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes`
    );
  } catch {
    alert(
      "Use this mini control center to capture the current tab.\n\n" +
        "• Create a new category to spin up a page + group.\n" +
        "• Destination category lists every existing group.\n" +
        "• Save to Extension stores the tab title, URL, and icon.\n" +
        "• Open Dashboard jumps to the full editor."
    );
  }
}
