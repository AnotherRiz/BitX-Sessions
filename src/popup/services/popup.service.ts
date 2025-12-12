import { storedSessionDefaultValue } from "@popup/utils/defaultValue";
import { MESSAGE_ACTIONS } from "@shared/constants/messages";
import { STORAGE_KEYS } from "@shared/constants/storageKeys";
import { ExtensionStorage, PopupState, SessionData, StoredSession } from "@shared/types";
import { getDomainFromUrl } from "@shared/utils/domain";
import { ExtensionError, handleError } from "@shared/utils/errorHandling";
import { generateId } from "@shared/utils/idGenerator";
import { validateSessionName } from "@shared/utils/validation";
import { ChromeApiService } from "./chromeApi.service";

export class PopupService {
  static getState(): { currentDomain: any } {
    throw new Error("Method not implemented.");
  }
  private chromeApi = new ChromeApiService();
  private state: PopupState = {
    currentDomain: "",
    currentTab: {} as chrome.tabs.Tab,
    sessions: [],
    activeSessions: {},
    currentRenameSessionId: "",
    currentDeleteSessionId: "",
  };

  async initialize(): Promise<PopupState> {
    try {
      this.state.currentTab = await this.chromeApi.getCurrentTab();
      if (!this.state.currentTab.url) {
        throw new ExtensionError("Unable to get current tab URL");
      }

      this.state.currentDomain = getDomainFromUrl(this.state.currentTab.url);
      await this.loadStorageData();

      return { ...this.state };
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.initialize"));
    }
  }

  async saveCurrentSession(name: string): Promise<SessionData> {
    try {
      const validatedName = validateSessionName(name);

      const response = await this.chromeApi.sendMessage<StoredSession | null>({
        action: MESSAGE_ACTIONS.GET_CURRENT_SESSION,
        domain: this.state.currentDomain,
        tabId: this.state.currentTab.id!,
      });

      if (!response.success) {
        throw new ExtensionError(response.error || "Failed to get current session");
      }

      const storedSession = response.data ?? storedSessionDefaultValue;

      const domainSessions = this.state.sessions.filter((s) => s.domain === this.state.currentDomain);
      const maxOrder = domainSessions.length > 0 ? Math.max(...domainSessions.map((s) => s.order ?? 0)) : -1;

      const newSession: SessionData = {
        ...storedSession,
        id: generateId(),
        name: validatedName,
        domain: this.state.currentDomain,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        order: maxOrder + 1,
      };

      this.state.sessions.push(newSession);
      this.state.activeSessions[this.state.currentDomain] = newSession.id;
      await this.saveStorageData();

      return newSession;
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.saveCurrentSession"));
    }
  }

  /**
   * Overwrite (update in-place) an existing saved session with the CURRENT tab session.
   * - Keeps the same id + order (so list order doesn't change)
   * - Optionally updates the session name
   */
  async overwriteSessionWithCurrent(sessionId: string, name?: string): Promise<void> {
    try {
      const session = this.state.sessions.find((s) => s.id === sessionId);
      if (!session) {
        throw new ExtensionError("Session not found");
      }

      // Safety: only allow overwriting sessions from the current domain (since we read the current tab session).
      if (session.domain !== this.state.currentDomain) {
        throw new ExtensionError("Cannot overwrite a session from a different domain");
      }

      const validatedName = name !== undefined ? validateSessionName(name) : session.name;

      const response = await this.chromeApi.sendMessage<StoredSession | null>({
        action: MESSAGE_ACTIONS.GET_CURRENT_SESSION,
        domain: this.state.currentDomain,
        tabId: this.state.currentTab.id!,
      });

      if (!response.success) {
        throw new ExtensionError(response.error || "Failed to get current session");
      }

      const storedSession = response.data ?? storedSessionDefaultValue;

      // Preserve identity + ordering metadata.
      const preserved = {
        id: session.id,
        order: session.order,
        createdAt: session.createdAt,
        domain: session.domain,
      };

      Object.assign(session, storedSession, preserved, {
        name: validatedName,
        lastUsed: Date.now(),
      });

      this.state.activeSessions[this.state.currentDomain] = session.id;
      await this.saveStorageData();
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.overwriteSessionWithCurrent"));
    }
  }

  async switchToSession(sessionId: string): Promise<void> {
    try {
      const session = this.state.sessions.find((s) => s.id === sessionId);
      if (!session) {
        throw new ExtensionError("Session not found");
      }

      const response = await this.chromeApi.sendMessage({
        action: MESSAGE_ACTIONS.SWITCH_SESSION,
        sessionData: session,
        tabId: this.state.currentTab.id!,
      });

      if (!response.success) {
        throw new ExtensionError(response.error || "Failed to switch session");
      }

      this.state.activeSessions[this.state.currentDomain] = sessionId;
      session.lastUsed = Date.now();

      await this.saveStorageData();
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.switchToSession"));
    }
  }

