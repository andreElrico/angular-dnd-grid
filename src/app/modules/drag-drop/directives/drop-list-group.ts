/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Directive, Input, OnDestroy} from '@angular/core';
import {coerceBooleanProperty} from '@angular/cdk/coercion';
import {CdkDropContainer} from "./drop-container";

/**
 * Declaratively connects sibling `cdkDropContainer` instances together. All of the `cdkDropContainer`
 * elements that are placed inside a `cdkDropContainerGroup` will be connected to each other
 * automatically. Can be used as an alternative to the `cdkDropContainerConnectedTo` input
 * from `cdkDropContainer`.
 */
@Directive({
  selector: '[cdkDropContainerGroup]',
  exportAs: 'cdkDropContainerGroup',
})
export class CdkDropContainerGroup implements OnDestroy {
  /** Drop lists registered inside the group. */
  readonly _items = new Set<CdkDropContainer>();

  /** Whether starting a dragging sequence from inside this group is disabled. */
  @Input('cdkDropContainerGroupDisabled')
  get disabled(): boolean { return this._disabled; }
  set disabled(value: boolean) {
    this._disabled = coerceBooleanProperty(value);
  }
  private _disabled = false;

  ngOnDestroy() {
    this._items.clear();
  }
}
