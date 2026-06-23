const ELL_NPI_STORAGE_KEY = 'ellNpiAccess';
const ELL_NPI_SESSION_HOURS = 12;

function sanitizeNpi(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

function isLikelyNpi(value) {
  return sanitizeNpi(value).length === 10;
}

function getNpiConfig() {
  const body = document.body;
  return {
    endpoint: body?.dataset.npiVerificationEndpoint || '',
  };
}

function getStoredNpiAccess() {
  try {
    const raw = window.localStorage.getItem(ELL_NPI_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.valid !== true || !parsed.expiresAt) return null;
    if (Date.now() > Number(parsed.expiresAt)) {
      window.localStorage.removeItem(ELL_NPI_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch (error) {
    return null;
  }
}

function hasStoredNpiAccess() {
  return Boolean(getStoredNpiAccess());
}

function getStoredNpiNumber() {
  return getStoredNpiAccess()?.npi || '';
}

function getStoredProviderName() {
  return getStoredNpiAccess()?.profile?.name || '';
}

function storeNpiAccess(payload) {
  const expiresAt = Date.now() + (ELL_NPI_SESSION_HOURS * 60 * 60 * 1000);
  const nextValue = {
    valid: true,
    npi: sanitizeNpi(payload?.npi || ''),
    expiresAt,
    profile: payload?.profile || null,
  };

  try {
    window.localStorage.setItem(ELL_NPI_STORAGE_KEY, JSON.stringify(nextValue));
  } catch (error) {
    /* no-op */
  }
}

async function verifyNpiAgainstService(npi, context = 'catalog') {
  const normalized = sanitizeNpi(npi);

  if (normalized.length !== 10) {
    return {
      valid: false,
      message: 'Please enter a full 10-digit NPI to continue.',
    };
  }

  const { endpoint } = getNpiConfig();
  if (!endpoint) {
    return {
      valid: false,
      message: 'NPI verification endpoint is not configured yet.',
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        npi: normalized,
        context,
      }),
    });

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      return {
        valid: false,
        message: data?.message || 'Unable to verify this NPI right now. Please try again shortly.',
      };
    }

    if (data?.valid) {
      return {
        valid: true,
        message: data.message || 'NPI verified.',
        npi: normalized,
        profile: data.profile || null,
      };
    }

    return {
      valid: false,
      message: data?.message || 'We could not confirm that NPI against the official source.',
    };
  } catch (error) {
    return {
      valid: false,
      message: 'NPI verification is temporarily unavailable. Please try again shortly.',
    };
  }
}

function getMaskedNpi(npi) {
  const normalized = sanitizeNpi(npi);
  if (normalized.length !== 10) return 'verified NPI';
  return `verified NPI ending in ${normalized.slice(-4)}`;
}

function getVerifiedProviderIdentity(profile) {
  const providerName = profile?.name?.trim();
  const credential = profile?.credential?.trim();
  const taxonomyCode = profile?.taxonomyCode?.trim();

  const suffixParts = [credential, taxonomyCode].filter(Boolean);
  if (providerName && suffixParts.length) return `${providerName} (${suffixParts.join(' • ')})`;
  if (providerName) return providerName;
  if (suffixParts.length) return suffixParts.join(' • ');
  return '';
}

function getVerifiedProviderSummaryText(stored) {
  const providerIdentity = getVerifiedProviderIdentity(stored?.profile);
  if (providerIdentity) return providerIdentity;
  return getMaskedNpi(stored?.npi || '');
}

function syncVerifiedProviderSummary() {
  const stored = getStoredNpiAccess();
  const providerLine = document.querySelector('[data-verified-provider-line]');
  const providerName = document.querySelector('[data-verified-provider-name]');

  if (stored?.npi) {
    if (providerLine instanceof HTMLElement && providerName instanceof HTMLElement) {
      providerLine.hidden = false;
      providerName.textContent = getVerifiedProviderSummaryText(stored);
    }

    return;
  }

  if (providerLine instanceof HTMLElement) providerLine.hidden = true;
}

