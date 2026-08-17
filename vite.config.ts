import path from "node:path";
import fs from "node:fs/promises";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const ASSETS_DIR = path.resolve(__dirname, "src/assets");
// Vite normalises every path it hands to a plugin (module ids, `ctx.file`) to
// forward slashes, even on Windows -- so the directory this is compared
// against has to go through the same conversion, or the comparison silently
// never matches.
const ASSETS_DIR_KEY = ASSETS_DIR.replace(/\\/g, "/");

const SAVE_PATH = "/__lore/save";
/** Custom HMR event carrying a builtin's fresh text; see ParserEditor.svelte -- the string has to match on both ends, nothing here imports the other. */
const SYNC_EVENT = "lore-sync:update";

/**
 * Lets the running app write the story it holds back onto the `.lore` file it
 * came from -- so the disk and the editor agree without a manual export, in
 * the one place ("yarn dev", editing a bundled story) where there is a file to
 * write to at all.
 *
 * Dev-only: a built app has no server behind it to receive this, and ships
 * none of this code (the client side of it is behind `import.meta.hot`).
 */
function loreSync(): Plugin {
  return {
    name: "lore-sync",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(SAVE_PATH, (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
          void (async () => {
            try {
              const { name, source } = JSON.parse(
                Buffer.concat(chunks).toString("utf8")
              ) as { name?: unknown; source?: unknown };
              if (typeof name !== "string" || typeof source !== "string") {
                res.statusCode = 400;
                res.end();
                return;
              }

              // Only ever a file already in this directory -- `basename`
              // strips any path the name might otherwise carry, and the
              // directory listing (not a hardcoded list) is the source of
              // truth for what is allowed, so a new `.lore` file only
              // becomes writable once it is actually there. This is a
              // network-reachable endpoint (`vite --host`), so nothing about
              // the target path is ever taken from the request as given.
              const safeName = path.basename(name);
              const entries = await fs.readdir(ASSETS_DIR);
              if (!entries.includes(safeName) || !safeName.endsWith(".lore")) {
                res.statusCode = 400;
                res.end();
                return;
              }

              await fs.writeFile(path.join(ASSETS_DIR, safeName), source);
              res.statusCode = 204;
              res.end();
            } catch {
              res.statusCode = 500;
              res.end();
            }
          })();
        });
      });
    },
    /**
     * Whatever changed a `.lore` file -- the endpoint above, or an edit made
     * straight on disk -- every tab open on this server hears about it, over
     * the connection the default reload would otherwise have used, but as
     * data rather than a remount. A tab already showing this exact text (the
     * one that just typed it, most often) does nothing with it; every other
     * tab open on the same story updates in place, cursor and all -- see the
     * listener in ParserEditor.svelte. The reload this replaces is
     * suppressed unconditionally: nothing here is a page a browser should
     * ever be asked to throw away and reread.
     */
    async handleHotUpdate(ctx) {
      const file = ctx.file.replace(/\\/g, "/");
      if (path.posix.dirname(file) !== ASSETS_DIR_KEY || !file.endsWith(".lore"))
        return;

      const source = await ctx.read();
      const name = path.posix.basename(file);
      ctx.server.ws.send(SYNC_EVENT, { name, source });
      return [];
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte(), loreSync()],
});
