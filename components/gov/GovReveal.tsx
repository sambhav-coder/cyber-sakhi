"use client";

import React, { useEffect, useRef } from "react";
import { clsx } from "clsx";

interface GovRevealProps {
  children: React.ReactNode;
  className?: string;
  /** Optional transition delay in ms, applied once revealed. */
  delay?: number;
}

/**
 * Lightweight scroll-reveal for landing sections. Uses IntersectionObserver,
 * adds `.gov-revealed` when the element enters the viewport (a single time).
 * The CSS layer fully disables the motion under prefers-reduced-motion.
 */
export const GovReveal: React.FC<GovRevealProps> = ({ children, className, delay = 0 }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add("gov-revealed");
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={clsx("gov-reveal", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
};