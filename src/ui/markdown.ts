/**
 * Markdown from a pod, shown as HTML. Anyone who can write a file can put
 * anything in it, so marked's output (which it never sanitizes) always goes
 * through DOMPurify before it reaches the page.
 *
 * Links and images keep only http(s), mailto and relative addresses; every
 * link opens in a new tab without handing it this page (`noopener`).
 */
import { marked } from "marked";
import DOMPurify from "dompurify";

const SAFE_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

let hooked = false;

export function renderMarkdown(source: string): string {
  if (!hooked) {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A" && node.hasAttribute("href")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
    hooked = true;
  }
  const html = marked.parse(source, { async: false, gfm: true });
  return DOMPurify.sanitize(html, {
    ALLOWED_URI_REGEXP: SAFE_URI,
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed"],
    FORBID_ATTR: ["style"],
  });
}
