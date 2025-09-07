// Client-side pagination for the check-in table
(function () {
	function select(selector, root) {
		return (root || document).querySelector(selector);
	}

	function selectAll(selector, root) {
		return Array.prototype.slice.call((root || document).querySelectorAll(selector));
	}

	function paginateRows(rows, page, pageSize) {
		var start = (page - 1) * pageSize;
		var end = start + pageSize;
		rows.forEach(function (row, index) {
			row.style.display = index >= start && index < end ? "grid" : "none";
		});
	}

	function updatePageInfo(el, page, totalPages, totalRows) {
		if (!el) return;
		el.textContent = "Page " + page + " of " + totalPages + " (" + totalRows + " rows)";
	}

	function initPagination() {
		var tableBody = select(".user-table .table-body");
		if (!tableBody) return;
		var allRows = selectAll(".table-row", tableBody);
		if (!allRows.length) return;

		var pageSizeSelect = select("#pageSizeSelect");
		var firstBtn = select("#firstPageBtn");
		var prevBtn = select("#prevPageBtn");
		var nextBtn = select("#nextPageBtn");
		var lastBtn = select("#lastPageBtn");
		var pageInfo = select("#pageInfo");

		var state = {
			page: 1,
			pageSize: pageSizeSelect ? parseInt(pageSizeSelect.value, 10) || 10 : 10
		};

		function getTotalPages() {
			return Math.max(1, Math.ceil(allRows.length / state.pageSize));
		}

		function clampPage(p) {
			var total = getTotalPages();
			if (p < 1) return 1;
			if (p > total) return total;
			return p;
		}

		function render() {
			var totalPages = getTotalPages();
			state.page = clampPage(state.page);
			paginateRows(allRows, state.page, state.pageSize);
			updatePageInfo(pageInfo, state.page, totalPages, allRows.length);
			// Enable/disable buttons
			if (firstBtn) firstBtn.disabled = state.page === 1;
			if (prevBtn) prevBtn.disabled = state.page === 1;
			if (nextBtn) nextBtn.disabled = state.page === totalPages;
			if (lastBtn) lastBtn.disabled = state.page === totalPages;
		}

		// Wire controls
		if (pageSizeSelect) {
			pageSizeSelect.addEventListener("change", function () {
				state.pageSize = parseInt(pageSizeSelect.value, 10) || 10;
				state.page = 1;
				render();
			});
		}

		if (firstBtn) firstBtn.addEventListener("click", function () {
			state.page = 1;
			render();
		});
		if (prevBtn) prevBtn.addEventListener("click", function () {
			state.page = clampPage(state.page - 1);
			render();
		});
		if (nextBtn) nextBtn.addEventListener("click", function () {
			state.page = clampPage(state.page + 1);
			render();
		});
		if (lastBtn) lastBtn.addEventListener("click", function () {
			state.page = getTotalPages();
			render();
		});

		render();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initPagination);
	} else {
		initPagination();
	}
})();


