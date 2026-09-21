/**
 * Government Portal hero background — the ONLY approved local assets.
 *
 * These four images live in the repository:
 *   public/assets/design/image.png   (1024x768,  4:3)
 *   public/assets/design2/image.png  (1600x900,  16:9)
 *   public/assets/design3/image.png  (1073x1255, portrait)
 *   public/assets/design4/image.png  (1216x1055, near-square)
 *
 * They are the only approved hero backgrounds for /gov. No remote/stock/
 * Unsplash image may be used here. Because the four source images have
 * different native aspect ratios, each slide carries its own focal point
 * (object-position) so the important area of every photo stays visible when
 * cropped to the full-width hero, without stretching or distortion.
 *
 * Focal points were derived from per-region edge-energy/brightness analysis
 * (top-to-bottom detail distribution of each source file) since the subject
 * composition varies between slides:
 *   - design:   detail center, upper-center -> 50 / 38
 *   - design2:  wide 16:9, subject center-left -> 45 / 60
 *   - design3:  portrait, subject center -> 48 / 45
 *   - design4:  near-square, subject center-left -> 45 / 55
 * Each slide also carries a small scale (<= 1.06) so wide/portrait images fill
 * the hero without letterboxing; the scale only applies to the active slide.
 */

export interface GovHeroSlide {
  src: string;
  alt: string;
  /** CSS object-position — horizontal then vertical (%). */
  positionX: number;
  positionY: number;
  /** Optional subtle scale for a slide that needs gentle emphasis. */
  scale?: number;
  /** Asset provenance note. */
  note: string;
}

export const GOV_HERO_SLIDES: GovHeroSlide[] = [
  {
    src: "/assets/design/image.png",
    alt: "Cyber-Sakhi Government Portal demonstration — approved local hero image 1",
    positionX: 50,
    positionY: 38,
    scale: 1.02,
    note: "public/assets/design/image.png (1024x768) — focal upper-center",
  },
  {
    src: "/assets/design2/image.png",
    alt: "Cyber-Sakhi Government Portal demonstration — approved local hero image 2",
    positionX: 45,
    positionY: 60,
    scale: 1.04,
    note: "public/assets/design2/image.png (1600x900) — focal center-left",
  },
  {
    src: "/assets/design3/image.png",
    alt: "Cyber-Sakhi Government Portal demonstration — approved local hero image 3",
    positionX: 48,
    positionY: 45,
    scale: 1.06,
    note: "public/assets/design3/image.png (1073x1255, portrait) — focal center",
  },
  {
    src: "/assets/design4/image.png",
    alt: "Cyber-Sakhi Government Portal demonstration — approved local hero image 4",
    positionX: 45,
    positionY: 55,
    scale: 1.05,
    note: "public/assets/design4/image.png (1216x1055) — focal center-left",
  },
];

/** Seconds each slide stays visible before the next crossfade. */
export const GOV_HERO_ROTATION_MS = 7000;
/** Crossfade duration between slides. */
export const GOV_HERO_FADE_MS = 1200;