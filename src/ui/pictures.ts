/**
 * Images a page links relatively (a converted copy's `rapport-images/…`),
 * read from the pod with the member's WebID: a plain `<img>` could not sign
 * its request, and would ask this app's own site.
 *
 * `sanitizeHtml` leaves such an image with its address in `data-src`; the
 * element around it names the file the address is relative to
 * (`data-base`). Only addresses on that file's own server are read. Kept by
 * address until sign-out, so a redraw does not read them again.
 */
import { authFetch } from "../lib/auth";

const shown = new Map<string, Promise<string | null>>();

export async function drawPictures(root: ParentNode): Promise<void> {
  const images = [...root.querySelectorAll<HTMLImageElement>("[data-base] img[data-src]")];
  await Promise.all(
    images.map(async (img) => {
      const base = img.closest<HTMLElement>("[data-base]")!.dataset.base!;
      let url: URL;
      try {
        url = new URL(img.dataset.src!, base);
      } catch {
        return;
      }
      if (url.origin !== new URL(base).origin) return;
      const href = url.href;
      if (!shown.has(href)) shown.set(href, read(href));
      const src = await shown.get(href)!;
      if (!src) shown.delete(href); // tried again at the next draw
      if (src) img.src = src;
      else img.alt = `${img.alt || "Image"} (could not be read: ${decodeURIComponent(url.pathname.split("/").pop() ?? "")})`;
    })
  );
}

async function read(url: string): Promise<string | null> {
  try {
    const res = await authFetch(url, { cache: "no-store" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}

/** Forgotten at sign-out, with the rest of what was read. */
export function forgetPictures(): void {
  for (const pending of shown.values()) void pending.then((src) => src && URL.revokeObjectURL(src));
  shown.clear();
}
