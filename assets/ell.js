document.addEventListener('DOMContentLoaded', () => {
  setupMobileNav();
  setupCatalog();
  setupProcurementVerification();
  setupInquiryPlaceholder();
  setupCurrentYear();
});

function setupMobileNav() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const sheet = document.querySelector('[data-mobile-nav]');
  if (!toggle || !sheet) return;

  const close = sheet.querySelector('[data-nav-close]');
  const backdrop = sheet.querySelector('[data-nav-backdrop]');
  const links = sheet.querySelectorAll('a');
  const desktopQuery = window.matchMedia('(min-width: 901px)');

  const closeSheet = () => {
    sheet.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  const openSheet = () => {
    sheet.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };

  const syncForViewport = (event) => {
    if (event.matches) closeSheet();
  };

  toggle.setAttribute('aria-expanded', 'false');

  toggle.addEventListener('click', () => {
    if (sheet.classList.contains('is-open')) closeSheet();
    else openSheet();
  });

  [close, backdrop].forEach((element) => {
    if (element) element.addEventListener('click', closeSheet);
  });

  links.forEach((link) => link.addEventListener('click', closeSheet));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSheet();
  });

  if (typeof desktopQuery.addEventListener === 'function') {
    desktopQuery.addEventListener('change', syncForViewport);
  } else if (typeof desktopQuery.addListener === 'function') {
    desktopQuery.addListener(syncForViewport);
  }

  syncForViewport(desktopQuery);
}

