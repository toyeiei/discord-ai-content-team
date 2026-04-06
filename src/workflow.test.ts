import { describe, it, expect } from 'vitest';
import { parseSocialPosts } from './workflow';

describe('parseSocialPosts', () => {
  it('parses all three platforms', () => {
    const posts = parseSocialPosts(`**Facebook:**
Check out our latest blog! #tech

**X/Twitter:**
New blog post! #AI

**LinkedIn:**
Sharing our latest insights on industry trends.`);

    expect(posts.facebook).toContain('Check out our latest blog');
    expect(posts.twitter).toContain('New blog post');
    expect(posts.linkedin).toContain('Sharing our latest insights');
  });

  it('returns empty strings for missing platforms', () => {
    const posts = parseSocialPosts('**Facebook:**\nOnly Facebook post');
    expect(posts.facebook).toBe('Only Facebook post');
    expect(posts.twitter).toBe('');
    expect(posts.linkedin).toBe('');
  });

  it('handles empty input', () => {
    expect(parseSocialPosts('')).toEqual({ facebook: '', twitter: '', linkedin: '' });
  });
});
