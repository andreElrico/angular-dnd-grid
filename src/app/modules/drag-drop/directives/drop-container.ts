import {ElementRef, InjectionToken, QueryList} from "@angular/core";
import {CdkDrag} from "@modules/drag-drop/directives/drag";
import {DropContainerRef} from "@modules/drag-drop/containers/drop-container-ref";

export interface CdkDropContainer<T = any> {
  /** DOM node that corresponds to the drop container. */
  element: ElementRef<HTMLElement>;

  /** Reference to the underlying drop list instance. */
  _dropContainerRef: DropContainerRef<any>;

  /** Arbitrary data to attach to all events emitted by this container. */
  data: T;

  /** Unique ID for the drop zone. */
  id: string;

  /** Whether starting a dragging sequence from this container is disabled. */
  disabled: boolean;

  _draggables: QueryList<CdkDrag>;
}

/**
 * Injection token that is used to provide a CdkDropList instance to CdkDrag.
 * Used for avoiding circular imports.
 */
export const CDK_DROP_CONTAINER = new InjectionToken<CdkDropContainer>('CDK_DROP_CONTAINER');
