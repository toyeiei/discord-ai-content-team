export interface Env {
  CONTENT_WORKFLOW: {
    create(options: { id: string; params: unknown }): Promise<void>;
    get(id: string): {
      sendEvent(event: unknown): Promise<void>;
    };
  };
  CACHE: KVNamespace;
  MINIMAX_API_KEY: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_APP_ID: string;
  DISCORD_PUBLIC_KEY: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  EXA_API_KEY?: string;
  RESEARCH_CHANNEL_ID: string;
  DRAFT_CHANNEL_ID: string;
  EDIT_CHANNEL_ID: string;
  FINAL_CHANNEL_ID: string;
  SOCIAL_CHANNEL_ID: string;
  PUBLISH_CHANNEL_ID: string;
}

export interface WorkflowChannels {
  research: string;
  draft: string;
  edit: string;
  final: string;
  social: string;
  publish: string;
}
