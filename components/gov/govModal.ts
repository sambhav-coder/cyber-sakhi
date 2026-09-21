"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GovModalPhase = "closed" | "entering" | "open" | "leaving";

export interface GovModalController {
  /** True while the modal should be in the DOM at all (enter/open/leave). */
  mounted: boolean;
  /** True once the enter frame has passed (drives the shown styles). */
  shown: boolean;
  /** True while the leave transition is running. */
  leaving: boolean;
  /** Attach to the outer modal wrapper to enable the focus trap. */
  ref: React.RefObject<HTMLDivElement>;
  /** Call to begin the close transition (then onClose fires after duration). */
  close: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal lifecycle for the gov tab-dialogs:
 *
 *  - Enter: `entering` for one frame, then `open` (drives the mount transition).
 *  - Leave: `close()` sets `leaving` (exit transition), then onClose fires.
 *  - Focus trap: keeps Tab/Shift+Tab cycling inside the panel while mounted and
 *    restores focus to the previously-focused element on close.
 *  - Escape: treated as a close request.
 *  - Scroll lock: body overflow hidden while mounted.
 */
export function useGovModal(
  isOpen: boolean,
  onClose: () => void,
  durationMs = 220
): GovModalController {
  const [phase, setPhase] = useState<GovModalPhase>("closed");
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const durationRef = useRef(durationMs);
  onCloseRef.current = onClose;
  durationRef.current = durationMs;

  // Enter / leave state machine.
  useEffect(() => {
    if (!isOpen) return;
    setPhase("entering");
    const t = window.setTimeout(() => setPhase("open"), 30);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  const close = useCallback(() => {
    setPhase((p) => {
      if (p === "closed" || p === "leaving") return p;
      return "leaving";
    });
  }, []);

  // Fire onClose once the leave animation completes.
  useEffect(() => {
    if (phase !== "leaving") return;
    const t = window.setTimeout(() => {
      onCloseRef.current();
      setPhase("closed");
    }, durationRef.current);
    return () => window.clearTimeout(t);
  }, [phase, onClose]);

  // Scroll lock + keyboard handling + focus management while mounted.
  useEffect(() => {
    const mounted = phase !== "closed";
    if (!mounted) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const focusables = () => {
      const el = ref.current;
      if (!el) return [];
      return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = focusables();
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || active === ref.current || !ref.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !ref.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    // Focus the panel/close button shortly after entering.
    const focusTimer = window.setTimeout(() => {
      const closeBtn = ref.current?.querySelector<HTMLElement>("[data-gov-modal-close]");
      (closeBtn ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    }, 40);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
    // `close` is stable; phase transitions drive re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return {
    mounted: phase !== "closed",
    shown: phase === "open",
    leaving: phase === "leaving",
    ref,
    close,
  };
}