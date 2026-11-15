import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor, restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  scopeProjectRef,
  scopeThreadRef,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  type ContextMenuItem,
  type EnvironmentId,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquarePlusIcon, PlusIcon, XIcon } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { useAtomValue } from "@effect/atom-react";
import { useThreadActionMenu } from "~/hooks/useThreadActionMenu";
import { canShareWithGuestAtom } from "./guestShareAvailability";
import { cn } from "~/lib/utils";
import { useProject, useThreadShells } from "../../state/entities";
import { readEnvironmentScope } from "../../state/session";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { neighbourAfterClose, useThreadTabsStore } from "../../threadTabsStore";
import { ProjectFavicon } from "../ProjectFavicon";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const DRAG_MODIFIERS = [restrictToHorizontalAxis, restrictToFirstScrollableAncestor];

const TAB_CLASS =
  "group/tab relative flex h-7 max-w-52 min-w-24 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg pr-1 pl-2.5 text-xs outline-none [-webkit-app-region:no-drag] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const TAB_IDLE = "text-muted-foreground hover:bg-accent/60 hover:text-foreground";
const TAB_ACTIVE = "bg-accent text-foreground shadow-xs";

interface TabMenu {
  readonly items: readonly ContextMenuItem<`tab:${string}`>[];
  readonly onSelect: (id: `tab:${string}`) => void;
}

/**
 * The title bar's thread tabs: recently opened threads, newest kept, with drag reorder,
 * close and a right-click menu. A draft shows as a passing "New thread" tab.
 */
export const ThreadTabStrip = memo(function ThreadTabStrip(props: {
  /** The routed server thread, or null on a draft. */
  readonly activeEnvironmentId: EnvironmentId | null;
  readonly activeThreadId: ThreadId | null;
  readonly onNewThread: () => void;
}) {
  const { activeEnvironmentId, activeThreadId } = props;
  const tabs = useThreadTabsStore((state) => state.tabs);
  const openTab = useThreadTabsStore((state) => state.open);
  const closeTabs = useThreadTabsStore((state) => state.close);
  const moveTab = useThreadTabsStore((state) => state.move);
  const navigate = useNavigate();
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const activeRef =
    activeEnvironmentId === null || activeThreadId === null
      ? null
      : scopeThreadRef(activeEnvironmentId, activeThreadId);
  const activeKey = activeRef === null ? null : scopedThreadKey(activeRef);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- records the routed thread in the persisted tab store when navigation lands on it
  useEffect(() => {
    if (activeEnvironmentId !== null && activeThreadId !== null) {
      openTab(scopeThreadRef(activeEnvironmentId, activeThreadId));
    }
  }, [activeEnvironmentId, activeThreadId, openTab]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const tabKeys = tabs.map((tab) => scopedThreadKey(tab.ref));
  // The same list the sidebar rows read, so a tab shows exactly what its row shows.
  const shells = useThreadShells();
  const shellByKey = new Map(
    shells
      .filter((shell) =>
        tabKeys.includes(scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id))),
      )
      .map(
        (shell) => [scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id)), shell] as const,
      ),
  );

  const goTo = (ref: ScopedThreadRef | null) => {
    if (ref === null) {
      props.onNewThread();
      return;
    }
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };

  const close = (keys: ReadonlySet<string>) => {
    const remaining = tabs.filter((tab) => !keys.has(scopedThreadKey(tab.ref)));
    if (activeKey !== null && keys.has(activeKey)) {
      const fallback =
        keys.size === 1
          ? neighbourAfterClose(tabs, activeKey)
          : (remaining[remaining.length - 1]?.ref ?? null);
      goTo(fallback);
    }
    closeTabs((ref) => keys.has(scopedThreadKey(ref)));
  };

  const tabMenu = (key: string): TabMenu => {
    const index = tabKeys.indexOf(key);
    return {
      items: [
        { id: "tab:close", label: "Close tab" },
        { id: "tab:close-others", label: "Close other tabs", disabled: tabs.length < 2 },
        {
          id: "tab:close-right",
          label: "Close tabs to the right",
          disabled: index === -1 || index === tabs.length - 1,
        },
      ],
      onSelect: (id) => {
        if (id === "tab:close") close(new Set([key]));
        if (id === "tab:close-others") close(new Set(tabKeys.filter((other) => other !== key)));
        if (id === "tab:close-right") close(new Set(tabKeys.slice(index + 1)));
      },
    };
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) moveTab(String(active.id), String(over.id));
  };

  return (
    <div
      role="tablist"
      aria-label="Open threads"
      data-thread-tab-strip
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={DRAG_MODIFIERS}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={tabKeys} strategy={horizontalListSortingStrategy}>
          {tabs.map((tab) => {
            const key = scopedThreadKey(tab.ref);
            return (
              <ThreadTab
                key={key}
                tabKey={key}
                threadRef={tab.ref}
                shell={shellByKey.get(key) ?? null}
                active={key === activeKey}
                renaming={renamingKey === key}
                onActivate={goTo}
                onClose={(closedKey) => close(new Set([closedKey]))}
                tabMenu={tabMenu}
                onStartRename={setRenamingKey}
                onFinishRename={() => setRenamingKey(null)}
              />
            );
          })}
        </SortableContext>
      </DndContext>
      {activeRef === null ? (
        <div role="tab" aria-selected className={cn(TAB_CLASS, TAB_ACTIVE, "cursor-default")}>
          <MessageSquarePlusIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">New thread</span>
        </div>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="New thread"
              onClick={props.onNewThread}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none [-webkit-app-region:no-drag] hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          }
        >
          <PlusIcon className="size-4" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">New thread</TooltipPopup>
      </Tooltip>
    </div>
  );
});

