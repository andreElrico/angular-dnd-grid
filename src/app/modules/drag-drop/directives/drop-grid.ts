/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {coerceArray, coerceBooleanProperty} from '@angular/cdk/coercion';
import {
  AfterContentInit,
  ChangeDetectorRef,
  ContentChildren,
  Directive,
  ElementRef,
  EventEmitter,
  forwardRef,
  Input,
  OnDestroy,
  Optional,
  Output,
  QueryList,
  SkipSelf,
} from '@angular/core';
import {Directionality} from '@angular/cdk/bidi';
import {CdkDrag} from './drag';
import {CdkDragDrop, CdkDragEnter, CdkDragExit, CdkDragSortEvent} from '../drag-events';
import {CdkDropContainerGroup} from './drop-list-group';
import {DragRef} from '../drag-ref';
import {DragDrop} from '../drag-drop';
import {Subject} from 'rxjs';
import {startWith, takeUntil} from 'rxjs/operators';
import {CDK_DROP_CONTAINER, CdkDropContainer} from "@modules/drag-drop/directives/drop-container";
import {DropGridRef} from "@modules/drag-drop/containers/drop-grid-ref";

/** Counter used to generate unique ids for drop zones. */
let _uniqueIdCounter = 0;


/** Container that wraps a set of draggable items. */
@Directive({
  selector: '[cdkDropGrid], cdk-drop-grid',
  exportAs: 'cdkDropGrid',
  providers: [
    // Prevent child drop lists from picking up the same group as their parent.
    {provide: CdkDropContainerGroup, useValue: undefined},
    {provide: CDK_DROP_CONTAINER, useExisting: CdkDropGrid},
  ],
  host: {
    'class': 'cdk-drop-grid',
    '[id]': 'id',
    '[class.cdk-drop-grid-disabled]': 'disabled',
    '[class.cdk-drop-grid-dragging]': '_dropContainerRef.isDragging()',
    '[class.cdk-drop-grid-receiving]': '_dropContainerRef.isReceiving()',
  }
})
export class CdkDropGrid<T = any> implements CdkDropContainer, AfterContentInit, OnDestroy {
  /** Emits when the list has been destroyed. */
  private _destroyed = new Subject<void>();

  /** Keeps track of the drop lists that are currently on the page. */
  private static _dropLists: CdkDropGrid[] = [];

  /** Reference to the underlying drop list instance. */
  _dropContainerRef: DropGridRef<CdkDropGrid<T>>;

  /** Draggable items in the container. */
  @ContentChildren(forwardRef(() => CdkDrag), {
    // Explicitly set to false since some of the logic below makes assumptions about it.
    // The `.withItems` call below should be updated if we ever need to switch this to `true`.
    descendants: false
  }) _draggables: QueryList<CdkDrag>;

  /**
   * Other draggable containers that this container is connected to and into which the
   * container's items can be transferred. Can either be references to other drop containers,
   * or their unique IDs.
   */
  @Input('cdkDropGridConnectedTo')
  connectedTo: (CdkDropContainer | string)[] | CdkDropContainer | string = [];

  /** Arbitrary data to attach to this container. */
  @Input('cdkDropGridData') data: T;

  /** Direction in which the list is oriented. */
  @Input('cdkDropGridOrientation') orientation: 'horizontal' | 'vertical' = 'vertical';

  /**
   * Unique ID for the drop zone. Can be used as a reference
   * in the `connectedTo` of another `CdkDropGrid`.
   */
  @Input() id: string = `cdk-drop-grid-${_uniqueIdCounter++}`;

  /** Locks the position of the draggable elements inside the container along the specified axis. */
  @Input('cdkDropGridLockAxis') lockAxis: 'x' | 'y';

  /** Whether starting a dragging sequence from this container is disabled. */
  @Input('cdkDropGridDisabled')
  get disabled(): boolean {
    return this._disabled || (!!this._group && this._group.disabled);
  }

  set disabled(value: boolean) {
    this._disabled = coerceBooleanProperty(value);
  }

  private _disabled = false;

  /** Whether sorting within this drop list is disabled. */
  @Input('cdkDropGridSortingDisabled')
  get sortingDisabled(): boolean {
    return this._sortingDisabled;
  }

  set sortingDisabled(value: boolean) {
    this._sortingDisabled = coerceBooleanProperty(value);
  }

  private _sortingDisabled = false;

  /**
   * Function that is used to determine whether an item
   * is allowed to be moved into a drop container.
   */
  @Input('cdkDropGridEnterPredicate')
  enterPredicate: (drag: CdkDrag, drop: CdkDropGrid) => boolean = () => true;

  /** Whether to auto-scroll the view when the user moves their pointer close to the edges. */
  @Input('cdkDropGridAutoScrollDisabled')
  autoScrollDisabled: boolean = false;

