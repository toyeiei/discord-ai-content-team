export class GitHubClient {
  constructor(private token: string, private repo: string) {}

  async createFile(path: string, content: string, message: string): Promise<boolean> {
    const [owner, name] = this.repo.split('/');
    if (!owner || !name) throw new Error(`Invalid repo: ${this.repo} (expected owner/repo)`);

    const url = `https://api.github.com/repos/${owner}/${name}/contents/${path}`;
    const encoded = btoa(unescape(encodeURIComponent(content)));

    const body: Record<string, unknown> = { message, content: encoded };
    const sha = await this.getSha(path);
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: JSON.stringify(body),
    });

    return res.ok;
  }

  private async getSha(path: string): Promise<string | null> {
    const [owner, name] = this.repo.split('/');
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${path}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    return (await res.json() as { sha?: string }).sha || null;
  }

  generateSlug(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}

export function generateBlogMarkdown(
  title: string,
  content: string,
  socialPosts?: { facebook: string; twitter: string; linkedin: string },
): string {
  const date = new Date().toISOString().split('T')[0];
  let md = `---\ntitle: "${title}"\ndate: ${date}\nexcerpt: "${title}"\n---\n\n# ${title}\n\n${content}`;
  if (socialPosts) {
    md += '\n\n---\n\n## Share This Post\n\n';
    md += `**Facebook:** ${socialPosts.facebook}\n\n`;
    md += `**X/Twitter:** ${socialPosts.twitter}\n\n`;
    md += `**LinkedIn:** ${socialPosts.linkedin}\n`;
  }
  return md;
}
