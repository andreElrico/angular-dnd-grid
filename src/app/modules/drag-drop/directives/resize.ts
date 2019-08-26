import {
  AfterViewInit,
  ChangeDetectorRef,
  ContentChild,
  ContentChildren,
  Directive,
  ElementRef,
  EventEmitter,
  Inject,
  Input,
  isDevMode,
  NgZone,
  OnChanges,
  OnDestroy,
  Optional,
  Output,
  QueryList,
  SimpleChanges,
  SkipSelf,
  ViewContainerRef
} from "@angular/core";
import {merge, Observable, Observer, Subject} from "rxjs";
import {Point, ResizeRef, ResizeRefConfig} from "../drag-ref";
import {coerceBooleanProperty, coerceElement, coerceNumberProperty} from "@angular/cdk/coercion";
import {map, startWith, switchMap, take, takeUntil, tap} from "rxjs/operators";
import {CDK_DROP_CONTAINER, CdkDropContainer} from "./drop-container";
import {DOCUMENT} from "@angular/common";
import {Directionality} from "@angular/cdk/bidi";
import {DragDrop} from "../drag-drop";
import {CDK_DRAG_CONFIG} from "./drag";
import {CdkResizeHandle} from "./resize-handle";
import {CdkResizePreview} from "./resize-preview";
import {CdkResizePlaceholder} from "./resize-placeholder";
import {CdkResizeChange, CdkResizeEnd, CdkResizeRelease, CdkResizeResized, CdkResizeStart} from "../resize-events";

/** Element that can be moved inside a CdkDropList container. */
@Directive({
  selector: '[cdkSesize]',
  exportAs: 'cdkSesize',
  host: {
    'class': 'cdk-resize',
    '[class.cdk-resize-disabled]': 'disabled',
    '[class.cdk-resize-resizing]': '_resizeRef.isResizing()',
  },
})
export class CdkResize<T = any> implements AfterViewInit, OnChanges, OnDestroy {
  private _destroyed = new Subject<void>();

  /** Reference to the underlying resize instance. */
  _resizeRef: ResizeRef<CdkResize<T>>;

  /** Elements that can be used to resize the resizable item. */
  @ContentChildren(CdkResizeHandle, {descendants: true}) _handles: QueryList<CdkResizeHandle>;

  /** Element that will be used as a template to create the resizable item's preview. */
  @ContentChild(CdkResizePreview, {static: false}) _previewTemplate: CdkResizePreview;

  /** Template for placeholder element rendered to show where a resizable would be dropped. */
  @ContentChild(CdkResizePlaceholder, {static: false}) _placeholderTemplate: CdkResizePlaceholder;

  /** Locks the position of the resized element along the specified axis. */
  @Input('cdkResizeLockAxis') lockAxis: 'left' | 'right' | 'top' | 'bottom';

  /**
   * Selector that will be used to determine the root resizable element, starting from
   * the `cdkResize` element and going up the DOM. Passing an alternate root element is useful
   * when trying to enable resizing on an element that you might not have access to.
   */
  @Input('cdkResizeRootElement') rootElementSelector: string;

  /**
   * Node or selector that will be used to determine the element to which the resizable's
   * position will be constrained. If a string is passed in, it'll be used as a selector that
   * will be matched starting from the element's parent and going up the DOM until a match
   * has been found.
   */
  @Input('cdkResizeBoundary') boundaryElement: string | ElementRef<HTMLElement> | HTMLElement;

  /**
   * Amount of milliseconds to wait after the user has put their
   * pointer down before starting to resize the element.
   */
  @Input('cdkResizeStartDelay') resizeStartDelay: number = 0;

  /**
   * Sets the position of a `CdkResize` that is outside of a drop container.
   * Can be used to restore the element's position for a returning user.
   */
  @Input('cdkResizeFreeResizePosition') freeResizePosition: { x: number, y: number };

  /** Whether starting to resize this element is disabled. */
  @Input('cdkResizeDisabled')
  get disabled(): boolean {
    return this._disabled || (this.dropContainer && this.dropContainer.disabled);
  }

  set disabled(value: boolean) {
    this._disabled = coerceBooleanProperty(value);
    this._resizeRef.disabled = this._disabled;
  }

  private _disabled = false;

  /**
   * Function that can be used to customize the logic of how the position of the resize item
   * is limited while it's being resized. Gets called with a point containing the current position
   * of the user's pointer on the page and should return a point describing where the item should
   * be rendered.
   */
  @Input('cdkResizeConstrainPosition') constrainPosition?: (point: Point, resizeRef: ResizeRef) => Point;

