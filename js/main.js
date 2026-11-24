// =========================================================================
// ByteStreams — site interactions (vanilla JS, no framework)
// Mirrors the interaction patterns used by the portfolio2 project.
// =========================================================================

(() => {
  'use strict';

  // ---------- Helpers -------------------------------------------------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  // ---------- Hamburger (mobile nav) ----------------------------------
  const hamburger = $('#hamburgerBtn');
  const nav       = $('#primaryNav');

  if (hamburger && nav) {
    // Mobile nav opens directly below the header, whose height varies by breakpoint
    const header = $('#siteHeader');
    if (header) {
      const setHeaderHeight = () => document.documentElement.style
        .setProperty('--header-h', `${header.offsetHeight}px`);
      setHeaderHeight();
      window.addEventListener('resize', setHeaderHeight);
    }

    const closeNav = () => {
      hamburger.classList.remove('is-open');
      nav.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
    };

    hamburger.addEventListener('click', () => {
      const willOpen = !nav.classList.contains('is-open');
      hamburger.classList.toggle('is-open', willOpen);
      nav.classList.toggle('is-open', willOpen);
      hamburger.setAttribute('aria-expanded', String(willOpen));
    });

    // Close nav when clicking a link
    $$('.header__nav-link:not(.header__nav-toggle), .header__submenu-link', nav).forEach(link => {
      link.addEventListener('click', closeNav);
    });

    // Close nav when clicking outside
    document.addEventListener('click', (e) => {
      if (!nav.classList.contains('is-open')) return;
      if (!nav.contains(e.target) && !hamburger.contains(e.target)) {
        closeNav();
      }
    });

    // Close nav on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        closeNav();
        hamburger.focus();
      }
    });
  }

  // ---------- Nav dropdowns (Services) --------------------------------
  // Desktop opens on hover/focus via CSS; click toggles for touch screens.
  $$('.header__nav-item--dropdown').forEach(item => {
    const toggle = $('.header__nav-toggle', item);
    if (!toggle) return;

    const setOpen = (open) => {
      item.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };

    toggle.addEventListener('click', () => setOpen(!item.classList.contains('is-open')));

    document.addEventListener('click', (e) => {
      if (!item.contains(e.target)) setOpen(false);
    });

    item.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && item.classList.contains('is-open')) {
        e.stopPropagation();
        setOpen(false);
        toggle.focus();
      }
    });
  });

  // ---------- Smooth scrolling for in-page anchors --------------------
  $$('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (!href || href === '#') return;

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();
      target.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  });

  // ---------- Active nav link on scroll -------------------------------
  const sections = $$('section[id]');
  const navLinks = $$('.header__nav-link');

  const setActiveLink = (id) => {
    navLinks.forEach(link => {
      link.classList.toggle(
        'is-active',
        link.getAttribute('href') === `#${id}`
      );
    });
  };

  if (sections.length && navLinks.length && 'IntersectionObserver' in window) {
    const navObserver = new IntersectionObserver((entries) => {
      entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        .forEach(entry => setActiveLink(entry.target.id));
    }, {
      rootMargin: '-40% 0px -50% 0px',
      threshold: [0, 0.25, 0.5, 0.75, 1]
    });

    sections.forEach(section => navObserver.observe(section));
  }

  // ---------- Header shadow on scroll ---------------------------------
  const header = $('#siteHeader');

  if (header) {
    const updateHeader = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 16);
    };
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }

  // ---------- Reveal cards on scroll (stats + features) ---------------
  const revealables = $$('.stat-card, .feature-card');

  if (revealables.length) {
    if ('IntersectionObserver' in window) {
      const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

      revealables.forEach(el => revealObserver.observe(el));
    } else {
      // Fallback: just show them
      revealables.forEach(el => el.classList.add('is-visible'));
    }
  }

  // ---------- Contact form (posts to Worker at /api/contact) ----------
  const form      = $('#contactForm');
  const status    = $('#formStatus');
  const submitBtn = $('#submitBtn');

  if (form && status) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = new FormData(form);
      const name    = (data.get('name')    || '').toString().trim();
      const email   = (data.get('email')   || '').toString().trim();
      const message = (data.get('message') || '').toString().trim();
      const website = (data.get('website') || '').toString().trim();

      if (!name || !email || !message) {
        setStatus('Please fill out all fields.', 'error');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setStatus('Please enter a valid email address.', 'error');
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      setStatus('Sending your message...', 'success');

      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name, email, message, website })
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'Unable to send your message right now.');
        }

        setStatus('Thanks! We’ll get back to you shortly.', 'success');
        form.reset();
      } catch (err) {
        setStatus(err.message || 'Unable to send your message right now.', 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    function setStatus(msg, kind) {
      status.textContent = msg;
      status.classList.remove('form-status--success', 'form-status--error');
      status.classList.add(`form-status--${kind}`);
    }
  }

  // ---------- Year in footer (if present) -----------------------------
  const yearEl = $('#currentYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
