document.addEventListener('DOMContentLoaded', () => {
  setupMobileNav();
  setupStickyHeader();
  setupProviderSignupRedirects();
  setupProviderRegistrationForm();
  setupCatalog();
  setupQualitySidebar();
  setupCurrentYear();
  setupSiteAnimations();
});

const ELL_PROVIDER_REGISTRATION_FALLBACK_ENDPOINT = 'https://ell-npi-verifier.onrender.com/provider-registration';

function isLocalHostname(hostname) {
  return ['127.0.0.1', 'localhost', '0.0.0.0', '::1'].includes(String(hostname || '').toLowerCase());
}

function getProviderRegistrationEndpointCandidates() {
  const configured = (document.body.dataset.providerRegistrationEndpoint || '').trim();
  const candidates = [];
  const add = (endpoint) => {
    if (!endpoint) return;

    try {
      const url = new URL(endpoint);
      if (!['http:', 'https:'].includes(url.protocol)) return;
      const normalized = url.href;
      if (!candidates.includes(normalized)) candidates.push(normalized);
    } catch (error) {
      console.warn('Ignoring invalid provider registration endpoint.', endpoint);
    }
  };

  if (isLocalHostname(window.location.hostname)) {
    add('http://127.0.0.1:8787/provider-registration');
  }

  add(configured);
  add(ELL_PROVIDER_REGISTRATION_FALLBACK_ENDPOINT);

  return candidates;
}

async function submitProviderRegistration(payload) {
  const attempts = [];

  for (const endpoint of getProviderRegistrationEndpointCandidates()) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok === false) {
        const message = data.message || `Registration endpoint returned ${response.status}.`;
        const error = new Error(message);
        error.status = response.status;
        error.endpoint = endpoint;
        throw error;
      }

      return data;
    } catch (error) {
      attempts.push({
        endpoint,
        status: error instanceof Error ? error.status : undefined,
        message: error instanceof Error ? error.message : 'Unknown registration error',
      });
    }
  }

  console.warn('ELL provider registration endpoints were unreachable.', attempts);

  if (attempts.some((attempt) => attempt.status === 404)) {
    throw new Error('Provider registration is not deployed on the connected service yet. Please redeploy the ELL provider access service and try again.');
  }

  const configuredError = attempts.find((attempt) => attempt.message && !attempt.message.includes('Failed to fetch'));
  if (configuredError?.message) {
    throw new Error(configuredError.message);
  }

  throw new Error('Provider registration is temporarily unavailable. Please try again shortly.');
}

function setupProviderSignupRedirects() {
  const catalogUrl = document.body.dataset.catalogUrl || '/collections/all';
  const registrationUrl = document.body.dataset.providerRegistrationUrl || `${catalogUrl}?view=provider-registration`;
  const isProviderApproved = document.body.dataset.providerApproved === 'true';
  const currentUrl = new URL(window.location.href);
  const view = currentUrl.searchParams.get('view') || '';
  const catalogPath = new URL(catalogUrl, window.location.origin).pathname.replace(/\/$/, '') || '/collections/all';
  const allowedViews = new Set([
    'about-us',
    'quality-safety',
    'provider-registration',
    'provider-info',
    'pricing-order-form',
    'featured-biologic-of-the-month',
  ]);

  if (isProviderApproved) return;

  const shouldGateUrl = (url) => {
    const target = new URL(url, window.location.origin);
    const targetPath = target.pathname.replace(/\/$/, '') || '/';
    const targetView = target.searchParams.get('view') || '';
    if (targetView && allowedViews.has(targetView)) return false;
    return targetPath === catalogPath || targetPath.startsWith('/products/');
  };

  if (!allowedViews.has(view) && shouldGateUrl(currentUrl.href)) {
    window.location.replace(registrationUrl);
    return;
  }

  document.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (shouldGateUrl(href)) link.setAttribute('href', registrationUrl);
  });
}

function setupProviderRegistrationForm() {
  const form = document.querySelector('[data-provider-registration-form]');
  if (!(form instanceof HTMLFormElement)) return;

  const success = form.querySelector('[data-provider-registration-success]');
  const error = form.querySelector('[data-provider-registration-error]');
  const submitButton = form.querySelector('[type="submit"]');

  const setStatus = (target) => {
    [success, error].forEach((element) => {
      if (element instanceof HTMLElement) element.hidden = element !== target;
    });

    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const payload = {};
    const data = new FormData(form);

    data.forEach((value, key) => {
      if (key.toLowerCase().includes('password')) return;
      payload[key] = String(value).trim();
    });

    payload.submitted_at = new Date().toISOString();

    try {
      form.setAttribute('aria-busy', 'true');
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = true;
        submitButton.dataset.originalLabel = submitButton.innerHTML || '';
        submitButton.textContent = 'Submitting for review...';
      }

      const result = await submitProviderRegistration(payload);
      if (success instanceof HTMLElement && result.message) success.textContent = result.message;
      form.reset();
      setStatus(success);
    } catch (registrationError) {
      if (error instanceof HTMLElement) {
        error.textContent = registrationError instanceof Error
          ? registrationError.message
          : 'Provider registration could not be saved. Please try again shortly.';
      }
      setStatus(error);
    } finally {
      form.removeAttribute('aria-busy');
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
        submitButton.innerHTML = submitButton.dataset.originalLabel || 'Submit provider registration';
      }
    }
  });
}

