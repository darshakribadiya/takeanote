"use client";

import { useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_NAME } from "@/constants";
import { altKey, modKey } from "@/lib/format";
import { createFolder, createTag, deleteFolder, deleteTag, renameFolder } from "@/lib/notes/api";
import { useStore } from "@/lib/notes/store";
import { countNotes } from "@/lib/notes/views";
import { AccountMenu } from "./account-menu";
import { useWorkspace } from "./workspace";

const PRIMARY_VIEWS = [
  { view: "all", label: "All notes", icon: "mdi:note-multiple-outline" },
  { view: "favorites", label: "Favorites", icon: "mdi:star-outline" },
  { view: "recent", label: "Recent", icon: "mdi:clock-outline" },
];

const SECONDARY_VIEWS = [
  { view: "archive", label: "Archive", icon: "mdi:archive-outline" },
  { view: "trash", label: "Trash", icon: "mdi:delete-outline" },
];

export function AppSidebar() {
  const { view, setView, newNote, openPalette, toast } = useWorkspace();
  const { isMobile, setOpenMobile } = useSidebar();
  const notes = useStore((s) => s.notes);
  const noteTags = useStore((s) => s.noteTags);
  const folderMap = useStore((s) => s.folders);
  const tagMap = useStore((s) => s.tags);
  const [creating, setCreating] = useState(null); // "folder" | "tag" | null
  const [renamingId, setRenamingId] = useState(null);

  const folders = useMemo(
    () => Object.values(folderMap).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [folderMap],
  );
  const tags = useMemo(() => Object.values(tagMap).sort((a, b) => a.name.localeCompare(b.name)), [tagMap]);
  const counts = useMemo(() => {
    const result = {};
    const views = [
      ...PRIMARY_VIEWS.map((item) => item.view),
      "trash",
      ...folders.map((folder) => `folder:${folder.id}`),
      ...tags.map((tag) => `tag:${tag.id}`),
    ];
    for (const key of views) result[key] = countNotes(notes, key, noteTags);
    return result;
  }, [notes, noteTags, folders, tags]);

  function go(nextView) {
    setView(nextView);
    if (isMobile) setOpenMobile(false);
  }

  async function run(action, failure) {
    try {
      await action();
    } catch (error) {
      toast.add({ title: failure, description: error.message, type: "error" });
    }
  }

  function submitNew(name) {
    const kind = creating;
    setCreating(null);
    if (!name.trim()) return;
    if (kind === "folder") {
      run(async () => go(`folder:${(await createFolder(name)).id}`), "Couldn't create folder");
    } else {
      run(async () => go(`tag:${(await createTag(name)).id}`), "Couldn't create tag");
    }
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-3">
        <div className="flex items-center gap-2 px-1 pt-1">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary-600 text-white">
            <Icon className="size-4" icon="mdi:lightning-bolt-outline" />
          </span>
          <span className="font-heading font-semibold">{APP_NAME}</span>
        </div>
        <div className="flex gap-1.5">
          <Button className="min-w-0 flex-1 justify-between" onClick={() => newNote()}>
            <span className="inline-flex items-center gap-2">
              <Icon icon="mdi:note-plus-outline" />
              New note
            </span>
            <KbdGroup className="max-sm:hidden">
              <Kbd className="bg-white/16 text-current">{altKey()}</Kbd>
              <Kbd className="bg-white/16 text-current">N</Kbd>
            </KbdGroup>
          </Button>
          <Button
            aria-label="New canvas"
            onClick={() => newNote({ kind: "canvas" })}
            size="icon"
            title={`New canvas (${altKey()} Shift N)`}
            variant="outline"
          >
            <Icon icon="mdi:vector-square" />
          </Button>
        </div>
        <Button className="w-full justify-between text-muted-foreground" onClick={openPalette} variant="outline">
          <span className="inline-flex items-center gap-2">
            <Icon icon="mdi:magnify" />
            Search
          </span>
          <KbdGroup className="max-sm:hidden">
            <Kbd>{modKey()}</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {PRIMARY_VIEWS.map((item) => (
              <ViewItem active={view === item.view} count={counts[item.view]} item={item} key={item.view} onSelect={go} />
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Folders</SidebarGroupLabel>
          <SidebarGroupAction aria-label="New folder" onClick={() => setCreating("folder")}>
            <Icon icon="mdi:plus" />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {folders.map((folder) =>
                renamingId === folder.id ? (
                  <SidebarMenuItem key={folder.id}>
                    <NameInput
                      defaultValue={folder.name}
                      onDone={(name) => {
                        setRenamingId(null);
                        if (name.trim() && name.trim() !== folder.name) {
                          run(() => renameFolder(folder, name), "Couldn't rename folder");
                        }
                      }}
                    />
                  </SidebarMenuItem>
                ) : (
                  <SidebarMenuItem key={folder.id}>
                    <SidebarMenuButton
                      isActive={view === `folder:${folder.id}`}
                      onClick={() => go(`folder:${folder.id}`)}
                      onDoubleClick={() => setRenamingId(folder.id)}
                    >
                      <Icon icon="mdi:folder-outline" />
                      <span className="truncate">{folder.name}</span>
                    </SidebarMenuButton>
                    <ItemMenu
                      count={counts[`folder:${folder.id}`]}
                      items={[
                        { label: "Rename", icon: "mdi:pencil-outline", onClick: () => setRenamingId(folder.id) },
                        {
                          label: "Delete folder",
                          icon: "mdi:delete-outline",
                          destructive: true,
                          onClick: () => {
                            if (view === `folder:${folder.id}`) go("all");
                            run(async () => {
                              await deleteFolder(folder);
                              toast.add({ title: `Deleted “${folder.name}”`, description: "Its notes moved to All notes." });
                            }, "Couldn't delete folder");
                          },
                        },
                      ]}
                    />
                  </SidebarMenuItem>
                ),
              )}
              {creating === "folder" && (
                <SidebarMenuItem>
                  <NameInput onDone={submitNew} placeholder="Folder name" />
                </SidebarMenuItem>
              )}
              {!folders.length && creating !== "folder" && (
                <SidebarMenuItem>
                  <SidebarMenuButton className="text-muted-foreground" onClick={() => setCreating("folder")} size="sm">
                    <Icon icon="mdi:folder-plus-outline" />
                    Create a folder
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tags</SidebarGroupLabel>
          <SidebarGroupAction aria-label="New tag" onClick={() => setCreating("tag")}>
            <Icon icon="mdi:plus" />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {tags.map((tag) => (
                <SidebarMenuItem key={tag.id}>
                  <SidebarMenuButton isActive={view === `tag:${tag.id}`} onClick={() => go(`tag:${tag.id}`)}>
                    <Icon icon="mdi:tag-outline" />
                    <span className="truncate">{tag.name}</span>
                  </SidebarMenuButton>
                  <ItemMenu
                    count={counts[`tag:${tag.id}`]}
                    items={[
                      {
                        label: "Delete tag",
                        icon: "mdi:delete-outline",
                        destructive: true,
                        onClick: () => {
                          if (view === `tag:${tag.id}`) go("all");
                          run(() => deleteTag(tag), "Couldn't delete tag");
                        },
                      },
                    ]}
                  />
                </SidebarMenuItem>
              ))}
              {creating === "tag" && (
                <SidebarMenuItem>
                  <NameInput onDone={submitNew} placeholder="Tag name" />
                </SidebarMenuItem>
              )}
              {!tags.length && creating !== "tag" && (
                <p className="px-2 py-1 text-xs text-muted-foreground">Add tags from any note.</p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            {SECONDARY_VIEWS.map((item) => (
              <ViewItem
                active={view === item.view}
                count={item.view === "trash" ? counts.trash : undefined}
                item={item}
                key={item.view}
                onSelect={go}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <AccountMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ViewItem({ item, active, count, onSelect }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} onClick={() => onSelect(item.view)}>
        <Icon icon={item.icon} />
        <span>{item.label}</span>
      </SidebarMenuButton>
      {count > 0 && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
    </SidebarMenuItem>
  );
}

// Count badge that swaps to a "…" menu on hover, keeping rows uncluttered.
function ItemMenu({ count, items }) {
  return (
    <>
      {count > 0 && (
        <SidebarMenuBadge className="group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0">
          {count}
        </SidebarMenuBadge>
      )}
      <Menu>
        <MenuTrigger render={<SidebarMenuAction aria-label="More" showOnHover />}>
          <Icon icon="mdi:dots-horizontal" />
        </MenuTrigger>
        <MenuPopup align="start" side="right">
          {items.map((item) => (
            <MenuItem key={item.label} onClick={item.onClick} variant={item.destructive ? "destructive" : "default"}>
              <Icon icon={item.icon} />
              {item.label}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    </>
  );
}

// Enter saves, Escape cancels, clicking away saves.
function NameInput({ defaultValue = "", placeholder, onDone }) {
  const [value, setValue] = useState(defaultValue);
  const doneRef = useRef(false);

  // Enter/Escape are followed by a blur; only the first one counts.
  function finish(result) {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(result);
  }

  return (
    <SidebarInput
      aria-label={placeholder ?? "Name"}
      autoFocus
      maxLength={120}
      onBlur={() => finish(value)}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(value);
        if (event.key === "Escape") {
          event.stopPropagation();
          finish("");
        }
      }}
      placeholder={placeholder}
      value={value}
    />
  );
}
