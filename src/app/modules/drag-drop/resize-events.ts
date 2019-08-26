import {CdkDropContainer} from "./directives/drop-container";
import {CdkResize} from "./directives/resize";

/** Event emitted when the user starts resizing a resizable. */
export interface CdkResizeStart<T = any> {
  /** Resizable that emitted the event. */
  source: CdkResize<T>;
}

/** Event emitted when the user releases an item, before any animations have started. */
export interface CdkResizeRelease<T = any> {
  /** Resizable that emitted the event. */
  source: CdkResize<T>;
}

/** Event emitted when the user stops resizing a resizable. */
export interface CdkResizeEnd<T = any> {
  /** Resizable that emitted the event. */
  source: CdkResize<T>;
  /** Distance in pixels that the user has resized since the resize sequence started. */
  distance: { x: number, y: number };
}

/** Event emitted when the user drops a resizable item inside a drop container. */
export interface CdkResizeResized<T, O = T> {
  /** Item that is being dropped. */
  item: CdkResize;
  /** Container in which the item was dropped. */
  container: CdkDropContainer<T>;
  /** Whether the user's pointer was over the container when the item was dropped. */
  isPointerOverContainer: boolean;
  /** Distance in pixels that the user has resized since the resize sequence started. */
  distance: { x: number, y: number };
}

/** Event emitted as the user is resizing a resizable item. */
export interface CdkResizeChange<T = any> {
  /** Item that is being resized. */
  source: CdkResize<T>;
  /** Position of the user's pointer on the page. */
  pointerPosition: { x: number, y: number };
  /** Native event that is causing the resizing. */
  event: MouseEvent | TouchEvent;
  /** Distance in pixels that the user has resized since the resize sequence started. */
  distance: { x: number, y: number };
  /**
   * Indicates the direction in which the user is resizing the element along each axis.
   * `1` means that the position is increasing (e.g. the user is moving to the right or downwards),
   * whereas `-1` means that it's decreasing (they're moving to the left or upwards). `0` means
   * that the position hasn't changed.
   */
  delta: { x: -1 | 0 | 1, y: -1 | 0 | 1 };
}
