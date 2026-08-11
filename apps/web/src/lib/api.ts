import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/v1",
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
