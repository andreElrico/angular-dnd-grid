import {extendStyles} from "./drag-styling";

/**
 * Toggles whether the native resize interactions should be enabled for an element.
 * @param element Element on which to toggle the resize interactions.
 * @param enable Whether the resize interactions should be enabled.
 * @docs-private
 */
export function toggleNativeResizeInteractions(element: HTMLElement, enable: boolean) {
  const userSelect = enable ? '' : 'none';

  extendStyles(element.style, {
    touchAction: enable ? '' : 'none',
    webkitUserDrag: enable ? '' : 'none',
    webkitTapHighlightColor: enable ? '' : 'transparent',
    userSelect: userSelect,
    msUserSelect: userSelect,
    webkitUserSelect: userSelect,
    MozUserSelect: userSelect
  });
}
