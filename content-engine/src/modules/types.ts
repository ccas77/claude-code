export interface ModuleHandler<Selection = unknown, ContentItem = unknown, PostSpec = unknown> {
  key: string;
  selectContent(ctx: unknown): Promise<Selection>;
  generate(ctx: unknown, selection: Selection): Promise<ContentItem>;
  buildPost(item: ContentItem): Promise<PostSpec>;
}
