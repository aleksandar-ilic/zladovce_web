import { inject, Injectable } from '@angular/core';
import { ApiClient } from '@zladovce/api';
import {
  AdminBlogCategory,
  AdminBlogCategoryList,
  AdminBlogPost,
  AdminBlogPostListItem,
  BlogPostState,
  ContentImage,
  Paged,
  SaveBlogCategoryRequest,
  SaveBlogPostRequest,
} from '@zladovce/models';
import { Observable } from 'rxjs';

export interface BlogPostListQuery {
  q?: string;
  status?: BlogPostState;
  categoryId?: string;
  page: number;
  pageSize: number;
}

/** `/admin/blog/*` (every administrator). */
@Injectable({ providedIn: 'root' })
export class BlogApi {
  private readonly api = inject(ApiClient);

  categories(): Observable<AdminBlogCategoryList> {
    return this.api.get<AdminBlogCategoryList>('/admin/blog/categories');
  }

  createCategory(body: SaveBlogCategoryRequest): Observable<AdminBlogCategory> {
    return this.api.post<AdminBlogCategory>('/admin/blog/categories', body);
  }

  updateCategory(id: string, body: SaveBlogCategoryRequest): Observable<AdminBlogCategory> {
    return this.api.put<AdminBlogCategory>(`/admin/blog/categories/${id}`, body);
  }

  deleteCategory(id: string): Observable<void> {
    return this.api.delete(`/admin/blog/categories/${id}`);
  }

  posts(query: BlogPostListQuery): Observable<Paged<AdminBlogPostListItem>> {
    return this.api.get<Paged<AdminBlogPostListItem>>('/admin/blog/posts', {
      params: {
        q: query.q,
        status: query.status,
        categoryId: query.categoryId,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  }

  post(id: string): Observable<AdminBlogPost> {
    return this.api.get<AdminBlogPost>(`/admin/blog/posts/${id}`);
  }

  create(body: SaveBlogPostRequest): Observable<AdminBlogPost> {
    return this.api.post<AdminBlogPost>('/admin/blog/posts', body);
  }

  update(id: string, body: SaveBlogPostRequest): Observable<AdminBlogPost> {
    return this.api.put<AdminBlogPost>(`/admin/blog/posts/${id}`, body);
  }

  /** `publishedAt` null = now; a future instant schedules the post. */
  publish(id: string, version: number, publishedAt: string | null): Observable<AdminBlogPost> {
    return this.api.post<AdminBlogPost>(`/admin/blog/posts/${id}/publish`, {
      version,
      publishedAt,
    });
  }

  unpublish(id: string, version: number): Observable<AdminBlogPost> {
    return this.api.post<AdminBlogPost>(`/admin/blog/posts/${id}/unpublish`, { version });
  }

  /** Archives the post (soft delete; it disappears from the site). */
  archive(id: string): Observable<void> {
    return this.api.delete(`/admin/blog/posts/${id}`);
  }

  /** Renditions of an image uploaded (purpose `blog`) for use inside the post text. */
  contentImage(uploadKey: string): Observable<ContentImage> {
    return this.api.post<ContentImage>('/admin/blog/images', { uploadKey });
  }
}
