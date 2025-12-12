import { getDomainFromUrl } from "@shared/utils/domain";
import { handleError } from "@shared/utils/errorHandling";
import { LoadingManager } from "./components/loadingManager";
import { ModalManager } from "./components/modalManager";
import { SessionList } from "./components/sessionList";
import { PopupService } from "./services/popup.service";
import { getElementByIdSafe } from "./utils/dom";

class PopupController {
  private loadingManager = new LoadingManager();
  private modalManager = new ModalManager();
  private sessionList: SessionList;
  private popupService = new PopupService();

  private currentSiteElement: HTMLElement;
  private saveBtn: HTMLButtonElement;
  private newSessionBtn: HTMLButtonElement;
  private handleCancelRename(): void {
    this.popupService.setState({ currentRenameSessionId: "" });
    this.modalManager.hideRenameModal();
  }

  private findSessionByNameInCurrentDomain(name: string, excludeId?: string) {
    const state = this.popupService.getState();
    const target = name.trim().toLowerCase();

    return state.sessions.find(
      (s) => s.domain === state.currentDomain && s.id !== excludeId && s.name.trim().toLowerCase() === target
    );
  }
  private async handleOverwriteRename(): Promise<void> {
    try {
      const newName = this.modalManager.getRenameModalInput();
      const { currentRenameSessionId } = this.popupService.getState();

      if (!newName || !currentRenameSessionId) {
        this.modalManager.hideRenameModal();
        return;
      }

      await this.loadingManager.withLoading(async () => {
        const conflict = this.findSessionByNameInCurrentDomain(newName, currentRenameSessionId);

        if (conflict) {
          await this.popupService.deleteSession(conflict.id);
        }

        await this.popupService.deleteSession(currentRenameSessionId);

        await this.popupService.saveCurrentSession(newName);
      });

      this.popupService.setState({ currentRenameSessionId: "" });
      this.modalManager.hideRenameModal();
      this.renderSessionsList();
    } catch (error) {
      this.showError(handleError(error, "overwrite session"));
    }
  }

  constructor() {
    // Get DOM elements
    this.currentSiteElement = getElementByIdSafe("currentSite");
    this.saveBtn = getElementByIdSafe("saveBtn");
    this.newSessionBtn = getElementByIdSafe("newSessionBtn");

    // Initialize session list
    this.sessionList = new SessionList(getElementByIdSafe("sessionsList"));
    this.setupSessionListHandlers();
    this.setupEventListeners();
  }

  async initialize(): Promise<void> {
    try {
      this.modalManager.hideAllModals();
      const state = await this.loadingManager.withLoading(async () => {
        return await this.popupService.initialize();
      });

      this.currentSiteElement.textContent = state.currentDomain;
      this.renderSessionsList();
    } catch (error) {
      this.showError(handleError(error, "PopupController.initialize"));
    }
  }

  getServiceInstance(): PopupService {
    return this.popupService;
  }

  private setupEventListeners(): void {
    this.saveBtn.addEventListener("click", () => this.handleSaveClick());
    this.newSessionBtn.addEventListener("click", () => this.handleNewSessionClick());
    getElementByIdSafe("overwriteRename").addEventListener("click", () => this.handleOverwriteRename());
    getElementByIdSafe("cancelRename").addEventListener("click", () => this.handleCancelRename());
    getElementByIdSafe("closeRenameModal").addEventListener("click", () => this.handleCancelRename());

    getElementByIdSafe("confirmSave").addEventListener("click", () => this.handleConfirmSave());
    getElementByIdSafe("confirmRename").addEventListener("click", () => this.handleConfirmRename());
    getElementByIdSafe("confirmDelete").addEventListener("click", () => this.handleConfirmDelete());
  }

  private setupSessionListHandlers(): void {
    this.sessionList.setEventHandlers({
      onSessionClick: (sessionId) => this.handleSessionSwitch(sessionId),
      onRenameClick: (sessionId) => this.handleRenameClick(sessionId),
      onDeleteClick: (sessionId) => this.handleDeleteClick(sessionId),
      onReorder: (sessionIds) => this.handleReorder(sessionIds),
    });
  }

  private async handleSaveClick(): Promise<void> {
    this.modalManager.showSaveModal();
  }

