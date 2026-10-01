/**
 * Classes compartilhadas pelos primitivos flutuantes (popover, dropdown, select,
 * command, dialog). Mantidas num só lugar para não divergirem entre componentes.
 */

/** Superfície flutuante: única categoria que recebe sombra (DESIGN.md). */
export const floatingClasses =
  "rounded-lg border border-line bg-surface text-ink shadow-popover"

/** Entrada e saída: só opacidade, 150ms. */
export const floatingMotionClasses =
  "duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"

/** Item de menu/lista: 32px, destaque em surface-sunken. */
export const menuItemClasses =
  "relative flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-sm text-ink select-none data-highlighted:bg-surface-sunken data-disabled:pointer-events-none data-disabled:text-ink-tertiary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:text-ink-secondary [&_svg:not([class*='size-'])]:size-4"

/** Rótulo de grupo em menus: mesmo estilo do MetaLabel. */
export const menuLabelClasses =
  "px-2 pt-2 pb-1 font-mono text-2xs font-medium tracking-label text-ink-tertiary uppercase"
