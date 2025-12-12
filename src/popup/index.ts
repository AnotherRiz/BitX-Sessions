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
        // If another session already has this name, delete it (so we can keep the current sessionId + order).
        const conflict = this.findSessionByNameInCurrentDomain(newName, currentRenameSessionId);
        if (conflict) {
          await this.popupService.deleteSession(conflict.id);
        }

        // ✅ overwrite in-place (keeps id + order)
        await this.popupService.overwriteSessionWithCurrent(currentRenameSessionId, newName);
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

let popupService: PopupService | null = null;

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Session Switcher popup loaded");
  const controller = new PopupController();
  await controller.initialize();

  popupService = controller.getServiceInstance();
  const state = popupService.getState();

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
        openTransferModal("export");
        break;

      case "import":
        openTransferModal("import");
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

type TransferTab = "export" | "import";

const transferModal = document.getElementById("transferModal") as HTMLElement | null;
const closeTransferModal = document.getElementById("closeTransferModal") as HTMLElement | null;
const transferTabExport = document.getElementById("transferTabExport") as HTMLButtonElement | null;
const transferTabImport = document.getElementById("transferTabImport") as HTMLButtonElement | null;
const transferPanels = Array.from(document.querySelectorAll<HTMLElement>(".transfer-panel"));
const transferFooters = Array.from(document.querySelectorAll<HTMLElement>(".transfer-footer"));
const cancelTransfer = document.getElementById("cancelTransfer") as HTMLElement | null;
const cancelTransfer2 = document.getElementById("cancelTransfer2") as HTMLElement | null;
const confirmExport = document.getElementById("confirmExport") as HTMLButtonElement | null;
const importFileInput = document.getElementById("importFileInput") as HTMLInputElement | null;
const importFileInfo = document.getElementById("importFileInfo") as HTMLElement | null;
const importError = document.getElementById("importError") as HTMLElement | null;
const confirmImport = document.getElementById("confirmImport") as HTMLButtonElement | null;

let importFile: File | null = null;

const exportError = document.getElementById("exportError") as HTMLElement | null;

async function exportSessions(scope: "current" | "all") {
  if (!popupService) return;

  if (exportError) exportError.style.display = "none";

  const { sessions } = await chrome.storage.local.get("sessions");

  const allSessions = Array.isArray(sessions) ? sessions : [];

  let exportData = allSessions;

  if (scope === "current") {
    const { currentDomain } = popupService.getState();

    exportData = allSessions.filter((session: any) => session.domain === currentDomain);
  }

  if (exportData.length === 0) {
    if (exportError) {
      exportError.textContent = "No sessions found for current site.";
      exportError.style.display = "block";
    }
    return;
  }

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  function sanitizeFileName(name: string): string {
    return name
      .replace(/^https?:\/\//, "")
      .replace(/[\/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "-")
      .toLowerCase();
  }

  const a = document.createElement("a");
  a.href = url;

  if (scope === "all") {
    a.download = "BitXSessions-AllSessions.json";
  } else {
    const { currentDomain } = popupService.getState();
    const safeDomain = sanitizeFileName(currentDomain || "unknown-site");
    a.download = `BitXSessions-${safeDomain}.json`;
  }

  a.click();
  URL.revokeObjectURL(url);
}

confirmExport?.addEventListener("click", async () => {
  const scope = getExportScope();
  await exportSessions(scope);
});

function setActiveTransferTab(tab: TransferTab) {
  if (exportError) exportError.style.display = "none";
  transferTabExport?.classList.toggle("active", tab === "export");
  transferTabImport?.classList.toggle("active", tab === "import");

  transferPanels.forEach((el) => {
    el.style.display = el.dataset.panel === tab ? "block" : "none";
  });

  // footers
  transferFooters.forEach((el) => {
    el.style.display = el.dataset.footer === tab ? "flex" : "none";
  });
}

export function openTransferModal(tab: TransferTab) {
  transferModal?.classList.add("show");
  if (exportError) exportError.style.display = "none";
  setActiveTransferTab(tab);
}

function closeTransfer() {
  transferModal?.classList.remove("show");

  importFile = null;
  if (importFileInfo) importFileInfo.textContent = "";
  if (importError) importError.style.display = "none";
  if (confirmImport) confirmImport.disabled = true;
  if (importFileInput) importFileInput.value = "";
}

function getExportScope(): "current" | "all" {
  const checked = document.querySelector<HTMLInputElement>('input[name="exportScope"]:checked');

  return checked?.value === "all" ? "all" : "current";
}

closeTransferModal?.addEventListener("click", closeTransfer);
cancelTransfer?.addEventListener("click", closeTransfer);
cancelTransfer2?.addEventListener("click", closeTransfer);

transferTabExport?.addEventListener("click", () => setActiveTransferTab("export"));
transferTabImport?.addEventListener("click", () => setActiveTransferTab("import"));

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

async function mergeSessions(importedSessions: any[]) {
  const { sessions } = await chrome.storage.local.get("sessions");
  const existing: any[] = Array.isArray(sessions) ? sessions : [];

  if (importedSessions.length === 0) return;

  const importedDomains = new Set(importedSessions.map((s) => s.domain).filter(Boolean));

  const keptSessions = existing.filter((s) => !importedDomains.has(s.domain));

  await chrome.storage.local.set({
    sessions: [...keptSessions, ...importedSessions],
  });
}

confirmImport?.addEventListener("click", async () => {
  if (!importFile) return;

  if (importError) importError.style.display = "none";

  try {
    const text = await importFile.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data)) {
      throw new Error("Invalid import format");
    }

    await mergeSessions(data);

    closeTransfer();
    location.reload();
  } catch (err) {
    console.error("Import failed:", err);
    if (importError) {
      importError.textContent = "Invalid or unsupported session file.";
      importError.style.display = "block";
    }
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
