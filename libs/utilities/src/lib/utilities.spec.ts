import { formatDate } from '@angular/common';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  formatDate as formatSrDate,
  formatDateTime,
  formatLongDate,
  formatTime,
  SERBIAN_LOCALE,
} from './format-date';
import { formatRsd, formatSerbianNumber } from './format-rsd';
import { provideSerbianLocale } from './locale';
import { RsdPipe, SrDatePipe } from './pipes';
import { slugify } from './slug';

const NBSP = ' ';

describe('formatRsd', () => {
  it('groups thousands with a dot and appends RSD', () => {
    expect(formatRsd(1200)).toBe(`1.200${NBSP}RSD`);
    expect(formatRsd(890)).toBe(`890${NBSP}RSD`);
    expect(formatRsd(1234567)).toBe(`1.234.567${NBSP}RSD`);
    expect(formatRsd(0)).toBe(`0${NBSP}RSD`);
  });

  it('shows decimals only when they are not zero', () => {
    expect(formatRsd(1200.0)).toBe(`1.200${NBSP}RSD`);
    expect(formatRsd(1200.5)).toBe(`1.200,50${NBSP}RSD`);
    expect(formatRsd(649.99)).toBe(`649,99${NBSP}RSD`);
    expect(formatRsd(0.05)).toBe(`0,05${NBSP}RSD`);
  });

  it('rounds to two decimals without floating point artefacts', () => {
    expect(formatRsd(1199.999)).toBe(`1.200${NBSP}RSD`);
    expect(formatRsd(0.1 + 0.2)).toBe(`0,30${NBSP}RSD`);
  });

  it('handles negative amounts and never prints a negative zero', () => {
    expect(formatRsd(-1500)).toBe(`-1.500${NBSP}RSD`);
    expect(formatRsd(-0.001)).toBe(`0${NBSP}RSD`);
  });

  it('returns an empty string for missing or invalid amounts', () => {
    expect(formatRsd(null)).toBe('');
    expect(formatRsd(undefined)).toBe('');
    expect(formatRsd(Number.NaN)).toBe('');
    expect(formatSerbianNumber(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('date formatting (Europe/Belgrade)', () => {
  it('formats winter time (UTC+1)', () => {
    const value = '2026-11-13T21:05:00Z';
    expect(formatSrDate(value)).toBe('13.11.2026.');
    expect(formatTime(value)).toBe('22:05');
    expect(formatDateTime(value)).toBe('13.11.2026. 22:05');
    expect(formatLongDate(value)).toBe('13. novembar 2026.');
  });

  it('formats summer time (UTC+2) and crosses midnight correctly', () => {
    const value = new Date('2026-07-31T22:30:00Z');
    expect(formatDateTime(value)).toBe('01.08.2026. 00:30');
    expect(formatLongDate(value)).toBe('1. avgust 2026.');
  });

  it('accepts timestamps', () => {
    expect(formatSrDate(Date.UTC(2026, 0, 5, 12))).toBe('05.01.2026.');
  });

  it('returns an empty string for missing or invalid input', () => {
    expect(formatSrDate(null)).toBe('');
    expect(formatSrDate(undefined)).toBe('');
    expect(formatSrDate('')).toBe('');
    expect(formatDateTime('nije datum')).toBe('');
    expect(formatTime('nije datum')).toBe('');
    expect(formatLongDate(null)).toBe('');
  });
});

describe('slugify', () => {
  it('transliterates Serbian Latin letters', () => {
    expect(slugify('Džem od šljiva')).toBe('dzem-od-sljiva');
    expect(slugify('Đurđevdanski kompot')).toBe('djurdjevdanski-kompot');
    expect(slugify('Voćni sok – čaša sreće')).toBe('vocni-sok-casa-srece');
    expect(slugify('ČĆŠŽĐ')).toBe('ccszdj');
  });

  it('collapses punctuation and whitespace and trims dashes', () => {
    expect(slugify('  Jabukovo sirće, 0,5 l!  ')).toBe('jabukovo-sirce-0-5-l');
    expect(slugify('--Kompot---od   dunja--')).toBe('kompot-od-dunja');
  });

  it('strips other diacritics', () => {
    expect(slugify('Crème brûlée')).toBe('creme-brulee');
  });

  it('returns an empty string for empty input', () => {
    expect(slugify('')).toBe('');
    expect(slugify(null)).toBe('');
    expect(slugify(undefined)).toBe('');
    expect(slugify('!!!')).toBe('');
  });
});

describe('pipes', () => {
  it('RsdPipe formats prices', () => {
    expect(new RsdPipe().transform(1200)).toBe(`1.200${NBSP}RSD`);
    expect(new RsdPipe().transform(null)).toBe('');
  });

  it('SrDatePipe supports all formats', () => {
    const pipe = new SrDatePipe();
    const value = '2026-11-13T21:05:00Z';
    expect(pipe.transform(value)).toBe('13.11.2026.');
    expect(pipe.transform(value, 'time')).toBe('22:05');
    expect(pipe.transform(value, 'dateTime')).toBe('13.11.2026. 22:05');
    expect(pipe.transform(value, 'long')).toBe('13. novembar 2026.');
  });
});

describe('provideSerbianLocale', () => {
  it('sets LOCALE_ID and registers locale data usable by Angular formatting', () => {
    TestBed.configureTestingModule({ providers: [provideSerbianLocale()] });
    expect(TestBed.inject(LOCALE_ID)).toBe(SERBIAN_LOCALE);
    expect(formatDate(new Date(2026, 10, 13), 'MMMM', SERBIAN_LOCALE)).toBe('novembar');
  });
});
