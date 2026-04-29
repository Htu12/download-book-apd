const TOKEN_KEY = "auth_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function redirectToLogin() {
  removeToken();
  window.location.replace("/login.html");
}

if (!getToken()) {
  redirectToLogin();
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleUnauthorized(response) {
  if (response.status === 401) {
    redirectToLogin();
    return true;
  }
  return false;
}

// DOM
const logoutBtn = document.getElementById("logoutBtn");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const summaryText = document.getElementById("summaryText");
const resultSection = document.getElementById("resultSection");
const resultTableWrap = document.getElementById("resultTableWrap");
const resultBody = document.getElementById("resultBody");
const statusBox = document.getElementById("statusBox");
const alertBox = document.getElementById("alertBox");
const pagination = document.getElementById("pagination");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfo = document.getElementById("pageInfo");

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;

const state = {
  allResults: [],
  currentPage: 1,
  latestSearchRequestId: 0,
  searchAbortController: null,
};

let debounceTimer = null;
let alertTimer = null;

// Helpers
function showElement(el) {
  el?.classList.remove("hidden");
}

function hideElement(el) {
  el?.classList.add("hidden");
}

function showAlert(message) {
  alertBox.textContent = message || "";
  alertBox.className = "alert";
  showElement(alertBox);

  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => hideAlert(), 2500);
}

