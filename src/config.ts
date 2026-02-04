// Server configuration - separated to avoid circular imports

export interface ServerConfig {
  primaryModel: string;
  fallbackModel?: string;
}

let serverConfig: ServerConfig | null = null;

export function setServerConfig(config: ServerConfig): void {
  serverConfig = config;
}

export function getServerConfig(): ServerConfig {
  if (!serverConfig) {
    // Return default config for testing scenarios
    return {
      primaryModel: 'test-model',
      fallbackModel: undefined,
    };
  }
  return serverConfig;
}