  async createNewSession(): Promise<void> {
    try {
      const response = await this.chromeApi.sendMessage({
        action: MESSAGE_ACTIONS.CLEAR_SESSION,
        domain: this.state.currentDomain,
        tabId: this.state.currentTab.id!,
      });

      if (!response.success) {
        throw new ExtensionError(response.error || "Failed to clear session");
      }

      delete this.state.activeSessions[this.state.currentDomain];
      await this.saveStorageData();
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.createNewSession"));
    }
  }

  /**
   * Rename a session.
   *
   * If a session with the same name already exists in the same domain:
   * - overwrite = false (default) -> throws an error
   * - overwrite = true -> deletes the conflicting session and proceeds
   */
  async renameSession(sessionId: string, newName: string, overwrite = false): Promise<void> {
    try {
      const session = this.state.sessions.find((s) => s.id === sessionId);
      if (!session) {
        throw new ExtensionError("Session not found");
      }

      const validatedName = validateSessionName(newName);
      const domain = session.domain;

      const conflict = this.findSessionByName(domain, validatedName, sessionId);
      if (conflict) {
        if (!overwrite) {
          // UI can catch this and show the "Overwrite" option.
          throw new ExtensionError("Session name already exists");
        }

        // Remove the conflicting session (same domain + same name).
        this.state.sessions = this.state.sessions.filter((s) => s.id !== conflict.id);

        // If the removed session was active, point active to the renamed session.
        if (this.state.activeSessions[domain] === conflict.id) {
          this.state.activeSessions[domain] = sessionId;
        }
      }

      session.name = validatedName;
      await this.saveStorageData();
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.renameSession"));
    }
  }

  /**
   * Find session by name within a domain (case-insensitive).
   * Excludes a session id if provided.
   */
  private findSessionByName(domain: string, name: string, excludeId?: string): SessionData | undefined {
    const target = name.trim().toLowerCase();
    return this.state.sessions.find(
      (s) => s.domain === domain && s.id !== excludeId && (s.name ?? "").trim().toLowerCase() === target
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      this.state.sessions = this.state.sessions.filter((s) => s.id !== sessionId);

      if (this.state.activeSessions[this.state.currentDomain] === sessionId) {
        delete this.state.activeSessions[this.state.currentDomain];
      }

      await this.saveStorageData();
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.deleteSession"));
    }
  }

  async reorderSessions(sessionIds: string[]): Promise<void> {
    try {
      const domainSessions = this.state.sessions.filter((s) => s.domain === this.state.currentDomain);

      if (sessionIds.length !== domainSessions.length) {
        throw new ExtensionError("Session count mismatch during reorder operation");
      }

      const sessionIdsSet = new Set(sessionIds);
      const allSessionsPresent = domainSessions.every((session) => sessionIdsSet.has(session.id));

      if (!allSessionsPresent) {
        throw new ExtensionError("Invalid session IDs provided for reorder operation");
      }

      sessionIds.forEach((id, index) => {
        const session = domainSessions.find((s) => s.id === id);
        if (session) {
          session.order = index;
        }
      });

      await this.saveStorageData();
    } catch (error) {
      throw new ExtensionError(handleError(error, "PopupService.reorderSessions"));
    }
  }

  getSession(sessionId: string): SessionData | undefined {
    return this.state.sessions.find((s) => s.id === sessionId);
  }

  getState(): PopupState {
    return { ...this.state };
  }

  setState(newState: Partial<PopupState>): void {
    this.state = { ...this.state, ...newState };
  }

  private async loadStorageData(): Promise<void> {
    try {
      const result = await this.chromeApi.getStorageData<ExtensionStorage>([
        STORAGE_KEYS.SESSIONS,
        STORAGE_KEYS.ACTIVE_SESSIONS,
      ]);

      this.state.sessions = result[STORAGE_KEYS.SESSIONS] || [];
      this.state.activeSessions = result[STORAGE_KEYS.ACTIVE_SESSIONS] || {};

      const migrationNeeded = await this.migrateLegacySessions();
      if (migrationNeeded) {
        await this.saveStorageData();
      }
    } catch (error) {
      console.error("Error loading storage data:", error);
      this.state.sessions = [];
      this.state.activeSessions = {};
    }
  }

  private migrateLegacySessions(): boolean {
    let migrationPerformed = false;
    const sessionsByDomain = new Map<string, SessionData[]>();

    this.state.sessions.forEach((session) => {
      if (!sessionsByDomain.has(session.domain)) {
        sessionsByDomain.set(session.domain, []);
      }
      sessionsByDomain.get(session.domain)!.push(session);
    });

    sessionsByDomain.forEach((sessions) => {
      sessions.forEach((session, index) => {
        if (session.order === undefined) {
          session.order = index;
          migrationPerformed = true;
        }
      });
    });

    return migrationPerformed;
  }

  private async saveStorageData(): Promise<void> {
    await this.chromeApi.setStorageData({
      [STORAGE_KEYS.SESSIONS]: this.state.sessions,
      [STORAGE_KEYS.ACTIVE_SESSIONS]: this.state.activeSessions,
    });
  }
}
