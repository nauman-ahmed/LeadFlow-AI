import React from 'react';
import { createRoot } from 'react-dom/client';
import { Widget } from './Widget';
import { widgetCSS } from './styles';
import type { Language } from './api';

interface InitOptions {
  apiUrl?: string;
  tenant?: string;
  language?: Language;
  target?: string | HTMLElement;
}

function injectStyles() {
  const id = 'leadflow-widget-styles';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = widgetCSS;
  document.head.appendChild(style);
}

function init(options: InitOptions = {}) {
  injectStyles();

  let host: HTMLElement | null = null;
  if (options.target) {
    host =
      typeof options.target === 'string'
        ? document.querySelector(options.target)
        : options.target;
  }
  if (!host) {
    host = document.getElementById('leadflow-root');
  }
  if (!host) {
    host = document.createElement('div');
    host.id = 'leadflow-root';
    document.body.appendChild(host);
  }

  const apiUrl =
    options.apiUrl ||
    (typeof window !== 'undefined' ? `${window.location.origin}/api/chat` : '/api/chat');

  const root = createRoot(host);
  root.render(
    React.createElement(Widget, {
      apiUrl,
      initialLanguage: options.language ?? 'en',
      tenant: options.tenant
    })
  );
}

function autoInit() {
  // Find our script tag (works whether loaded sync or async).
  const scripts = Array.from(document.scripts);
  const me = scripts.find((s) => s.src && /leadflow-widget(\.[a-f0-9]+)?\.js/i.test(s.src));

  const opts: InitOptions = {};
  if (me) {
    if (me.dataset.api) opts.apiUrl = me.dataset.api;
    if (me.dataset.tenant) opts.tenant = me.dataset.tenant;
    if (me.dataset.language) opts.language = me.dataset.language as Language;
    if (me.dataset.target) opts.target = me.dataset.target;
  }

  init(opts);
}

declare global {
  interface Window {
    LeadFlow?: { init: typeof init };
  }
}

if (typeof window !== 'undefined') {
  window.LeadFlow = { init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
}

export { init };
