/** Where the journey card sits, and the map padding that keeps guided subjects clear of it (≥ 768 px). */
export const WIDE_BREAKPOINT = 768;
const SM_BREAKPOINT = 640;
export const cardWidth = (viewport: number) => Math.min(340, viewport - 76);
/** Gap between the card and the viewport's right edge: Tailwind right-12, or right-16 from sm. */
export const cardRight = (viewport: number) => viewport >= SM_BREAKPOINT ? 64 : 48;
/** Left edge of the card in viewport pixels. */
export const cardLeft = (viewport: number) => viewport - cardRight(viewport) - cardWidth(viewport);
export function framePadding(viewport: number) {
  const wide = viewport >= WIDE_BREAKPOINT;
  return { top: 0, left: 0, bottom: wide ? 120 : 0, right: wide ? cardWidth(viewport) + 80 : 0 };
}
