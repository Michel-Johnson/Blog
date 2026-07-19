import * as pdfjsLib from "./assets/pdfjs/pdf.min.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./assets/pdfjs/pdf.worker.min.js";

const params = new URLSearchParams(window.location.search);
const requestedFile = params.get("file") || "";
const requestedTitle = params.get("title") || "PDF document";
const stage = document.querySelector("[data-stage]");
const status = document.querySelector("[data-status]");
const canvas = document.querySelector("[data-canvas]");
const title = document.querySelector("[data-title]");
const openOriginal = document.querySelector("[data-open-original]");
const pageInput = document.querySelector("[data-page-input]");
const pageCount = document.querySelector("[data-page-count]");
const zoomLabel = document.querySelector("[data-zoom]");
const previousButton = document.querySelector("[data-previous]");
const nextButton = document.querySelector("[data-next]");

let documentHandle = null;
let currentPage = 1;
let zoom = 1;
let fitScale = 1;
let renderTask = null;
let renderVersion = 0;
let resizeTimer = null;

function safePdfUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    if (url.origin !== window.location.origin || !/\.pdf$/i.test(url.pathname)) return null;
    return url;
  } catch (_) {
    return null;
  }
}

const pdfUrl = safePdfUrl(requestedFile);

async function validatePdfResponse(url) {
  const response = await fetch(url.href, {
    headers: { Range: "bytes=0-4" },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`PDF request returned ${response.status}`);
  }
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const signature = new TextDecoder("ascii").decode((await response.arrayBuffer()).slice(0, 5));
  if (!contentType.includes("application/pdf") || signature !== "%PDF-") {
    throw new Error(`PDF URL returned ${contentType || "an unknown content type"} instead of a PDF`);
  }
}

function setError(message) {
  stage.classList.remove("is-ready");
  stage.setAttribute("aria-busy", "false");
  const fallback = pdfUrl
    ? `<br><a href="${pdfUrl.href}" target="_blank" rel="noreferrer">Open the original PDF</a>`
    : "";
  status.innerHTML = `${message}${fallback}`;
}

function updateControls() {
  const count = documentHandle?.numPages || 0;
  pageInput.value = String(currentPage);
  pageInput.max = String(count || 1);
  pageCount.textContent = String(count);
  previousButton.disabled = currentPage <= 1;
  nextButton.disabled = !count || currentPage >= count;
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

async function renderPage() {
  if (!documentHandle) return;
  const version = ++renderVersion;
  if (renderTask) {
    renderTask.cancel();
    renderTask = null;
  }
  stage.setAttribute("aria-busy", "true");
  const page = await documentHandle.getPage(currentPage);
  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(260, stage.clientWidth - (window.innerWidth <= 680 ? 24 : 72));
  fitScale = Math.min(2.2, availableWidth / baseViewport.width);
  const cssScale = fitScale * zoom;
  const viewport = page.getViewport({ scale: cssScale });
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  const context = canvas.getContext("2d", { alpha: false });

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const task = page.render({
    canvasContext: context,
    viewport,
    transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
  });
  renderTask = task;
  try {
    await task.promise;
    if (version !== renderVersion) return;
    stage.classList.add("is-ready");
    stage.setAttribute("aria-busy", "false");
  } catch (error) {
    if (error?.name !== "RenderingCancelledException") throw error;
  } finally {
    if (renderTask === task) renderTask = null;
  }
  if (version === renderVersion) updateControls();
}

async function loadPdf() {
  title.textContent = requestedTitle;
  document.title = `${requestedTitle} · PDF Preview`;
  if (!pdfUrl) {
    setError("This PDF link is invalid or is not hosted on this site.");
    return;
  }
  openOriginal.href = pdfUrl.href;
  try {
    await validatePdfResponse(pdfUrl);
    const task = pdfjsLib.getDocument({
      url: pdfUrl.href,
      cMapUrl: "./assets/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "./assets/pdfjs/standard_fonts/",
      wasmUrl: "./assets/pdfjs/wasm/"
    });
    documentHandle = await task.promise;
    updateControls();
    await renderPage();
  } catch (error) {
    console.error(error);
    setError(error?.message || "The PDF could not be rendered in the reader.");
  }
}

previousButton.addEventListener("click", () => {
  if (currentPage <= 1) return;
  currentPage -= 1;
  renderPage();
});

nextButton.addEventListener("click", () => {
  if (!documentHandle || currentPage >= documentHandle.numPages) return;
  currentPage += 1;
  renderPage();
});

pageInput.addEventListener("change", () => {
  if (!documentHandle) return;
  currentPage = Math.max(1, Math.min(documentHandle.numPages, Number(pageInput.value) || 1));
  renderPage();
});

document.querySelector("[data-zoom-out]").addEventListener("click", () => {
  zoom = Math.max(.5, Math.round((zoom - .15) * 100) / 100);
  renderPage();
});

document.querySelector("[data-zoom-in]").addEventListener("click", () => {
  zoom = Math.min(3, Math.round((zoom + .15) * 100) / 100);
  renderPage();
});

document.querySelector("[data-fit-width]").addEventListener("click", () => {
  zoom = 1;
  renderPage();
});

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => renderPage(), 140);
});

loadPdf();
