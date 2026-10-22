import { billingCopy } from './pricing-data.js';
import { createSandText } from './vendor/raisedhand-sand-text.js';

export function setupPricing() {
  const section = document.querySelector('#pricing');
  if (!section) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const periodButtons = [...section.querySelectorAll('[data-billing-period]')];
  const toggle = section.querySelector('[data-billing-switch]');
  const status = section.querySelector('[data-pricing-status]');
  const labels = Object.fromEntries(['price', 'standard', 'billing', 'saving'].map(key =>
    [key, createSandText(section.querySelector(`[data-price-${key}]`), motion)]));
  const dialog = document.querySelector('#cue-pro-preview');
  const proButton = section.querySelector('[data-pro-preview]');
  let period = 'monthly', previousOverflow = '';

  function applyPeriod(next, announce = true) {
    const copy = billingCopy(next);
    period = next;
    section.dataset.billing = next;
    toggle.checked = copy.yearly;
    periodButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.billingPeriod === next)));
    Object.entries(labels).forEach(([key, controller]) => controller.set(copy[key]));
    section.querySelector('[data-yearly-discount]').textContent = copy.discount;
    dialog.querySelector('[data-pro-charge]').textContent = copy.charge;
    dialog.querySelector('[data-pro-period]').textContent = `${copy.yearly ? 'Yearly' : 'Monthly'} plan`;
    dialog.querySelector('[data-pro-billing]').textContent = copy.yearly ? `${copy.price}/month equivalent. ${copy.billing}` : copy.billing;
    if (announce) status.textContent = `${copy.yearly ? 'Yearly' : 'Monthly'} Pro: ${copy.charge}. ${copy.allowance}.`;
  }
  periodButtons.forEach(button => {
    button.disabled = false;
    button.addEventListener('click', () => applyPeriod(button.dataset.billingPeriod));
  });
  toggle.disabled = false;
  toggle.addEventListener('change', () => applyPeriod(toggle.checked ? 'yearly' : 'monthly'));
  applyPeriod(period, false);

  proButton.hidden = false;
  proButton.addEventListener('click', () => {
    applyPeriod(period, false);
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
  });
  dialog.querySelector('[data-pro-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    proButton.focus();
  });

  // The source's hover lift and glare also respond to a finger passing across either card.
  const timers = new Map();
  section.querySelectorAll('.cue-member').forEach(card => {
    card.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' || motion.matches) return;
      clearTimeout(timers.get(card));
      card.classList.add('is-active');
      timers.set(card, setTimeout(() => card.classList.remove('is-active'), 1200));
    }, { passive: true });
  });
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    Object.values(labels).forEach(controller => controller.destroy());
    timers.forEach(timer => clearTimeout(timer));
  });
}
