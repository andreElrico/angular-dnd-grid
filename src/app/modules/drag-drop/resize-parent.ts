import {InjectionToken} from '@angular/core';

/**
 * Injection token that can be used for a `CdkResize` to provide itself as a parent to the
 * resize-specific child directive (`CdkResizeHandle`, `CdkResizePreview` etc.). Used primarily
 * to avoid circular imports.
 * @docs-private
 */
export const CDK_RESIZE_PARENT = new InjectionToken<{}>('CDK_RESIZE_PARENT');
