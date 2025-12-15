import { CSS_CLASSES, UI_TEXT } from "@popup/utils/constants";
import { ActiveSessions, SessionData } from "@shared/types";
import { formatDate } from "@shared/utils/date";

type SessionListView = "list" | "grid";

const SELECTORS = {
  row: ".session-row-outer",
  dragHandle: ".drag-handle",
} as const;

const escapeHtml = (value: string): string => {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
};

export class SessionList {
  private container: HTMLElement;

  private onSessionClick?: (sessionId: string) => void;
  private onRenameClick?: (sessionId: string) => void;
  private onDeleteClick?: (sessionId: string) => void;
  private onReorder?: (sessionIds: string[]) => void;

  private draggedRow: HTMLElement | null = null;
  private hoveredRow: HTMLElement | null = null;

  private viewMode: SessionListView = "list";

  constructor(container: HTMLElement) {
    this.container = container;

    this.handleClick = this.handleClick.bind(this);
    this.handleDragStart = this.handleDragStart.bind(this);
    this.handleDragOver = this.handleDragOver.bind(this);
    this.handleDrop = this.handleDrop.bind(this);
    this.handleDragEnd = this.handleDragEnd.bind(this);
    this.handleDragEnter = this.handleDragEnter.bind(this);
    this.handleDragLeave = this.handleDragLeave.bind(this);

    this.container.addEventListener("click", this.handleClick);
    this.container.addEventListener("dragstart", this.handleDragStart);
    this.container.addEventListener("dragover", this.handleDragOver);
    this.container.addEventListener("drop", this.handleDrop);
    this.container.addEventListener("dragend", this.handleDragEnd);
    this.container.addEventListener("dragenter", this.handleDragEnter);
    this.container.addEventListener("dragleave", this.handleDragLeave);
  }

  setEventHandlers(handlers: {
    onSessionClick?: (sessionId: string) => void;
    onRenameClick?: (sessionId: string) => void;
    onDeleteClick?: (sessionId: string) => void;
    onReorder?: (sessionIds: string[]) => void;
  }): void {
    this.onSessionClick = handlers.onSessionClick;
    this.onRenameClick = handlers.onRenameClick;
    this.onDeleteClick = handlers.onDeleteClick;
    this.onReorder = handlers.onReorder;
  }

  setViewMode(mode: SessionListView): void {
    this.viewMode = mode;
    this.applyViewClass();
  }

  render(sessions: SessionData[], activeSessions: ActiveSessions, currentDomain: string): void {
    this.applyViewClass();

    const domainSessions = sessions
      .filter((s) => s.domain === currentDomain)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (domainSessions.length === 0) {
      this.renderEmptyState();
      return;
    }

    const activeSessionId = activeSessions[currentDomain];

    if (this.viewMode === "grid") {
      this.renderSessionsGrid(domainSessions, activeSessionId);
    } else {
      this.renderSessionsList(domainSessions, activeSessionId);
    }
  }

  private applyViewClass(): void {
    this.container.classList.toggle("view-grid", this.viewMode === "grid");
    this.container.classList.toggle("view-list", this.viewMode === "list");
  }

  private renderEmptyState(): void {
    this.container.innerHTML = `<div class="${CSS_CLASSES.NO_SESSIONS}">${escapeHtml(UI_TEXT.NO_SESSIONS)}</div>`;
  }

  private renderSessionsList(sessions: SessionData[], activeSessionId?: string): void {
    const sessionsHtml = sessions
      .map((session, index) => {
        const isActive = session.id === activeSessionId;
        const lastUsed = formatDate(session.lastUsed);

        return `
          <div class="session-row-outer">
            <div class="session-card-wrapper">
              <div
                class="${CSS_CLASSES.SESSION_ITEM} ${isActive ? CSS_CLASSES.ACTIVE : ""}"
                draggable="true"
                data-session-id="${escapeHtml(session.id)}"
              >
                <div class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</div>

                <div class="session-info">
                  <div class="session-name limit-name">
                    <span class="session-name-badge">${index + 1}. </span>
                    <span class="session-name-text">${escapeHtml(session.name || UI_TEXT.UNNAMED_SESSION)}</span>
                  </div>
                  <div class="session-meta">${escapeHtml(UI_TEXT.LAST_USED)} ${escapeHtml(lastUsed)}</div>
                </div>
              </div>
            </div>

            <div class="session-actions-inline">
              <button class="session-btn rename-btn" data-action="rename" data-session-id="${escapeHtml(session.id)}">Edit</button>
              <button class="session-btn delete-btn" data-action="delete" data-session-id="${escapeHtml(session.id)}">Delete</button>
            </div>
          </div>
        `;
      })
      .join("");

    this.container.innerHTML = sessionsHtml;
  }

