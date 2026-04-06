import { describe, it, expect, vi } from 'vitest';
import { GitHubClient, generateBlogMarkdown } from './github';

describe('GitHubClient', () => {
  describe('generateSlug', () => {
    it('converts title to lowercase slug', () => {
      expect(new GitHubClient('t', 'o/r').generateSlug('Hello World')).toBe('hello-world');
    });

    it('removes special characters', () => {
      expect(new GitHubClient('t', 'o/r').generateSlug('Hello! @World#2024')).toBe('hello-world-2024');
    });

    it('trims leading and trailing dashes', () => {
      expect(new GitHubClient('t', 'o/r').generateSlug('---Hello World---')).toBe('hello-world');
    });

    it('handles empty strings', () => {
      expect(new GitHubClient('t', 'o/r').generateSlug('')).toBe('');
    });
  });

  describe('createFile', () => {
    it('throws for invalid repo format', async () => {
      await expect(new GitHubClient('t', 'invalid').createFile('p.md', 'c', 'm')).rejects.toThrow('Invalid repo');
    });

    it('creates file successfully', async () => {
      const client = new GitHubClient('t', 'owner/repo');
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: null }) })
        .mockResolvedValueOnce({ ok: true });

      expect(await client.createFile('p.md', 'content', 'msg')).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('updates existing file with SHA', async () => {
      const client = new GitHubClient('t', 'owner/repo');
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'existing-sha' }) })
        .mockResolvedValueOnce({ ok: true });

      expect(await client.createFile('p.md', 'new content', 'update')).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('throws on non-404 API errors from getSha', async () => {
      const client = new GitHubClient('t', 'owner/repo');
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });

      await expect(client.createFile('p.md', 'c', 'm')).rejects.toThrow('GitHub API error: 403');
    });
  });
});

describe('generateBlogMarkdown', () => {
  it('generates valid markdown with frontmatter', () => {
    const md = generateBlogMarkdown('Test Title', 'Blog content.');
    expect(md).toContain('---');
    expect(md).toContain('title: "Test Title"');
    expect(md).toContain('# Test Title');
  });

  it('includes social posts section when provided', () => {
    const md = generateBlogMarkdown('Title', 'Content', {
      facebook: 'FB post', twitter: 'Tweet', linkedin: 'LI post',
    });
    expect(md).toContain('## Share This Post');
    expect(md).toContain('**Facebook:** FB post');
    expect(md).toContain('**X/Twitter:** Tweet');
  });

  it('omits social section when not provided', () => {
    expect(generateBlogMarkdown('T', 'C')).not.toContain('Share This Post');
  });

  it('escapes quotes in title', () => {
    const md = generateBlogMarkdown('Title with "quotes"', 'Content');
    expect(md).toContain('title: "Title with "quotes""');
  });
});
