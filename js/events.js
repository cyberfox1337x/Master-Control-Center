// events.js — central click delegation
import { $ } from "./utils.js";
import { exportJson, handleResetAll } from "./actions.js";
import { openPageModal, handleDeletePage, openGroupModal, deleteGroup, openLinkModal, closeModal, openQuickSaveModal } from "./modals.js";
import { toggleGroupEdit } from "./render-groups.js";

/** Attach single document click listener handling [data-action] elements (delegation). */
export function wireClickDelegation() {
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;

    switch (action) {
      case "addPage":
        openPageModal(); break;
      case "renamePage":
        openPageModal(btn.dataset.pageId); break;
      case "deletePage":
        await handleDeletePage(btn.dataset.pageId); break;

      case "toggleSettings":
        const panel = $("#settingsPanel");

        // 1. Alterna a classe 'open' (como você já fazia)
        //    e armazena o novo estado (true = aberto, false = fechado)
        const isOpen = panel.classList.toggle("open");

        // 2. Encontra *todos* os botões que controlam o painel
        const toggleButtons = document.querySelectorAll('[data-action="toggleSettings"]');

        // 3. Atualiza o 'aria-expanded' em todos eles (bom para acessibilidade)
        toggleButtons.forEach(button => {
          button.setAttribute('aria-expanded', isOpen.toString());
        });

        break;


      case "exportJson":
        await exportJson(); break;
      case "resetAll":
        await handleResetAll(); break;

      case "addGroup":
        openGroupModal(); break;
      case "deleteGroup":
        deleteGroup(btn.dataset.groupId); break;

      case "quickSave":
        openQuickSaveModal(); break;

      case "addLink":
        openLinkModal(btn.dataset.groupId); break;

      case "toggleGroupEdit":
        toggleGroupEdit(btn.dataset.groupId); break;

      case "editLink":
        openLinkModal(btn.dataset.groupId, btn.dataset.linkId); break;

      case "deleteLink": {
        // Deprecated path (kept for safety)
        // Prefer edit via Edit Apps mode + delete inside modal
        break;
      }

      case "closeModal":
        closeModal(); break;
    }
  });
}