  /** Emits when the user drops an item inside the container. */
  @Output('cdkDropGridDropped')
  dropped: EventEmitter<CdkDragDrop<T, any>> = new EventEmitter<CdkDragDrop<T, any>>();

  /**
   * Emits when the user has moved a new drag item into this container.
   */
  @Output('cdkDropGridEntered')
  entered: EventEmitter<CdkDragEnter<T>> = new EventEmitter<CdkDragEnter<T>>();

  /**
   * Emits when the user removes an item from the container
   * by dragging it into another container.
   */
  @Output('cdkDropGridExited')
  exited: EventEmitter<CdkDragExit<T>> = new EventEmitter<CdkDragExit<T>>();

  /** Emits as the user is swapping items while actively dragging. */
  @Output('cdkDropGridSorted')
  sorted: EventEmitter<CdkDragSortEvent<T>> = new EventEmitter<CdkDragSortEvent<T>>();

  constructor(
    /** Element that the drop list is attached to. */
    public element: ElementRef<HTMLElement>, dragDrop: DragDrop,
    private _changeDetectorRef: ChangeDetectorRef, @Optional() private _dir?: Directionality,
    @Optional() @SkipSelf() private _group?: CdkDropContainerGroup) {
    this._dropContainerRef = dragDrop.createDropGrid(element);
    this._dropContainerRef.data = this;
    this._dropContainerRef.enterPredicate = (drag: DragRef<CdkDrag>, drop: DropGridRef<CdkDropGrid>) => {
      return this.enterPredicate(drag.data, drop.data);
    };

    this._syncInputs(this._dropContainerRef);
    this._handleEvents(this._dropContainerRef);
    CdkDropGrid._dropLists.push(this);

    if (_group) {
      _group._items.add(this);
    }
  }

  ngAfterContentInit() {
    this._draggables.changes
      .pipe(startWith(this._draggables), takeUntil(this._destroyed))
      .subscribe((items: QueryList<CdkDrag>) => {
        this._dropContainerRef.withItems(items.map(drag => drag._dragRef));
      });
  }

  ngOnDestroy() {
    const index = CdkDropGrid._dropLists.indexOf(this);

    if (index > -1) {
      CdkDropGrid._dropLists.splice(index, 1);
    }

    if (this._group) {
      this._group._items.delete(this);
    }

    this._dropContainerRef.dispose();
    this._destroyed.next();
    this._destroyed.complete();
  }

  /** Syncs the inputs of the CdkDropGrid with the options of the underlying DropGridRef. */
  private _syncInputs(ref: DropGridRef<CdkDropGrid>) {
    if (this._dir) {
      this._dir.change
        .pipe(startWith(this._dir.value), takeUntil(this._destroyed))
        .subscribe(value => ref.withDirection(value));
    }

    ref.beforeStarted.subscribe(() => {
      const siblings = coerceArray(this.connectedTo).map(drop => {
        return typeof drop === 'string' ?
          CdkDropGrid._dropLists.find(list => list.id === drop)! : drop;
      });

      if (this._group) {
        this._group._items.forEach(drop => {
          if (siblings.indexOf(drop) === -1) {
            siblings.push(drop);
          }
        });
      }

      ref.disabled = this.disabled;
      ref.lockAxis = this.lockAxis;
      ref.sortingDisabled = this.sortingDisabled;
      ref.autoScrollDisabled = this.autoScrollDisabled;
      ref.connectedTo(siblings.filter(drop => drop && drop !== this).map(list => list._dropContainerRef));
    });
  }

  /** Handles events from the underlying DropGridRef. */
  private _handleEvents(ref: DropGridRef<CdkDropGrid>) {
    ref.beforeStarted.subscribe(() => {
      this._changeDetectorRef.markForCheck();
    });

    ref.entered.subscribe(event => {
      this.entered.emit({
        container: this,
        item: event.item.data,
        currentIndex: event.currentIndex
      });
    });

    ref.exited.subscribe(event => {
      this.exited.emit({
        container: this,
        item: event.item.data
      });
      this._changeDetectorRef.markForCheck();
    });

    ref.sorted.subscribe(event => {
      this.sorted.emit({
        previousIndex: event.previousIndex,
        currentIndex: event.currentIndex,
        container: this,
        item: event.item.data
      });
    });

    ref.dropped.subscribe(event => {
      this.dropped.emit({
        previousIndex: event.previousIndex,
        currentIndex: event.currentIndex,
        previousContainer: event.previousContainer.data,
        container: event.container.data,
        item: event.item.data,
        isPointerOverContainer: event.isPointerOverContainer,
        distance: event.distance
      });

      // Mark for check since all of these events run outside of change
      // detection and we're not guaranteed for something else to have triggered it.
      this._changeDetectorRef.markForCheck();
    });
  }

}
