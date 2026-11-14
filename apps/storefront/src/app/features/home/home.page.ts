import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButton } from '@zladovce/ui';

interface ProductGroup {
  name: string;
  note: string;
}

interface OrderingFact {
  title: string;
  text: string;
}

/**
 * Homepage (Phase 2): hero and a short, honest introduction. Phase 4 adds featured
 * categories and products, the family story with photos, blog previews and the newsletter.
 * The copy states only what is confirmed in the specification – no invented claims.
 */
@Component({
  selector: 'sf-home-page',
  imports: [RouterLink, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bg-cream-100" aria-labelledby="hero-naslov">
      <div
        class="mx-auto grid max-w-page items-center gap-12 px-gutter py-section md:grid-cols-[1.15fr_1fr]"
      >
        <div>
          <p class="eyebrow">Porodični posao sa juga Srbije</p>
          <h1 id="hero-naslov" class="mt-4 text-display">
            Domaći ukusi, pripremljeni kao za svoju kuću
          </h1>
          <p class="mt-6 max-w-prose text-lg text-ink-700">
            Zladovce je porodični posao sa juga Srbije. Pravimo domaće džemove, voćne sokove, sirće
            i kompote i šaljemo ih na adrese širom zemlje.
          </p>
          <div class="mt-9 flex flex-wrap gap-3">
            <a uiButton size="lg" routerLink="/" fragment="o-nama">Upoznajte nas</a>
            <a uiButton size="lg" variant="secondary" routerLink="/" fragment="porucivanje"
              >Kako se poručuje</a
            >
          </div>
        </div>

        <div class="rounded-xl border border-sage-200 bg-sage-50 p-8 md:p-10">
          <h2 class="text-2xl">Šta pravimo</h2>
          <ul class="mt-6 divide-y divide-sage-200">
            @for (group of productGroups; track group.name) {
              <li
                class="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              >
                <span class="font-serif text-xl font-semibold text-olive-800">{{
                  group.name
                }}</span>
                <span class="text-sm text-ink-700 sm:text-right">{{ group.note }}</span>
              </li>
            }
          </ul>
        </div>
      </div>
    </section>

    <section id="o-nama" class="scroll-mt-24" aria-labelledby="o-nama-naslov">
      <div class="mx-auto max-w-page px-gutter py-section">
        <div class="max-w-prose">
          <p class="eyebrow">O nama</p>
          <h2 id="o-nama-naslov" class="mt-3 text-3xl md:text-4xl">Porodica iza svake tegle</h2>
          <p class="mt-6 text-lg text-ink-700">
            Iza imena Zladovce stoji jedna porodica i njena kuhinja. Proizvode pripremamo sami,
            onako kako ih pravimo i za svoju trpezu.
          </p>
          <p class="mt-4 text-ink-700">
            Na ovom mestu uskoro ćete moći da pregledate celu ponudu, pročitate više o nama i
            poručite ono što vam se dopadne.
          </p>
        </div>
      </div>
    </section>

    <section
      id="porucivanje"
      class="scroll-mt-24 border-t border-cream-200 bg-cream-100"
      aria-labelledby="porucivanje-naslov"
    >
      <div class="mx-auto max-w-page px-gutter py-section">
        <p class="eyebrow">Poručivanje</p>
        <h2 id="porucivanje-naslov" class="mt-3 text-3xl md:text-4xl">
          Jednostavno, bez naloga i kartice
        </h2>
        <ol class="mt-10 grid gap-6 md:grid-cols-3">
          @for (fact of orderingFacts; track fact.title; let i = $index) {
            <li class="rounded-lg border border-cream-200 bg-white p-6 shadow-soft">
              <span class="font-serif text-3xl font-semibold text-olive-500" aria-hidden="true">{{
                i + 1
              }}</span>
              <h3 class="mt-3 text-xl">{{ fact.title }}</h3>
              <p class="mt-2 text-ink-700">{{ fact.text }}</p>
            </li>
          }
        </ol>
        <p class="mt-8 text-sm text-ink-500">Online prodavnica je u pripremi.</p>
      </div>
    </section>
  `,
})
export class HomePage {
  protected readonly productGroups: readonly ProductGroup[] = [
    { name: 'Džemovi', note: 'Za doručak, palačinke i kolače' },
    { name: 'Voćni sokovi', note: 'Za svaki dan i za goste' },
    { name: 'Sirće', note: 'Za salate i zimnicu' },
    { name: 'Kompoti', note: 'Voće iz tegle, tokom cele godine' },
  ];

  protected readonly orderingFacts: readonly OrderingFact[] = [
    {
      title: 'Dostava širom Srbije',
      text: 'Paket šaljemo kurirskom službom na adresu koju navedete.',
    },
    { title: 'Plaćanje pouzećem', text: 'Porudžbinu plaćate kuriru kada paket stigne.' },
    { title: 'Bez registracije', text: 'Za poručivanje nije potreban korisnički nalog.' },
  ];
}
