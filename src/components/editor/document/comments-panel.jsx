"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useEditorState } from "@tiptap/react";
import { PersonAvatar } from "@/components/person-avatar";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { addReply, createThread, deleteComment, deleteThread, setResolved, threadPositions } from "@/lib/editor/comments";
import { isMac, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * Side panel with the note's comment threads in document order.
 * `draft` is a thread being started ({ id, quote }): its text is already
 * marked, and the thread is only written once the first comment is sent.
 */
export function CommentsPanel({ editor, doc, threads, user, readOnly, draft, onDraftDone, activeId, onActivate, onClose }) {
  const [filter, setFilter] = useState("open");
  const listRef = useRef(null);
  const positions = useEditorState({
    editor,
    selector: ({ editor: current }) => Object.fromEntries(threadPositions(current.state.doc, current.schema.marks.comment)),
  }) ?? {};

  const all = [...threads.values()];
  const shown = all
    .filter((thread) => (filter === "open" ? !thread.resolved : thread.resolved))
    .sort((a, b) => (positions[a.id] ?? Infinity) - (positions[b.id] ?? Infinity) || a.createdAt.localeCompare(b.createdAt));
  const openCount = all.filter((thread) => !thread.resolved).length;
  const resolvedCount = all.length - openCount;

  // A thread picked in the document scrolls into view here.
  useEffect(() => {
    if (!activeId) return;
    requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-thread-id="${CSS.escape(activeId)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [activeId]);

  function showInDocument(threadId) {
    onActivate(threadId);
    requestAnimationFrame(() => {
      editor.view.dom.querySelector(".comment-highlight.is-active")?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  return (
    <aside
      aria-label="Comments"
      className="flex max-h-[calc(100dvh-12rem)] w-80 max-w-[calc(100vw-1.5rem)] flex-col rounded-xl border bg-popover/96 shadow-lg/5 backdrop-blur"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Icon className="size-4.5 text-muted-foreground" icon="mdi:comment-text-multiple-outline" />
        <span className="flex-1 text-sm font-medium">Comments</span>
        <SegmentedControl size="sm">
          {[
            { value: "open", label: `Open${openCount ? ` ${openCount}` : ""}` },
            { value: "resolved", label: `Resolved${resolvedCount ? ` ${resolvedCount}` : ""}` },
          ].map((option) => (
            <SegmentedControlItem
              aria-pressed={filter === option.value}
              data-pressed={filter === option.value ? "" : undefined}
              key={option.value}
              onClick={() => setFilter(option.value)}
            >
              <span className="text-xs">{option.label}</span>
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
        <button
          aria-label="Close comments"
          className="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent"
          onClick={onClose}
          type="button"
        >
          <Icon className="size-4" icon="mdi:close" />
        </button>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto p-2" ref={listRef}>
        {draft && !threads.has(draft.id) && (
          <DraftCard
            draft={draft}
            onCancel={() => onDraftDone({ cancelled: true })}
            onSubmit={(text) => {
              createThread(doc, { id: draft.id, quote: draft.quote, text, user });
              onDraftDone({ cancelled: false });
            }}
          />
        )}
        {shown.map((thread) => (
          <ThreadCard
            active={thread.id === activeId}
            detached={positions[thread.id] === undefined}
            key={thread.id}
            onDelete={() => {
              deleteThread(doc, thread.id);
              editor.commands.removeComment(thread.id);
            }}
            onDeleteComment={(commentId) => deleteComment(doc, commentId)}
            onReply={(text) => addReply(doc, { threadId: thread.id, text, user })}
            onResolve={(resolved) => {
              setResolved(doc, { threadId: thread.id, resolved, user });
              if (resolved) onActivate(null);
            }}
            onSelect={() => showInDocument(thread.id)}
            readOnly={readOnly}
            thread={thread}
            user={user}
          />
        ))}
        {!shown.length && !draft && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {filter === "open"
              ? readOnly
                ? "No open comments."
                : `Select text and press the comment button, or ${isMac() ? "⌘⌥M" : "Ctrl+Alt+M"}.`
              : "No resolved comments."}
          </p>
        )}
      </div>
    </aside>
  );
}

function DraftCard({ draft, onSubmit, onCancel }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-ring/48 bg-card p-2.5 ring-2 ring-ring/16" data-thread-id={draft.id}>
      <Quote text={draft.quote} />
      <Composer autoFocus onCancel={onCancel} onSubmit={onSubmit} placeholder="Add a comment" submitLabel="Comment" />
    </div>
  );
}

function ThreadCard({ thread, user, active, detached, readOnly, onSelect, onReply, onResolve, onDelete, onDeleteComment }) {
  const ownsThread = Boolean(user?.id) && thread.authorId === user.id;
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-2.5 transition-shadow",
        active ? "border-ring/48 ring-2 ring-ring/16" : "cursor-pointer hover:border-ring/32",
      )}
      data-thread-id={thread.id}
      onClick={() => !active && onSelect()}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <Quote text={thread.quote} />
          {detached && <p className="mt-1 text-xs text-muted-foreground">The commented text was removed.</p>}
        </div>
        {!readOnly && (
          <div className="flex shrink-0">
            <CardButton
              label={thread.resolved ? "Reopen" : "Resolve"}
              onClick={(event) => {
                event.stopPropagation();
                onResolve(!thread.resolved);
              }}
            >
              <Icon icon={thread.resolved ? "mdi:restore" : "mdi:check"} />
            </CardButton>
            {ownsThread && (
              <CardButton
                label="Delete thread"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              >
                <Icon icon="mdi:delete-outline" />
              </CardButton>
            )}
          </div>
        )}
      </div>

      <ol className="flex flex-col gap-2.5">
        {thread.comments.map((comment, index) => (
          <li className="group flex gap-2" key={comment.id}>
            <PersonAvatar className="size-6 text-[0.6rem] ring-0" color={comment.authorColor} name={comment.authorName} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-sm font-medium">{comment.authorName}</span>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString()}>
                  {relativeTime(comment.createdAt)}
                </time>
                {!readOnly && index > 0 && user?.id && comment.authorId === user.id && (
                  <button
                    aria-label="Delete reply"
                    className="ms-auto inline-flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteComment(comment.id);
                    }}
                    type="button"
                  >
                    <Icon className="size-3.5" icon="mdi:close" />
                  </button>
                )}
              </div>
              <p className="text-sm break-words whitespace-pre-wrap">{comment.text}</p>
            </div>
          </li>
        ))}
      </ol>

      {thread.resolved && thread.resolvedBy && <p className="text-xs text-muted-foreground">Resolved by {thread.resolvedBy}</p>}
      {active && !readOnly && !thread.resolved && <Composer onSubmit={onReply} placeholder="Reply" submitLabel="Reply" />}
    </article>
  );
}

function Quote({ text }) {
  return (
    <p className="line-clamp-2 border-s-2 border-amber-400 ps-2 text-xs text-muted-foreground italic">{text || "…"}</p>
  );
}

// Enter adds a line; Ctrl/⌘+Enter sends; Esc cancels a new thread.
function Composer({ onSubmit, onCancel, placeholder, submitLabel, autoFocus }) {
  const [text, setText] = useState("");
  const trimmed = text.trim();

  function submit() {
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  }

  return (
    <div className="flex flex-col gap-1.5" onClick={(event) => event.stopPropagation()}>
      <textarea
        aria-label={placeholder}
        autoFocus={autoFocus}
        className="min-h-16 w-full resize-none rounded-md bg-muted/64 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/32"
        maxLength={2000}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape" && onCancel) {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder={placeholder}
        rows={2}
        value={text}
      />
      <div className="flex justify-end gap-1">
        {onCancel && (
          <button className="h-7 rounded-md px-2.5 text-xs hover:bg-accent" onClick={onCancel} type="button">
            Cancel
          </button>
        )}
        <button
          className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
          disabled={!trimmed}
          onClick={submit}
          title={`${submitLabel} (${isMac() ? "⌘" : "Ctrl"}+Enter)`}
          type="button"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function CardButton({ label, onClick, children }) {
  return (
    <button
      aria-label={label}
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
