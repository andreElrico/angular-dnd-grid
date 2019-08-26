import {Inject, Injectable, NgZone, OnDestroy} from '@angular/core';
import {normalizePassiveListenerOptions} from "@angular/cdk/platform";
import {DropContainerRef} from "./containers/drop-container-ref";
import {ResizeRef} from "./resize-ref";
import {Subject} from "rxjs";
import {DOCUMENT} from "@angular/common";

/** Event options that can be used to bind an active, capturing event. */
const activeCapturingEventOptions = normalizePassiveListenerOptions({
  passive: false,
  capture: true
});

/**
 * Service that keeps track of all the resize item and drop container
 * instances, and manages global event listeners on the `document`.
 * @docs-private
 */
// Note: this class is generic, rather than referencing CdkResize and CdkDropList directly, in order
// to avoid circular imports. If we were to reference them here, importing the registry into the
// classes that are registering themselves will introduce a circular import.
@Injectable({providedIn: 'root'})
export class ResizeRegistry implements OnDestroy {
  private _document: Document;

  /** Registered drop container instances. */
  private _dropInstances = new Set<DropContainerRef>();

  /** Registered resize item instances. */
  private _resizeInstances = new Set<ResizeRef>();

  /** Resize item instances that are currently being resized. */
  private _activeResizeInstances = new Set<ResizeRef>();

  /** Keeps track of the event listeners that we've bound to the `document`. */
  private _globalListeners = new Map<string, {
    handler: (event: Event) => void,
    options?: AddEventListenerOptions | boolean
  }>();

  /**
   * Emits the `touchmove` or `mousemove` events that are dispatched
   * while the user is resizing a resize item instance.
   */
  readonly pointerMove: Subject<TouchEvent | MouseEvent> = new Subject<TouchEvent | MouseEvent>();

  /**
   * Emits the `touchend` or `mouseup` events that are dispatched
   * while the user is resizing a resize item instance.
   */
  readonly pointerUp: Subject<TouchEvent | MouseEvent> = new Subject<TouchEvent | MouseEvent>();

  /** Emits when the viewport has been scrolled while the user is resizing an item. */
  readonly scroll: Subject<Event> = new Subject<Event>();

  constructor(
    private _ngZone: NgZone,
    @Inject(DOCUMENT) _document: any) {
    this._document = _document;
  }

  /** Adds a drop container to the registry. */
  registerDropContainer(drop: DropContainerRef) {
    if (!this._dropInstances.has(drop)) {
      this._dropInstances.add(drop);
    } else {
      throw Error(`Drop instance with has already been registered.`);
    }
  }

  /** Adds a resize item instance to the registry. */
  registerResizeItem(resize: ResizeRef) {
    this._resizeInstances.add(resize);

    // The `touchmove` event gets bound once, ahead of time, because WebKit
    // won't preventDefault on a dynamically-added `touchmove` listener.
    // See https://bugs.webkit.org/show_bug.cgi?id=184250.
    if (this._resizeInstances.size === 1) {
      this._ngZone.runOutsideAngular(() => {
        // The event handler has to be explicitly active,
        // because newer browsers make it passive by default.
        this._document.addEventListener('touchmove', this._preventDefaultWhileResizing,
          activeCapturingEventOptions);
      });
    }
  }

  /** Removes a drop container from the registry. */
  removeDropContainer(drop: DropContainerRef) {
    this._dropInstances.delete(drop);
  }

  /** Removes a resize item instance from the registry. */
  removeResizeItem(resize: ResizeRef) {
    this._resizeInstances.delete(resize);
    this.stopResizing(resize);

    if (this._resizeInstances.size === 0) {
      this._document.removeEventListener('touchmove', this._preventDefaultWhileResizing,
        activeCapturingEventOptions);
    }
  }

  /**
   * Starts the resizing sequence for a resize instance.
   * @param resize Resize instance which is being resized.
   * @param event Event that initiated the resizing.
   */
  startResizing(resize: ResizeRef, event: TouchEvent | MouseEvent) {
    // Do not process the same resize twice to avoid memory leaks and redundant listeners
    if (this._activeResizeInstances.has(resize)) {
      return;
    }

    this._activeResizeInstances.add(resize);

    if (this._activeResizeInstances.size === 1) {
      const isTouchEvent = event.type.startsWith('touch');
      const moveEvent = isTouchEvent ? 'touchmove' : 'mousemove';
      const upEvent = isTouchEvent ? 'touchend' : 'mouseup';

      // We explicitly bind __active__ listeners here, because newer browsers will default to
      // passive ones for `mousemove` and `touchmove`. The events need to be active, because we
      // use `preventDefault` to prevent the page from scrolling while the user is resizing.
      this._globalListeners
        .set(moveEvent, {
          handler: (e: Event) => this.pointerMove.next(e as TouchEvent | MouseEvent),
          options: activeCapturingEventOptions
        })
        .set(upEvent, {
          handler: (e: Event) => this.pointerUp.next(e as TouchEvent | MouseEvent),
          options: true
        })
        .set('scroll', {
          handler: (e: Event) => this.scroll.next(e)
        })
        // Preventing the default action on `mousemove` isn't enough to disable text selection
        // on Safari so we need to prevent the selection event as well. Alternatively this can
        // be done by setting `user-select: none` on the `body`, however it has causes a style
        // recalculation which can be expensive on pages with a lot of elements.
        .set('selectstart', {
          handler: this._preventDefaultWhileResizing,
          options: activeCapturingEventOptions
        });

      this._ngZone.runOutsideAngular(() => {
        this._globalListeners.forEach((config, name) => {
          this._document.addEventListener(name, config.handler, config.options);
        });
      });
    }
  }

  /** Stops resizing a resize item instance. */
  stopResizing(resize: ResizeRef) {
    this._activeResizeInstances.delete(resize);

    if (this._activeResizeInstances.size === 0) {
      this._clearGlobalListeners();
    }
  }

  /** Gets whether a resize item instance is currently being resized. */
  isResizing(resize: ResizeRef) {
    return this._activeResizeInstances.has(resize);
  }

  ngOnDestroy() {
    this._resizeInstances.forEach(instance => this.removeResizeItem(instance));
    this._dropInstances.forEach(instance => this.removeDropContainer(instance));
    this._clearGlobalListeners();
    this.pointerMove.complete();
    this.pointerUp.complete();
  }

  /**
   * Event listener that will prevent the default browser action while the user is resizing.
   * @param event Event whose default action should be prevented.
   */
  private _preventDefaultWhileResizing = (event: Event) => {
    if (this._activeResizeInstances.size) {
      event.preventDefault();
    }
  };

  /** Clears out the global event listeners from the `document`. */
  private _clearGlobalListeners() {
    this._globalListeners.forEach((config, name) => {
      this._document.removeEventListener(name, config.handler, config.options);
    });

    this._globalListeners.clear();
  }
}