function setupStickyHeader() {
  const header = document.querySelector('.site-header');
  if (!(header instanceof HTMLElement)) return;

  const syncHeaderState = () => {
    if (window.scrollY > 8) header.classList.add('is-scrolled');
    else header.classList.remove('is-scrolled');
  };

  syncHeaderState();
  window.addEventListener('scroll', syncHeaderState, { passive: true });
}

function setupMobileNav() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const sheet = document.querySelector('[data-mobile-nav]');
  if (!toggle || !sheet) return;

  const close = sheet.querySelector('[data-nav-close]');
  const backdrop = sheet.querySelector('[data-nav-backdrop]');
  const links = sheet.querySelectorAll('a');
  const desktopQuery = window.matchMedia('(min-width: 1041px)');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let closeTimer;

  const closeSheet = () => {
    if (!sheet.classList.contains('is-open') && !sheet.classList.contains('is-closing')) return;

    window.clearTimeout(closeTimer);
    sheet.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');

    if (motionQuery.matches) {
      sheet.classList.remove('is-closing');
      sheet.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      return;
    }

    sheet.classList.add('is-closing');
    closeTimer = window.setTimeout(() => {
      sheet.classList.remove('is-closing');
      sheet.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }, 320);
  };

  const openSheet = () => {
    window.clearTimeout(closeTimer);
    sheet.classList.remove('is-closing');
    sheet.setAttribute('aria-hidden', 'false');
    sheet.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    document.body.style.overflow = 'hidden';
  };

  const syncForViewport = (event) => {
    if (event.matches) closeSheet();
  };

  toggle.setAttribute('aria-expanded', 'false');
  sheet.setAttribute('aria-hidden', 'true');

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
  const searches = [...catalog.querySelectorAll('[data-catalog-search]')];
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
    if (filterButton) filterButton.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  const openFilterSheet = () => {
    if (!filterSheet) return;
    filterSheet.classList.add('is-open');
    if (filterButton) filterButton.setAttribute('aria-expanded', 'true');
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

  const getSearchQuery = () => {
    const activeSearch = searches.find((input) => input.value.trim());
    return activeSearch ? activeSearch.value.trim().toLowerCase() : '';
  };

  const syncSearchInputs = (event) => {
    const source = event.target;
    if (!(source instanceof HTMLInputElement)) return;
    searches.forEach((input) => {
      if (input !== source) input.value = source.value;
    });
    applyFilters();
  };

  const applyFilters = () => {
    const selected = Object.fromEntries(filterNames.map((name) => [name, getSelectedValues(name)]));
    const query = getSearchQuery();
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
    searches.forEach((input) => {
      input.value = '';
    });
    if (sort) sort.value = 'default';
    applyFilters();
    closeFilterSheet();
  };

  searches.forEach((input) => input.addEventListener('input', syncSearchInputs));
  if (sort) {
    sort.addEventListener('change', () => {
      applySort(sort.value);
      applyFilters();
    });
  }
  resetButtons.forEach((button) => button.addEventListener('click', clearAll));

  applyFilters();
}

