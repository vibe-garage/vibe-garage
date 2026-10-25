import { error, sameOrigin, HttpError } from "./http.js";
import { signup, login, logout, me, updateMe } from "./auth.js";

const routes = [
  { method: "POST", path: "/api/auth/signup", handler: signup },
  { method: "POST", path: "/api/auth/login", handler: login },
  { method: "POST", path: "/api/auth/logout", handler: logout },
  { method: "GET", path: "/api/me", handler: me },
  { method: "PATCH", path: "/api/me", handler: updateMe },
  // Batch 2: /api/posts and /api/users/:id routes are registered here.
];

function matchPath(pattern, pathname) {
  const expected = pattern.split("/").filter(Boolean);
  const actual = pathname.split("/").filter(Boolean);
  if (expected.length !== actual.length) return null;

  const params = {};
  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i].startsWith(":")) {
      params[expected[i].slice(1)] = decodeURIComponent(actual[i]);
    } else if (expected[i] !== actual[i]) {
      return null;
    }
  }
  return params;
}

function matchRoute(method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchPath(route.path, pathname);
    if (params) return { handler: route.handler, params };
  }
  return null;
}

async function handleApi(request, env, ctx) {
  if (!sameOrigin(request, env)) {
    return error(403, "forbidden_origin", "Cross-origin request blocked.");
  }

  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const route = matchRoute(method, url.pathname);

  if (!route) {
    const pathExists = routes.some((candidate) => matchPath(candidate.path, url.pathname));
    if (pathExists) {
      return error(405, "method_not_allowed", "Method not allowed.");
    }
    return error(404, "not_found", "Not found.");
  }

  try {
    return await route.handler(request, env, ctx, route.params);
  } catch (err) {
    if (err instanceof HttpError) {
      return error(err.status, err.code, err.message);
    }
    console.error(err && err.stack ? err.stack : err);
    return error(500, "server_error", "Something went wrong.");
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleApi(request, env, ctx);
    }

    // Batch 2: /img/:key is served from KV here.

    return env.ASSETS.fetch(request);
  },
};