function setupCatalog() {
  const catalog = document.querySelector('[data-catalog-root]');
  if (!catalog) return;

  const items = [...catalog.querySelectorAll('[data-lot-item]')];
  if (!items.length) return;

  const search = catalog.querySelector('[data-catalog-search]');
  const sort = catalog.querySelector('[data-catalog-sort]');
  const resetButtons = catalog.querySelectorAll('[data-catalog-reset]');
  const count = catalog.querySelector('[data-results-count]');
  const empty = catalog.querySelector('[data-catalog-empty]');
  const pills = catalog.querySelector('[data-filter-pills]');
  const filterButton = catalog.querySelector('[data-filter-toggle]');
  const filterSheet = catalog.querySelector('[data-mobile-filters]');

  const closeFilterSheet = () => {
    if (!filterSheet) return;
    filterSheet.classList.remove('is-open');
    document.body.style.overflow = '';
  };

  const openFilterSheet = () => {
    if (!filterSheet) return;
    filterSheet.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };

  if (filterButton && filterSheet) {
    const close = filterSheet.querySelector('[data-filter-close]');
    const backdrop = filterSheet.querySelector('[data-filter-backdrop]');
    filterButton.addEventListener('click', openFilterSheet);
    [close, backdrop].forEach((element) => {
      if (element) element.addEventListener('click', closeFilterSheet);
    });
  }

  const filterNames = ['source', 'volume', 'status', 'cells'];

  const getSelectedValues = (name) =>
    [...catalog.querySelectorAll(`[data-filter-group="${name}"] input:checked`)].map((input) => input.value.toLowerCase());

  const parseCellCount = (value) => {
    const normalized = String(value).replace(/[^0-9.]/g, '');
    return Number.parseFloat(normalized || '0');
  };

  const matchesCellFilter = (itemValue, filters) => {
    if (!filters.length) return true;
    const cellValue = parseCellCount(itemValue);
    return filters.some((filter) => {
      if (filter.includes('10')) return cellValue >= 10;
      if (filter.includes('5')) return cellValue >= 5;
      if (filter.includes('1')) return cellValue >= 1;
      return String(itemValue).toLowerCase().includes(filter);
    });
  };

  const getItemSignature = (item) => ({
    source: (item.dataset.source || '').toLowerCase(),
    volume: (item.dataset.volume || '').toLowerCase(),
    status: (item.dataset.status || '').toLowerCase(),
    cells: item.dataset.cells || '',
    search: (item.dataset.search || '').toLowerCase(),
    sortViability: Number.parseFloat(item.dataset.viabilitySort || '0'),
    sortCells: parseCellCount(item.dataset.cells),
    sortVolume: Number.parseFloat((item.dataset.volume || '').replace(/[^0-9.]/g, '') || '0'),
  });

  const syncMirroredInputs = (event) => {
    const source = event.target;
    if (!(source instanceof HTMLInputElement)) return;
    const key = source.getAttribute('data-sync-key');
    if (!key) return;
    catalog.querySelectorAll(`[data-sync-key="${key}"]`).forEach((input) => {
      if (input !== source) input.checked = source.checked;
    });
    applyFilters();
  };

  catalog.querySelectorAll('[data-sync-key]').forEach((input) => input.addEventListener('change', syncMirroredInputs));

  const applySort = (value) => {
    catalog.querySelectorAll('[data-sort-container]').forEach((wrapper) => {
      const sortable = [...wrapper.querySelectorAll('[data-lot-item]')];
      const visible = sortable.filter((item) => !item.hidden);
      const hidden = sortable.filter((item) => item.hidden);

      visible.sort((a, b) => {
        const one = getItemSignature(a);
        const two = getItemSignature(b);

        switch (value) {
          case 'viability-desc':
            return two.sortViability - one.sortViability;
          case 'cells-desc':
            return two.sortCells - one.sortCells;
          case 'volume-asc':
            return one.sortVolume - two.sortVolume;
          default:
            return 0;
        }
      });

      [...visible, ...hidden].forEach((item) => wrapper.appendChild(item));
    });
  };

  const updatePills = (selected, query) => {
    if (!pills) return;

    const fragments = [];
    if (selected.source.length) fragments.push(`Tissue: ${selected.source.join(', ')}`);
    if (selected.volume.length) fragments.push(`Vol: ${selected.volume.join(', ')}`);
    if (selected.cells.length) fragments.push(`Cells: ${selected.cells.join(', ')}`);
    if (selected.status.length) fragments.push(`Status: ${selected.status.join(', ')}`);
    if (query) fragments.push(`Search: ${query}`);

    pills.innerHTML = '';

    if (!fragments.length) {
      const span = document.createElement('span');
      span.className = 'muted-copy';
      span.textContent = 'Showing all inventory lots';
      pills.appendChild(span);
      return;
    }

    fragments.forEach((label) => {
      const pill = document.createElement('span');
      pill.className = 'filter-pill';
      pill.textContent = label;
      pills.appendChild(pill);
    });
  };

  const applyFilters = () => {
    const selected = Object.fromEntries(filterNames.map((name) => [name, getSelectedValues(name)]));
    const query = search ? search.value.trim().toLowerCase() : '';
    let visibleCount = 0;

    items.forEach((item) => {
      const meta = getItemSignature(item);
      const sourceMatch = !selected.source.length || selected.source.includes(meta.source);
      const volumeMatch = !selected.volume.length || selected.volume.includes(meta.volume);
      const statusMatch = !selected.status.length || selected.status.includes(meta.status);
      const cellsMatch = matchesCellFilter(meta.cells, selected.cells);
      const queryMatch = !query || meta.search.includes(query);
      const isVisible = sourceMatch && volumeMatch && statusMatch && cellsMatch && queryMatch;

      item.hidden = !isVisible;
      if (isVisible) visibleCount += 1;
    });

    if (sort) applySort(sort.value);
    if (count) count.textContent = `${visibleCount} Result${visibleCount === 1 ? '' : 's'}`;
    if (empty) empty.classList.toggle('is-visible', visibleCount === 0);
    updatePills(selected, query);
  };

  const clearAll = () => {
    catalog.querySelectorAll('[data-filter-group] input').forEach((input) => {
      input.checked = false;
    });
    if (search) search.value = '';
    if (sort) sort.value = 'default';
    applyFilters();
    closeFilterSheet();
  };

  if (search) search.addEventListener('input', applyFilters);
  if (sort) {
    sort.addEventListener('change', () => {
      applySort(sort.value);
      applyFilters();
    });
  }
  resetButtons.forEach((button) => button.addEventListener('click', clearAll));

  applyFilters();
}

function setupProcurementVerification() {
  document.querySelectorAll('[data-verify-trigger]').forEach((button) => {
    button.addEventListener('click', () => {
      const root = button.closest('[data-verification-root]');
      if (!root) return;

      const input = root.querySelector('[data-npi-input]');
      const institution = root.querySelector('[data-institution-input]');
      const status = root.querySelector('[data-verification-status]');
      const value = input instanceof HTMLInputElement ? input.value.trim() : '';
      const institutionValue = institution instanceof HTMLInputElement ? institution.value.trim() : '';

      if (value.length < 10) {
        if (status) status.textContent = 'Enter a valid 10-digit NPI to continue.';
        return;
      }

      if (status) {
        status.textContent = institutionValue
          ? `Verified for ${institutionValue}. Your compliance packet is queued for review.`
          : 'Verification received. Your compliance packet is queued for review.';
      }
    });
  });
}

function setupInquiryPlaceholder() {
  document.querySelectorAll('[data-inquiry-button]').forEach((button) => {
    button.addEventListener('click', () => {
      const root = button.closest('[data-inquiry-root]');
      if (!root) return;
      const target = root.querySelector('[data-inquiry-status]');
      if (target) {
        target.textContent = 'Allocation inquiry captured. Direct the provider to the procurement page to complete verification.';
      }
    });
  });
}

function setupCurrentYear() {
  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
}
