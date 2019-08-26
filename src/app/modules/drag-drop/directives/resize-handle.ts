import {Directive, ElementRef, Inject, Input, OnDestroy, Optional} from "@angular/core";
import {Subject} from "rxjs";
import {coerceBooleanProperty} from "@angular/cdk/coercion";
import {CDK_DRAG_PARENT} from "../drag-parent";
import {toggleNativeResizeInteractions} from "../resize-styling";

/** Handle that can be used to resize and CdkResize instance. */
@Directive({
  selector: '[cdkResizeHandle]',
  host: {
    'class': 'cdk-resize-handle'
  }
})
export class CdkResizeHandle implements OnDestroy {
  /** Closest parent resizable instance. */
  _parentResize: {} | undefined;

  /** Emits when the state of the handle has changed. */
  _stateChanges = new Subject<CdkResizeHandle>();

  /** Whether starting to resize through this handle is disabled. */
  @Input('cdkResizeHandleDisabled')
  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    this._disabled = coerceBooleanProperty(value);
    this._stateChanges.next(this);
  }

  private _disabled = false;

  constructor(
    public element: ElementRef<HTMLElement>,
    @Inject(CDK_DRAG_PARENT) @Optional() parentDrag?: any) {

    this._parentResize = parentDrag;
    toggleNativeResizeInteractions(element.nativeElement, false);
  }

  ngOnDestroy() {
    this._stateChanges.complete();
  }
}
