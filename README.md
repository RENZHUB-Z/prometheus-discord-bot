# Prometheus Deobfuscator — Discord Bot

Use `/deobf code:<Lua source>` directly in Discord, or provide a `.lua` attachment. No Termux is required once the bot is deployed on a host.

## Features

- `/deobf code:<source>` accepts up to 6,000 characters (Discord slash-command limit).
- `/deobf file:<attachment>` accepts `.lua` files up to 200 KB.
- Returns the transformed code as a `.deobfuscated.lua` attachment.
- Runs analysis in a worker thread with a 15-second timeout.
- Does not execute the Lua source or fetch URLs mentioned inside `loadstring(game:HttpGet(...))`.
- Replies privately to the command user.

This project targets Prometheus-obfuscated Lua. A simple Roblox loader such as `loadstring(game:HttpGet("https://example.com/script.lua"))()` is only a downloader/loader expression; this bot does not fetch or execute that URL. To analyze remote code, obtain the source through a trusted, authorized method and paste or upload the actual Lua source.

## Deploy without Termux

1. Create a private GitHub repository and upload all project files while preserving folders.
2. In Render, create a **Background Worker** from that repository. This is a continuously running bot process, not a static site. Background Workers may require a paid Render instance; check the current plan/pricing before creating it.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add these environment variables in Render: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and optionally `DISCORD_GUILD_ID` for fast command registration in one test server.
6. Deploy. Check the worker logs for `Logged in as ...` and `Registered /deobf`.

## Discord setup

1. Open https://discord.com/developers/applications and create an application.
2. Create a bot and copy its token privately.
3. Copy the Application ID as `DISCORD_CLIENT_ID`.
4. Use OAuth2 URL Generator with `bot` and `applications.commands` scopes and invite it to your server. No privileged intents are required.
5. For guild-scoped registration, set `DISCORD_GUILD_ID` to your test server ID.

Never put tokens in source code, screenshots, or a public repository. If a token is exposed, reset it immediately.

## Limits and notes

- Discord string input: max 6,000 characters. Use a file attachment for longer scripts.
- File input: max 200 KB; output max 1 MB.
- 15-second worker timeout.
- Deobfuscation may fail on unsupported or damaged payloads and cannot restore original comments or names reliably.
- Analyze only code you own or have permission to inspect.