  private async handleConfirmSave(): Promise<void> {
    try {
      const name = this.modalManager.getSaveModalInput();

      await this.loadingManager.withLoading(async () => {
        await this.popupService.saveCurrentSession(name);
      });

      this.modalManager.hideSaveModal();
      this.renderSessionsList();
    } catch (error) {
      this.showError(handleError(error, "save session"));
    }
  }

  private async handleNewSessionClick(): Promise<void> {
    try {
      await this.loadingManager.withLoading(async () => {
        await this.popupService.createNewSession();
      });

      this.renderSessionsList();
    } catch (error) {
      this.showError(handleError(error, "create new session"));
    }
  }

  private async handleSessionSwitch(sessionId: string): Promise<void> {
    try {
      await this.loadingManager.withLoading(async () => {
        await this.popupService.switchToSession(sessionId);
      });

      this.renderSessionsList();
    } catch (error) {
      this.showError(handleError(error, "switch session"));
    }
  }

  private handleRenameClick(sessionId: string): void {
    const session = this.popupService.getSession(sessionId);
    if (session) {
      this.popupService.setState({ currentRenameSessionId: sessionId });
      this.modalManager.showRenameModal(session.name);
    }
  }

  private async handleConfirmRename(): Promise<void> {
    try {
      const newName = this.modalManager.getRenameModalInput();
      const sessionId = this.popupService.getState().currentRenameSessionId;

      if (newName && sessionId) {
        await this.popupService.renameSession(sessionId, newName);
        this.renderSessionsList();
      }

      this.modalManager.hideRenameModal();
    } catch (error) {
      this.showError(handleError(error, "rename session"));
    }
  }

  private handleDeleteClick(sessionId: string): void {
    const session = this.popupService.getSession(sessionId);
    if (session) {
      this.popupService.setState({ currentDeleteSessionId: sessionId });
      this.modalManager.showDeleteModal(session.name);
    }
  }

  private async handleConfirmDelete(): Promise<void> {
    try {
      const sessionId = this.popupService.getState().currentDeleteSessionId;

      if (sessionId) {
        await this.popupService.deleteSession(sessionId);
        this.renderSessionsList();
      }

      this.modalManager.hideDeleteModal();
    } catch (error) {
      this.showError(handleError(error, "delete session"));
    }
  }

  private async handleReorder(sessionIds: string[]): Promise<void> {
    try {
      await this.popupService.reorderSessions(sessionIds);
    } catch (error) {
      this.showError(handleError(error, "reorder sessions"));
    }
  }

  private renderSessionsList(): void {
    const state = this.popupService.getState();
    this.sessionList.render(state.sessions, state.activeSessions, state.currentDomain);
  }

  private showError(message: string): void {
    console.error("Popup error:", message);

    this.modalManager.showErrorModal(message);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Session Switcher popup loaded");
  const controller = new PopupController();
  await controller.initialize();

  const service = controller.getServiceInstance();
  const state = service.getState();

  let currentDomain = state.currentDomain;

  const tabActivatedListener = async (activeInfo: { tabId: number }) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      const newDomain = getDomainFromUrl(tab.url);
      if (newDomain !== currentDomain) {
        currentDomain = newDomain;
        await controller.initialize();
      }
    }
  };

  const tabUpdatedListener = async (_: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
    if (changeInfo.status === "complete" && tab.url) {
      const newDomain = getDomainFromUrl(tab.url);
      if (newDomain !== currentDomain) {
        currentDomain = newDomain;
        await controller.initialize();
      }
    }
  };

  chrome.tabs.onActivated.addListener(tabActivatedListener);
  chrome.tabs.onUpdated.addListener(tabUpdatedListener);

  const cleanup = () => {
    chrome.tabs.onActivated.removeListener(tabActivatedListener);
    chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
  };

  window.addEventListener("beforeunload", cleanup);
  window.addEventListener("unload", cleanup);
});

