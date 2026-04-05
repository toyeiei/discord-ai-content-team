export class GitHubClient {
  private token: string;
  private repo: string;

  constructor(token: string, repo: string) {
    this.token = token;
    this.repo = repo;
  }

  async createFile(path: string, content: string, message: string): Promise<boolean> {
    const [owner, repo] = this.repo.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repo format: ${this.repo}. Expected 'owner/repo'`);
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const contentEncoded = btoa(unescape(encodeURIComponent(content)));

    const existing = await this.getFileSha(path);
    const body: Record<string, unknown> = {
      message,
      content: contentEncoded,
    };

    if (existing) {
      body.sha = existing;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    });

    return response.ok;
  }

  async getFileSha(path: string): Promise<string | null> {
    const [owner, repo] = this.repo.split('/');

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
return null;
}
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json() as { sha?: string };
    return data.sha || null;
  }

  generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  formatDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}

export function generateBlogMarkdown(
  title: string,
  content: string,
  socialPosts?: { facebook: string; twitter: string; linkedin: string },
): string {
  const date = new Date().toISOString().split('T')[0];
  let md = `---\ntitle: \"${title}\"\ndate: ${date}\nexcerpt: \"${title}\"\n---\n\n`;
  md += `# ${title}\n\n`;
  md += content;

  if (socialPosts) {
    md += '\n\n---\n\n## Share This Post\n\n';
    md += `**Facebook:** ${socialPosts.facebook}\n\n`;
    md += `**X/Twitter:** ${socialPosts.twitter}\n\n`;
    md += `**LinkedIn:** ${socialPosts.linkedin}\n`;
  }

  return md;
}
