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
  private domainsListElement: HTMLElement | null = null;

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

  private setupSessionViewToggle(): void {
    const toggle = document.getElementById("sessionsViewToggle");
    if (!toggle) return;

    const buttons = Array.from(toggle.querySelectorAll<HTMLButtonElement>(".view-btn"));
    if (buttons.length === 0) return;

    const saved = (localStorage.getItem("bitx_session_list_view") ?? "list") as "list" | "grid";
    const initialView: "list" | "grid" = saved === "grid" ? "grid" : "list";

    this.applySessionView(initialView);

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = (btn.dataset.view as "list" | "grid") ?? "list";
        this.applySessionView(view);
        localStorage.setItem("bitx_session_list_view", view);
        this.renderSessionsList();
      });
    });
  }

  private applySessionView(view: "list" | "grid"): void {
    this.sessionList.setViewMode(view);

    const toggle = document.getElementById("sessionsViewToggle");
    toggle?.querySelectorAll<HTMLButtonElement>(".view-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
  }
  private setupMainTabs(): void {
    const container = document.getElementById("mainTabs");
    if (!container) return;

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>(".main-tab"));
    const panels = Array.from(document.querySelectorAll<HTMLElement>(".main-panel[data-main-panel]"));

    if (tabs.length === 0 || panels.length === 0) return;

    const saved = (localStorage.getItem("bitx_main_tab") ?? "sessions") as "sessions" | "domains";
    const initial: "sessions" | "domains" = saved === "domains" ? "domains" : "sessions";
    this.setMainTab(initial);

    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = (btn.dataset.main as "sessions" | "domains") ?? "sessions";
        this.setMainTab(tab);
        localStorage.setItem("bitx_main_tab", tab);
      });
    });
  }

  private setMainTab(tab: "sessions" | "domains"): void {
    const container = document.getElementById("mainTabs");
    if (!container) return;

    container.querySelectorAll<HTMLButtonElement>(".main-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.main === tab);
    });

    document.querySelectorAll<HTMLElement>(".main-panel[data-main-panel]").forEach((p) => {
      p.classList.toggle("active", p.dataset.mainPanel === tab);
    });
  }

  private setupDomainsViewToggle(): void {
    const toggle = document.getElementById("domainsViewToggle");
    const list = document.getElementById("domainsList");

    this.domainsListElement = list;

    if (!toggle || !list) return;

    const buttons = Array.from(toggle.querySelectorAll<HTMLButtonElement>(".view-btn"));
    if (buttons.length === 0) return;

    const saved = (localStorage.getItem("bitx_domain_list_view") ?? "list") as "list" | "grid";
    const initialView: "list" | "grid" = saved === "grid" ? "grid" : "list";

    this.applyDomainsView(initialView);

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = (btn.dataset.view as "list" | "grid") ?? "list";
        this.applyDomainsView(view);
        localStorage.setItem("bitx_domain_list_view", view);
      });
    });
  }

  private applyDomainsView(view: "list" | "grid"): void {
    if (!this.domainsListElement) return;

    this.domainsListElement.classList.toggle("view-list", view === "list");
    this.domainsListElement.classList.toggle("view-grid", view === "grid");

    const toggle = document.getElementById("domainsViewToggle");
    toggle?.querySelectorAll<HTMLButtonElement>(".view-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
  }

  private renderDomainsList(): void {
    if (!this.domainsListElement) return;

    const state = this.popupService.getState();
    const sessions: any[] = Array.isArray(state.sessions) ? state.sessions : [];

    const counts = new Map<string, number>();
    for (const s of sessions) {
      const d = typeof s?.domain === "string" ? s.domain.trim() : "";
      if (!d) continue;
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }

    const domains = Array.from(counts.entries()).map(([domain, count]) => ({ domain, count }));

    if (domains.length === 0) {
      this.domainsListElement.innerHTML = '<div class="no-sessions">No domains saved yet</div>';
      return;
    }

    const currentDomain = state.currentDomain;

    domains.sort((a, b) => {
      if (a.domain === currentDomain) return -1;
      if (b.domain === currentDomain) return 1;
      return a.domain.localeCompare(b.domain);
    });

    this.domainsListElement.innerHTML = "";

    for (const item of domains) {
      const row = document.createElement("div");
      row.className = "domain-item";
      if (item.domain === currentDomain) row.classList.add("active");

      const title = document.createElement("div");
      title.className = "domain-title";
      title.textContent = item.domain;

      const sessionsLine = document.createElement("div");
      sessionsLine.className = "domain-sessions";
      sessionsLine.textContent = `${item.count} session${item.count === 1 ? "" : "s"}`;

      const activeLine = document.createElement("div");
      activeLine.className = "domain-active";

      const activeSessionId = (state.activeSessions as any)?.[item.domain];
      const active = activeSessionId ? sessions.find((s) => s?.id === activeSessionId) : null;
      const activeName = active?.name ? String(active.name) : "—";

      activeLine.innerHTML = `<span class="domain-active-label">Active:</span> <span class="domain-active-name">${activeName}</span>`;

      row.appendChild(title);
      row.appendChild(sessionsLine);
      row.appendChild(activeLine);

      row.addEventListener("click", () => {
        void this.openDomain(item.domain);
      });

      this.domainsListElement.appendChild(row);
    }
  }

  private async openDomain(domain: string): Promise<void> {
    try {
      const url = domain.includes("://") ? domain : `https://${domain}`;
      await chrome.tabs.create({ url });

      // optional: setelah klik domain, balik ke tab sessions
      this.setMainTab("sessions");
      localStorage.setItem("bitx_main_tab", "sessions");
    } catch (error) {
      this.showError(handleError(error, "open domain"));
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
    this.setupSessionViewToggle();
    this.setupMainTabs();
    this.setupDomainsViewToggle();
  }

  async initialize(): Promise<void> {
    try {
      this.modalManager.hideAllModals();
      const state = await this.loadingManager.withLoading(async () => {
        return await this.popupService.initialize();
      });

      this.currentSiteElement.textContent = state.currentDomain;
      this.renderSessionsList();
      this.renderDomainsList();
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
    this.renderDomainsList();
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
  setTransferView("local", "export");
  renderTransferUI();
}

function closeTransfer() {
  transferModal?.classList.remove("show");

  importFile = null;
  if (importFileInfo) importFileInfo.textContent = "";
  if (importError) importError.style.display = "none";
  if (confirmImport) confirmImport.disabled = true;
  if (importFileInput) importFileInput.value = "";

  cloudExportBlocked = false;
  cloudImportBlocked = false;

  if (cloudExportBtn) {
    cloudExportBtn.disabled = false;
    cloudExportBtn.textContent = "Generate Transfer Code";
  }

  if (cloudImportBtn) {
    cloudImportBtn.disabled = false;
    cloudImportBtn.textContent = "Import Sessions";
  }

  clearError(cloudExportError);
  clearError(cloudImportError);
  cloudImportFailCount = 0;
  cloudImportBlocked = false;
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
let cloudImportBlocked = false;

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

function showError(el: HTMLElement | null, message: string) {
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
}

function clearError(el: HTMLElement | null) {
  if (!el) return;
  el.textContent = "";
  el.style.display = "none";
}

async function buildExportData(scope: "current" | "all"): Promise<any[]> {
  if (!popupService) return [];

  const { sessions } = await chrome.storage.local.get("sessions");
  const allSessions: any[] = Array.isArray(sessions) ? sessions : [];

  if (scope === "all") return allSessions;

  const { currentDomain } = popupService.getState();
  return allSessions.filter((s) => s.domain === currentDomain);
}

const cloudExportBtn = document.getElementById("cloudExportBtn") as HTMLButtonElement | null;
const cloudExportResult = document.getElementById("cloudExportResult") as HTMLElement | null;
const transferCodeText = document.getElementById("transferCodeText") as HTMLElement | null;
const copyTransferCode = document.getElementById("copyTransferCode") as HTMLButtonElement | null;
let cloudExportBlocked = false;

const cloudExportError = document.getElementById("cloudExportError") as HTMLElement | null;

cloudExportBtn?.addEventListener("click", async () => {
  if (!cloudExportBtn || cloudExportBlocked) return;

  clearError(cloudExportError);

  cloudExportBtn.disabled = true;
  cloudExportBtn.textContent = "Generating...";

  try {
    const data = await buildExportData("all");

    if (data.length === 0) {
      showError(cloudExportError, "No sessions available to export.");
      return;
    }

    const res = await fetch("https://api.bitx.gitmeriz.my.id/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: data }),
    });

    const text = await res.text();

    if (!res.ok) {
      if (res.status === 429) {
        cloudExportBlocked = true;

        cloudExportBtn.disabled = true;
        cloudExportBtn.textContent = "Export Limit Reached";

        showError(cloudExportError, "Export limit reached. Please try again in 1 hour.");
      } else {
        showError(cloudExportError, text || "Failed to generate transfer code.");
      }
      return;
    }

    const result = JSON.parse(text);

    if (transferCodeText && cloudExportResult) {
      transferCodeText.textContent = result.transfer_code;
      cloudExportResult.style.display = "block";
    }
  } catch (err) {
    console.error("Cloud export failed:", err);
    showError(cloudExportError, "Failed to generate transfer code. Please try again.");
  } finally {
    if (!cloudExportBlocked) {
      cloudExportBtn.disabled = false;
      cloudExportBtn.textContent = "Generate Transfer Code";
    }
  }
});

copyTransferCode?.addEventListener("click", async () => {
  if (!transferCodeText) return;

  await navigator.clipboard.writeText(transferCodeText.textContent || "");
  copyTransferCode.textContent = "Copied!";
  setTimeout(() => {
    copyTransferCode.textContent = "Copy";
  }, 1200);
});

const cloudImportBtn = document.getElementById("cloudImportBtn") as HTMLButtonElement | null;
const cloudImportCode = document.getElementById("cloudImportCode") as HTMLInputElement | null;
const cloudImportError = document.getElementById("cloudImportError") as HTMLElement | null;
let cloudImportFailCount = 0;
const MAX_IMPORT_FAIL = 5;

cloudImportBtn?.addEventListener("click", async () => {
  if (!cloudImportBtn || cloudImportBlocked) return;

  clearError(cloudImportError);

  const code = cloudImportCode?.value.trim();
  if (!code) {
    showError(cloudImportError, "Please enter a transfer code.");
    return;
  }

  cloudImportBtn.disabled = true;
  cloudImportBtn.textContent = "Importing...";

  try {
    const res = await fetch("https://api.bitx.gitmeriz.my.id/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transfer_code: code }),
    });

    const text = await res.text();

    if (!res.ok) {
      if (res.status === 429) {
        cloudImportBlocked = true;

        cloudImportBtn.disabled = true;
        cloudImportBtn.textContent = "Import Limit Reached";

        showError(cloudImportError, "Import limit reached. Please try again in 1 hour.");
      } else if (res.status === 404) {
        cloudImportFailCount++;

        if (cloudImportFailCount >= MAX_IMPORT_FAIL) {
          cloudImportBlocked = true;

          cloudImportBtn.disabled = true;
          cloudImportBtn.textContent = "Too Many Attempts";

          showError(cloudImportError, "Too many invalid attempts. Please wait before trying again.");
        } else {
          showError(cloudImportError, "Invalid or expired transfer code.");
        }
      } else {
        showError(cloudImportError, "Failed to import sessions.");
      }
      return;
    }

    const result = JSON.parse(text);

    if (!Array.isArray(result.payload)) {
      throw new Error("Invalid payload format");
    }

    await mergeSessions(result.payload);

    closeTransfer();
    location.reload();
  } catch (err) {
    console.error("Cloud import failed:", err);
    showError(cloudImportError, "Failed to import sessions. Please try again.");
  } finally {
    if (!cloudImportBlocked) {
      cloudImportBtn.disabled = false;
      cloudImportBtn.textContent = "Import Sessions";
    }
  }
});

document.querySelectorAll(".modal-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.getAttribute("data-tab") as "local" | "cloud";

    activeMainTab = target;

    activeSubTab = "export";

    document.querySelectorAll(".modal-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    renderTransferUI();
  });
});

