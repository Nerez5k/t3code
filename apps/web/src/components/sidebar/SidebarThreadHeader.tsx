import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  ChartNoAxesColumnIcon,
  FolderPlusIcon,
  SearchIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import {
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  useState,
} from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { useIssuesSupported, usePullRequestsSupported } from "../../state/environments";
import { readIssueListPreferences } from "../issue/issueListPreferences";
import { IssueGlyph } from "../issue/issuePresentation";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import {
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface SidebarThreadHeaderProps {
  hasProjects: boolean;
  projectScope: ReactNode;
  onNewProject: () => void;
  onNewThread: (event: ReactMouseEvent) => void;
  newThreadDisabled: boolean;
  newThreadShortcutLabel: string | null | undefined;
  newThreadInProjectShortcutLabel: string | null | undefined;
  showNewThreadInProjectHint: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  isSearching: boolean;
  searchResultCount: number;
  activeSearchResultIndex: number;
  onClearSearch: () => void;
}

export function SidebarThreadHeader({
  hasProjects,
  projectScope,
  onNewProject,
  onNewThread,
  newThreadDisabled,
  newThreadShortcutLabel,
  newThreadInProjectShortcutLabel,
  showNewThreadInProjectHint,
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
  onSearchKeyDown,
  isSearching,
  searchResultCount,
  activeSearchResultIndex,
  onClearSearch,
}: SidebarThreadHeaderProps) {
  const resultsVisible = isSearching && searchResultCount > 0;
  // Shrinking results can remove the active option; never leave aria-activedescendant pointing at it.
  const activeResultExists = resultsVisible && activeSearchResultIndex < searchResultCount;
  const [searchOpen, setSearchOpen] = useState(false);
  const newThreadLabel = newThreadShortcutLabel
    ? `New thread (${newThreadShortcutLabel})`
    : "New thread";

  const searchVisible = searchOpen || isSearching;
  const closeSearch = () => {
    onClearSearch();
    setSearchOpen(false);
  };

  return (
    <div className="flex flex-col gap-0.5">
      <SidebarPrimaryNav
        onNewThread={onNewThread}
        newThreadDisabled={newThreadDisabled}
        newThreadTooltip={
          showNewThreadInProjectHint ? (
            <span className="flex flex-col gap-0.5">
              <span>{newThreadLabel}</span>
              <span className="text-muted-foreground">
                New thread in current project: Shift+click
                {newThreadInProjectShortcutLabel ? ` (${newThreadInProjectShortcutLabel})` : ""}
              </span>
            </span>
          ) : (
            newThreadLabel
          )
        }
      />
      <div className="mt-3 flex h-7 items-center gap-1 pr-0.5 pl-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-muted-foreground">
          Threads
        </span>
        <div className="flex shrink-0 items-center">
          <SidebarHeaderIconButton
            label="Search threads"
            onClick={() => {
              if (searchVisible) {
                closeSearch();
              } else {
                setSearchOpen(true);
              }
            }}
          >
            <SearchIcon />
          </SidebarHeaderIconButton>
          {hasProjects ? (
            <>
              {projectScope}
              <SidebarHeaderIconButton label="Add project" onClick={onNewProject}>
                <FolderPlusIcon />
              </SidebarHeaderIconButton>
            </>
          ) : null}
        </div>
      </div>
      {searchVisible ? (
        <div className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground bg-sidebar-row-hover text-sidebar-foreground ring-1 ring-inset ring-ring/40 focus-within:ring-ring/70">
          <SearchIcon className="size-4 shrink-0 text-(--sidebar-icon-color)" />
          <SidebarInput
            ref={searchInputRef}
            nativeInput
            autoFocus
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              onSearchKeyDown(event);
              if (!event.defaultPrevented && event.key === "Escape" && searchQuery === "") {
                closeSearch();
              }
            }}
            onBlur={() => {
              if (searchQuery === "") setSearchOpen(false);
            }}
            placeholder="Search"
            aria-label="Search threads"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={resultsVisible}
            aria-controls={resultsVisible ? "sidebar-thread-search-results" : undefined}
            aria-activedescendant={
              activeResultExists
                ? `sidebar-thread-search-result-${activeSearchResultIndex}`
                : undefined
            }
            className="min-w-0 flex-1"
          />
          {isSearching ? (
            <Button
              type="button"
              size="icon-micro"
              variant="ghost-muted"
              className="shrink-0"
              aria-label="Clear thread search"
              onClick={() => {
                onClearSearch();
                searchInputRef.current?.focus();
              }}
            >
              <XIcon className="size-3" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** New thread, Pull requests and Usage as full rows, like a launcher at the top of the sidebar. */
function SidebarPrimaryNav(props: {
  onNewThread: (event: ReactMouseEvent) => void;
  newThreadDisabled: boolean;
  newThreadTooltip: ReactNode;
}) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (location) => location.pathname });
  const pullRequestsSupported = usePullRequestsSupported();
  const issuesSupported = useIssuesSupported();
  const go = (to: "/pull-requests" | "/issues" | "/usage") => {
    if (isMobile) setOpenMobile(false);
    if (to === "/pull-requests") {
      void navigate({ to, search: readPullRequestListPreferences() });
    } else if (to === "/issues") {
      void navigate({ to, search: readIssueListPreferences() });
    } else {
      void navigate({ to });
    }
  };
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Tooltip>
          <TooltipTrigger
            render={
              <SidebarMenuButton
                disabled={props.newThreadDisabled}
                onClick={props.onNewThread}
                isActive={pathname === "/"}
              />
            }
          >
            <SquarePenIcon />
            <span>New thread</span>
          </TooltipTrigger>
          <TooltipPopup side="right">{props.newThreadTooltip}</TooltipPopup>
        </Tooltip>
      </SidebarMenuItem>
      {pullRequestsSupported ? (
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => go("/pull-requests")}
            isActive={pathname.startsWith("/pull-requests")}
          >
            <PullRequestGlyph.pullRequest />
            <span>Pull requests</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : null}
      {issuesSupported ? (
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => go("/issues")}
            isActive={pathname.startsWith("/issues")}
          >
            <IssueGlyph.issue />
            <span>Issues</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : null}
      <SidebarMenuItem>
        <SidebarMenuButton onClick={() => go("/usage")} isActive={pathname.startsWith("/usage")}>
          <ChartNoAxesColumnIcon />
          <span>Usage</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function SidebarHeaderIconButton({
  label,
  tooltip = label,
  className,
  children,
  ...rest
}: {
  label: string;
  tooltip?: ReactNode;
  className?: string | undefined;
  children?: ReactNode;
} & Omit<
  ComponentProps<typeof SidebarMenuButton>,
  "children" | "className" | "tooltip" | "isActive" | "aria-label"
>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            size="icon"
            type="button"
            aria-label={label}
            {...rest}
            className={cn("relative size-7 shrink-0", className)}
          />
        }
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
        />
      </TooltipTrigger>
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
