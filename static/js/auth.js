/**
 * Auth UI: show/hide password toggles, signup password meter, basic login checks.
 */
(function () {
  "use strict";

  function wireToggle(buttonId, inputId) {
    const btn = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;

    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-pressed", show ? "true" : "false");
    });
  }

  wireToggle("togglePassword", "password");
  wireToggle("togglePasswordSignup", "password");
  wireToggle("toggleConfirmSignup", "confirm_password");

  /** Login page: switch between username-only and email-only fields (if present). */
  function wireLoginMethodTabs() {
    const form = document.getElementById("loginForm");
    const radUser = document.getElementById("loginMethodUser");
    const radEmail = document.getElementById("loginMethodEmail");
    const blockUser = document.getElementById("blockUsername");
    const blockEmail = document.getElementById("blockEmail");
    const inputUser = document.getElementById("login_username");
    const inputEmail = document.getElementById("login_email");
    if (!form || !radUser || !radEmail || !blockUser || !blockEmail || !inputUser || !inputEmail) return;

    function setMode(useEmail) {
      if (useEmail) {
        blockEmail.removeAttribute("hidden");
        blockEmail.classList.remove("is-hidden");
        blockUser.setAttribute("hidden", "");
        blockUser.classList.add("is-hidden");
        inputEmail.removeAttribute("disabled");
        inputEmail.setAttribute("required", "");
        inputUser.setAttribute("disabled", "");
        inputUser.removeAttribute("required");
        inputUser.value = "";
      } else {
        blockUser.removeAttribute("hidden");
        blockUser.classList.remove("is-hidden");
        blockEmail.setAttribute("hidden", "");
        blockEmail.classList.add("is-hidden");
        inputUser.removeAttribute("disabled");
        inputUser.setAttribute("required", "");
        inputEmail.setAttribute("disabled", "");
        inputEmail.removeAttribute("required");
        inputEmail.value = "";
      }
    }

    radUser.addEventListener("change", () => {
      if (radUser.checked) setMode(false);
    });
    radEmail.addEventListener("change", () => {
      if (radEmail.checked) setMode(true);
    });
    setMode(radEmail.checked);
  }

  wireLoginMethodTabs();

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      const userEl = document.getElementById("login_username");
      const passEl = document.getElementById("password");
      const u = (userEl && userEl.value) ? userEl.value.trim() : "";
      const p = passEl ? passEl.value : "";
      if (!u || !p.trim()) {
        e.preventDefault();
      }
    });
  }

  const pw = document.getElementById("password");
  const confirm = document.getElementById("confirm_password");
  const meter = document.querySelector(".js-pw-meter-bar");
  const rulesEl = document.getElementById("pwRulesHint");
  const matchEl = document.getElementById("pwMatchHint");

  if (!pw || !meter) return;

  function scorePassword(p) {
    let s = 0;
    if (p.length >= 8) s += 25;
    if (p.length >= 12) s += 15;
    if (/[A-Za-z]/.test(p)) s += 20;
    if (/\d/.test(p)) s += 20;
    if (/[^A-Za-z0-9]/.test(p)) s += 20;
    return Math.min(100, s);
  }

  function updateMeter() {
    const p = pw.value || "";
    meter.style.width = scorePassword(p) + "%";
  }

  function updateHints() {
    const p = pw.value || "";
    const c = confirm ? confirm.value : "";

    if (rulesEl) {
      const parts = [];
      if (p.length < 8) parts.push("8+ chars");
      if (!/[A-Za-z]/.test(p)) parts.push("one letter");
      if (!/\d/.test(p)) parts.push("one number");
      if (parts.length) {
        rulesEl.textContent = "Still need: " + parts.join(", ") + ".";
        rulesEl.classList.remove("is-valid");
        rulesEl.classList.add("is-invalid");
      } else {
        rulesEl.textContent = "Password meets basic rules.";
        rulesEl.classList.remove("is-invalid");
        rulesEl.classList.add("is-valid");
      }
    }

    if (matchEl && confirm) {
      if (!c) {
        matchEl.textContent = "";
        matchEl.classList.remove("is-invalid", "is-valid");
      } else if (p !== c) {
        matchEl.textContent = "Passwords do not match.";
        matchEl.classList.add("is-invalid");
        matchEl.classList.remove("is-valid");
      } else {
        matchEl.textContent = "Passwords match.";
        matchEl.classList.add("is-valid");
        matchEl.classList.remove("is-invalid");
      }
    }
  }

  pw.addEventListener("input", () => {
    updateMeter();
    updateHints();
  });
  if (confirm) confirm.addEventListener("input", updateHints);
  updateMeter();
  updateHints();
})();
