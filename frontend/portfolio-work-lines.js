(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const items = [...document.querySelectorAll("#work .projects > a, #about, #contact")];
  if (!items.length) return;
  let frame = 0;
  function render() {
    frame = 0;
    const height = window.innerHeight;
    const distance = Math.min(300, height * .38);
    const travel = Math.min(160, window.innerWidth * .16);
    // Horizontal transforms do not affect the vertical scroll measurements.
    // Read all positions before writing styles to avoid layout thrashing.
    const positions = items.map(element => ({
      top: element.getBoundingClientRect().top,
      focused: element.matches(":focus-within")
    }));
    items.forEach((element, index) => {
      const {top, focused} = positions[index];
      const progress = reduced.matches || focused ? 1 : Math.max(0, Math.min(1, (height * .94 - top) / distance));
      const eased = 1 - Math.pow(1 - progress, 3);
      element.classList.add("scroll-slide");
      element.style.setProperty("--slide-x", `${(-(1 - eased) * travel).toFixed(2)}px`);
      element.style.setProperty("--slide-opacity", eased.toFixed(3));
    });
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(render); }
  window.addEventListener("scroll", schedule, {passive:true});
  window.addEventListener("resize", schedule, {passive:true});
  window.addEventListener("pageshow", schedule);
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", schedule);
  reduced.addEventListener("change", schedule);
  document.fonts?.ready.then(schedule);
  schedule();

  // Snap between screens, leaving tall sections freely scrollable.
  const projects = document.querySelector("#work .projects");
  if (!projects) return;
  let snapping = false, snapFrame = 0, settleTimer = 0;
  let lastY = window.scrollY, direction = 0;
  const destination = () => Math.max(0, Math.min(
    projects.getBoundingClientRect().top + window.scrollY - 30,
    document.documentElement.scrollHeight - window.innerHeight
  ));
  function snapTarget(y, sign, settling = false) {
    const top = selector => document.querySelector(selector).getBoundingClientRect().top + window.scrollY;
    const work = destination(), about = top('#about'), contact = top('#contact');
    const bands = [[0,work], [Math.max(work,about-window.innerHeight),about],
      [Math.max(about,contact-window.innerHeight),contact]];
    for (const [start,end] of bands) {
      if (settling && (y <= start + 2 || y >= end - 2)) continue;
      if (sign > 0 && y >= start - 2 && y < end - 2) return end;
      if (sign < 0 && y > start + 2 && y <= end + 2) return start;
    }
    return null;
  }
  function snapTo(end) {
    const start = window.scrollY;
    if (snapping || end === null || Math.abs(start-end) < 2) return;
    snapping = true;
    const started = performance.now();
    function step(now) {
      const progress = reduced.matches ? 1 : Math.min(1, (now - started) / 720);
      const eased = 1 - Math.pow(1 - progress, 4);
      window.scrollTo({top:start + (end - start) * eased, behavior:"instant"});
      if (progress < 1) snapFrame = requestAnimationFrame(step);
      else { snapping = false; lastY = window.scrollY; direction = 0; }
    }
    snapFrame = requestAnimationFrame(step);
  }
  window.addEventListener("wheel", event => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (snapping) { event.preventDefault(); return; }
    const target = snapTarget(window.scrollY, Math.sign(event.deltaY));
    if (target !== null) {
      event.preventDefault(); snapTo(target);
    }
  }, {passive:false});
  // Touch, keyboard and scrollbar input also settle at the same destination.
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (!snapping) direction = Math.sign(y - lastY) || direction;
    lastY = y;
    clearTimeout(settleTimer);
    if (!snapping && direction) {
      const target = snapTarget(y, direction, true);
      if (target !== null) settleTimer = setTimeout(() => snapTo(target), 140);
    }
  }, {passive:true});
  window.addEventListener("touchmove", event => {
    if (snapping) event.preventDefault();
  }, {passive:false});
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    cancelAnimationFrame(snapFrame); clearTimeout(settleTimer);
    snapping = false; direction = 0; lastY = window.scrollY;
  });
})();
