import {Directive, Input, TemplateRef} from '@angular/core';

/**
 * Element that will be used as a template for the placeholder of a CdkResize when
 * it is being resized. The placeholder is displayed in place of the element being resized.
 */
@Directive({
  selector: 'ng-template[cdkResizePlaceholder]'
})
export class CdkResizePlaceholder<T = any> {
  /** Context data to be added to the placeholder template instance. */
  @Input() data: T;

  constructor(public templateRef: TemplateRef<T>) {
  }
}
