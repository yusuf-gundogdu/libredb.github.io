import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { engineName, postEngine, postNeighbours, relatedPosts } from '../src/lib/posts';
import { engines } from '../src/data/engines';

/**
 * The blog is grouped by engine — nine PostgreSQL posts, eight MySQL — but that
 * grouping lived only in the filename. "Keep reading" took the two newest posts
 * and showed them to all 104, so a reader on a Postgres page was offered the
 * same two links as a reader on a Redis page and never the other eight Postgres
 * posts. These assert the built pages, not the helper alone: the helper was
 * never the part that broke.
 */

// `engine` holds the per-engine archives, not a post.
const dirs = readdirSync('dist/blog', { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== 'engine')
  .map((e) => e.name);

const html = (slug: string) => readFileSync(`dist/blog/${slug}/index.html`, 'utf8');
const block = (doc: string, re: RegExp) => re.exec(doc)?.[0] ?? '';
const linksIn = (fragment: string) => [...fragment.matchAll(/href="(\/blog\/[^"]+)"/g)].map((m) => m[1]);

describe('postEngine reads the family out of the slug', () => {
  it('matches the longest engine id, not the first', () => {
    // `sqlserver` and `sqlite` both start with `sql`; `libsql` contains it.
    expect(postEngine('sqlserver-no-execution-plan-shown')).toBe('sqlserver');
    expect(postEngine('sqlite-no-transaction-controls')).toBe('sqlite');
    expect(postEngine('libsql-self-hosted-sqld')).toBe('libsql');
    expect(postEngine('postgresql-explain-analyze-executes')).toBe('postgresql');
  });

  it('returns nothing for a post that belongs to no engine', () => {
    expect(postEngine('counting-databases')).toBeUndefined();
    expect(postEngine('what-one-interface-costs')).toBeUndefined();
  });

  it('names every id it can return', () => {
    for (const e of engines) expect(engineName(e.id), `${e.id} has no name`).toBeTruthy();
  });
});

describe('relatedPosts prefers the same engine and still fills the block', () => {
  const mk = (id: string, day: number) => ({ id, data: { publishedAt: new Date(2026, 0, day) } });
  const all = [
    mk('postgresql-a', 1),
    mk('postgresql-b', 2),
    mk('postgresql-c', 3),
    mk('postgresql-d', 4),
    mk('postgresql-e', 5),
    mk('redis-a', 6),
    mk('counting-databases', 7),
  ];

  it('offers only same-engine posts when there are enough', () => {
    const out = relatedPosts(all[0]!, all, 4).map((p) => p.id);
    expect(out).toEqual(['postgresql-e', 'postgresql-d', 'postgresql-c', 'postgresql-b']);
  });

  it('tops up from the rest of the blog when an engine is thin', () => {
    const out = relatedPosts(all[5]!, all, 4);
    expect(out.length).toBe(4);
    expect(out.map((p) => p.id)).not.toContain('redis-a');
  });

  it('never returns the post itself, and still fills a family-less post', () => {
    const out = relatedPosts(all[6]!, all, 4);
    expect(out.map((p) => p.id)).not.toContain('counting-databases');
    expect(out.length).toBe(4);
  });

  it('walks a family oldest to newest', () => {
    const { prev, next } = postNeighbours(all[2]!, all);
    expect(prev?.id).toBe('postgresql-b');
    expect(next?.id).toBe('postgresql-d');
    expect(postNeighbours(all[0]!, all).prev).toBeUndefined();
  });
});

describe('every built post carries the relations', () => {
  it('recommends more than a handful of distinct posts across the blog', () => {
    // The regression this guards: a static "featured" list looks identical on a
    // single page and is only visible in aggregate.
    const recommended = new Set<string>();
    for (const slug of dirs) {
      for (const href of linksIn(block(html(slug), /<aside[^>]*post__more[\s\S]*?<\/aside>/))) {
        recommended.add(href);
      }
    }
    expect(recommended.size, 'the related block is showing the same posts to everyone').toBeGreaterThan(50);
  });

  it('offers same-engine reading where the engine has other posts', () => {
    const families = new Map<string, string[]>();
    for (const slug of dirs) {
      const family = postEngine(slug);
      if (family) families.set(family, [...(families.get(family) ?? []), slug]);
    }

    for (const [family, slugs] of families) {
      if (slugs.length < 5) continue; // a thin family legitimately fills from elsewhere
      for (const slug of slugs) {
        const offered = linksIn(block(html(slug), /<aside[^>]*post__more[\s\S]*?<\/aside>/));
        const sameFamily = offered.filter((h) => postEngine(h.replace(/^\/blog\/|\/$/g, '')) === family);
        expect(sameFamily.length, `${slug} offers nothing else from ${family}`).toBeGreaterThan(0);
      }
    }
  });

  it('gives every post a breadcrumb, both rendered and in schema', () => {
    for (const slug of dirs) {
      const doc = html(slug);
      expect(doc, `${slug}: no rendered breadcrumb`).toContain('post__crumbs');
      expect(doc, `${slug}: no BreadcrumbList`).toContain('"BreadcrumbList"');
    }
  });

  it('gives every post an article image and a sequential link', () => {
    for (const slug of dirs) {
      const doc = html(slug);
      const ld = [...doc.matchAll(/<script[^>]+ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));
      const nodes = ld.flatMap((d) => d['@graph'] ?? [d]);
      const article = nodes.find((n: { '@type': string }) => n['@type'] === 'BlogPosting');
      expect(article?.image, `${slug}: BlogPosting has no image`).toMatch(/^https:\/\//);
      expect(article?.mainEntityOfPage, `${slug}: mainEntityOfPage is not the served URL`).toMatch(/\/$/);
      expect(doc, `${slug}: no prev/next navigation`).toContain('post__seq');
    }
  });
});

describe('the sitemap dates what it knows', () => {
  const sitemap = readFileSync('dist/sitemap-0.xml', 'utf8');

  it('gives every post a lastmod', () => {
    const dated = [...sitemap.matchAll(/<loc>([^<]+)<\/loc><lastmod>/g)].map((m) => new URL(m[1]!).pathname);
    const posts = dated.filter((p) => /^\/blog\/[^/]+\/$/.test(p));
    expect(posts.length).toBe(dirs.length);
    // The archives are dated too — by their newest post.
    expect(dated.filter((p) => p.startsWith('/blog/engine/')).length).toBeGreaterThan(10);
  });

  it('leaves undated pages undated rather than stamping the build time', () => {
    // A lastmod on every URL, refreshed each deploy, is the signal Google learns
    // to ignore. Marketing pages carry no date, so they claim none.
    const entries = [...sitemap.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0]);
    const undated = entries
      .filter((e) => !e.includes('<lastmod>'))
      .map((e) => new URL(/<loc>([^<]+)<\/loc>/.exec(e)![1]!).pathname);
    expect(undated.length).toBeGreaterThan(0);
    // The listing at /blog/ is itself undated: it is an index, not a post.
    for (const path of undated) expect(path, 'a post went undated').not.toMatch(/^\/blog\/[^/]+\/$/);
  });
});

describe('code blocks can be copied', () => {
  it('loads the copier on every post', () => {
    // The button is injected at runtime, so the markup cannot be asserted — what
    // can be is that the module reaches the page and that it shares the
    // clipboard fallback rather than carrying a second copy of it.
    for (const slug of dirs) {
      const doc = readFileSync(`dist/blog/${slug}/index.html`, 'utf8');
      const modules = [...doc.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]!);
      const loaded = modules.some((src) => readFileSync(`dist${src}`, 'utf8').includes('codecopy'));
      expect(loaded, `${slug}: the code copier is not loaded`).toBe(true);
    }
  });

  it('reads the code from the DOM instead of duplicating it into an attribute', () => {
    // A `data-copy` attribute per block would roughly double the weight of a
    // code-heavy page to save a few lines of script.
    const doc = readFileSync('dist/blog/postgresql-connect-docker-container/index.html', 'utf8');
    const body = doc.slice(doc.indexOf('post__body prose'), doc.indexOf('<nav class="toc"'));
    expect(body).toContain('<pre');
    expect(body, 'code was duplicated into an attribute').not.toContain('data-copy=');
  });
});
