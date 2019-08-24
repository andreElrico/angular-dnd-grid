import {
  adjustClientRect,
  AUTO_SCROLL_STEP,
  AutoScrollHorizontalDirection,
  AutoScrollVerticalDirection,
  DROP_PROXIMITY_THRESHOLD,
  DropContainerRef,
  findIndex,
  getHorizontalScrollDirection,
  getMutableClientRect,
  getVerticalScrollDirection,
  incrementHorizontalScroll,
  incrementVerticalScroll,
  isInsideClientRect,
  ScrollPosition
} from "@modules/drag-drop/containers/drop-container-ref";
import {ElementRef, NgZone} from "@angular/core";
import {animationFrameScheduler, interval, Subject, Subscription} from "rxjs";
import {DragRefInternal as DragRef, Point} from "@modules/drag-drop/drag-ref";
import {DragDropRegistry} from "@modules/drag-drop/drag-drop-registry";
import {ViewportRuler} from "@angular/cdk/overlay";
import {Direction} from "@angular/cdk/bidi";
import {coerceElement} from "@angular/cdk/coercion";
import {moveItemInArray} from "@modules/drag-drop/drag-utils";
import {takeUntil} from "rxjs/operators";

/**
 * Entry in the position cache for draggable items.
 * @docs-private
 */