document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("menuBtn") as HTMLElement | null;
  const dropdownMenu = document.getElementById("dropdownMenu") as HTMLElement | null;

  if (!menuBtn || !dropdownMenu) return;

  menuBtn.addEventListener("click", (e: MouseEvent) => {
    e.stopPropagation();

    const isOpen = dropdownMenu.style.display === "block";
    dropdownMenu.style.display = isOpen ? "none" : "block";
  });

  document.addEventListener("click", (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    if (dropdownMenu.style.display === "block" && !dropdownMenu.contains(target) && !menuBtn.contains(target)) {
      dropdownMenu.style.display = "none";
    }
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const dropdown = document.getElementById("dropdownMenu");

  if (!dropdown) return;

  dropdown.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target.dataset.action) return;

    const action = target.dataset.action;

    switch (action) {
      case "export":
        exportSessions();
        break;

      case "import":
        openImportModal();
        break;

      case "clear":
        openClearAllModal();
        break;

      case "help":
        openHelpModal();
        break;

      case "about":
        openAboutModal();
        break;
    }
  });
});

async function exportSessions() {
  const { sessions } = await chrome.storage.local.get("sessions");

  const json = JSON.stringify(sessions ?? {}, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "BitXSessions-backup.json";
  a.click();

  URL.revokeObjectURL(url);
}

const importModal = document.getElementById("importModal") as HTMLElement | null;
const importFileInput = document.getElementById("importFileInput") as HTMLInputElement | null;
const importFileInfo = document.getElementById("importFileInfo") as HTMLElement | null;
const importError = document.getElementById("importError") as HTMLElement | null;
const closeImportModal = document.getElementById("closeImportModal") as HTMLElement | null;
const cancelImport = document.getElementById("cancelImport") as HTMLElement | null;
const confirmImport = document.getElementById("confirmImport") as HTMLButtonElement | null;

let importFile: File | null = null;

export function openImportModal() {
  importModal?.classList.add("show");
}

function closeImport() {
  importModal?.classList.remove("show");
  importFile = null;

  if (importFileInfo) importFileInfo.textContent = "";
  if (importError) importError.style.display = "none";
  if (confirmImport) confirmImport.disabled = true;

  importFileInput!.value = "";
}

closeImportModal?.addEventListener("click", closeImport);
cancelImport?.addEventListener("click", closeImport);

importFileInput?.addEventListener("change", () => {
  importFile = importFileInput.files?.[0] ?? null;

  if (!importFile) {
    confirmImport!.disabled = true;
    importFileInfo!.textContent = "";
    return;
  }

  importFileInfo!.textContent = `Selected: ${importFile.name} (${(importFile.size / 1024).toFixed(1)} KB)`;
  confirmImport!.disabled = false;
});

confirmImport?.addEventListener("click", async () => {
  if (!importFile) return;

  try {
    const text = await importFile.text();
    const data = JSON.parse(text);

    await chrome.storage.local.set({ sessions: data });

    closeImport();

    location.reload();
  } catch (err) {
    console.error(err);
    importError!.textContent = "Invalid JSON file.";
    importError!.style.display = "block";
  }
});

const clearAllModal = document.getElementById("clearAllModal") as HTMLElement | null;
const closeClearAllModal = document.getElementById("closeClearAllModal") as HTMLElement | null;
const cancelClearAll = document.getElementById("cancelClearAll") as HTMLElement | null;
const confirmClearAll = document.getElementById("confirmClearAll") as HTMLElement | null;

function openClearAllModal() {
  clearAllModal?.classList.add("show");
}

function closeClearAll() {
  clearAllModal?.classList.remove("show");
}

closeClearAllModal?.addEventListener("click", closeClearAll);
cancelClearAll?.addEventListener("click", closeClearAll);

confirmClearAll?.addEventListener("click", async () => {
  await chrome.storage.local.set({ sessions: {} });
  closeClearAll();
  location.reload();
});

const helpModal = document.getElementById("helpModal") as HTMLElement | null;
const closeHelpModal = document.getElementById("closeHelpModal");
const closeHelpBtn = document.getElementById("closeHelpBtn");

export function openHelpModal() {
  helpModal?.classList.add("show");
}

function closeHelp() {
  helpModal?.classList.remove("show");
}

closeHelpModal?.addEventListener("click", closeHelp);
closeHelpBtn?.addEventListener("click", closeHelp);

const aboutModal = document.getElementById("aboutModal") as HTMLElement | null;
const closeAboutModal = document.getElementById("closeAboutModal");
const closeAboutBtn = document.getElementById("closeAboutBtn");

export function openAboutModal() {
  aboutModal?.classList.add("show");
}

function closeAbout() {
  aboutModal?.classList.remove("show");
}

closeAboutModal?.addEventListener("click", closeAbout);
closeAboutBtn?.addEventListener("click", closeAbout);
