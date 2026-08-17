/**
 * Where a story lives when it is not a file on a disk.
 *
 * Two places, and they answer different questions. The browser it was written
 * in keeps it across a refresh, a closed tab, a laptop that went to sleep
 * mid-session. A link carries it to someone else -- the whole story, in the
 * URL, so there is nothing to sign into and nothing to be up.
 *
 * A link is a snapshot. It says what the story was when the link was made, and
 * it will go on saying that after the author has moved on; nothing about the
 * two ends stays in touch. That is the whole bargain, and it is the reason
 * this needs no server.
 */

import storySource from "../assets/story.lore?raw";
import grimoireSource from "../assets/grimoire.lore?raw";

/** The stories that ship with the app, straight out of the bundle. */
export const builtins: Record<string, string> = {
  "story.lore": storySource,
  "grimoire.lore": grimoireSource,
};

const KEY = "lore-weaver.stories";
const FIRST = "story.lore";

/** The fragment key. A different format would want a different one. */
const PARAM = "lore";

/**
 * Encoding needs the browser's own compression, which is the one piece of
 * this that a browser can be too old for. Nothing else here is gated on it:
 * a browser that cannot make a link can still read one, and can still keep a
 * story of its own.
 */
export const canShare = typeof CompressionStream !== "undefined";

export type Stories = Record<string, string>;

function strings(value: unknown): Stories {
  if (typeof value !== "object" || value === null) return {};
  const out: Stories = {};
  for (const [name, text] of Object.entries(value))
    if (typeof text === "string") out[name] = text;
  return out;
}

export function load(): { stories: Stories; selected: string } {
  const fresh = { stories: { ...builtins }, selected: FIRST };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const saved = JSON.parse(raw) as { stories?: unknown; selected?: unknown };
    const stories = { ...builtins, ...strings(saved.stories) };
    const selected =
      typeof saved.selected === "string" && saved.selected in stories
        ? saved.selected
        : FIRST;
    return { stories, selected };
  } catch {
    // Anything unreadable is treated as nothing written: a stored story is
    // worth keeping, but not worth an app that will not start.
    return fresh;
  }
}

/** Where {@link saveToDisk} sends a builtin's text; see `vite.config.ts`. */
const SAVE_PATH = "/__lore/save";

/**
 * Writes a builtin's current text back to the `.lore` file it was bundled
 * from. Only the dev server has anything listening on {@link SAVE_PATH}, and
 * only a story that actually came from one of those files has a file to
 * write to -- a link or an imported file has neither, and stays put in
 * {@link save} alone.
 *
 * Fire-and-forget, the same as `save` above: a page that is not being served
 * by `vite dev`, or a write that fails for some reason of its own, should
 * leave the editor exactly as usable as one where it succeeded.
 */
export function saveToDisk(name: string, source: string) {
  if (!import.meta.env.DEV || !(name in builtins)) return;
  fetch(SAVE_PATH, { method: "POST", body: JSON.stringify({ name, source }) }).catch(
    () => {}
  );
}

export function save(stories: Stories, selected: string) {
  // A built-in nobody has touched is not stored. It comes from the bundle, so
  // leaving it there is what lets `src/assets/story.lore` be edited on disk
  // and still show up in a browser that has been open all along -- the
  // dev-server workflow this app is mostly used through. Type a change and
  // the copy here shadows it; undo back to the original text and it stops.
  const kept: Stories = {};
  for (const [name, text] of Object.entries(stories))
    if (builtins[name] !== text) kept[name] = text;
  try {
    localStorage.setItem(KEY, JSON.stringify({ stories: kept, selected }));
  } catch {
    // Private browsing, a full quota. The story is still on the screen; the
    // author is better served by an editor that keeps working than by an
    // alert about a browser setting they did not choose.
  }
}

/**
 * Put a story into the list under a name that is free, and say which name it
 * got. Files and links both arrive carrying a name that may already be taken,
 * and losing an evening's writing to a name collision is not something an
 * import should be able to do.
 *
 * Text that is already here is the same story arriving twice -- a link
 * followed again, a file loaded a second time -- so it selects what is there
 * rather than growing the list a copy at a time.
 */
export function addStory(stories: Stories, name: string, text: string): string {
  for (const [existing, current] of Object.entries(stories))
    if (current === text) return existing;

  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let unique = name;
  for (let n = 2; unique in stories; n++) unique = `${stem} ${n}${ext}`;

  stories[unique] = text;
  return unique;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  // A character at a time rather than spreading into fromCharCode: the spread
  // is an argument per byte, and a long story is a lot of arguments.
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytes(encoded: string): Uint8Array {
  const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pack(text: string): Promise<Uint8Array> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unpack(packed: Uint8Array): Promise<string> {
  const stream = new Blob([packed])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

/**
 * The address of this page, with the story in it.
 *
 * In the fragment, not the query: a fragment is never sent to the server, so
 * a link to a story stays between the people holding it and never turns up in
 * a host's logs. It also leaves `?play` free, which is what lets a link and a
 * mode be written in the same URL -- `?play#lore=...` opens the tablet on the
 * table straight into the story it was sent.
 */
export async function shareLink(name: string, source: string): Promise<string> {
  const url = new URL(location.href);
  const packed = await pack(`${name || "shared.lore"}\n${source}`);
  url.hash = `${PARAM}=${base64url(packed)}`;
  return url.toString();
}

/**
 * The story a link arrived with, if it arrived with one.
 *
 * Taken, not read: once it is in the browser, a URL going on carrying a whole
 * story is only in the way -- of the address bar, and of a second link being
 * pasted over it. Replaced rather than pushed, because a history entry is a
 * place to go back to and this is not one. The URL is only cleared once the
 * story is out of it, so a link that cannot be read survives a reload.
 */
export async function takeShared(): Promise<
  { name: string; source: string } | undefined
> {
  const encoded = new URLSearchParams(location.hash.slice(1)).get(PARAM);
  if (!encoded) return undefined;

  const text = await unpack(bytes(encoded));
  const newline = text.indexOf("\n");
  if (newline < 0) throw new Error("a shared story with no name");

  const url = new URL(location.href);
  url.hash = "";
  history.replaceState(null, "", url);

  return { name: text.slice(0, newline), source: text.slice(newline + 1) };
}
