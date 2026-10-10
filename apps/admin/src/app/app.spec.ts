import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';

it('renders the routed page', async () => {
  await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] }).compileComponents();

  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();

  expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).not.toBeNull();
});
