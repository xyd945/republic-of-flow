'use client';

import { useEffect, useRef } from 'react';

/**
 * One shared registry for every modal layer in the app.
 *
 * Two overlays can be open at once — a Market sheet is reachable from the
 * keyboard while the notification panel is up, because neither traps focus.
 * When each layer managed its own scroll lock, that was enough to wedge the
 * app: both snapshot `overflow` on mount and restore it on unmount, so the
 * inner one saved the outer one's `hidden` and put it back on the way out,
 * leaving the page locked with nothing open. And an unconditional Escape
 * listener per layer closed every layer at once rather than the top one.
 *
 * So the stack is global, the lock is reference-counted against it, and only
 * the layer on top answers Escape.
 *
 * The lock also has to target the right element. `.rof-screen` is a fixed
 * height with `overflow: hidden`, which means the document body never scrolls
 * — `<main>` does. Locking the body alone left the page scrolling happily
 * behind an open sheet.
 */

type Layer = { close: () => void };

const stack: Layer[] = [];
let saved: { el: HTMLElement; prev: string }[] = [];

function scrollables(): HTMLElement[] {
  const out: HTMLElement[] = [document.body];
  document.querySelectorAll<HTMLElement>('[data-scroll-region]').forEach((el) => out.push(el));
  return out;
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || stack.length === 0) return;
  e.stopPropagation();
  stack[stack.length - 1].close();
}

function acquire(layer: Layer) {
  stack.push(layer);
  if (stack.length > 1) return;
  document.addEventListener('keydown', onKey, true);
  saved = scrollables().map((el) => ({ el, prev: el.style.overflow }));
  saved.forEach(({ el }) => { el.style.overflow = 'hidden'; });
}

function release(layer: Layer) {
  const i = stack.lastIndexOf(layer);
  if (i !== -1) stack.splice(i, 1);
  if (stack.length > 0) return;
  document.removeEventListener('keydown', onKey, true);
  saved.forEach(({ el, prev }) => { el.style.overflow = prev; });
  saved = [];
}

/** Register an open modal layer: locks scrolling and claims Escape while mounted. */
export function useOverlay(onClose: () => void) {
  // Through a ref so a changing handler identity never re-runs the effect and
  // re-orders the stack underneath a layer that is still open.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const layer: Layer = { close: () => close.current() };
    acquire(layer);
    return () => release(layer);
  }, []);
}