function hideAlert() {
  hideElement(alertBox);
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getTotalPages() {
  return Math.max(1, Math.ceil(state.allResults.length / PAGE_SIZE));
}

function clampCurrentPage() {
  const totalPages = getTotalPages();
  if (state.currentPage < 1) state.currentPage = 1;
  if (state.currentPage > totalPages) state.currentPage = totalPages;
}

function getPageItems(page) {
  const start = (page - 1) * PAGE_SIZE;
  return state.allResults.slice(start, start + PAGE_SIZE);
}

// Render
function buildPlaceholderRows(count) {
  return Array.from({ length: count })
    .map(
      () => `
        <tr class="placeholder-row" aria-hidden="true">
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
      `,
    )
    .join("");
}

function renderRows(items) {
  const rowsHtml = items
    .map(
      (item) => `
        <tr>
          <td title="${escapeHtml(item.bookName)}">${escapeHtml(item.bookName)}</td>
          <td>
            <div class="actions">
              <button class="btn btn-outline btn-sm" type="button" data-doc-id="${escapeHtml(item.docId)}">
                Tải
              </button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");

  const placeholderCount = Math.max(0, PAGE_SIZE - items.length);
  resultBody.innerHTML = rowsHtml + buildPlaceholderRows(placeholderCount);
}

function updatePagination() {
  if (state.allResults.length <= PAGE_SIZE) {
    hideElement(pagination);
    return;
  }

  clampCurrentPage();
  const totalPages = getTotalPages();
  pageInfo.textContent = `Trang ${state.currentPage} / ${totalPages}`;
  prevPageBtn.disabled = state.currentPage <= 1;
  nextPageBtn.disabled = state.currentPage >= totalPages;
  showElement(pagination);
}

function renderCurrentPage() {
  clampCurrentPage();
  const pageItems = getPageItems(state.currentPage);

  if (!pageItems.length) {
    renderStateNotFound();
    return;
  }

  renderRows(pageItems);
  updatePagination();
}

function renderStateIdle() {
  summaryText.textContent = "Nhập từ khóa để bắt đầu tìm kiếm";
  hideAlert();
  hideElement(statusBox);
  hideElement(pagination);
  hideElement(resultTableWrap);
  hideElement(resultSection);
  resultBody.innerHTML = "";
}

function renderStateLoading() {
  summaryText.textContent = "Đang tìm kiếm...";
  hideAlert();
  hideElement(pagination);
  hideElement(resultTableWrap);
  hideElement(resultSection);
  resultBody.innerHTML = "";
}

function renderStateNotFound() {
  summaryText.textContent = "Không tìm thấy kết quả";
  hideAlert();
  hideElement(pagination);
  hideElement(resultTableWrap);
  hideElement(resultSection);
  resultBody.innerHTML = "";
}

function renderStateError() {
  summaryText.textContent = "Có lỗi khi tìm kiếm";
  hideAlert();
  hideElement(pagination);
  hideElement(resultTableWrap);
  hideElement(resultSection);
  resultBody.innerHTML = "";
}

function renderStateSuccess(text) {
  summaryText.textContent = text;
  showElement(resultSection);
  hideAlert();
  hideElement(statusBox);
  showElement(resultTableWrap);
  renderCurrentPage();
}

// State
function resetSearchState() {
  state.allResults = [];
  state.currentPage = 1;
  state.latestSearchRequestId += 1;

  if (state.searchAbortController) {
    state.searchAbortController.abort();
    state.searchAbortController = null;
  }

  searchBtn.disabled = false;
}

function resetEmptyState() {
  resetSearchState();
  renderStateIdle();
}

function setSearchResults(results, total) {
  state.allResults = Array.isArray(results) ? results : [];
  state.currentPage = 1;

  if (!state.allResults.length) {
    renderStateNotFound();
    return;
  }

  renderStateSuccess(`Tìm thấy ${Number(total || state.allResults.length)} kết quả`);
}

function setSearchError() {
  state.allResults = [];
  state.currentPage = 1;
  renderStateError();
}

// Search
async function searchBooks() {
  const q = searchInput.value.trim();

  if (!q) {
    resetEmptyState();
    return;
  }

  if (state.searchAbortController) {
    state.searchAbortController.abort();
  }

  const controller = new AbortController();
  state.searchAbortController = controller;
  const requestId = ++state.latestSearchRequestId;

  searchBtn.disabled = true;
  renderStateLoading();

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
      headers: authHeaders(),
    });

    if (handleUnauthorized(response)) return;

    const data = await response.json();
    if (requestId !== state.latestSearchRequestId) return;

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Tìm kiếm thất bại");
    }

    setSearchResults(data.results, data.total);
  } catch (error) {
    if (error.name === "AbortError") return;
    if (requestId !== state.latestSearchRequestId) return;
    setSearchError(error.message || "Tìm kiếm thất bại");
  } finally {
    if (requestId === state.latestSearchRequestId) {
      searchBtn.disabled = false;
      state.searchAbortController = null;
    }
  }
}

// Download
function getFileNameFromResponse(response, docId) {
  let fileName = `download_${docId}`;
  const cd = response.headers.get("Content-Disposition") || "";

  const utf8Match = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const asciiMatch = cd.match(/filename="([^"]+)"/i);

  if (utf8Match) fileName = decodeURIComponent(utf8Match[1]);
  else if (asciiMatch) fileName = asciiMatch[1];

  return fileName;
}

function triggerBrowserDownload(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

async function downloadBook(docId, btn) {
  if (!docId) return;

  const originalText = btn ? btn.textContent : "Tải";

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Đang tải...";
    }

    const response = await fetch(`/api/download?d=${encodeURIComponent(docId)}`, {
      headers: authHeaders(),
    });

    if (handleUnauthorized(response)) return;

    if (!response.ok) {
      let errorMessage = "Tải file thất bại";
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    const fileName = getFileNameFromResponse(response, docId);
    triggerBrowserDownload(blob, fileName);

    if (btn) {
      btn.textContent = "Đã tải";
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 1500);
    }
  } catch (error) {
    console.error("[DOWNLOAD_ERROR]", error);

    if (btn) {
      btn.textContent = "Lỗi";
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 1500);
    }

    showAlert(error.message || "Không tải được file");
  }
}

// Events
logoutBtn.addEventListener("click", () => {
  removeToken();
  window.location.replace("/login.html");
});

prevPageBtn.addEventListener("click", () => {
  if (state.currentPage > 1) {
    state.currentPage -= 1;
    renderCurrentPage();
  }
});

nextPageBtn.addEventListener("click", () => {
  if (state.currentPage < getTotalPages()) {
    state.currentPage += 1;
    renderCurrentPage();
  }
});

searchBtn.addEventListener("click", () => {
  clearTimeout(debounceTimer);
  searchBooks();
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    clearTimeout(debounceTimer);
    searchBooks();
  }

  if (event.key === "Escape") {
    searchInput.value = "";
    clearTimeout(debounceTimer);
    resetEmptyState();
  }
});

searchInput.addEventListener("input", () => {
  const value = searchInput.value.trim();
  clearTimeout(debounceTimer);

  if (!value) {
    resetEmptyState();
    return;
  }

  debounceTimer = setTimeout(() => searchBooks(), SEARCH_DEBOUNCE_MS);
});

resultBody.addEventListener("click", (event) => {
  const button = event.target.closest(".btn[data-doc-id]");
  if (!button) return;
  downloadBook(button.dataset.docId, button);
});

// Init
resetEmptyState();
