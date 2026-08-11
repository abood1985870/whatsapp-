import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/v1",
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

/**
 * The organization every request acts on.
 *
 * The API resolves the tenant from the caller's membership, and refuses to
 * GUESS when a user belongs to more than one organization — it returns
 * ORGANIZATION_REQUIRED rather than silently picking the first, which is the
 * bug the whole tenant-isolation work removed. That means the client has to
 * say which one it means.
 *
 * Most calls already pass ?organizationId=. This header covers the ones that
 * address a resource by id alone (open a conversation, reply, resolve, toggle
 * AI, publish an agent) which sent no organization anywhere. Without it, a
 * user in two organizations could list their inbox and then not open anything
 * in it.
 */
export const ORG_STORAGE_KEY = "qano-org";

export function setActiveOrganization(organizationId: string | null) {
  if (typeof window === "undefined") return;
  if (organizationId) localStorage.setItem(ORG_STORAGE_KEY, organizationId);
  else localStorage.removeItem(ORG_STORAGE_KEY);
}

export function getActiveOrganization(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ORG_STORAGE_KEY);
}

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const organizationId = getActiveOrganization();
  // Only when the request does not already name one. Sending a header that
  // disagrees with an explicit ?organizationId= is refused by the API as
  // ORGANIZATION_ID_CONFLICT, which is the correct behaviour — so do not
  // create that conflict here.
  if (organizationId && !/organizationId=/.test(config.url ?? "")) {
    config.headers["X-Organization-Id"] = organizationId;
  }
  return config;
});

/**
 * Routes where a 401 is an ANSWER, not an expired session.
 *
 * The interceptor used to redirect on every 401, including the login request
 * itself — so a wrong password reloaded the page and the error message the form
 * was about to render was destroyed before anyone saw it. The 2FA exchange has
 * the same problem: redirecting would throw away the pending mfaToken and send
 * the user back to the start.
 */
const CREDENTIAL_ROUTES = ["/auth/login", "/auth/login/mfa", "/auth/register", "/auth/forgot-password", "/auth/reset-password"];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error.config?.url || "";
    const isCredentialRoute = CREDENTIAL_ROUTES.some((r) => url.startsWith(r));

    if (error.response?.status === 401 && !isCredentialRoute) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        // Clear the presence cookie too, or middleware keeps letting the
        // visitor into a shell whose every request 401s.
        document.cookie = "qano-signed-in=; path=/; max-age=0; SameSite=Lax";
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
