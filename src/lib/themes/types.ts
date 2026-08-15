import type { Component, Snippet } from "svelte";

/**
 * Wording that belongs to the fiction rather than to the machine. A CRT denies
 * access; a warded book refuses you.
 */
export interface ThemeStrings {
  /** Shown when a `#password` answer is rejected. */
  wrongPassword: string;
  /** Shown when the story has nowhere left to go. */
  end: string;
  /** Decorates a `#title` line. */
  title: (text: string) => string;
}

export type ChromeProps = {
  /** Cover the viewport (play mode) rather than sit inside a pane. */
  fullscreen: boolean;
  children: Snippet;
};

/**
 * A theme is a frame plus a set of CSS custom properties. The frame draws the
 * object the fiction says you are looking at; the properties tell the shared
 * content markup how to render inside it. Everything a theme needs to change
 * goes through one of those two, so adding one never means touching Terminal.
 */
export interface Theme {
  name: string;
  /** Human-readable, for pickers. */
  label: string;
  chrome: Component<ChromeProps>;
  strings: ThemeStrings;
  /** Virtual-keyboard hint for the password prompt. */
  passwordInputMode: "numeric" | "text";
}
