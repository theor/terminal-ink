import CrtChrome from "./CrtChrome.svelte";
import LibraryChrome from "./LibraryChrome.svelte";
import type { Theme } from "./types.ts";

export type { Theme, ThemeStrings, ChromeProps } from "./types.ts";

export const DEFAULT_THEME = "crt";

export const themes: Record<string, Theme> = {
  crt: {
    name: "crt",
    label: "CRT terminal",
    chrome: CrtChrome,
    passwordInputMode: "numeric",
    strings: {
      wrongPassword: "ACCESS DENIED",
      end: "-- END OF LINE --",
      title: (text) => `// ${text} //`,
    },
  },
  library: {
    name: "library",
    label: "Magical library",
    chrome: LibraryChrome,
    passwordInputMode: "text",
    strings: {
      wrongPassword: "The ward refuses you.",
      end: "~ here the text ends ~",
      title: (text) => text,
    },
  },
};

/** Falls back to the default rather than blanking the screen on a typo. */
export function themeFor(name: string | undefined): Theme {
  return themes[name ?? ""] ?? themes[DEFAULT_THEME];
}
