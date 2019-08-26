import {TestBed} from '@angular/core/testing';

import {ResizeRegistryService} from './resize-registry';

describe('ResizeRegistryService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: ResizeRegistryService = TestBed.get(ResizeRegistryService);
    expect(service).toBeTruthy();
  });
});
