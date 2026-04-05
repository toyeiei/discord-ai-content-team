export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function searchWeb(query: string, apiKey: string): Promise<SearchResult[]> {
  if (!apiKey) {
    return [{ title: 'Placeholder', url: 'https://example.com', snippet: `Search results for: ${query}` }];
  }

  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        numResults: 10,
        type: 'auto',
      }),
    });

    if (!response.ok) {
      throw new Error(`Exa API error: ${response.status}`);
    }

    const data = await response.json() as { results?: SearchResult[] };
    return data.results || [];
  } catch (error) {
    console.error('Exa search failed:', error);
    return [];
  }
}

export async function summarizeSearchResults(results: SearchResult[]): Promise<string> {
  if (results.length === 0) {
    return 'No search results found.';
  }

  let summary = '## Research Summary\n\n';

  for (const result of results) {
    summary += `### ${result.title}\n`;
    summary += `${result.snippet}\n`;
    summary += `Source: ${result.url}\n\n`;
  }

  return summary;
}