  /** Emits when the user starts resizing the item. */
  @Output('cdkResizeStarted') started: EventEmitter<CdkResizeStart> = new EventEmitter<CdkResizeStart>();

  /** Emits when the user has released a resize item, before any animations have started. */
  @Output('cdkResizeReleased') released: EventEmitter<CdkResizeRelease> = new EventEmitter<CdkResizeRelease>();

  /** Emits when the user stops resizing an item in the container. */
  @Output('cdkResizeEnded') ended: EventEmitter<CdkResizeEnd> = new EventEmitter<CdkResizeEnd>();

  /** Emits when the user drops the item inside a container. */
  @Output('cdkResizeResized') resized: EventEmitter<CdkResizeResized<any>> = new EventEmitter<CdkResizeResized<any>>();

  /**
   * Emits as the user is resizing the item. Use with caution,
   * because this event will fire for every pixel that the user has resized.
   */
  @Output('cdkResizeChanged') moved: Observable<CdkResizeChange<T>> = new Observable((observer: Observer<CdkResizeChange<T>>) => {
    const subscription = this._resizeRef.moved.pipe(map(movedEvent => ({
      source: this,
      pointerPosition: movedEvent.pointerPosition,
      event: movedEvent.event,
      delta: movedEvent.delta,
      distance: movedEvent.distance
    }))).subscribe(observer);

    return () => {
      subscription.unsubscribe();
    };
  });

  constructor(
    /** Element that the resizable is attached to. */
    public element: ElementRef<HTMLElement>,
    /** Droppable container that the resizable is a part of. */
    @Inject(CDK_DROP_CONTAINER) @Optional() @SkipSelf() public dropContainer: CdkDropContainer,
    @Inject(DOCUMENT) private _document: any, private _ngZone: NgZone,
    private _viewContainerRef: ViewContainerRef, @Inject(CDK_DRAG_CONFIG) config: ResizeRefConfig,
    @Optional() private _dir: Directionality, dragDrop: DragDrop,
    private _changeDetectorRef: ChangeDetectorRef) {
    this._resizeRef = dragDrop.createDrag(element, config);
    this._resizeRef.data = this;
    this._syncInputs(this._resizeRef);
    this._handleEvents(this._resizeRef);
  }

  /**
   * Returns the element that is being used as a placeholder
   * while the current element is being resized.
   */
  getPlaceholderElement(): HTMLElement {
    return this._resizeRef.getPlaceholderElement();
  }

  /** Returns the root resizable element. */
  getRootElement(): HTMLElement {
    return this._resizeRef.getRootElement();
  }

  /** Resets a standalone resize item to its initial position. */
  reset(): void {
    this._resizeRef.reset();
  }

  /**
   * Gets the pixel coordinates of the resizable outside of a drop container.
   */
  getFreeResizePosition(): { readonly x: number, readonly y: number } {
    return this._resizeRef.getFreeResizePosition();
  }

  ngAfterViewInit() {
    // We need to wait for the zone to stabilize, in order for the reference
    // element to be in the proper place in the DOM. This is mostly relevant
    // for resizable elements inside portals since they get stamped out in
    // their original DOM position and then they get transferred to the portal.
    this._ngZone.onStable.asObservable()
      .pipe(take(1), takeUntil(this._destroyed))
      .subscribe(() => {
        this._updateRootElement();

        // Listen for any newly-added handles.
        this._handles.changes.pipe(
          startWith(this._handles),
          // Sync the new handles with the ResizeRef.
          tap((handles: QueryList<CdkResizeHandle>) => {
            const childHandleElements = handles
              .filter(handle => handle._parentResize === this)
              .map(handle => handle.element);
            this._resizeRef.withHandles(childHandleElements);
          }),
          // Listen if the state of any of the handles changes.
          switchMap((handles: QueryList<CdkResizeHandle>) => {
            return merge(...handles.map(item => item._stateChanges));
          }),
          takeUntil(this._destroyed)
        ).subscribe(resizeInstance => {
          // Enabled/disable the handle that changed in the ResizeRef.
          const resizeRef = this._resizeRef;
          const handle = resizeInstance.element.nativeElement;
          resizeInstance.disabled ? resizeRef.disableHandle(handle) : resizeRef.enableHandle(handle);
        });

        if (this.freeResizePosition) {
          this._resizeRef.setFreeResizePosition(this.freeResizePosition);
        }
      });
  }

