import {
  DropContainerRef,
  getMutableClientRect,
  isInsideClientRect,
  ScrollPosition
} from "@modules/drag-drop/containers/drop-container-ref";
import {ElementRef, NgZone} from "@angular/core";
import {Subject} from "rxjs";
import {DragRefInternal as DragRef, Point} from "@modules/drag-drop/drag-ref";
import {DragDropRegistry} from "@modules/drag-drop/drag-drop-registry";
import {ViewportRuler} from "@angular/cdk/overlay";
import {Direction} from "@angular/cdk/bidi";
import {coerceElement} from "@angular/cdk/coercion";

/**
 * Internal compile-time-only representation of a `DropListRef`.
 * Used to avoid circular import issues between the `DropListRef` and the `DragRef`.
 * @docs-private
 */
export interface DropGridRefInternal extends DropGridRef {
}

export class DropGridRef<T = any> implements DropContainerRef<T> {
  /** DOM document **/
  private _document: Document;

  /** Element that the drop list is attached to. */
  element: HTMLElement | ElementRef<HTMLElement>;

  /** Whether starting a dragging sequence from this container is disabled. */
  disabled: boolean = false;

  /** Whether sorting items within the list is disabled. */
  sortingDisabled: boolean = true;

  /** Locks the position of the draggable elements inside the container along the specified axis. */
  lockAxis: 'x' | 'y';

  /**
   * Whether auto-scrolling the view when the user
   * moves their pointer close to the edges is disabled.
   */
  autoScrollDisabled: boolean = false;

  /**
   * Function that is used to determine whether an item
   * is allowed to be moved into a drop container.
   */
  enterPredicate: (drag: DragRef, drop: DropContainerRef) => boolean = () => true;

  /** Emits right before dragging has started. */
  beforeStarted = new Subject<void>();

  /**
   * Emits when the user has moved a new drag item into this container.
   */
  entered = new Subject<{ item: DragRef, container: DropGridRef, currentIndex: number }>();

  /**
   * Emits when the user removes an item from the container
   * by dragging it into another container.
   */
  exited = new Subject<{ item: DragRef, container: DropGridRef }>();

  /** Emits when the user drops an item inside the container. */
  dropped = new Subject<{
    item: DragRef,
    currentIndex: number,
    previousIndex: number,
    container: DropGridRef,
    previousContainer: DropGridRef,
    isPointerOverContainer: boolean,
    distance: Point;
  }>();

  /** Emits as the user is swapping items while actively dragging. */
  sorted = new Subject<{
    previousIndex: number,
    currentIndex: number,
    container: DropGridRef,
    item: DragRef
  }>();

  /** Arbitrary data that can be attached to the drop list. */
  data: T;

  /** Whether an item in the list is being dragged. */
  private _isDragging = false;

  /** Keeps track of the container's scroll position. */
  private _scrollPosition: ScrollPosition = {top: 0, left: 0};

  /** Keeps track of the scroll position of the viewport. */
  private _viewportScrollPosition: ScrollPosition = {top: 0, left: 0};

  /** Cached `ClientRect` of the drop list. */
  private _clientRect: ClientRect;

  /** Connected siblings that currently have a dragged item. */
  private _activeSiblings = new Set<DropContainerRef>();

  /** Layout direction of the drop list. */
  private _direction: Direction = 'ltr';

  constructor(
    element: ElementRef<HTMLElement> | HTMLElement,
    private _dragDropRegistry: DragDropRegistry,
    _document: any,
    /**
     * @deprecated _ngZone and _viewportRuler parameters to be made required.
     * @breaking-change 9.0.0
     */
    private _ngZone?: NgZone,
    private _viewportRuler?: ViewportRuler) {
    _dragDropRegistry.registerDropContainer(this);
    this._document = _document;
    this.element = element instanceof ElementRef ? element.nativeElement : element;
  }

  /** Removes the drop list functionality from the DOM element. */
  dispose() {
  }

  /** Whether an item from this list is currently being dragged. */
  isDragging() {
    return this._isDragging;
  }

  /** Starts dragging an item. */
  start(): void {
  }

  /**
   * Emits an event to indicate that the user moved an item into the container.
   * @param item Item that was moved into the container.
   * @param pointerX Position of the item along the X axis.
   * @param pointerY Position of the item along the Y axis.
   */
  enter(item: DragRef, pointerX: number, pointerY: number): void {
  }

  /**
   * Removes an item from the container after it was dragged into another container by the user.
   * @param item Item that was dragged out.
   */
  exit(item: DragRef): void {
  }

