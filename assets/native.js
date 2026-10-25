/* Vibe Garage native accounts and posts. Vanilla JS, no build step. */
(function () {
  const C = window.VG_CONFIG || {};
  const TEST_TURNSTILE_KEY = "1x00000000000000000000AA";
  const MAX_IMAGE_BYTES = 1048576;
  let mePromise = null;
  let turnstileScriptPromise = null;

  async function request(path, options = {}) {
    const opts = {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: { ...(options.headers || {}) },
    };
    if (options.body !== undefined) {
      if (options.raw) {
        opts.body = options.body;
      } else {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(options.body);
      }
    }

    let response;
    try {
      response = await fetch(path, opts);
    } catch {
      const err = new Error("Could not reach Vibe Garage. Check your connection and try again.");
      err.code = "network_error";
      throw err;
    }

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const info = (data && data.error) || {};
      const err = new Error(info.message || "Something went wrong. Try again.");
      err.code = info.code || "error";
      err.status = response.status;
      throw err;
    }

    return data || {};
  }

  function me() {
    if (!mePromise) {
      mePromise = request("/api/me")
        .then((data) => data.user || null)
        .catch((err) => {
          if (err.status === 401 || err.code === "not_signed_in") return null;
          mePromise = null;
          throw err;
        });
    }
    return mePromise;
  }

  async function signup(payload) {
    const data = await request("/api/auth/signup", { method: "POST", body: payload });
    mePromise = Promise.resolve(data.user);
    return data.user;
  }

  async function login(payload) {
    const data = await request("/api/auth/login", { method: "POST", body: payload });
    mePromise = Promise.resolve(data.user);
    return data.user;
  }

  async function logout() {
    const data = await request("/api/auth/logout", { method: "POST", body: {} });
    mePromise = Promise.resolve(null);
    return data;
  }

  async function createPost(payload) {
    const data = await request("/api/posts", { method: "POST", body: payload });
    return data.post;
  }

  async function updatePost(id, payload) {
    const data = await request(`/api/posts/${encodeURIComponent(id)}`, { method: "PATCH", body: payload });
    return data.post;
  }

  async function deletePost(id) {
    return request(`/api/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async function getPost(id) {
    const data = await request(`/api/posts/${encodeURIComponent(id)}`);
    return data.post;
  }

  async function listPosts(filters = {}) {
    const params = new URLSearchParams();
    if (filters.kind) params.set("kind", filters.kind);
    if (filters.user) params.set("user", filters.user);
    if (filters.limit) params.set("limit", String(filters.limit));
    const query = params.toString();
    const data = await request(`/api/posts${query ? "?" + query : ""}`);
    return data.posts || [];
  }

  async function uploadImage(file) {
    return request("/api/images", {
      method: "PUT",
      raw: true,
      body: file,
      headers: { "Content-Type": file.type },
    });
  }

  async function uploadAvatar(file) {
    const data = await request("/api/me/avatar", {
      method: "PUT",
      raw: true,
      body: file,
      headers: { "Content-Type": file.type },
    });
    mePromise = Promise.resolve(data.user);
    return data.user;
  }

  async function updateMe(payload) {
    const data = await request("/api/me", { method: "PATCH", body: payload });
    mePromise = Promise.resolve(data.user);
    return data.user;
  }

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(true);
    if (turnstileScriptPromise) return turnstileScriptPromise;
    turnstileScriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(Boolean(window.turnstile));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
      setTimeout(() => resolve(Boolean(window.turnstile)), 6000);
    });
    return turnstileScriptPromise;
  }

  function loadImage(file) {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(file).then((bitmap) => ({
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => { if (bitmap.close) bitmap.close(); },
      }));
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        close: () => URL.revokeObjectURL(objectUrl),
      });
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("That image could not be read."));
      };
      img.src = objectUrl;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  async function resizeImage(file, maxSide = 1600) {
    const image = await loadImage(file);
    const plans = [
      { side: maxSide, quality: 0.85 },
      { side: maxSide, quality: 0.7 },
      { side: Math.min(1200, maxSide), quality: 0.7 },
    ];

    let last = null;
    try {
      for (const plan of plans) {
        const scale = Math.min(1, plan.side / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image.source, 0, 0, width, height);
        const blob = await canvasToBlob(canvas, "image/webp", plan.quality);
        if (!blob) throw new Error("Could not process that image.");
        last = blob;
        if (blob.size <= MAX_IMAGE_BYTES) break;
      }
    } finally {
      image.close();
    }

    if (!last) throw new Error("Could not process that image.");
    return last;
  }

  function authPanel(container, options = {}) {
    if (!container) return;
    const onDone = typeof options.onDone === "function" ? options.onDone : () => {};

    container.innerHTML = `
      <div class="panel glass" style="margin-top:18px;padding:18px">
        <div style="display:flex;gap:8px;margin-bottom:14px" role="tablist" aria-label="Account">
          <button type="button" class="btn sm" data-vgn-tab="signin" role="tab" aria-selected="true">Sign in</button>
          <button type="button" class="btn ghost sm" data-vgn-tab="signup" role="tab" aria-selected="false">Create account</button>
        </div>
        <div data-vgn-form>
          <div class="field"><label for="vgn-email">Email</label><div class="inp"><input type="email" id="vgn-email" autocomplete="email" required></div></div>
          <div class="field" data-vgn-name hidden><label for="vgn-name">Display name</label><div class="inp"><input type="text" id="vgn-name" autocomplete="nickname" maxlength="40"></div></div>
          <div class="field"><label for="vgn-password">Password</label><div class="inp"><input type="password" id="vgn-password" autocomplete="current-password" required></div></div>
          <div data-vgn-turnstile style="margin:12px 0"></div>
          <p class="hint err" data-vgn-error role="alert" style="min-height:1.2em;margin:0 0 10px"></p>
          <button type="button" class="btn" data-vgn-submit>Sign in</button>
        </div>
      </div>`;

    const form = container.querySelector("[data-vgn-form]");
    const emailInput = container.querySelector("#vgn-email");
    const nameField = container.querySelector("[data-vgn-name]");
    const nameInput = container.querySelector("#vgn-name");
    const passwordInput = container.querySelector("#vgn-password");
    const turnstileBox = container.querySelector("[data-vgn-turnstile]");
    const errorBox = container.querySelector("[data-vgn-error]");
    const submitButton = container.querySelector("[data-vgn-submit]");
    const tabs = [...container.querySelectorAll("[data-vgn-tab]")];

    let mode = "signin";
    let turnstileToken = null;
    let turnstileRendered = false;

    function setError(message) {
      errorBox.textContent = message || "";
    }

    function setMode(next) {
      mode = next;
      tabs.forEach((tab) => {
        const active = tab.dataset.vgnTab === next;
        tab.classList.toggle("ghost", !active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });
      const creating = next === "signup";
      nameField.hidden = !creating;
      passwordInput.autocomplete = creating ? "new-password" : "current-password";
      submitButton.textContent = creating ? "Create account" : "Sign in";
      setError("");
      if (!creating) {
        turnstileToken = null;
      } else {
        prepareTurnstile();
      }
    }

    async function prepareTurnstile() {
      const sitekey = C.turnstileSiteKey;
      if (!sitekey) {
        turnstileToken = "dev";
        return;
      }
      if (sitekey === TEST_TURNSTILE_KEY) {
        turnstileToken = "dev";
        if (!turnstileBox.dataset.note) {
          turnstileBox.dataset.note = "1";
          turnstileBox.innerHTML = '<p class="muted" style="font-size:.82rem;margin:0">Test mode: verification is skipped.</p>';
        }
        return;
      }
      if (turnstileRendered) return;

      const loaded = await loadTurnstile();
      if (!loaded || !window.turnstile || typeof window.turnstile.render !== "function") {
        turnstileToken = "dev";
        turnstileBox.innerHTML = '<p class="muted" style="font-size:.82rem;margin:0">Verification is unavailable, continuing in test mode.</p>';
        return;
      }

      turnstileBox.innerHTML = "";
      try {
        window.turnstile.render(turnstileBox, {
          sitekey,
          callback: (token) => { turnstileToken = token; },
          "error-callback": () => { turnstileToken = "dev"; },
          "expired-callback": () => { turnstileToken = null; },
        });
        turnstileRendered = true;
      } catch {
        turnstileToken = "dev";
      }
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => setMode(tab.dataset.vgnTab));
    });

    async function submitForm() {
      setError("");
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const displayName = nameInput.value.trim();

      if (!email) {
        setError("Enter your email address.");
        return;
      }
      if (!password) {
        setError("Enter your password.");
        return;
      }
      if (mode === "signup") {
        if (displayName.length < 2 || displayName.length > 40) {
          setError("Display name must be 2 to 40 characters.");
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }
        if (!turnstileToken) {
          setError(C.turnstileSiteKey === TEST_TURNSTILE_KEY
            ? "Verification is not ready yet. Try again."
            : "Complete the verification, then try again.");
          return;
        }
      }

      submitButton.disabled = true;
      try {
        if (mode === "signup") {
          const user = await signup({
            email,
            password,
            display_name: displayName,
            turnstile: turnstileToken || "dev",
          });
          onDone(user);
        } else {
          const user = await login({ email, password });
          onDone(user);
        }
      } catch (err) {
        setError(err.message || "Something went wrong. Try again.");
      } finally {
        submitButton.disabled = false;
      }
    }

    submitButton.addEventListener("click", submitForm);
    form.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitForm();
      }
    });

    setMode("signin");
  }

  window.VGN = {
    me,
    signup,
    login,
    logout,
    createPost,
    updatePost,
    deletePost,
    getPost,
    listPosts,
    uploadImage,
    uploadAvatar,
    updateMe,
    resizeImage,
    authPanel,
  };
})();
