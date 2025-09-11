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
╔═══════════════════════════════════════╗
║             Scout MCP Server          ║
║    Enhanced coding context via RAG    ║
╚═══════════════════════════════════════╝
`));

program
  .name('scout-mcp')
  .description('Scout MCP server for enhanced coding context via vector search and RAG')
  .version(packageJson.version);

program
  .command('start')
  .description('Start the Scout MCP server')
  .option('-p, --port <port>', 'Port to run the server on (for HTTP mode)', '3000')
  .option('--http', 'Run in HTTP mode instead of STDIO mode')
  .option('--config <path>', 'Path to configuration file')
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    try {
      console.log(chalk.green('🚀 Starting Scout MCP Server...'));
      
      if (options.verbose) {
        console.log(chalk.gray('Options:', JSON.stringify(options, null, 2)));
      }

      // Validate environment variables
      const requiredEnvVars = ['PINECONE_API_KEY', 'OPENAI_API_KEY'];
      const missingVars = requiredEnvVars.filter(name => !process.env[name]);

      if (missingVars.length > 0) {
        console.error(chalk.red('❌ Missing required environment variables:'));
        missingVars.forEach(varName => {
          console.error(chalk.red(`   - ${varName}`));
        });
        console.log(chalk.yellow('\n💡 Set them using:'));
        console.log(chalk.gray('   export PINECONE_API_KEY="your_pinecone_key"'));
        console.log(chalk.gray('   export OPENAI_API_KEY="your_openai_key"'));
        console.log(chalk.gray('   export GITHUB_TOKEN="your_github_token" # (optional)'));
        process.exit(1);
      }

      console.log(chalk.green('✅ Environment variables verified'));
      console.log(chalk.blue(`📊 Configuration:`));
      console.log(chalk.gray(`   - Pinecone Index: ${process.env.PINECONE_INDEX || 'scout-index'}`));
      console.log(chalk.gray(`   - OpenAI Model: ${process.env.OPENAI_MODEL || 'text-embedding-3-small'}`));
      console.log(chalk.gray(`   - Max File Size: ${process.env.MAX_FILE_SIZE || '1MB'}`));
      console.log(chalk.gray(`   - Mode: ${options.http ? 'HTTP' : 'STDIO (MCP)'}`));

      const server = await createServer({
        httpMode: options.http,
        port: parseInt(options.port),
        verbose: options.verbose,
        configPath: options.config
      });

      if (options.http) {
        console.log(chalk.green(`🌐 HTTP server running on port ${options.port}`));
        console.log(chalk.blue(`   Visit: http://localhost:${options.port}/health`));
      } else {
        console.log(chalk.green('📡 STDIO MCP server ready for connections'));
        console.log(chalk.blue('   Add to your Claude Desktop configuration:'));
        console.log(chalk.gray(`   "scout-mcp": {`));
        console.log(chalk.gray(`     "command": "npx",`));
        console.log(chalk.gray(`     "args": ["scout-mcp", "start"]`));
        console.log(chalk.gray(`   }`));
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to start server:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize Scout MCP with environment setup')
  .action(() => {
    console.log(chalk.blue('🔧 Scout MCP Setup\n'));
    
    console.log(chalk.yellow('Required Environment Variables:'));
    console.log(chalk.gray('1. PINECONE_API_KEY - Get from https://www.pinecone.io/'));
    console.log(chalk.gray('2. OPENAI_API_KEY - Get from https://platform.openai.com/api-keys'));
    console.log(chalk.gray('3. GITHUB_TOKEN - Optional, get from https://github.com/settings/tokens\n'));

    console.log(chalk.yellow('Setup Commands:'));
    console.log(chalk.green('export PINECONE_API_KEY="your_pinecone_api_key"'));
    console.log(chalk.green('export OPENAI_API_KEY="your_openai_api_key"'));
    console.log(chalk.green('export GITHUB_TOKEN="your_github_token"  # Optional\n'));

    console.log(chalk.yellow('Claude Desktop Configuration:'));
    console.log(chalk.gray('Add this to your Claude Desktop MCP settings:'));
    console.log(chalk.green(`{
  "mcpServers": {
    "scout-mcp": {
      "command": "npx",
      "args": ["scout-mcp", "start"],
      "env": {
        "PINECONE_API_KEY": "\${PINECONE_API_KEY}",
        "OPENAI_API_KEY": "\${OPENAI_API_KEY}",
        "GITHUB_TOKEN": "\${GITHUB_TOKEN}"
      }
    }
  }
}`));

    console.log(chalk.blue('\n🚀 Then run: npx scout-mcp start'));
  });

program
  .command('health')
  .description('Check Scout MCP server health and configuration')
  .action(async () => {
    console.log(chalk.blue('🏥 Health Check\n'));
    
    try {
      // Check environment variables
      const requiredEnvVars = ['PINECONE_API_KEY', 'OPENAI_API_KEY'];
      const optionalEnvVars = ['GITHUB_TOKEN', 'PINECONE_INDEX', 'OPENAI_MODEL'];
      
      console.log(chalk.yellow('Environment Variables:'));
      
      let allGood = true;
      for (const varName of requiredEnvVars) {
        const isSet = !!process.env[varName];
        console.log(`${isSet ? '✅' : '❌'} ${varName}: ${isSet ? 'SET' : 'NOT SET'}`);
        if (!isSet) allGood = false;
      }
      
      for (const varName of optionalEnvVars) {
        const isSet = !!process.env[varName];
        console.log(`${isSet ? '✅' : '⚪'} ${varName}: ${isSet ? 'SET' : 'NOT SET (optional)'}`);
      }

      if (allGood) {
        console.log(chalk.green('\n✅ All required environment variables are set'));
        console.log(chalk.blue('🚀 Ready to run: npx scout-mcp start'));
      } else {
        console.log(chalk.red('\n❌ Missing required environment variables'));
        console.log(chalk.blue('💡 Run: npx scout-mcp init for setup instructions'));
      }

    } catch (error) {
      console.error(chalk.red('❌ Health check failed:'), error);
    }
  });

program
  .command('version')
  .description('Show version information')
  .action(() => {
    console.log(chalk.blue('Scout MCP Server'));
    console.log(chalk.gray(`Version: ${packageJson.version}`));
    console.log(chalk.gray(`Node.js: ${process.version}`));
    console.log(chalk.gray(`Platform: ${process.platform}`));
  });

// Default command
program
  .action(() => {
    console.log(chalk.yellow('Welcome to Scout MCP Server!\n'));
    console.log(chalk.blue('Available commands:'));
    console.log(chalk.gray('  npx scout-mcp start    - Start the MCP server'));
    console.log(chalk.gray('  npx scout-mcp init     - Setup instructions'));
    console.log(chalk.gray('  npx scout-mcp health   - Check configuration'));
    console.log(chalk.gray('  npx scout-mcp --help   - Show all commands\n'));
    console.log(chalk.green('Quick start: npx scout-mcp init'));
  });

// Parse command line arguments
program.parse();