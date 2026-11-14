import { mergeApplicationConfig } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { loadAppConfig, provideAppConfig } from '@zladovce/api';
import { App } from './app/app';
import { appConfig } from './app/app.config';

function showStartupError(): void {
  const host = document.querySelector('adm-root') ?? document.body;
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText =
    'max-width:32rem;margin:4rem auto;padding:0 1.25rem;font-family:system-ui,sans-serif;line-height:1.5';
  const title = document.createElement('h1');
  title.style.cssText = 'font-size:1.5rem;margin:0 0 .75rem';
  title.textContent = 'Administracija ne može da se pokrene';
  const text = document.createElement('p');
  text.textContent =
    'Podešavanja aplikacije nisu ispravna ili nisu dostupna. Pokušajte ponovo za nekoliko minuta, a ako se greška ponovi, obratite se osobi koja održava sajt.';
  box.append(title, text);
  host.replaceChildren(box);
}

// Runtime configuration (API address, auth mode) is loaded before bootstrap, so one build
// runs in every environment. The admin app requires the "auth" section.
loadAppConfig({ requireAuth: true })
  .then((config) =>
    bootstrapApplication(
      App,
      mergeApplicationConfig(appConfig, { providers: [provideAppConfig(config)] }),
    ),
  )
  .catch((error: unknown) => {
    console.error(error);
    showStartupError();
  });
