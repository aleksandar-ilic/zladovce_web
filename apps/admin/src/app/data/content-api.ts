import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import {
  AdminAboutPage,
  AdminFaqItem,
  AdminFaqList,
  AdminHomePage,
  AdminRichTextPage,
  AdminTestimonial,
  AdminTestimonialList,
  CmsPageKey,
  CmsPageList,
  SaveAboutPageRequest,
  SaveFaqItemRequest,
  SaveHomePageRequest,
  SaveRichTextPageRequest,
  SaveTestimonialRequest,
} from '@zladovce/models';
import { Observable } from 'rxjs';

export type AdminCmsPage = AdminHomePage | AdminAboutPage | AdminRichTextPage;
export type SaveCmsPageRequest =
  SaveHomePageRequest | SaveAboutPageRequest | SaveRichTextPageRequest;

/** CMS pages, FAQ and testimonials (every administrator). */
@Injectable({ providedIn: 'root' })
export class ContentApi {
  private readonly api = inject(ApiClient);

  pages(): Observable<CmsPageList> {
    return this.api.get<CmsPageList>('/admin/cms/pages');
  }

  page(key: 'home'): Observable<AdminHomePage>;
  page(key: 'about'): Observable<AdminAboutPage>;
  page(key: CmsPageKey): Observable<AdminCmsPage>;
  page(key: CmsPageKey): Observable<AdminCmsPage> {
    return this.api.get<AdminCmsPage>(`/admin/cms/pages/${key}`);
  }

  savePage(key: CmsPageKey, body: SaveCmsPageRequest): Observable<AdminCmsPage> {
    return this.api.put<AdminCmsPage>(`/admin/cms/pages/${key}`, body);
  }

  faq(): Observable<AdminFaqList> {
    return this.api.get<AdminFaqList>('/admin/faq');
  }

  createFaq(body: SaveFaqItemRequest): Observable<AdminFaqItem> {
    return this.api.post<AdminFaqItem>('/admin/faq', body);
  }

  updateFaq(id: string, body: SaveFaqItemRequest): Observable<AdminFaqItem> {
    return this.api.put<AdminFaqItem>(`/admin/faq/${id}`, body);
  }

  deleteFaq(id: string): Observable<void> {
    return this.api.delete(`/admin/faq/${id}`);
  }

  /** Every item exactly once, in the new order. */
  reorderFaq(ids: readonly string[]): Observable<AdminFaqList> {
    return this.api.put<AdminFaqList>('/admin/faq/order', { ids });
  }

  testimonials(): Observable<AdminTestimonialList> {
    return this.api.get<AdminTestimonialList>('/admin/testimonials');
  }

  createTestimonial(body: SaveTestimonialRequest): Observable<AdminTestimonial> {
    return this.api.post<AdminTestimonial>('/admin/testimonials', body);
  }

  updateTestimonial(id: string, body: SaveTestimonialRequest): Observable<AdminTestimonial> {
    return this.api.put<AdminTestimonial>(`/admin/testimonials/${id}`, body);
  }

  deleteTestimonial(id: string): Observable<void> {
    return this.api.delete(`/admin/testimonials/${id}`);
  }
}