function applyStoredNpiToRoots() {
  const stored = getStoredNpiAccess();
  if (!stored?.npi) return;

  document.querySelectorAll('[data-verification-root]').forEach((root) => {
    const input = root.querySelector('[data-npi-input]');
    const trigger = root.querySelector('[data-verify-trigger]');
    const status = root.querySelector('[data-verification-status]');

    if (!(input instanceof HTMLInputElement)) return;

    input.value = stored.npi;
    input.readOnly = true;
    input.setAttribute('aria-readonly', 'true');
    input.classList.add('field--verified');

    const label = input.id ? root.querySelector(`label[for="${input.id}"]`) : null;
    if (label instanceof HTMLElement) label.hidden = true;

    input.hidden = true;
    if (trigger instanceof HTMLElement) trigger.hidden = true;

    if (status instanceof HTMLElement) {
      const institutionInput = root.querySelector('[data-institution-input]');
      const institutionValue = institutionInput instanceof HTMLInputElement ? institutionInput.value.trim() : '';
      const providerIdentity = getVerifiedProviderIdentity(stored?.profile);

      if (providerIdentity) {
        status.textContent = institutionValue
          ? `Verified: ${providerIdentity} for ${institutionValue}.`
          : `Verified: ${providerIdentity}.`;
      } else {
        status.textContent = institutionValue
          ? `Using ${getMaskedNpi(stored.npi)} for ${institutionValue}.`
          : `Using ${getMaskedNpi(stored.npi)} for this provider session.`;
      }
    }
  });

  syncVerifiedProviderSummary();
}