function setTransferView(main: "local" | "cloud", sub: "export" | "import") {
  // main tabs
  document.querySelectorAll(".modal-tab").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-tab") === main);
  });

  document.querySelectorAll(".transfer-panel").forEach((p) => {
    const el = p as HTMLElement;
    el.style.display = el.dataset.panel === main ? "block" : "none";
  });

  // sub tabs
  document.querySelectorAll(".sub-tab").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-subtab") === `${main}-${sub}`);
  });

  document.querySelectorAll(".sub-panel").forEach((p) => {
    const el = p as HTMLElement;
    el.style.display = el.dataset.subpanel === `${main}-${sub}` ? "block" : "none";
  });
}

let activeMainTab: "local" | "cloud" = "local";
let activeSubTab: "export" | "import" = "export";

function renderTransferUI() {
  document.querySelectorAll(".transfer-panel").forEach((panel) => {
    panel.setAttribute("style", panel.getAttribute("data-panel") === activeMainTab ? "display:block" : "display:none");
  });

  document.querySelectorAll(".transfer-panel").forEach((panel) => {
    const el = panel as HTMLElement;
    el.style.display = el.dataset.panel === activeMainTab ? "block" : "none";
  });

  document.querySelectorAll(".sub-panel").forEach((panel) => {
    panel.setAttribute(
      "style",
      panel.getAttribute("data-subpanel") === `${activeMainTab}-${activeSubTab}` ? "display:block" : "display:none"
    );
  });

  document.querySelectorAll(".sub-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.getAttribute("data-subtab") === `${activeMainTab}-${activeSubTab}`);
  });
}

document.querySelectorAll(".sub-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const key = tab.getAttribute("data-subtab")!;

    const [main, sub] = key.split("-") as ["local" | "cloud", "export" | "import"];

    activeMainTab = main;
    activeSubTab = sub;

    renderTransferUI();
  });
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
