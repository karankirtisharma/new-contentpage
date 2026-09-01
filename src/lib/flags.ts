/**
 * Build flags.
 *
 * `SHOW_COPY` hides the entire DOM layer — nav, progress rail, scroll hint, cursor, and
 * every word of chapter copy — leaving only the lunar scene and the scroll geometry that
 * drives the camera through it.
 *
 * The sections themselves stay mounted at their exact heights even when their copy does
 * not. Scroll progress is measured against document height, so deleting them would
 * collapse the scrollable range and park the dolly at t = 0 forever. See ChapterSpacer.
 *
 * Typed as `boolean` rather than left to infer the literal, so neither the compiler nor
 * the linter treats the branches it guards as dead code.
 */
export const SHOW_COPY: boolean = false;
