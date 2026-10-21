// Cue presentation, adapted from the owner's Glee website. No capture or AI calls.
import { setupFilmPlayers } from './film-player.js';
import { setupProductExamples } from './ui-demo.js';
import { setupStoryWall } from './story-wall.js';
import { setupDesktopDemo } from './desktop-demo.js';
import { setupParticleBackground } from './particle-background.js';
const one = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => [...root.querySelectorAll(selector)];
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const refreshFilms = setupFilmPlayers();
const refreshDesktop = setupDesktopDemo();
setupProductExamples();
setupStoryWall();
setupParticleBackground();

const nav = one('.navtoggle'), navMenu = one('#navmenu');
function navClose() { navMenu?.classList.remove('on'); nav?.setAttribute('aria-expanded', 'false'); }
nav?.addEventListener('click', () => {
  const open = navMenu.classList.toggle('on');
  nav.setAttribute('aria-expanded', String(open));
});
if (navMenu) all('a', navMenu).forEach(link => link.addEventListener('click', navClose));
function closeMenus(restoreFocus = false) {
  all('.dlgrp.open').forEach(group => {
    group.classList.remove('open');
    one('.dlbtn', group).setAttribute('aria-expanded', 'false');
    one('.dlmenu', group).hidden = true;
    if (restoreFocus) one('.dlbtn', group).focus();
  });
}
all('.dlgrp').forEach((group, index) => {
  const button = one('.dlbtn', group), menu = one('.dlmenu', group);
  menu.id = 'cue-download-menu-' + index;
  button.setAttribute('aria-controls', menu.id);
  const items = all('[role="menuitem"]', menu);
  function open() {
    closeMenus(); menu.hidden = false; group.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
  }
  button.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    group.classList.contains('open') ? closeMenus() : open();
  });
  button.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault(); open(); items[0]?.focus();
  });
  items.forEach((link, i) => {
    link.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); items[(i + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault(); items[event.key === 'Home' ? 0 : items.length - 1].focus();
      } else if (event.key === 'Tab') closeMenus();
    });
    link.addEventListener('click', event => {
      if (link.getAttribute('aria-disabled') === 'true') event.preventDefault();
      closeMenus(); navClose();
    });
  });
});
document.addEventListener('click', event => {
  if (!event.target.closest('.dlgrp')) closeMenus();
  if (!event.target.closest('nav')) navClose();
});
addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeMenus(true); navClose(); }
});

const modal = one('.video-modal');
let tourFocus;
all('[data-tour]').forEach(link => link.addEventListener('click', event => {
  if (!modal?.showModal || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); tourFocus = link;
  all('video').forEach(video => video.pause());
  modal.showModal(); document.body.style.overflow = 'hidden'; one('.modal-close', modal).focus();
  requestAnimationFrame(refreshFilms);
}));
one('.modal-close', modal || document.createElement('div'))?.addEventListener('click', () => modal.close());
modal?.addEventListener('click', event => {
  if (event.target !== modal) return;
  const r = modal.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) modal.close();
});
modal?.addEventListener('close', () => { one('video', modal).pause(); document.body.style.overflow = ''; tourFocus?.focus(); refreshFilms(); refreshDesktop(); });

if (!motion.matches && typeof IntersectionObserver === 'function') {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('in'); observer.unobserve(entry.target); }
  }), { threshold: .12 });
  all('.io').forEach(element => { element.classList.add('reveal'); observer.observe(element); });
} else all('.io').forEach(element => element.classList.add('in'));
motion.addEventListener('change', () => { if (motion.matches) all('.io').forEach(element => element.classList.add('in')); });

addEventListener('message', event => {
  if (event.origin !== location.origin || !event.data?.cueInstallGuide) return;
  const frame = all('[data-install-walkthrough]').find(element => element.contentWindow === event.source);
  if (!frame) return;
  const height = event.data.cueInstallGuide.height;
  if (Number.isFinite(height) && height >= 200 && height <= 1600) frame.style.height = Math.ceil(height) + 'px';
});
fetch('/release.json', { cache: 'no-cache' }).then(response => response.ok ? response.json() : null).then(release => {
  if (!release) return;
  all('[data-version]').forEach(element => { element.textContent = release.version; });
  for (const arch of ['arm64', 'x64']) {
    const asset = release.assets?.[arch];
    all('[data-release-size="' + arch + '"]').forEach(element => { element.textContent = asset ? Math.ceil(asset.bytes / 1048576) + ' MB' : 'Preparing'; });
    all('[data-release-arch="' + arch + '"]').forEach(link => {
      if (asset?.url === '/get/mac/' + arch) { link.href = asset.url; link.removeAttribute('aria-disabled'); }
      else { link.href = '/install/'; link.setAttribute('aria-disabled', 'true'); }
    });
  }
}).catch(() => {});
