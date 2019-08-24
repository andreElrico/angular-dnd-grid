/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {CdkDrag} from './directives/drag';
import {CdkDropContainer} from "@modules/drag-drop/directives/drop-container";

/** Event emitted when the user starts dragging a draggable. */
export interface CdkDragStart<T = any> {
  /** Draggable that emitted the event. */
  source: CdkDrag<T>;
}

/** Event emitted when the user releases an item, before any animations have started. */
export interface CdkDragRelease<T = any> {
  /** Draggable that emitted the event. */
  source: CdkDrag<T>;
}

/** Event emitted when the user stops dragging a draggable. */
export interface CdkDragEnd<T = any> {
  /** Draggable that emitted the event. */
  source: CdkDrag<T>;
  /** Distance in pixels that the user has dragged since the drag sequence started. */
  distance: {x: number, y: number};
}

/** Event emitted when the user moves an item into a new drop container. */
export interface CdkDragEnter<T = any, I = T> {
  /** Container into which the user has moved the item. */
  container: CdkDropContainer<T>;
  /** Item that was removed from the container. */
  item: CdkDrag<I>;
  /** Index at which the item has entered the container. */
  currentIndex: any;
}

/**
 * Event emitted when the user removes an item from a
 * drop container by moving it into another one.
 */
export interface CdkDragExit<T = any, I = T> {
  /** Container from which the user has a removed an item. */
  container: CdkDropContainer<T>;
  /** Item that was removed from the container. */
  item: CdkDrag<I>;
}


/** Event emitted when the user drops a draggable item inside a drop container. */
export interface CdkDragDrop<T, O = T> {
  /** Index of the item when it was picked up. */
  previousIndex: any;
  /** Current index of the item. */
  currentIndex: any;
  /** Item that is being dropped. */
  item: CdkDrag;
  /** Container in which the item was dropped. */
  container: CdkDropContainer<T>;
  /** Container from which the item was picked up. Can be the same as the `container`. */
  previousContainer: CdkDropContainer<O>;
  /** Whether the user's pointer was over the container when the item was dropped. */
  isPointerOverContainer: boolean;
  /** Distance in pixels that the user has dragged since the drag sequence started. */
  distance: {x: number, y: number};
}

/** Event emitted as the user is dragging a draggable item. */
export interface CdkDragMove<T = any> {
  /** Item that is being dragged. */
  source: CdkDrag<T>;
  /** Position of the user's pointer on the page. */
  pointerPosition: {x: number, y: number};
  /** Native event that is causing the dragging. */
  event: MouseEvent | TouchEvent;
  /** Distance in pixels that the user has dragged since the drag sequence started. */
  distance: {x: number, y: number};
  /**
   * Indicates the direction in which the user is dragging the element along each axis.
   * `1` means that the position is increasing (e.g. the user is moving to the right or downwards),
   * whereas `-1` means that it's decreasing (they're moving to the left or upwards). `0` means
   * that the position hasn't changed.
   */
  delta: {x: -1 | 0 | 1, y: -1 | 0 | 1};
}

/** Event emitted when the user swaps the position of two drag items. */
export interface CdkDragSortEvent<T = any, I = T> {
  /** Index from which the item was sorted previously. */
  previousIndex: any;
  /** Index that the item is currently in. */
  currentIndex: any;
  /** Container that the item belongs to. */
  container: CdkDropContainer<T>;
  /** Item that is being sorted. */
  item: CdkDrag<I>;
}
