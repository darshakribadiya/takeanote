/*
 * Clipboard actions for right-click menus. The menu has focus when an item
 * is clicked, so execCommand("copy") would copy nothing; serialize the
 * editor selection the way ProseMirror does for Ctrl+C instead.
 */

export async function copySelection(editor) {
  const { dom, text } = editor.view.serializeForClipboard(editor.state.selection.content());
  if (typeof ClipboardItem === "undefined") {
    await navigator.clipboard.writeText(text);
    return;
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([dom.innerHTML], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    }),
  ]);
}

export async function cutSelection(editor) {
  await copySelection(editor);
  editor.chain().focus().deleteSelection().run();
}

// Rich paste when the clipboard has HTML, otherwise plain text.
export async function pasteInto(editor, { plain = false } = {}) {
  editor.view.focus();
  if (!plain && navigator.clipboard.read) {
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes("text/html")) {
        editor.view.pasteHTML(await (await item.getType("text/html")).text());
        return;
      }
    }
  }
  editor.view.pasteText(await navigator.clipboard.readText());
}
