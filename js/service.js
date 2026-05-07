/* ============================================================
   SERVICE PAGES · minimal JS (nav, status, WA fab)
   ============================================================ */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// Nav scroll state
const nav = $("#nav");
if (nav) {
  const tick = () => nav.classList.toggle("is-scrolled", window.scrollY > 24);
  tick();
  window.addEventListener("scroll", tick, { passive: true });
}

// Mobile drawer
const burger = $("#navBurger");
const drawer = $("#mobileDrawer");
if (burger && drawer) {
  const toggle = (open) => {
    drawer.classList.toggle("is-open", open);
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    drawer.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("menu-open", open);
  };
  burger.addEventListener("click", () => toggle(!drawer.classList.contains("is-open")));
  $$("#mobileDrawer a").forEach((a) => a.addEventListener("click", () => toggle(false)));
}

// Business hours status
const isOpen = () => {
  const now = new Date();
  const d = now.getDay(), h = now.getHours() + now.getMinutes() / 60;
  if (d >= 1 && d <= 5) return h >= 9 && h < 17;
  if (d === 6) return h >= 9 && h < 12;
  return false;
};
const applyStatus = () => {
  const open = isOpen();
  [$("#navStatus"), $("#waFab")].filter(Boolean).forEach((el) => {
    el.classList.toggle("is-online", open);
    el.classList.toggle("is-offline", !open);
    el.querySelectorAll(".status-label").forEach((lbl) => {
      lbl.textContent = open
        ? (el.id === "waFab" ? "SISTEMA OPERATIVO" : "[ SISTEMA OPERATIVO ]")
        : (el.id === "waFab" ? "SISTEMA OFFLINE" : "[ SISTEMA OFFLINE ]");
    });
  });
};
applyStatus();
setInterval(applyStatus, 60_000);

// WhatsApp FAB visibility
const fab = $("#waFab");
if (fab) {
  const onScroll = () => fab.classList.toggle("is-visible", window.scrollY > 200);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}
