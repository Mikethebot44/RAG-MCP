#!/usr/bin/env node

import { program } from 'commander';
import { createServer } from './server.js';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packagePath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

console.log(chalk.blue(`
====================================
        RAG MCP Server CLI (OSS)
====================================
`));

program
  .name('scout-mcp')
  .description('RAG MCP server (OpenAI + Pinecone) for enhanced coding context via vector search and RAG')
  .version(packageJson.version);

program
  .command('start')
  .description('Start the RAG MCP server')
  .option('-p, --port <port>', 'Port to run the server on (for HTTP mode)', '3000')
  .option('--http', 'Run in HTTP mode instead of STDIO mode')
  .option('--config <path>', 'Path to configuration file')
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    try {
      console.log(chalk.green('Starting RAG MCP Server (OSS)...'));

      if (options.verbose) {
        console.log(chalk.gray('Options:', JSON.stringify(options, null, 2)));
      }

      const requiredEnvVars = ['OPENAI_API_KEY', 'PINECONE_API_KEY', 'PINECONE_INDEX'];
      const missingVars = requiredEnvVars.filter(name => !process.env[name]);

      if (missingVars.length > 0) {
        console.error(chalk.red('Missing required environment variables:'));
        missingVars.forEach(varName => {
          console.error(chalk.red(`  - ${varName}`));
        });
        console.log(chalk.yellow('\nSet them using:'));
        console.log(chalk.gray('  export OPENAI_API_KEY="sk-..."'));
        console.log(chalk.gray('  export PINECONE_API_KEY="pcn-..."'));
        console.log(chalk.gray('  export PINECONE_INDEX="your-index"'));
        console.log(chalk.gray('  export GITHUB_TOKEN="your_github_token"      # optional'));
        console.log(chalk.gray('  export FIRECRAWL_API_KEY="fc-..."           # optional'));
        process.exit(1);
      }

      console.log(chalk.green('Environment variables verified'));
      console.log(chalk.blue('Configuration:'));
      console.log(chalk.gray(`  - Pinecone Index: ${process.env.PINECONE_INDEX}`));
      console.log(chalk.gray(`  - Max File Size: ${process.env.MAX_FILE_SIZE || '1MB'}`));
      console.log(chalk.gray(`  - Mode: ${options.http ? 'HTTP' : 'STDIO (MCP)'}`));

      const server = await createServer({
        httpMode: options.http,
        port: parseInt(options.port, 10),
        verbose: options.verbose,
        configPath: options.config
      });

      if (options.http) {
        console.log(chalk.green(`HTTP server running on port ${options.port}`));
        console.log(chalk.blue(`  Visit: http://localhost:${options.port}/health`));
      } else {
        console.log(chalk.green('STDIO MCP server ready for connections'));
        console.log(chalk.blue('Add to your Claude Desktop configuration:'));
        console.log(chalk.gray('  "scout-mcp": {'));
        console.log(chalk.gray('    "command": "npx",'));
        console.log(chalk.gray('    "args": ["scout-mcp", "start"]'));
        console.log(chalk.gray('  }'));
        console.log(chalk.blue('\nRemember to include OPENAI_API_KEY, PINECONE_API_KEY and PINECONE_INDEX in the environment.'));
      }

    } catch (error) {
      console.error(chalk.red('Failed to start server:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize RAG MCP with environment setup')
  .action(() => {
    console.log(chalk.blue('RAG MCP Setup (OSS)'));
    console.log();
    console.log(chalk.yellow('Required environment variables:'));
    console.log(chalk.gray('  OPENAI_API_KEY      - Your OpenAI API key'));
    console.log(chalk.gray('  PINECONE_API_KEY    - Your Pinecone API key'));
    console.log(chalk.gray('  PINECONE_INDEX      - Your Pinecone index name'));
    console.log();
    console.log(chalk.yellow('Optional environment variables:'));
    console.log(chalk.gray('  GITHUB_TOKEN       - GitHub token for higher rate limits'));
    console.log(chalk.gray('  FIRECRAWL_API_KEY  - Enables find_sources/deep_research tools'));
    console.log();
    console.log(chalk.yellow('Example setup:'));
    console.log(chalk.green('  export OPENAI_API_KEY="sk-..."'));
    console.log(chalk.green('  export PINECONE_API_KEY="pcn-..."'));
    console.log(chalk.green('  export PINECONE_INDEX="your-index"'));
    console.log(chalk.green('  export GITHUB_TOKEN="your_github_token"      # optional'));
    console.log(chalk.green('  export FIRECRAWL_API_KEY="fc-..."           # optional'));
    console.log();
    console.log(chalk.yellow('Claude Desktop configuration:'));
    console.log(chalk.green(`{
  "mcpServers": {
    "scout-mcp": {
      "command": "npx",
      "args": ["scout-mcp", "start"],
      "env": {
        "OPENAI_API_KEY": "\${OPENAI_API_KEY}",
        "PINECONE_API_KEY": "\${PINECONE_API_KEY}",
        "PINECONE_INDEX": "\${PINECONE_INDEX}",
        "GITHUB_TOKEN": "\${GITHUB_TOKEN}",
        "FIRECRAWL_API_KEY": "\${FIRECRAWL_API_KEY}"
      }
    }
  }
}`));
    console.log();
    console.log(chalk.blue('Then run: npx scout-mcp start'));
  });

program
  .command('health')
  .description('Check RAG MCP server health and configuration')
  .action(() => {
    console.log(chalk.blue('Environment check'));
    console.log();

    const requiredEnvVars = ['OPENAI_API_KEY', 'PINECONE_API_KEY', 'PINECONE_INDEX'];
    const optionalEnvVars = ['GITHUB_TOKEN', 'MAX_FILE_SIZE', 'CHUNK_SIZE', 'FIRECRAWL_API_KEY'];

    let allGood = true;
    requiredEnvVars.forEach(varName => {
      const isSet = Boolean(process.env[varName]);
      console.log(`${isSet ? chalk.green('[OK]') : chalk.red('[!!]')} ${varName}: ${isSet ? 'SET' : 'NOT SET'}`);
      if (!isSet) {
        allGood = false;
      }
    });

    optionalEnvVars.forEach(varName => {
      const isSet = Boolean(process.env[varName]);
      console.log(`${isSet ? chalk.green('[OK]') : chalk.yellow('[..]')} ${varName}: ${isSet ? 'SET' : 'OPTIONAL'}`);
    });

    console.log();
    if (allGood) {
      console.log(chalk.green('All required environment variables are set.'));
      console.log(chalk.blue('Ready to run: npx scout-mcp start'));
    } else {
      console.log(chalk.red('Missing required environment variables.'));
      console.log(chalk.blue('Run: npx scout-mcp init for setup instructions.'));
    }
  });

program
  .command('version')
  .description('Show version information')
  .action(() => {
    console.log(chalk.blue('RAG MCP Server (OSS)'));
    console.log(chalk.gray(`Version: ${packageJson.version}`));
    console.log(chalk.gray(`Node.js: ${process.version}`));
    console.log(chalk.gray(`Platform: ${process.platform}`));
  });

program
  .action(() => {
    console.log(chalk.yellow('Welcome to the RAG MCP Server CLI (OSS)!'));
    console.log();
    console.log(chalk.blue('Available commands:'));
    console.log(chalk.gray('  npx scout-mcp start    - Start the MCP server'));
    console.log(chalk.gray('  npx scout-mcp init     - Setup instructions'));
    console.log(chalk.gray('  npx scout-mcp health   - Check configuration'));
    console.log(chalk.gray('  npx scout-mcp --help   - Show all commands'));
    console.log();
    console.log(chalk.green('Quick start: npx scout-mcp init'));
  });

program.parse();