interface CachedGridItemPosition {
  /** Instance of the drag item. */
  drag: DragRef;
  /** Dimensions of the item. */
  clientRect: ClientRect;
  /** Amount by which the item has been moved since dragging started. */
  offset: { x: number, y: number };
}

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
    currentIndex: ClientRect,
    previousIndex: ClientRect,
    container: DropGridRef,
    previousContainer: DropGridRef,
    isPointerOverContainer: boolean,
    distance: Point;
  }>();

  /** Emits as the user is swapping items while actively dragging. */
  sorted = new Subject<{
    previousIndex: ClientRect,
    currentIndex: ClientRect,
    container: DropGridRef,
    item: DragRef
  }>();

  /** Arbitrary data that can be attached to the drop list. */
  data: T;

  /** Whether an item in the list is being dragged. */
  private _isDragging = false;

  /** Cache of the dimensions of all the items inside the container. */
  private _itemPositions: CachedGridItemPosition[] = [];

  /** Keeps track of the container's scroll position. */
  private _scrollPosition: ScrollPosition = {top: 0, left: 0};

  /** Keeps track of the scroll position of the viewport. */
  private _viewportScrollPosition: ScrollPosition = {top: 0, left: 0};

  /** Cached `ClientRect` of the drop list. */
  private _clientRect: ClientRect;

  /**
   * Draggable items that are currently active inside the container. Includes the items
   * from `_draggables`, as well as any items that have been dragged in, but haven't
   * been dropped yet.
   */
  private _activeDraggables: DragRef[];

  /** Draggable items in the container. */
  private _draggables: ReadonlyArray<DragRef>;

  /**
   * Keeps track of the item that was last swapped with the dragged item, as
   * well as what direction the pointer was moving in when the swap occured.
   */
  private _previousSwap = {drag: null as DragRef | null, delta: {x: 0, y: 0}};

  /** Drop lists that are connected to the current one. */
  private _siblings: ReadonlyArray<DropContainerRef> = [];

  /** Connected siblings that currently have a dragged item. */
  private _activeSiblings = new Set<DropContainerRef>();

  /** Layout direction of the drop list. */
  private _direction: Direction = 'ltr';

  /** Subscription to the window being scrolled. */
  private _viewportScrollSubscription = Subscription.EMPTY;

  /** Vertical direction in which the list is currently scrolling. */
  private _verticalScrollDirection = AutoScrollVerticalDirection.NONE;

  /** Horizontal direction in which the list is currently scrolling. */
  private _horizontalScrollDirection = AutoScrollHorizontalDirection.NONE;

  /** Node that is being auto-scrolled. */
  private _scrollNode: HTMLElement | Window;

  /** Used to signal to the current auto-scroll sequence when to stop. */
  private _stopScrollTimers = new Subject<void>();

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
    this._stopScrolling();
    this._stopScrollTimers.complete();
    this._removeListeners();
    this.beforeStarted.complete();
    this.entered.complete();
    this.exited.complete();
    this.dropped.complete();
    this.sorted.complete();
    this._activeSiblings.clear();
    this._scrollNode = null!;
    this._dragDropRegistry.removeDropContainer(this);
  }

  /** Whether an item from this list is currently being dragged. */
  isDragging() {
    return this._isDragging;
  }

  /** Starts dragging an item. */
  start(): void {
    const element = coerceElement(this.element);
    this.beforeStarted.next();
    this._isDragging = true;
    this._cacheItems();
    this._siblings.forEach(sibling => sibling._startReceiving(this));
    this._removeListeners();

    // @breaking-change 9.0.0 Remove check for _ngZone once it's marked as a required param.
    if (this._ngZone) {
      this._ngZone.runOutsideAngular(() => element.addEventListener('scroll', this._handleScroll));
    } else {
      element.addEventListener('scroll', this._handleScroll);
    }

    // @breaking-change 9.0.0 Remove check for _viewportRuler once it's marked as a required param.
    if (this._viewportRuler) {
      this._viewportScrollPosition = this._viewportRuler.getViewportScrollPosition();
      this._viewportScrollSubscription = this._dragDropRegistry.scroll.subscribe(() => {
        if (this.isDragging()) {
          const newPosition = this._viewportRuler!.getViewportScrollPosition();
          this._updateAfterScroll(this._viewportScrollPosition, newPosition.top, newPosition.left,
            this._clientRect);
        }
      });
    }
  }

  /**
   * Emits an event to indicate that the user moved an item into the container.
   * @param item Item that was moved into the container.
   * @param pointerX Position of the item along the X axis.
   * @param pointerY Position of the item along the Y axis.
   */
  enter(item: DragRef, pointerX: number, pointerY: number): void {
    this.start();

    // If sorting is disabled, we want the item to return to its starting
    // position if the user is returning it to its initial container.
    let newIndex = this.sortingDisabled ? this._draggables.indexOf(item) : -1;

    if (newIndex === -1) {
      // We use the coordinates of where the item entered the drop
      // zone to figure out at which index it should be inserted.
      newIndex = this._getItemIndexFromPointerPosition(item, pointerX, pointerY);
    }

    const activeDraggables = this._activeDraggables;
    const currentIndex = activeDraggables.indexOf(item);
    const placeholder = item.getPlaceholderElement();
    let newPositionReference: DragRef | undefined = activeDraggables[newIndex];

    // If the item at the new position is the same as the item that is being dragged,
    // it means that we're trying to restore the item to its initial position. In this
    // case we should use the next item from the list as the reference.
    if (newPositionReference === item) {
      newPositionReference = activeDraggables[newIndex + 1];
    }

    // Since the item may be in the `activeDraggables` already (e.g. if the user dragged it
    // into another container and back again), we have to ensure that it isn't duplicated.
    if (currentIndex > -1) {
      activeDraggables.splice(currentIndex, 1);
    }

    // Don't use items that are being dragged as a reference, because
    // their element has been moved down to the bottom of the body.
    if (newPositionReference && !this._dragDropRegistry.isDragging(newPositionReference)) {
      const element = newPositionReference.getRootElement();
      element.parentElement!.insertBefore(placeholder, element);
      activeDraggables.splice(newIndex, 0, item);
    } else {
      coerceElement(this.element).appendChild(placeholder);
      activeDraggables.push(item);
    }

    // The transform needs to be cleared so it doesn't throw off the measurements.
    placeholder.style.transform = '';

    // Note that the positions were already cached when we called `start` above,
    // but we need to refresh them since the amount of items has changed.
    this._cacheItemPositions();
    this.entered.next({item, container: this, currentIndex: this.getItemIndex(item)});
  }

  /**
   * Removes an item from the container after it was dragged into another container by the user.
   * @param item Item that was dragged out.
   */
  exit(item: DragRef): void {
    this._reset();
    this.exited.next({item, container: this});
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
  drop(item: DragRef, currentIndex: ClientRect, previousContainer: DropGridRef, isPointerOverContainer: boolean,
       distance: Point = {x: 0, y: 0}): void {
    this._reset();
    this.dropped.next({
      item,
      currentIndex,
      previousIndex: previousContainer.getItemIndex(item),
      container: this,
      previousContainer,
      isPointerOverContainer,
      distance
    });
  }

  /**
   * Sorts an item inside the container based on its position.
   * @param item Item to be sorted.
   * @param pointerX Position of the item along the X axis.
   * @param pointerY Position of the item along the Y axis.
   * @param pointerDelta Direction in which the pointer is moving along each axis.
   */
  _sortItem(item: DragRef, pointerX: number, pointerY: number, pointerDelta: { x: number, y: number }): void {
    // Don't sort the item if sorting is disabled or it's out of range.
    if (this.sortingDisabled || !this._isPointerNearDropContainer(pointerX, pointerY)) {
      return;
    }

    const siblings = this._itemPositions;
    const newIndex = this._getItemIndexFromPointerPosition(item, pointerX, pointerY, pointerDelta);

    if (newIndex === -1 && siblings.length > 0) {
      return;
    }

    const currentIndex = findIndex(siblings, currentItem => currentItem.drag === item);
    const siblingAtNewPosition = siblings[newIndex];
    const currentPosition = siblings[currentIndex].clientRect;
    const newPosition = siblingAtNewPosition.clientRect;
    const delta = currentIndex > newIndex ? 1 : -1;

    this._previousSwap.drag = siblingAtNewPosition.drag;
    this._previousSwap.delta = pointerDelta;

    // How many pixels the item's placeholder should be offset.
    const itemOffset = this._getItemOffsetPx(currentPosition, newPosition, delta);

    // How many pixels all the other items should be offset.
    const siblingOffset = this._getSiblingOffsetPx(currentIndex, siblings, delta);

    // Save the previous order of the items before moving the item to its new index.
    // We use this to check whether an item has been moved as a result of the sorting.
    const oldOrder = siblings.slice();

    // Shuffle the array in place.
    moveItemInArray(siblings, currentIndex, newIndex);

    this.sorted.next({
      previousIndex: newPosition,
      currentIndex: currentPosition,
      container: this,
      item
    });

    siblings.forEach((sibling, index) => {
      // Don't do anything if the position hasn't changed.
      if (oldOrder[index] === sibling) {
        return;
      }

      const isDraggedItem = sibling.drag === item;
      const offset = isDraggedItem ? itemOffset : siblingOffset;
      const elementToOffset = isDraggedItem ? item.getPlaceholderElement() :
        sibling.drag.getRootElement();

      // Update the offset to reflect the new position.
      sibling.offset.x += offset.x;
      sibling.offset.y += offset.y;

      // Since we're moving the items with a `transform`, we need to adjust their cached
      // client rects to reflect their new position, as well as swap their positions in the cache.
      // Note that we shouldn't use `getBoundingClientRect` here to update the cache, because the
      // elements may be mid-animation which will give us a wrong result.
      // Round the transforms since some browsers will
      // blur the elements, for sub-pixel transforms.
      elementToOffset.style.transform = `translate3d(${Math.round(sibling.offset.x)}px, ${Math.round(sibling.offset.y)}px, 0)`;
      adjustClientRect(sibling.clientRect, offset.y, offset.x);
    });
  }

  /**
   * Sets the draggable items that are a part of this list.
   * @param items Items that are a part of this list.
   */
  withItems(items: DragRef[]): this {
    this._draggables = items;
    items.forEach(item => item._withDropContainer(this));

    if (this.isDragging()) {
      this._cacheItems();
    }

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
    this._siblings = connectedTo.slice();
    return this;
  }

  /**
   * Figures out the index of an item in the container.
   * @param item Item whose index should be determined.
   */
  getItemIndex(item: DragRef): any {
    if (!this._isDragging) {
      return this._draggables.indexOf(item);
    }

    // Items are sorted always by top/left in the cache, however they flow differently in RTL.
    // The rest of the logic still stands no matter what orientation we're in, however
    // we need to invert the array when determining the index.
    const items = this._direction === 'rtl' ? this._itemPositions.slice().reverse() : this._itemPositions;

    return findIndex(items, currentItem => currentItem.drag === item);
  }

  /**
   * Whether the list is able to receive the item that
   * is currently being dragged inside a connected drop list.
   */
  isReceiving(): boolean {
    return this._activeSiblings.size > 0;
  }

  /**
   * Checks whether the user's pointer is close to the edges of either the
   * viewport or the drop list and starts the auto-scroll sequence.
   * @param pointerX User's pointer position along the x axis.
   * @param pointerY User's pointer position along the y axis.
   */
  _startScrollingIfNecessary(pointerX: number, pointerY: number) {
    if (this.autoScrollDisabled) {
      return;
    }

    let scrollNode: HTMLElement | Window | undefined;
    let verticalScrollDirection = AutoScrollVerticalDirection.NONE;
    let horizontalScrollDirection = AutoScrollHorizontalDirection.NONE;

    // @breaking-change 9.0.0 Remove null check for _viewportRuler once it's a required parameter.
    // Check whether we're in range to scroll the viewport.
    if (this._viewportRuler) {
      const {width, height} = this._viewportRuler.getViewportSize();
      const clientRect = {width, height, top: 0, right: width, bottom: height, left: 0};
      verticalScrollDirection = getVerticalScrollDirection(clientRect, pointerY);
      horizontalScrollDirection = getHorizontalScrollDirection(clientRect, pointerX);
      scrollNode = window;
    }

    // If we couldn't find a scroll direction based on the
    // window, try with the container, if the pointer is close by.
    if (!verticalScrollDirection && !horizontalScrollDirection &&
      this._isPointerNearDropContainer(pointerX, pointerY)) {
      verticalScrollDirection = getVerticalScrollDirection(this._clientRect, pointerY);
      horizontalScrollDirection = getHorizontalScrollDirection(this._clientRect, pointerX);
      scrollNode = coerceElement(this.element);
    }

    // TODO(crisbeto): we also need to account for whether the view or element are scrollable in
    // the first place. With the current approach we'll still try to scroll them, but it just
    // won't do anything. The only case where this is relevant is that if we have a scrollable
    // list close to the viewport edge where the viewport isn't scrollable. In this case the
    // we'll be trying to scroll the viewport rather than the list.

    if (scrollNode && (verticalScrollDirection !== this._verticalScrollDirection ||
      horizontalScrollDirection !== this._horizontalScrollDirection ||
      scrollNode !== this._scrollNode)) {
      this._verticalScrollDirection = verticalScrollDirection;
      this._horizontalScrollDirection = horizontalScrollDirection;
      this._scrollNode = scrollNode;

      if ((verticalScrollDirection || horizontalScrollDirection) && scrollNode) {
        // @breaking-change 9.0.0 Remove null check for `_ngZone` once it is made required.
        if (this._ngZone) {
          this._ngZone.runOutsideAngular(this._startScrollInterval);
        } else {
          this._startScrollInterval();
        }
      } else {
        this._stopScrolling();
      }
    }
  }

  /** Stops any currently-running auto-scroll sequences. */
  _stopScrolling() {
    this._stopScrollTimers.next();
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
    return isInsideClientRect(this._clientRect, x, y);
  }

  /**
   * Figures out whether an item should be moved into a sibling
   * drop container, based on its current position.
   * @param item Drag item that is being moved.
   * @param x Position of the item along the X axis.
   * @param y Position of the item along the Y axis.
   */
  _getSiblingContainerFromPosition(item: DragRef, x: number, y: number): DropContainerRef | undefined {
    return this._siblings.find(sibling => sibling._canReceive(item, x, y));
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

  /** Removes the event listeners associated with this drop list. */
  private _removeListeners() {
    coerceElement(this.element).removeEventListener('scroll', this._handleScroll);
    this._viewportScrollSubscription.unsubscribe();
  }

  /** Handles the container being scrolled. Has to be an arrow function to preserve the context. */
  private _handleScroll = () => {
    if (!this.isDragging()) {
      return;
    }

    const element = coerceElement(this.element);
    this._updateAfterScroll(this._scrollPosition, element.scrollTop, element.scrollLeft);
  };

  /** Starts the interval that'll auto-scroll the element. */
  private _startScrollInterval = () => {
    this._stopScrolling();

    interval(0, animationFrameScheduler)
      .pipe(takeUntil(this._stopScrollTimers))
      .subscribe(() => {
        const node = this._scrollNode;

        if (this._verticalScrollDirection === AutoScrollVerticalDirection.UP) {
          incrementVerticalScroll(node, -AUTO_SCROLL_STEP);
        } else if (this._verticalScrollDirection === AutoScrollVerticalDirection.DOWN) {
          incrementVerticalScroll(node, AUTO_SCROLL_STEP);
        }

        if (this._horizontalScrollDirection === AutoScrollHorizontalDirection.LEFT) {
          incrementHorizontalScroll(node, -AUTO_SCROLL_STEP);
        } else if (this._horizontalScrollDirection === AutoScrollHorizontalDirection.RIGHT) {
          incrementHorizontalScroll(node, AUTO_SCROLL_STEP);
        }
      });
  };

  /**
   * Updates the internal state of the container after a scroll event has happened.
   * @param scrollPosition Object that is keeping track of the scroll position.
   * @param newTop New top scroll position.
   * @param newLeft New left scroll position.
   * @param extraClientRect Extra `ClientRect` object that should be updated, in addition to the
   *  ones of the drag items. Useful when the viewport has been scrolled and we also need to update
   *  the `ClientRect` of the list.
   */
  private _updateAfterScroll(scrollPosition: ScrollPosition, newTop: number, newLeft: number,
                             extraClientRect?: ClientRect) {
    const topDifference = scrollPosition.top - newTop;
    const leftDifference = scrollPosition.left - newLeft;

    if (extraClientRect) {
      adjustClientRect(extraClientRect, topDifference, leftDifference);
    }

    // Since we know the amount that the user has scrolled we can shift all of the client rectangles
    // ourselves. This is cheaper than re-measuring everything and we can avoid inconsistent
    // behavior where we might be measuring the element before its position has changed.
    this._itemPositions.forEach(({clientRect}) => {
      adjustClientRect(clientRect, topDifference, leftDifference);
    });

    // We need two loops for this, because we want all of the cached
    // positions to be up-to-date before we re-sort the item.
    this._itemPositions.forEach(({drag}) => {
      if (this._dragDropRegistry.isDragging(drag)) {
        // We need to re-sort the item manually, because the pointer move
        // events won't be dispatched while the user is scrolling.
        drag._sortFromLastPointerPosition();
      }
    });

    scrollPosition.top = newTop;
    scrollPosition.left = newLeft;
  }

  /** Caches the current items in the list and their positions. */
  private _cacheItems(): void {
    this._activeDraggables = this._draggables.slice();
    this._cacheItemPositions();
    this._cacheOwnPosition();
  }

  /** Refreshes the position cache of the items and sibling containers. */
  private _cacheItemPositions() {
    this._itemPositions = this._activeDraggables.map(drag => {
      const elementToMeasure = this._dragDropRegistry.isDragging(drag) ?
        // If the element is being dragged, we have to measure the
        // placeholder, because the element is hidden.
        drag.getPlaceholderElement() :
        drag.getRootElement();
      return {drag, offset: {x: 0, y: 0}, clientRect: getMutableClientRect(elementToMeasure)};
    }).sort((a, b) => a.clientRect.left === b.clientRect.left ? a.clientRect.top - b.clientRect.top : a.clientRect.left - b.clientRect.left);
  }

  /** Resets the container to its initial state. */
  private _reset() {
    this._isDragging = false;

    // TODO(crisbeto): may have to wait for the animations to finish.
    this._activeDraggables.forEach(item => item.getRootElement().style.transform = '');
    this._siblings.forEach(sibling => sibling._stopReceiving(this));
    this._activeDraggables = [];
    this._itemPositions = [];
    this._previousSwap.drag = null;
    this._previousSwap.delta = {x: 0, y: 0};
    this._stopScrolling();
    this._removeListeners();
  }

  /**
   * Checks whether the pointer coordinates are close to the drop container.
   * @param pointerX Coordinates along the X axis.
   * @param pointerY Coordinates along the Y axis.
   */
  private _isPointerNearDropContainer(pointerX: number, pointerY: number): boolean {
    const {top, right, bottom, left, width, height} = this._clientRect;
    const xThreshold = width * DROP_PROXIMITY_THRESHOLD;
    const yThreshold = height * DROP_PROXIMITY_THRESHOLD;

    return pointerY > top - yThreshold && pointerY < bottom + yThreshold &&
      pointerX > left - xThreshold && pointerX < right + xThreshold;
  }

  /**
   * Gets the offset in pixels by which the item that is being dragged should be moved.
   * @param currentPosition Current position of the item.
   * @param newPosition Position of the item where the current item should be moved.
   * @param delta Direction in which the user is moving.
   */
  private _getItemOffsetPx(currentPosition: ClientRect, newPosition: ClientRect, delta: 1 | -1) {
    let itemOffset = {x: newPosition.left - currentPosition.left, y: newPosition.top - currentPosition.top};

    // Account for differences in the item width/height.
    if (delta === -1) {
      itemOffset.x += newPosition.width - currentPosition.width;
      itemOffset.y += newPosition.height - currentPosition.height;
    }

    return itemOffset;
  }

  /**
   * Gets the offset in pixels by which the items that aren't being dragged should be moved.
   * @param currentIndex Index of the item currently being dragged.
   * @param siblings All of the items in the list.
   * @param delta Direction in which the user is moving.
   */
  private _getSiblingOffsetPx(currentIndex: number, siblings: CachedGridItemPosition[], delta: 1 | -1) {
    const currentPosition = siblings[currentIndex].clientRect;
    const immediateSibling = siblings[currentIndex + delta * -1];
    let siblingOffset = {x: currentPosition.left, y: currentPosition.top};

    if (immediateSibling) {
      // Get the spacing between the start of the current item and the end of the one immediately
      // after it in the direction in which the user is dragging, or vice versa. We add it to the
      // offset in order to push the element to where it will be when it's inline and is influenced
      // by the `margin` of its siblings.
      if (delta === -1) {
        siblingOffset.x -= immediateSibling.clientRect.left - currentPosition.right;
        siblingOffset.y -= immediateSibling.clientRect.top - currentPosition.bottom;
      } else {
        siblingOffset.x += currentPosition.left - immediateSibling.clientRect.right;
        siblingOffset.y += currentPosition.top - immediateSibling.clientRect.bottom;
      }
    }

    return siblingOffset;
  }

  /**
   * Gets the index of an item in the drop container, based on the position of the user's pointer.
   * @param item Item that is being sorted.
   * @param pointerX Position of the user's pointer along the X axis.
   * @param pointerY Position of the user's pointer along the Y axis.
   * @param delta Direction in which the user is moving their pointer.
   */
  private _getItemIndexFromPointerPosition(item: DragRef, pointerX: number, pointerY: number, delta?: { x: number, y: number }) {
    return findIndex(this._itemPositions, ({drag, clientRect}, _, array) => {
      if (drag === item) {
        // If there's only one item left in the container, it must be
        // the dragged item itself so we use it as a reference.
        return array.length < 2;
      }

      if (delta) {
        // If the user is still hovering over the same item as last time, and they didn't change
        // the direction in which they're dragging, we don't consider it a direction swap.
        if (drag === this._previousSwap.drag && delta === this._previousSwap.delta) {
          return false;
        }
      }

      return (pointerX >= Math.floor(clientRect.left) && pointerX <= Math.floor(clientRect.right))
        && (pointerY >= Math.floor(clientRect.top) && pointerY <= Math.floor(clientRect.bottom));
    });
  }
}