  ngOnChanges(changes: SimpleChanges) {
    const rootSelectorChange = changes['rootElementSelector'];
    const positionChange = changes['freeResizePosition'];

    // We don't have to react to the first change since it's being
    // handled in `ngAfterViewInit` where it needs to be deferred.
    if (rootSelectorChange && !rootSelectorChange.firstChange) {
      this._updateRootElement();
    }

    // Skip the first change since it's being handled in `ngAfterViewInit`.
    if (positionChange && !positionChange.firstChange && this.freeResizePosition) {
      this._resizeRef.setFreeResizePosition(this.freeResizePosition);
    }
  }

  ngOnDestroy() {
    this._destroyed.next();
    this._destroyed.complete();
    this._resizeRef.dispose();
  }

  /** Syncs the root element with the `ResizeRef`. */
  private _updateRootElement() {
    const element = this.element.nativeElement;
    const rootElement = this.rootElementSelector ?
      getClosestMatchingAncestor(element, this.rootElementSelector) : element;

    if (rootElement && rootElement.nodeType !== this._document.ELEMENT_NODE) {
      throw Error(`cdkDrag must be attached to an element node. ` +
        `Currently attached to "${rootElement.nodeName}".`);
    }

    this._resizeRef.withRootElement(rootElement || element);
  }

  /** Gets the boundary element, based on the `boundaryElement` value. */
  private _getBoundaryElement() {
    const boundary = this.boundaryElement;

    if (!boundary) {
      return null;
    }

    if (typeof boundary === 'string') {
      return getClosestMatchingAncestor(this.element.nativeElement, boundary);
    }

    const element = coerceElement(boundary);

    if (isDevMode() && !element.contains(this.element.nativeElement)) {
      throw Error('Resizable element is not inside of the node passed into cdkResizeBoundary.');
    }

    return element;
  }

  /** Syncs the inputs of the CdkResize with the options of the underlying ResizeRef. */
  private _syncInputs(ref: ResizeRef<CdkResize<T>>) {
    ref.beforeStarted.subscribe(() => {
      if (!ref.isDragging()) {
        const dir = this._dir;
        const placeholder = this._placeholderTemplate ? {
          template: this._placeholderTemplate.templateRef,
          context: this._placeholderTemplate.data,
          viewContainer: this._viewContainerRef
        } : null;
        const preview = this._previewTemplate ? {
          template: this._previewTemplate.templateRef,
          context: this._previewTemplate.data,
          viewContainer: this._viewContainerRef
        } : null;

        ref.disabled = this.disabled;
        ref.lockAxis = this.lockAxis;
        ref.resizeStartDelay = coerceNumberProperty(this.resizeStartDelay);
        ref.constrainPosition = this.constrainPosition;
        ref
          .withBoundaryElement(this._getBoundaryElement())
          .withPlaceholderTemplate(placeholder)
          .withPreviewTemplate(preview);

        if (dir) {
          ref.withDirection(dir.value);
        }
      }
    });
  }

  /** Handles the events from the underlying `ResizeRef`. */
  private _handleEvents(ref: ResizeRef<CdkResize<T>>) {
    ref.started.subscribe(() => {
      this.started.emit({source: this});

      // Since all of these events run outside of change detection,
      // we need to ensure that everything is marked correctly.
      this._changeDetectorRef.markForCheck();
    });

    ref.released.subscribe(() => {
      this.released.emit({source: this});
    });

    ref.ended.subscribe(event => {
      this.ended.emit({source: this, distance: event.distance});

      // Since all of these events run outside of change detection,
      // we need to ensure that everything is marked correctly.
      this._changeDetectorRef.markForCheck();
    });

    ref.dropped.subscribe(event => {
      this.resized.emit({
        container: event.container.data,
        isPointerOverContainer: event.isPointerOverContainer,
        item: this,
        distance: event.distance
      });
    });
  }
}

/** Gets the closest ancestor of an element that matches a selector. */
function getClosestMatchingAncestor(element: HTMLElement, selector: string) {
  let currentElement = element.parentElement as HTMLElement | null;

  while (currentElement) {
    // IE doesn't support `matches` so we have to fall back to `msMatchesSelector`.
    if (currentElement.matches ? currentElement.matches(selector) :
      (currentElement as any).msMatchesSelector(selector)) {
      return currentElement;
    }

    currentElement = currentElement.parentElement;
  }

  return null;
}
