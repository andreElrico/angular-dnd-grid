import {Directive, Input, TemplateRef} from '@angular/core';

/**
 * Element that will be used as a template for the preview
 * of a CdkResize when it is being resized.
 */
@Directive({
  selector: 'ng-template[cdkResizePreview]'
})
export class CdkResizePreview<T = any> {
  /** Context data to be added to the preview template instance. */
  @Input() data: T;

  constructor(public templateRef: TemplateRef<T>) {
  }
}
