import { error, json, sameOrigin, HttpError } from "./http.js";
import { signup, login, logout, me, updateMe } from "./auth.js";
import {
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  getUserProfile,
} from "./posts.js";
import { uploadImage, uploadAvatar, serveImage } from "./images.js";

async function config(request, env) {
  return json({ turnstileSiteKey: env.TURNSTILE_SITEKEY || "" });
}

const routes = [
  { method: "GET", path: "/api/config", handler: config },
  { method: "POST", path: "/api/auth/signup", handler: signup },
  { method: "POST", path: "/api/auth/login", handler: login },
  { method: "POST", path: "/api/auth/logout", handler: logout },
  { method: "GET", path: "/api/me", handler: me },
  { method: "PATCH", path: "/api/me", handler: updateMe },
  { method: "PUT", path: "/api/me/avatar", handler: uploadAvatar },
  { method: "GET", path: "/api/posts", handler: listPosts },
  { method: "POST", path: "/api/posts", handler: createPost },
  { method: "GET", path: "/api/posts/:id", handler: getPost },
  { method: "PATCH", path: "/api/posts/:id", handler: updatePost },
  { method: "DELETE", path: "/api/posts/:id", handler: deletePost },
  { method: "GET", path: "/api/users/:id", handler: getUserProfile },
  { method: "PUT", path: "/api/images", handler: uploadImage },
];

function matchPath(pattern, pathname) {
  const expected = pattern.split("/").filter(Boolean);
  const actual = pathname.split("/").filter(Boolean);
  if (expected.length !== actual.length) return null;

  const params = {};
  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i].startsWith(":")) {
      try {
        params[expected[i].slice(1)] = decodeURIComponent(actual[i]);
      } catch {
        return null;
      }
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

const GISCUS_THEME_CSS = /^\/assets\/giscus-theme[^/]*\.css$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleApi(request, env, ctx);
    }

    if (url.pathname.startsWith("/img/")) {
      let key = "";
      try {
        key = decodeURIComponent(url.pathname.slice("/img/".length));
      } catch {
        return error(404, "not_found", "Not found.");
      }
      return serveImage(request, env, key);
    }

    if (url.pathname === "/") {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }

    if (GISCUS_THEME_CSS.test(url.pathname)) {
      // giscus.app loads this stylesheet cross-origin into its iframe, so it needs CORS.
      const res = await env.ASSETS.fetch(request);
      const out = new Response(res.body, res);
      out.headers.set("Access-Control-Allow-Origin", "https://giscus.app");
      out.headers.append("Vary", "Origin");
      return out;
    }

    return env.ASSETS.fetch(request);
  },
};