  /**
   * Drops an item into this container.
   * @param item Item being dropped into the container.
   * @param currentIndex Index at which the item should be inserted.
   * @param previousContainer Container from which the item got dragged in.
   * @param isPointerOverContainer Whether the user's pointer was over the
   *    container when the item was dropped.
   * @param distance Distance the user has dragged since the start of the dragging sequence.
   * @breaking-change 9.0.0 `distance` parameter to become required.
   */
  drop(item: DragRef, currentIndex: number, previousContainer: DropGridRef,
       isPointerOverContainer: boolean, distance: Point = {x: 0, y: 0}): void {
  }

  /**
   * Sorts an item inside the container based on its position.
   * @param item Item to be sorted.
   * @param pointerX Position of the item along the X axis.
   * @param pointerY Position of the item along the Y axis.
   * @param pointerDelta Direction in which the pointer is moving along each axis.
   */
  _sortItem(item: DragRef, pointerX: number, pointerY: number,
            pointerDelta: { x: number, y: number }): void {
  }

  /**
   * Sets the draggable items that are a part of this list.
   * @param items Items that are a part of this list.
   */
  withItems(items: DragRef[]): this {
    return this;
  }

  /** Sets the layout direction of the drop list. */
  withDirection(direction: Direction): this {
    this._direction = direction;
    return this;
  }

  /**
   * Sets the containers that are connected to this one. When two or more containers are
   * connected, the user will be allowed to transfer items between them.
   * @param connectedTo Other containers that the current containers should be connected to.
   */
  connectedTo(connectedTo: DropContainerRef[]): this {
    return this;
  }

  /**
   * Figures out the index of an item in the container.
   * @param item Item whose index should be determined.
   */
  getItemIndex(item: DragRef): any {
  }

  /**
   * Whether the list is able to receive the item that
   * is currently being dragged inside a connected drop list.
   */
  isReceiving(): boolean {
    return true;
  }

  /**
   * Checks whether the user's pointer is close to the edges of either the
   * viewport or the drop list and starts the auto-scroll sequence.
   * @param pointerX User's pointer position along the x axis.
   * @param pointerY User's pointer position along the y axis.
   */
  _startScrollingIfNecessary(pointerX: number, pointerY: number) {
  }

  /** Stops any currently-running auto-scroll sequences. */
  _stopScrolling() {
  }

  /** Caches the position of the drop list. */
  private _cacheOwnPosition() {
    const element = coerceElement(this.element);
    this._clientRect = getMutableClientRect(element);
    this._scrollPosition = {top: element.scrollTop, left: element.scrollLeft};
  }

  /**
   * Checks whether the user's pointer is positioned over the container.
   * @param x Pointer position along the X axis.
   * @param y Pointer position along the Y axis.
   */
  _isOverContainer(x: number, y: number): boolean {
    return true;
  }

  /**
   * Figures out whether an item should be moved into a sibling
   * drop container, based on its current position.
   * @param item Drag item that is being moved.
   * @param x Position of the item along the X axis.
   * @param y Position of the item along the Y axis.
   */
  _getSiblingContainerFromPosition(item: DragRef, x: number, y: number): DropGridRef | undefined {
    return;
  }

  /**
   * Checks whether the drop list can receive the passed-in item.
   * @param item Item that is being dragged into the list.
   * @param x Position of the item along the X axis.
   * @param y Position of the item along the Y axis.
   */
  _canReceive(item: DragRef, x: number, y: number): boolean {
    if (!this.enterPredicate(item, this) || !isInsideClientRect(this._clientRect, x, y)) {
      return false;
    }

    const elementFromPoint = this._document.elementFromPoint(x, y) as HTMLElement | null;

    // If there's no element at the pointer position, then
    // the client rect is probably scrolled out of the view.
    if (!elementFromPoint) {
      return false;
    }

    const nativeElement = coerceElement(this.element);

    // The `ClientRect`, that we're using to find the container over which the user is
    // hovering, doesn't give us any information on whether the element has been scrolled
    // out of the view or whether it's overlapping with other containers. This means that
    // we could end up transferring the item into a container that's invisible or is positioned
    // below another one. We use the result from `elementFromPoint` to get the top-most element
    // at the pointer position and to find whether it's one of the intersecting drop containers.
    return elementFromPoint === nativeElement || nativeElement.contains(elementFromPoint);
  }

  /**
   * Called by one of the connected drop lists when a dragging sequence has started.
   * @param sibling Sibling in which dragging has started.
   */
  _startReceiving(sibling: DropContainerRef) {
    const activeSiblings = this._activeSiblings;

    if (!activeSiblings.has(sibling)) {
      activeSiblings.add(sibling);
      this._cacheOwnPosition();
    }
  }

  /**
   * Called by a connected drop list when dragging has stopped.
   * @param sibling Sibling whose dragging has stopped.
   */
  _stopReceiving(sibling: DropContainerRef) {
    this._activeSiblings.delete(sibling);
  }
}
