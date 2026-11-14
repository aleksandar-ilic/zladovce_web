import { mergeApplicationConfig } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { loadAppConfig, provideAppConfig } from '@zladovce/api';
import { App } from './app/app';
import { appConfig } from './app/app.config';

// Runtime configuration is loaded before bootstrap, so one build runs in every environment.
// The prerendered HTML stays visible while this happens (and if it fails).
loadAppConfig()
  .then((config) =>
    bootstrapApplication(
      App,
      mergeApplicationConfig(appConfig, { providers: [provideAppConfig(config)] }),
    ),
  )
  .catch((error: unknown) => console.error(error));
