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

function addClassIfNotExists(el, className) {
  if (el && !el.classList.contains(className)) {
    el.classList.add(className);
  }
}

function removeClassIfExists(el, className) {
  if (el && el.classList.contains(className)) {
    el.classList.remove(className);
  }
}

function showElement(el) {
  removeClassIfExists(el, "hidden");
}

function hideElement(el) {
  addClassIfNotExists(el, "hidden");
}

function showResultSection() {
  showElement(resultSection);
}

function hideResultSection() {
  hideElement(resultSection);
}

function showResultTable() {
  showElement(resultTableWrap);
}

function hideResultTable() {
  hideElement(resultTableWrap);
}

function showStatusBox(message = "") {
  statusBox.textContent = message;
  showElement(statusBox);
}

function hideStatusBox() {
  statusBox.textContent = "";
  hideElement(statusBox);
}

function showPagination() {
  showElement(pagination);
}

function hidePagination() {
  hideElement(pagination);
}

function showAlert(message) {
  alertBox.textContent = message || "";
  alertBox.className = "alert";
  showElement(alertBox);

  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => {
    hideAlert();
  }, 2500);
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

  if (state.currentPage < 1) {
    state.currentPage = 1;
  }

  if (state.currentPage > totalPages) {
    state.currentPage = totalPages;
  }
}

function getPageItems(page) {
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  return state.allResults.slice(start, end);
}

function buildPlaceholderRows(count) {
  return Array.from({ length: count })
    .map(
      () => `
        <tr class="placeholder-row" aria-hidden="true">
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>
            <div class="actions">
              <button class="action-btn" type="button" tabindex="-1">Tải</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function clearResults() {
  resultBody.innerHTML = "";
}

function updatePagination() {
  if (state.allResults.length <= PAGE_SIZE) {
    hidePagination();
    return;
  }

  clampCurrentPage();

  const totalPages = getTotalPages();
  pageInfo.textContent = `Trang ${state.currentPage} / ${totalPages}`;
  prevPageBtn.disabled = state.currentPage <= 1;
  nextPageBtn.disabled = state.currentPage >= totalPages;

  showPagination();
}

function renderRows(items) {
  const rowsHtml = items
    .map(
      (item) => `
        <tr>
          <td title="${escapeHtml(item.docId)}">${escapeHtml(item.docId)}</td>
          <td title="${escapeHtml(item.bookName)}">${escapeHtml(item.bookName)}</td>
          <td>
            <div class="actions">
              <button
                class="action-btn"
                type="button"
                data-doc-id="${escapeHtml(item.docId)}"
              >
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
  summaryText.textContent = "Chưa tìm kiếm";
  hideAlert();
  hideStatusBox();
  hidePagination();
  hideResultTable();
  hideResultSection();
  clearResults();
}

function renderStateLoading() {
  summaryText.textContent = "Đang tìm kiếm...";
  showResultSection();
  hideAlert();
  hidePagination();
  hideResultTable();
  clearResults();
  hideResultSection();
}

function renderStateNotFound() {
  summaryText.textContent = "Không tìm thấy kết quả";
  showResultSection();
  hideAlert();
  hidePagination();
  hideResultTable();
  clearResults();
  hideResultSection();
}

function renderStateError(message) {
  summaryText.textContent = "Có lỗi khi tìm kiếm";
  showResultSection();
  hideAlert();
  hidePagination();
  hideResultTable();
  clearResults();
  hideResultSection();
}

function renderStateSuccess(resultsCountText) {
  summaryText.textContent = resultsCountText;
  showResultSection();
  hideAlert();
  hideStatusBox();
  showResultTable();
  renderCurrentPage();
}

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

  const safeTotal = Number(total || state.allResults.length);
  renderStateSuccess(`Tìm thấy ${safeTotal} kết quả`);
}

function setSearchError(message) {
  state.allResults = [];
  state.currentPage = 1;
  renderStateError(message);
}

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
    });

    const data = await response.json();

    if (requestId !== state.latestSearchRequestId) {
      return;
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Tìm kiếm thất bại");
    }

    setSearchResults(data.results, data.total);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    if (requestId !== state.latestSearchRequestId) {
      return;
    }

    setSearchError(error.message || "Tìm kiếm thất bại");
  } finally {
    if (requestId === state.latestSearchRequestId) {
      searchBtn.disabled = false;
      state.searchAbortController = null;
    }
  }
}

function getFileNameFromResponse(response, docId) {
  let fileName = `download_${docId}`;
  const contentDisposition = response.headers.get("Content-Disposition") || "";

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  const asciiMatch = contentDisposition.match(/filename="([^"]+)"/i);

  if (utf8Match) {
    fileName = decodeURIComponent(utf8Match[1]);
  } else if (asciiMatch) {
    fileName = asciiMatch[1];
  }

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

  setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 1000);
}

async function downloadBook(docId, btn) {
  if (!docId) return;

  const originalText = btn ? btn.textContent : "Tải";

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Đang tải...";
    }

    const response = await fetch(`/api/download?d=${encodeURIComponent(docId)}`);

    if (!response.ok) {
      let errorMessage = "Tải file thất bại";

      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // bỏ qua
      }

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

  debounceTimer = setTimeout(() => {
    searchBooks();
  }, SEARCH_DEBOUNCE_MS);
});

resultBody.addEventListener("click", (event) => {
  const button = event.target.closest(".action-btn[data-doc-id]");
  if (!button) return;

  const { docId } = button.dataset;
  downloadBook(docId, button);
});

resetEmptyState();
