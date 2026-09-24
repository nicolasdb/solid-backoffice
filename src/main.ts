/**
 * The shell: login → pod discovery → your app.
 *
 * No framework, no router. Screens are functions that replace the contents of
 * `#app`. That is enough for an app of this size, and it is what the three apps
 * this kit was extracted from all converged on independently.
 *
 * `renderHome` hands over to the backoffice's own screens; everything above
 * it is the kit's shell, kept unchanged.
 */
import "./styles/core.css";
import "./styles/theme.css";
import "./styles/patterns.css";
import { completeLogin, loginWithIdentifier, logout } from "./lib/auth";
import { describePodError, getPrimaryPodUrl, isAuthError } from "./lib/pod";
import { APP_NAME, DEFAULT_IDENTIFIER } from "./config";
import { focusView } from "./ui/a11y";
import { renderError, renderPending } from "./ui/patterns";
import { renderMembership } from "./onboarding";
import "./styles/backoffice.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

/** Escapes text before it goes into innerHTML — WebIDs and errors are inputs. */
function esc(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

async function main(): Promise<void> {
  const state = await completeLogin();

  if (!state.loggedIn) {
    renderLoginView(
      state.offline
        ? "Could not reach the identity layer from here — check the connection, or try again from the app's own address."
        : undefined
    );
    return;
  }

  const webId = state.webId!;
  renderLoadingView(webId);

  try {
    const podUrl = await getPrimaryPodUrl(webId);
    await renderHome(webId, podUrl);
  } catch (err) {
    renderErrorView(webId, err);
  }
}

function renderLoginView(message?: string): void {
  app.innerHTML = `
    <main class="screen stack">
      <h1>${esc(APP_NAME)}</h1>
      <p class="lead">
        Sign in with your pod's address, or with your WebID if you don't know
        which provider hosts it — it will be discovered from your profile.
      </p>
      <form id="login-form" class="stack">
        <div class="field">
          <label for="identifier">Pod or WebID</label>
          <input id="identifier" name="identifier" type="url"
                 value="${esc(DEFAULT_IDENTIFIER)}" required />
        </div>
        <div><button type="submit">Sign in</button></div>
      </form>
      ${message ? `<p class="error">${esc(message)}</p>` : ""}
    </main>
  `;

  const form = document.querySelector<HTMLFormElement>("#login-form")!;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector<HTMLInputElement>("#identifier")!;
    const button = form.querySelector("button")!;
    button.disabled = true;
    button.textContent = "Redirecting…";
    try {
      await loginWithIdentifier(input.value.trim());
    } catch (err) {
      renderLoginView(err instanceof Error ? err.message : String(err));
    }
  });

  focusView(app);
}

function renderLoadingView(webId: string): void {
  app.innerHTML = `
    <main class="screen stack">
      <h1 class="visually-hidden" data-view-title>Connecting</h1>
      <p class="lead">Signed in as <code>${esc(webId)}</code>.</p>
      ${renderPending("Looking for your pod…")}
    </main>
  `;
  focusView(app);
}

/**
 * Pod discovery failed — which, on a pod app, is a routine outcome rather than
 * an exceptional one, and never the user's mistake.
 *
 * Rendered by `renderError` rather than by hand so it cannot become a dead end:
 * the component refuses an error state that offers no way forward. An expired
 * session is the common case here and it has a real answer — sign in again —
 * so the copy says that rather than leaving someone staring at a status code.
 */
function renderErrorView(webId: string, err: unknown): void {
  app.innerHTML = `
    <main class="screen stack">
      ${renderError({
        title: isAuthError(err) ? "Your session ended" : "Could not reach your pod",
        detail: describePodError(err),
        recovery: isAuthError(err)
          ? "Nothing was lost — your work is in the pod, not in this tab. Signing in again brings it back."
          : "Your pod is unaffected. This is about reaching it from here, not about what is in it.",
        action: { label: "Sign in again", id: "logout" },
        technical: err instanceof Error ? err.message : String(err),
      })}
      <p class="meta">Signed in as <code>${esc(webId)}</code>.</p>
    </main>
  `;
  document.querySelector<HTMLButtonElement>("#logout")!.addEventListener("click", async () => {
    await logout();
    renderLoginView();
  });

  focusView(app);
}

/**
 * Slice A is the whole home screen for now: the member's side of the
 * handshake. The kit's links to /styleguide.html and /guidelines.html went
 * with the kit's placeholder; both pages still ship in dist/.
 */
async function renderHome(webId: string, podUrl: string): Promise<void> {
  await renderMembership(app, webId, podUrl, async () => {
    await logout();
    renderLoginView();
  });
}

main();