const ThreadTab = memo(function ThreadTab(props: {
  readonly tabKey: string;
  readonly threadRef: ScopedThreadRef;
  readonly shell: EnvironmentThreadShell | null;
  readonly active: boolean;
  readonly renaming: boolean;
  readonly onActivate: (ref: ScopedThreadRef) => void;
  readonly onClose: (key: string) => void;
  readonly tabMenu: (key: string) => TabMenu;
  readonly onStartRename: (key: string) => void;
  readonly onFinishRename: () => void;
}) {
  const { threadRef, shell } = props;
  const project = useProject(
    shell === null ? null : scopeProjectRef(threadRef.environmentId, shell.projectId),
  );
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const canShareWithGuest = useAtomValue(canShareWithGuestAtom(threadRef.environmentId));
  const { openMenu } = useThreadActionMenu({
    threadRef,
    projectCwd: project?.workspaceRoot ?? null,
    onStartRename: () => props.onStartRename(props.tabKey),
    canShareWithGuest,
  });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.tabKey,
    disabled: props.renaming,
  });
  // Archived, deleted or not yet loaded threads have no shell; their tab waits hidden.
  if (shell === null) return null;
  const title = shell.title;
  const status = resolveSidebarThreadStatus(shell);
  const working = status === "working" || status === "preparing";
  const needsYou = status === "approval" || status === "input";

  const commitRename = (value: string) => {
    props.onFinishRename();
    const next = value.trim();
    if (next.length === 0 || next === title) return;
    void updateThreadMetadata({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, title: next },
    }).then((result) => {
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: "Failed to rename thread",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    });
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={props.active}
      tabIndex={0}
      data-thread-tab={props.tabKey}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        TAB_CLASS,
        props.active ? TAB_ACTIVE : TAB_IDLE,
        isDragging && "z-10 opacity-80",
      )}
      onClick={() => props.onActivate(threadRef)}
      onAuxClick={(event) => {
        if (event.button === 1) props.onClose(props.tabKey);
      }}
      onDoubleClick={() => {
        if (readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope)) {
          props.onStartRename(props.tabKey);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu({ x: event.clientX, y: event.clientY }, props.tabMenu(props.tabKey));
      }}
      onKeyDown={(event) => {
        if (props.renaming) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onActivate(threadRef);
        }
      }}
    >
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        {working ? (
          <Spinner size="sm" aria-label="Working" />
        ) : project ? (
          <ProjectFavicon project={project} className="size-3.5" />
        ) : (
          <MessageSquarePlusIcon aria-hidden className="size-3.5" />
        )}
        {needsYou ? (
          <span
            aria-label="Needs your answer"
            className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-warning"
          />
        ) : null}
      </span>
      {props.renaming ? (
        <input
          aria-label="Thread title"
          className="min-w-0 flex-1 rounded-sm bg-background px-1 outline-none ring-1 ring-inset ring-ring"
          defaultValue={title}
          ref={(element) => {
            element?.focus();
            element?.select();
          }}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => commitRename(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.currentTarget.value = title;
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{title}</span>
      )}
      <button
        type="button"
        aria-label={`Close ${title}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          props.onClose(props.tabKey);
        }}
        className={cn(
          "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100",
          props.active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100",
        )}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
});