  private renderSessionsGrid(sessions: SessionData[], activeSessionId?: string): void {
    const sessionsHtml = sessions
      .map((session, index) => {
        const isActive = session.id === activeSessionId;

        return `
          <div class="session-row-outer">
            <div
              class="${CSS_CLASSES.SESSION_ITEM} ${isActive ? CSS_CLASSES.ACTIVE : ""}"
              draggable="true"
              data-session-id="${escapeHtml(session.id)}"
            >
              <div class="session-card-top compact">
                <div class="session-left">
                  <div class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</div>
                  <div class="session-order-badge" title="Order">${index + 1}</div>

                  <div class="session-name limit-name">
                    ${escapeHtml(session.name || UI_TEXT.UNNAMED_SESSION)}
                  </div>
                </div>
              </div>

              <div class="session-actions-inline">
                <button class="session-btn rename-btn" title="Edit" data-action="rename" data-session-id="${escapeHtml(session.id)}">
                  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25z"></path>
                    <path d="M20.7 7.04a1 1 0 0 0 0-1.41L18.37 3.3a1 1 0 0 0-1.41 0l-1.82 1.82 3.75 3.75 1.81-1.83z"></path>
                  </svg>
                </button>

                <button class="session-btn delete-btn" title="Delete" data-action="delete" data-session-id="${escapeHtml(session.id)}">
                  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 7h12l-1 14H7L6 7z"></path>
                    <path d="M9 4h6l1 2H8l1-2z"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    this.container.innerHTML = sessionsHtml;
  }

  private handleClick(e: Event): void {
    const target = e.target as HTMLElement;

    const button = target.closest(`.${CSS_CLASSES.SESSION_BTN}`) as HTMLButtonElement | null;
    if (button) {
      e.stopPropagation();

      const action = button.dataset.action;
      const sessionId = button.dataset.sessionId;

      if (!sessionId) return;

      if (action === "rename") this.onRenameClick?.(sessionId);
      if (action === "delete") this.onDeleteClick?.(sessionId);
      return;
    }

    // Don't switch session when user clicks on drag handle
    if (target.closest(SELECTORS.dragHandle)) return;

    const sessionItem = target.closest(`.${CSS_CLASSES.SESSION_ITEM}`) as HTMLElement | null;
    const sessionId = sessionItem?.dataset.sessionId;
    if (!sessionId) return;

    this.onSessionClick?.(sessionId);
  }

  private handleDragStart(e: DragEvent): void {
    const target = e.target as HTMLElement;
    const sessionItem = target.closest(`.${CSS_CLASSES.SESSION_ITEM}`) as HTMLElement | null;
    if (!sessionItem) return;

    const row = sessionItem.closest(SELECTORS.row) as HTMLElement | null;
    if (!row) return;

    this.draggedRow = row;
    row.classList.add("dragging");

    const sessionId = sessionItem.dataset.sessionId ?? "";
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", sessionId);
    }
  }

  private handleDragOver(e: DragEvent): void {
    // Required to allow drop
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  private handleDragEnter(e: DragEvent): void {
    const row = (e.target as HTMLElement).closest(SELECTORS.row) as HTMLElement | null;
    if (!row || row === this.draggedRow) return;

    if (this.hoveredRow && this.hoveredRow !== row) {
      this.hoveredRow.classList.remove("drag-over");
    }

    row.classList.add("drag-over");
    this.hoveredRow = row;
  }

  private handleDragLeave(e: DragEvent): void {
    const row = (e.target as HTMLElement).closest(SELECTORS.row) as HTMLElement | null;
    if (!row) return;

    // relatedTarget can be null (e.g. leaving the window)
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    const leavingRow = !relatedTarget || !row.contains(relatedTarget);

    if (leavingRow && row === this.hoveredRow) {
      row.classList.remove("drag-over");
      this.hoveredRow = null;
    }
  }

  private handleDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const row = (e.target as HTMLElement).closest(SELECTORS.row) as HTMLElement | null;

    if (row && this.draggedRow && row !== this.draggedRow) {
      const allRows = Array.from(this.container.querySelectorAll(SELECTORS.row)) as HTMLElement[];
      const draggedIndex = allRows.indexOf(this.draggedRow);
      const targetIndex = allRows.indexOf(row);

      if (draggedIndex < targetIndex) {
        row.after(this.draggedRow);
      } else {
        row.before(this.draggedRow);
      }

      const reorderedIds = Array.from(this.container.querySelectorAll(`.${CSS_CLASSES.SESSION_ITEM}`))
        .map((item) => (item as HTMLElement).dataset.sessionId)
        .filter((id): id is string => Boolean(id));

      this.onReorder?.(reorderedIds);
    }

    this.clearDragOverState();
    this.draggedRow = null;
    this.hoveredRow = null;
  }

  private handleDragEnd(e: DragEvent): void {
    const target = e.target as HTMLElement;

    const row = target.closest(SELECTORS.row) as HTMLElement | null;
    row?.classList.remove("dragging");

    this.clearDragOverState();
    this.draggedRow = null;
    this.hoveredRow = null;
  }

  private clearDragOverState(): void {
    this.container.querySelectorAll(SELECTORS.row).forEach((r) => r.classList.remove("drag-over"));
  }
}
