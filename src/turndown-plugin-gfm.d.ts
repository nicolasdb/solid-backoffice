/** The plugin ships no types; the two rules `lib/word.ts` uses. */
declare module "@joplin/turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const gfm: TurndownService.Plugin;
}