function setupQualitySidebar() {
  const qualityPage = document.querySelector('.quality-page');
  if (!qualityPage) return;

  const links = [...qualityPage.querySelectorAll('.quality-sidebar__nav a[href^="#"]')];
  const sections = links
    .map((link) => {
      const id = link.getAttribute('href')?.slice(1);
      const section = id ? document.getElementById(id) : null;
      return section ? { link, section } : null;
    })
    .filter(Boolean);

  if (!sections.length) return;

  const setActive = (activeLink) => {
    links.forEach((link) => {
      const isActive = link === activeLink;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  };

  const getHeaderOffset = () => {
    const styles = window.getComputedStyle(document.documentElement);
    const headerHeight = Number.parseFloat(styles.getPropertyValue('--ell-header-height')) || 76;
    return headerHeight + 48;
  };

  const updateActiveFromScroll = () => {
    let active = sections[0];
    const activationLine = getHeaderOffset();

    sections.forEach((entry) => {
      if (entry.section.getBoundingClientRect().top <= activationLine) active = entry;
    });

    setActive(active.link);
  };

  const scheduleUpdate = () => window.requestAnimationFrame(updateActiveFromScroll);

  links.forEach((link) => {
    link.addEventListener('click', () => {
      setActive(link);
      window.setTimeout(updateActiveFromScroll, 120);
    });
  });

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('hashchange', () => window.setTimeout(updateActiveFromScroll, 120));
  window.addEventListener('load', updateActiveFromScroll);
  updateActiveFromScroll();
  window.setTimeout(updateActiveFromScroll, 120);
}

function setupCurrentYear() {
  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
}

function setupSiteAnimations() {
  const root = document.documentElement;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionGroups = [
    { selector: '.home-hero__copy > .eyebrow, .home-hero__copy > .display-title, .home-hero__copy > .lead-copy', variant: 'motion-hero-copy', step: 110 },
    { selector: '.home-hero__actions .ell-button', variant: 'motion-hero-action', step: 95 },
    { selector: '.cell-visual', variant: 'motion-hero-visual' },
    { selector: '.trust-badge', variant: 'motion-fade-up', step: 70 },
    { selector: '.solutions-editorial__intro > *, .solutions-article', variant: 'motion-fade-up', step: 90 },
    { selector: '.solution-card', variant: 'motion-fade-up', step: 110 },
    { selector: '.feature-card', variant: 'motion-fade-up', step: 95 },
    { selector: '.collection-hero > *', variant: 'motion-fade-up', step: 90 },
    { selector: '.filters-panel > *, .filters-panel__card, .table-shell, .catalog-mobile-card', variant: 'motion-fade-up', step: 80 },
    { selector: '.collection-product-card, .search-result-card', variant: 'motion-fade-up', step: 75 },
    { selector: '.detail-main > *, .detail-panel', variant: 'motion-fade-up', step: 90 },
    { selector: '.quality-sidebar, .quality-page__hero .quality-content-section, .quality-main > .quality-content-section', variant: 'motion-fade-up', step: 95 },
    { selector: '.cert-card, .timeline-item, .resource-card', variant: 'motion-fade-up', step: 75 },
    { selector: '.procurement-page__hero > *, .procurement-steps > *, .procurement-layout > *', variant: 'motion-fade-up', step: 85 },
    { selector: '.contact-layout > *, .contact-support-grid > *', variant: 'motion-fade-up', step: 90 },
    { selector: '.team-page__intro > *, .team-card', variant: 'motion-fade-up', step: 100 },
    { selector: '.cart-shell, .cart-summary-box, .cart-items > *', variant: 'motion-fade-up', step: 80 },
    { selector: '.site-footer__brand, .site-footer .footer-links > *, .footer-bottom', variant: 'motion-fade-up', step: 70 },
    { selector: '.error-shell', variant: 'motion-fade-up', step: 90 },
  ];

  let observer;

  const collectTargets = () => {
    const seen = new Set();
    const targets = [];

    motionGroups.forEach((group) => {
      document.querySelectorAll(group.selector).forEach((element, index) => {
        if (!(element instanceof HTMLElement) || seen.has(element)) return;
        if (element.closest('[hidden], .mobile-sheet, .mobile-filter-sheet')) return;

        seen.add(element);
        element.classList.add('motion-reveal', group.variant);
        element.style.setProperty('--motion-delay', `${(group.step || 80) * index}ms`);
        targets.push(element);
      });
    });

    return targets;
  };

  const revealImmediately = (targets) => {
    targets.forEach((element) => element.classList.add('is-visible'));
  };

  const disconnectObserver = () => {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  };

  const syncMotion = () => {
    const targets = collectTargets();
    disconnectObserver();

    if (prefersReducedMotion.matches) {
      root.classList.remove('motion-enabled');
      root.classList.add('motion-reduce');
      revealImmediately(targets);
      return;
    }

    root.classList.remove('motion-reduce');
    root.classList.add('motion-enabled');

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer?.unobserve(entry.target);
        });
      },
      {
        threshold: 0.14,
        rootMargin: '0px 0px -10% 0px',
      }
    );

    targets.forEach((element) => {
      element.classList.remove('is-visible');
      observer.observe(element);
    });
  };

  if (typeof prefersReducedMotion.addEventListener === 'function') {
    prefersReducedMotion.addEventListener('change', syncMotion);
  } else if (typeof prefersReducedMotion.addListener === 'function') {
    prefersReducedMotion.addListener(syncMotion);
  }

  syncMotion();
}
