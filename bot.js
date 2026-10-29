'use strict';

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  AttachmentBuilder,
} = require('discord.js');
const { Worker } = require('node:worker_threads');
const path = require('node:path');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '';
const MAX_INPUT_BYTES = 200 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const WORKER_TIMEOUT_MS = 15_000;

if (!TOKEN || !CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID environment variable.');
  process.exit(1);
}

const command = new SlashCommandBuilder()
  .setName('deobf')
  .setDescription('Analyze Prometheus-obfuscated Lua source')
  .addStringOption(option =>
    option.setName('code')
      .setDescription('Paste Lua source (max 6000 characters)')
      .setMaxLength(6000)
      .setRequired(false))
  .addAttachmentOption(option =>
    option.setName('file')
      .setDescription('Or attach a .lua file (max 200 KB)')
      .setRequired(false))
    .setDMPermission(false);

async function registerCommand() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);

  await rest.put(route, { body: [command.toJSON()] });
  console.log(`Registered /deobf (${GUILD_ID ? 'guild' : 'global'} command).`);
}

function runDeobfuscator(source, filename) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'deobf-worker.js'), {
      workerData: { source, filename },
    });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Deobfuscation timed out after 15 seconds.'));
    }, WORKER_TIMEOUT_MS);

    worker.once('message', result => {
      clearTimeout(timer);
      worker.terminate();
      if (result && result.ok) resolve(result);
      else reject(new Error(result?.error || 'Deobfuscation failed.'));
    });

    worker.once('error', error => {
      clearTimeout(timer);
      worker.terminate();
      reject(error);
    });

    worker.once('exit', code => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(new Error(`Deobfuscator worker stopped (code ${code}).`));
      }
    });
  });
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'deobf') {
    return;
  }

  const pastedCode = interaction.options.getString('code');
  const attachment = interaction.options.getAttachment('file');

  if (!pastedCode && !attachment) {
    await interaction.reply({
      content: 'Provide `code` or attach a `.lua` file. Example: `/deobf code:local x = 1`',
      ephemeral: true,
    });
    return;
  }
  if (pastedCode && attachment) {
    await interaction.reply({
      content: 'Choose either `code` or `file`, not both.',
      ephemeral: true,
    });
    return;
  }

  let source;
  let filename = 'pasted.lua';

  if (pastedCode) {
    source = pastedCode;
  } else {
    filename = attachment.name || 'input.lua';
    if (!filename.toLowerCase().endsWith('.lua')) {
      await interaction.reply({ content: 'Please upload a `.lua` file.', ephemeral: true });
      return;
    }
    if (attachment.size > MAX_INPUT_BYTES) {
      await interaction.reply({
        content: `File too large. Maximum size is ${MAX_INPUT_BYTES / 1024} KB.`,
        ephemeral: true,
      });
      return;
    }
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (!pastedCode) {
      const response = await fetch(attachment.url, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Could not download attachment (HTTP ${response.status}).`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_INPUT_BYTES) {
        throw new Error('Downloaded file exceeds the 200 KB limit.');
      }
      source = bytes.toString('latin1');
    }

    if (Buffer.byteLength(source, 'latin1') > MAX_INPUT_BYTES) {
      throw new Error('Input exceeds the 200 KB processing limit.');
    }

    // The worker parses source code; it does not execute the Lua program
    // or fetch URLs referenced by loadstring/HttpGet expressions.
    const result = await runDeobfuscator(source, path.basename(filename));

    if (result.codeBytes > MAX_OUTPUT_BYTES) {
      throw new Error('Output exceeds the 1 MB output limit.');
    }

    const output = Buffer.from(result.code, 'latin1');
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const outputName = safeName.replace(/\.lua$/i, '') + '.deobfuscated.lua';
    const file = new AttachmentBuilder(output, { name: outputName });
    const notes = Array.isArray(result.notes) ? result.notes.slice(0, 5) : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings.slice(0, 5) : [];
    let summary = `Finished analyzing **${safeName}**. Output is attached.`;
    if (notes.length) summary += '\n\n**Notes**\n' + notes.map(x => `• ${String(x).slice(0, 300)}`).join('\n');
    if (warnings.length) summary += '\n\n**Warnings**\n' + warnings.map(x => `• ${String(x).slice(0, 300)}`).join('\n');

    await interaction.editReply({ content: summary.slice(0, 1900), files: [file] });
  } catch (error) {
    const message = String(error?.message || 'Unknown error').slice(0, 1200);
    await interaction.editReply({
      content: `Could not deobfuscate this source: ${message}\n\nThis tool targets Prometheus-obfuscated Lua. It does not execute Roblox loadstrings or download code from URLs. Only analyze code you have permission to inspect.`,
    });
  }
});

(async () => {
  try {
    await registerCommand();
    await client.login(TOKEN);
  } catch (error) {
    console.error('Startup failed:', error);
    process.exit(1);
  }
})();
