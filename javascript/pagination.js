// Universal pagination for tables
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
			var isTr = row && row.tagName && row.tagName.toLowerCase() === "tr";
			var visible = index >= start && index < end;
			row.style.display = visible ? (isTr ? "" : "grid") : "none";
		});
	}

	function updatePageInfo(el, page, totalPages, totalRows) {
		if (!el) return;
		el.textContent = "Page " + page + " of " + totalPages + " (" + totalRows + " rows)";
	}

	function adjustHeaderForScrollbar(tableSelector) {
		var tableBody = select(tableSelector + " .table-body");
		var tableHeader = select(tableSelector + " .table-header");
		if (!tableBody || !tableHeader) return;
		
		// Calculate scrollbar width
		var scrollbarWidth = tableBody.offsetWidth - tableBody.clientWidth;
		tableHeader.style.paddingRight = scrollbarWidth + "px";
	}

	function initPagination(tableSelector) {
		var tableBody = select(tableSelector + " .table-body");
		var isDivTable = true;
		if (!tableBody) {
			// Fallback for native tables
			tableBody = select(tableSelector + " tbody");
			isDivTable = false;
		}
		if (!tableBody) return;
		var allRows = isDivTable ? selectAll(".table-row", tableBody) : selectAll("tr", tableBody);
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
			
			// Adjust header alignment after rendering
			setTimeout(function() { adjustHeaderForScrollbar(tableSelector); }, 0);
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
		
		// Handle window resize
		window.addEventListener("resize", function() { adjustHeaderForScrollbar(tableSelector); });
	}

	// Auto-initialize based on which table is present
	function autoInit() {
		// Check for checkin table
		if (select(".user-table")) {
			initPagination(".user-table");
		}
		// Check for products table
		if (select(".products-table")) {
			initPagination(".products-table");
		}
		// Check for transactions table (store credits)
		if (select(".transactions-table-container")) {
			// Wrap the native <table> with virtual row divs for pagination logic consistency
			// Convert <tbody> rows to divs with class .table-row and .table-cell so paginateRows works
			var tbody = select(".transactions-table tbody");
			if (tbody) {
				var rows = selectAll("tr", tbody);
				rows.forEach(function(tr){
					// ensure each row is displayed as grid for paginateRows toggle
					tr.classList.add("table-row");
				});
			}
			initPagination(".transactions-table-container");
		}
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", autoInit);
	} else {
		autoInit();
	}

	// Expose a public re-initializer for dynamic tables
	window.initTablePagination = function(selector){
		initPagination(selector);
	};
})();
