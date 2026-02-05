import { select, input } from '@inquirer/prompts';
import { getAvailableModels, isOpenCodeInstalled } from '../config/autoDetect.js';
import { saveConfig, McpConfig } from '../config/loader.js';
import { getConfigPath } from '../config/paths.js';

/**
 * Run the interactive setup wizard.
 */
export async function runSetupWizard(): Promise<McpConfig> {
  console.log('\n🔧 OpenCode MCP Setup\n');

  // Check if OpenCode is installed
  const installed = await isOpenCodeInstalled();
  if (!installed) {
    console.log('❌ OpenCode CLI not found. Please install it first:');
    console.log('   npm install -g opencode\n');
    process.exit(1);
  }

  console.log('Fetching available models from OpenCode...\n');

  // Get available models
  let models = await getAvailableModels();
  let manualEntry = false;

  if (models.length === 0) {
    console.log('⚠️  Could not fetch models from OpenCode.\n');
    manualEntry = true;
  }

  // Select primary model
  let primaryModel: string;

  if (manualEntry) {
    primaryModel = await input({
      message: 'Enter your primary model (format: provider/model):',
      validate: (value) => {
        if (!value.includes('/')) {
          return 'Model must be in format: provider/model (e.g., google/gemini-2.5-pro)';
        }
        return true;
      },
    });
  } else {
    // Group models by provider for better UX
    const modelChoices = models.slice(0, 20).map(model => ({
      name: model,
      value: model,
    }));

    // Add option to show more or enter manually
    if (models.length > 20) {
      modelChoices.push({
        name: `... show all ${models.length} models`,
        value: '__show_all__',
      });
    }
    modelChoices.push({
      name: 'Enter manually',
      value: '__manual__',
    });

    let selection = await select({
      message: 'Select your primary model:',
      choices: modelChoices,
    });

    if (selection === '__show_all__') {
      const allChoices = models.map(model => ({
        name: model,
        value: model,
      }));
      allChoices.push({
        name: 'Enter manually',
        value: '__manual__',
      });

      selection = await select({
        message: 'Select your primary model:',
        choices: allChoices,
      });
    }

    if (selection === '__manual__') {
      primaryModel = await input({
        message: 'Enter your primary model (format: provider/model):',
        validate: (value) => {
          if (!value.includes('/')) {
            return 'Model must be in format: provider/model';
          }
          return true;
        },
      });
    } else {
      primaryModel = selection;
    }
  }

  // Select fallback model (optional)
  let fallbackModel: string | undefined;

  const fallbackChoices = [
    { name: '(none)', value: '__none__' },
    ...(manualEntry ? [] : models.slice(0, 10).map(m => ({ name: m, value: m }))),
    { name: 'Enter manually', value: '__manual__' },
  ];

  const fallbackSelection = await select({
    message: 'Select a fallback model (optional):',
    choices: fallbackChoices,
  });

  if (fallbackSelection === '__manual__') {
    fallbackModel = await input({
      message: 'Enter fallback model (format: provider/model):',
      validate: (value) => {
        if (value && !value.includes('/')) {
          return 'Model must be in format: provider/model';
        }
        return true;
      },
    });
  } else if (fallbackSelection !== '__none__') {
    fallbackModel = fallbackSelection;
  }

  // Select default agent
  const defaultAgent = await select({
    message: 'Default agent mode:',
    choices: [
      { name: 'build (immediate execution)', value: 'build' as const },
      { name: 'plan (structured analysis)', value: 'plan' as const },
      { name: 'explore (investigation)', value: 'explore' as const },
    ],
  });

  // Build config
  const config: McpConfig = {
    model: primaryModel,
    defaults: {
      agent: defaultAgent,
    },
  };

  if (fallbackModel) {
    config.fallbackModel = fallbackModel;
  }

  // Save config
  saveConfig(config);

  const configPath = getConfigPath();
  console.log(`\n✅ Config saved to ${configPath}\n`);
  console.log('You can now use: opencode-mcp');
  console.log('Or reconfigure anytime with: opencode-mcp --setup\n');

  return config;
}