document.addEventListener('DOMContentLoaded', () => {
  setupMobileNav();
  setupNpiGate();
  setupCatalog();
  setupQualitySidebar();
  setupProcurementVerification();
  setupCartCheckoutGuard();
  setupCurrentYear();
  setupSiteAnimations();
  applyStoredNpiToRoots();
  syncVerifiedProviderSummary();
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

function setupNpiGate() {
  const body = document.body;
  const gate = document.querySelector('[data-npi-gate]');
  if (!body || !gate) return;

  const form = gate.querySelector('[data-npi-gate-form]');
  const input = gate.querySelector('[data-npi-gate-input]');
  const status = gate.querySelector('[data-npi-gate-status]');
  const copy = gate.querySelector('[data-npi-gate-copy]');
  const backdrop = gate.querySelector('[data-npi-gate-dismiss]');
  const closeButton = gate.querySelector('[data-npi-gate-close]');
  const providerMenu = document.querySelector('[data-provider-menu]');
  const providerSummary = providerMenu?.querySelector('summary');
  const protectedRoute = body.dataset.npiProtectedRoute === 'true';
  const submitButton = form.querySelector('button[type="submit"]');

  if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) return;

  let pendingHref = '';
  let pendingAction = '';

  const hasAccess = () => hasStoredNpiAccess();

  const isProtectedUrl = (href) => {
    if (!href) return false;

    let url;
    try {
      url = new URL(href, window.location.origin);
    } catch (error) {
      return false;
    }

    if (url.origin !== window.location.origin) return false;

    const path = url.pathname;
    const view = url.searchParams.get('view');
    const providerPaths = [
      '/pages/provider-info',
      '/pages/provider-account-setup',
      '/pages/pricing-order-form',
    ];

    if (view === 'quality-safety' || path.includes('quality-safety')) return false;
    if (providerPaths.includes(path)) return true;
    if (path === '/pages/catalog') return true;
    if (path.startsWith('/collections/')) return true;
    if (path.startsWith('/products/')) return true;

    return false;
  };

  const getGateContext = ({ href = '', action = '' } = {}) => {
    if (action === 'provider-menu') return 'provider';
    if (!href) return body.dataset.npiGateContext || 'catalog';

    try {
      const url = new URL(href, window.location.origin);
      if (url.pathname.includes('provider-info') || url.pathname.includes('provider-account-setup') || url.pathname.includes('pricing-order-form')) {
        return 'provider';
      }
    } catch (error) {
      return body.dataset.npiGateContext || 'catalog';
    }

    return 'catalog';
  };

  const syncGateCopy = (context) => {
    if (!copy) return;

    copy.textContent = context === 'provider'
      ? gate.dataset.providerCopy || copy.textContent
      : gate.dataset.catalogCopy || copy.textContent;
  };

  const setRequiredState = (required) => {
    gate.dataset.required = required ? 'true' : 'false';
    if (closeButton instanceof HTMLElement) closeButton.hidden = required;
    if (backdrop instanceof HTMLElement) backdrop.dataset.locked = required ? 'true' : 'false';
  };

  const focusInput = () => {
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  };

  const closeGate = () => {
    if (gate.dataset.required === 'true' && !hasAccess()) return;

    gate.hidden = true;
    gate.setAttribute('aria-hidden', 'true');
    body.classList.remove('npi-gate-open');
    status.textContent = '';
    pendingHref = '';
    pendingAction = '';
  };

  const unlockProtectedView = () => {
    body.classList.remove('ell-page--npi-pending', 'npi-gate-open');
    body.classList.add('ell-npi-authorized');
    gate.hidden = true;
    gate.setAttribute('aria-hidden', 'true');
    status.textContent = '';
    applyStoredNpiToRoots();
  };

  const openGate = ({ href = '', action = '', required = false } = {}) => {
    pendingHref = href;
    pendingAction = action;
    syncGateCopy(getGateContext({ href, action }));
    setRequiredState(required);
    gate.hidden = false;
    gate.setAttribute('aria-hidden', 'false');
    body.classList.remove('ell-page--npi-pending');
    body.classList.add('npi-gate-open');
    status.textContent = required
      ? 'Enter your NPI to verify provider access.'
      : 'Provider verification is required before continuing.';
    focusInput();
  };

  const continueToDestination = () => {
    if (pendingAction === 'provider-menu' && providerMenu) {
      providerMenu.open = true;
      providerSummary?.setAttribute('aria-expanded', 'true');
      pendingAction = '';
      return;
    }

    if (pendingHref) {
      const nextUrl = new URL(pendingHref, window.location.origin);
      const currentUrl = new URL(window.location.href);

      if (nextUrl.pathname !== currentUrl.pathname || nextUrl.search !== currentUrl.search || nextUrl.hash !== currentUrl.hash) {
        window.location.assign(nextUrl.toString());
        return;
      }
    }

    pendingHref = '';
    pendingAction = '';
  };

  input.addEventListener('input', () => {
    input.value = sanitizeNpi(input.value);
    if (status.textContent) status.textContent = '';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const npi = sanitizeNpi(input.value);
    input.value = npi;

    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
    status.textContent = 'Verifying NPI against the official registry...';

    verifyNpiAgainstService(npi, getGateContext({ href: pendingHref, action: pendingAction }))
      .then((result) => {
        if (!result.valid) {
          status.textContent = result.message;
          input.focus();
          return;
        }

        storeNpiAccess(result);
        status.textContent = result.message || 'NPI verified.';
        unlockProtectedView();
        continueToDestination();
      })
      .finally(() => {
        if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
      });
  });

  if (backdrop instanceof HTMLElement) {
    backdrop.addEventListener('click', () => {
      if (backdrop.dataset.locked === 'true') return;
      closeGate();
    });
  }

  if (closeButton instanceof HTMLElement) {
    closeButton.addEventListener('click', () => closeGate());
  }

  document.addEventListener(
    'click',
    (event) => {
      const link = event.target.closest('a[href]');
      if (!link || hasAccess()) return;
      if (!isProtectedUrl(link.href)) return;

      event.preventDefault();
      openGate({ href: link.href, required: false });
    },
    true
  );

  if (providerSummary) {
    providerSummary.addEventListener('click', (event) => {
      if (hasAccess()) return;

      event.preventDefault();
      providerMenu.open = false;
      openGate({ action: 'provider-menu', required: false });
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeGate();
  });

  if (hasAccess()) {
    unlockProtectedView();
    return;
  }

  if (protectedRoute) {
    openGate({ href: window.location.href, required: true });
  } else {
    body.classList.remove('ell-page--npi-pending');
  }
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

function setupProcurementVerification() {
  document.querySelectorAll('[data-verify-trigger]').forEach((button) => {
    button.addEventListener('click', async () => {
      const root = button.closest('[data-verification-root]');
      if (!root) return;

      const input = root.querySelector('[data-npi-input]');
      const institution = root.querySelector('[data-institution-input]');
      const status = root.querySelector('[data-verification-status]');
      const value = input instanceof HTMLInputElement ? input.value.trim() : '';
      const institutionValue = institution instanceof HTMLInputElement ? institution.value.trim() : '';

      const normalized = sanitizeNpi(value);
      if (input instanceof HTMLInputElement) input.value = normalized;

      if (!isLikelyNpi(normalized)) {
        if (status) status.textContent = 'Enter a valid 10-digit NPI to prepare the review details.';
        return;
      }

      button.disabled = true;
      if (status) status.textContent = 'Verifying NPI against the official registry...';

      const result = await verifyNpiAgainstService(normalized, 'catalog');
      button.disabled = false;

      if (!result.valid) {
        if (status) status.textContent = result.message;
        return;
      }

      storeNpiAccess(result);
      applyStoredNpiToRoots();

      if (status) {
        const providerIdentity = getVerifiedProviderIdentity(result.profile);
        status.textContent = providerIdentity
          ? institutionValue
            ? `Verified: ${providerIdentity} for ${institutionValue}. Review details are prepared and eligibility is reviewed before fulfillment.`
            : `Verified: ${providerIdentity}. Review details are prepared and provider eligibility is reviewed before fulfillment.`
          : institutionValue
            ? `NPI verified for ${institutionValue}. Review details are prepared and eligibility is reviewed before fulfillment.`
            : 'NPI verified. Review details are prepared and provider eligibility is reviewed before fulfillment.';
      }
    });
  });
}

function setupCartCheckoutGuard() {
  const form = document.querySelector('[data-cart-form]');
  if (!form) return;

  const checkoutButton = form.querySelector('[data-checkout-submit]');
  const npiInput = form.querySelector('[data-npi-input]');
  const institutionInput = form.querySelector('[data-institution-input]');
  const status = form.querySelector('[data-verification-status]');

  if (!checkoutButton || !(npiInput instanceof HTMLInputElement)) return;

  const syncStoredNpi = () => {
    const storedNpi = getStoredNpiNumber();
    if (!storedNpi) return false;

    npiInput.value = storedNpi;
    npiInput.readOnly = true;
    npiInput.setAttribute('aria-readonly', 'true');
    return true;
  };

  syncStoredNpi();

  checkoutButton.addEventListener('click', async (event) => {
    const storedNpi = getStoredNpiNumber();
    const npi = sanitizeNpi(storedNpi || npiInput.value);
    const institution = institutionInput instanceof HTMLInputElement ? institutionInput.value.trim() : '';

    if (storedNpi) {
      npiInput.value = storedNpi;
    }

    if (npi.length >= 10 && institution.length >= 2) {
      if (storedNpi) {
        if (status) status.textContent = `Using ${getMaskedNpi(storedNpi)}. Order review can continue.`;
        return;
      }

      if (status) status.textContent = 'Verifying NPI against the official registry...';
      checkoutButton.disabled = true;
      const result = await verifyNpiAgainstService(npi, 'catalog');
      checkoutButton.disabled = false;

      if (result.valid) {
        storeNpiAccess(result);
        applyStoredNpiToRoots();
        if (status) {
          const providerIdentity = getVerifiedProviderIdentity(result.profile);
          status.textContent = providerIdentity
            ? `Verified: ${providerIdentity}. Order review can continue.`
            : 'NPI verified. Order review can continue.';
        }
        return;
      }

      event.preventDefault();
      if (status) status.textContent = result.message;
      npiInput.focus();
      form.querySelector('#clinical-verification')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    event.preventDefault();
    if (status) {
      status.textContent = institution.length < 2
        ? 'Enter an affiliated institution before continuing to order review.'
        : 'Enter a verified 10-digit NPI before continuing to order review.';
    }
    if (institution.length < 2 && institutionInput instanceof HTMLInputElement) institutionInput.focus();
    else npiInput.focus();
    form.querySelector('#clinical-verification')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
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
    { selector: '.solutions-heading > *', variant: 'motion-fade-up', step: 90 },
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
