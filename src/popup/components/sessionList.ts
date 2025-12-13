import { CSS_CLASSES, UI_TEXT } from "@popup/utils/constants";
import { ActiveSessions, SessionData } from "@shared/types";
import { formatDate } from "@shared/utils/date";

export class SessionList {
  private container: HTMLElement;
  private onSessionClick?: (sessionId: string) => void;
  private onRenameClick?: (sessionId: string) => void;
  private onDeleteClick?: (sessionId: string) => void;
  private onReorder?: (sessionIds: string[]) => void;
  private draggedElement: HTMLElement | null = null;
  private draggedOverElement: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.addEventListener("click", this.handleClick.bind(this));
    this.container.addEventListener("dragstart", this.handleDragStart.bind(this));
    this.container.addEventListener("dragover", this.handleDragOver.bind(this));
    this.container.addEventListener("drop", this.handleDrop.bind(this));
    this.container.addEventListener("dragend", this.handleDragEnd.bind(this));
    this.container.addEventListener("dragenter", this.handleDragEnter.bind(this));
    this.container.addEventListener("dragleave", this.handleDragLeave.bind(this));
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

  render(sessions: SessionData[], activeSessions: ActiveSessions, currentDomain: string): void {
    const domainSessions = sessions
      .filter((s) => s.domain === currentDomain)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const activeSessionId = activeSessions[currentDomain];

    if (domainSessions.length === 0) {
      this.renderEmptyState();
      return;
    }

    this.renderSessions(domainSessions, activeSessionId);
  }

  private renderEmptyState(): void {
    this.container.innerHTML = `<div class="${CSS_CLASSES.NO_SESSIONS}">${UI_TEXT.NO_SESSIONS}</div>`;
  }

  private renderSessions(sessions: SessionData[], activeSessionId?: string): void {
    const sessionsHtml = sessions
      .map((session) => {
        const isActive = session.id === activeSessionId;
        const lastUsed = formatDate(session.lastUsed);

        return `
      <div class="session-row-outer">

        <div class="session-card-wrapper">
          <div class="${CSS_CLASSES.SESSION_ITEM} ${isActive ? CSS_CLASSES.ACTIVE : ""}" draggable="true" data-session-id="${session.id}">

            <div class="drag-handle">⋮⋮</div>

            <div class="session-info">
                <div class="session-name limit-name">${session.name || UI_TEXT.UNNAMED_SESSION}</div>
                <div class="session-meta">${UI_TEXT.LAST_USED} ${lastUsed}</div>
            </div>

          </div>
        </div>

        <div class="session-actions-inline">
          <button class="session-btn rename-btn"
                  data-action="rename"
                  data-session-id="${session.id}">
              Edit
          </button>

          <button class="session-btn delete-btn"
                  data-action="delete"
                  data-session-id="${session.id}">
              Delete
          </button>
        </div>

      </div>
    `;
      })
      .join("");

    this.container.innerHTML = sessionsHtml;
  }

  private handleClick(e: Event): void {
    const target = e.target as HTMLElement;

    if (target.classList.contains(CSS_CLASSES.SESSION_BTN)) {
      e.stopPropagation();
      const action = target.dataset.action;
      const sessionId = target.dataset.sessionId;

      if (!sessionId) return;

      if (action === "rename" && this.onRenameClick) {
        this.onRenameClick(sessionId);
      } else if (action === "delete" && this.onDeleteClick) {
        this.onDeleteClick(sessionId);
      }
      return;
    }

    if (target.classList.contains("drag-handle")) {
      return;
    }

    // Handle session switching
    const sessionItem = target.closest(`.${CSS_CLASSES.SESSION_ITEM}`) as HTMLElement;
    if (sessionItem && this.onSessionClick) {
      const sessionId = sessionItem.dataset.sessionId;
      if (sessionId) {
        this.onSessionClick(sessionId);
      }
    }
  }

  private handleDragStart(e: DragEvent): void {
    const target = e.target as HTMLElement;
    const sessionItem = target.closest(`.${CSS_CLASSES.SESSION_ITEM}`) as HTMLElement | null;
    if (!sessionItem) return;

    const row = sessionItem.closest(".session-row-outer") as HTMLElement | null;
    if (!row) return;

    this.draggedElement = row;
    row.classList.add("dragging");

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      const sessionId = sessionItem.dataset.sessionId ?? "";
      e.dataTransfer.setData("text/plain", sessionId);
    }
  }

  private handleDragOver(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  }

  private handleDragEnter(e: DragEvent): void {
    const row = (e.target as HTMLElement).closest(".session-row-outer") as HTMLElement | null;
    if (!row || row === this.draggedElement) return;

    if (this.draggedOverElement && this.draggedOverElement !== row) {
      this.draggedOverElement.classList.remove("drag-over");
    }

    row.classList.add("drag-over");
    this.draggedOverElement = row;
  }

  private handleDragLeave(e: DragEvent): void {
    const row = (e.target as HTMLElement).closest(".session-row-outer") as HTMLElement | null;
    const relatedTarget = e.relatedTarget as HTMLElement | null;

    if (!row || !relatedTarget) return;

    const leavingToOutside = !row.contains(relatedTarget);
    if (leavingToOutside && row === this.draggedOverElement) {
      row.classList.remove("drag-over");
      this.draggedOverElement = null;
    }
  }

  private handleDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const row = (e.target as HTMLElement).closest(".session-row-outer") as HTMLElement | null;

    if (row && this.draggedElement && row !== this.draggedElement) {
      const allRows = Array.from(this.container.querySelectorAll(".session-row-outer")) as HTMLElement[];

      const draggedIndex = allRows.indexOf(this.draggedElement);
      const targetIndex = allRows.indexOf(row);

      if (draggedIndex < targetIndex) {
        row.after(this.draggedElement);
      } else {
        row.before(this.draggedElement);
      }

      // Order session IDs berdasarkan urutan baru
      const reorderedIds = Array.from(this.container.querySelectorAll(`.${CSS_CLASSES.SESSION_ITEM}`)).map(
        (item) => (item as HTMLElement).dataset.sessionId!
      );

      if (this.onReorder) {
        this.onReorder(reorderedIds);
      }
    }
  }

  private handleDragEnd(e: DragEvent): void {
    const target = e.target as HTMLElement;

    // Bersihkan kelas dragging di row & item
    const row = target.closest(".session-row-outer") as HTMLElement | null;
    if (row) {
      row.classList.remove("dragging");
    }
    if (target.classList.contains(CSS_CLASSES.SESSION_ITEM)) {
      target.classList.remove("dragging");
    }

    // Bersihkan semua "drag-over"
    const allRows = this.container.querySelectorAll(".session-row-outer");
    allRows.forEach((r) => r.classList.remove("drag-over"));

    this.draggedElement = null;
    this.draggedOverElement = null;
  }
}
