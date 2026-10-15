<h1 align="center">AgentsDock: an IDE designed for agentic AI research</h1>

<div align="center">
  <a href="https://agentsdock.net">
    <img
      src="https://img.shields.io/badge/website-agentsdock.net-0EA5E9"
      alt="AgentsDock website"
    />
  </a>
  <a href="https://github.com/ZhengyiLuo/AgentsDock/releases/latest">
    <img
      src="https://img.shields.io/github/v/release/ZhengyiLuo/AgentsDock?label=desktop&amp;color=EA7233"
      alt="Latest stable desktop release"
    />
  </a>
  <a href="https://discord.gg/ZGDrhEWqPt">
    <img
      src="https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&amp;logoColor=white"
      alt="Join the AgentsDock Discord"
    />
  </a>
  <img
    src="https://img.shields.io/badge/backend-self--hosted-2563EB"
    alt="Self-hosted backend"
  />
  <a href="CONTRIBUTING.md">
    <img
      src="https://img.shields.io/badge/contributions-welcome-brightgreen.svg"
      alt="Contributions welcome"
    />
  </a>
</div>

<p align="center">
  <a href="https://agentsdock.net">
    <img
      src="docs/assets/agentsdock-overview.png"
      alt="AgentsDock desktop and mobile apps showing agent chats and file previews"
      width="760"
    />
  </a>
</p>

<div align="center">
  AgentsDock brings <strong>Claude Code</strong>, <strong>Codex</strong>,
  <strong>Cursor</strong>, and <strong>OpenCode</strong> into one desktop and
  mobile workspace. Use your agents for coding, research, and long-running work
  without living in a terminal. Easily review files and rich media.
  <br />
  <br />
  <strong>Desktop:</strong>
  <a href="https://github.com/ZhengyiLuo/AgentsDock/releases/latest">Download for macOS, Windows or Linux — latest stable</a>
  ·
  <a href="https://github.com/ZhengyiLuo/AgentsDock/releases">All releases and release notes</a>
  <br />
  <strong>Mobile:</strong>
  <a href="https://apps.apple.com/us/app/agentsdock/id6769275751">iPhone &amp; iPad</a>
  ·
  <a href="https://github.com/ZhengyiLuo/AgentsDock-Releases/releases/download/android-v0.1.1-beta.8/AgentsDock-0.1.1-android-arm64-beta.8.apk">Android</a>
  <br />
  <br />
  <strong>
    AgentsDock is the client; AgentsServer is the self-hosted backend.
  </strong>
</div>

## What you can do

- **Work with your agents:** start and resume chats, follow live activity, and
  queue the next task.
- **Ask a side question:** Codex Side chat has independent model and reasoning
  controls, live activity, and Stop/Clear actions alongside your main chat.
- **Review the results:** view images and videos inline, browse files, inspect
  code changes, and download artifacts.
- **Keep long-running work organized:** group chats, search history, create
  digests, and schedule recurring jobs.
- **Open a real terminal:** use a persistent tmux terminal attached to each
  chat's workspace.
- **Move between devices and servers:** connect multiple clients to the same
  server, or manage several servers from one app.

## How it works

**AgentsDock is the client. AgentsServer is the self-hosted backend.** Install
the server on the machine that has your projects and agent CLIs. That can be
the same computer as the desktop app or a remote machine you control. The
desktop and mobile apps connect to it to send tasks and display results.

The agent CLIs must be installed and authenticated **on the server**, not on
your phone. Self-hosting gives you control of the server and stored history;
it does not make the models local. Your selected provider still processes
model requests, and clients may cache content on your devices. Available
providers and features depend on the client and server version.

## Get started

You need a server and an app. They can run on the **same computer**; a separate
server is only needed if you want to run your agents elsewhere. npm installs the
server and its command-line tool. Download the desktop/mobile app separately.

1. **Prepare the server machine.** Use **Apple silicon macOS** with a desktop
   login, or **Linux** with a working user systemd session. Install
   [Node.js **22.14 or later**, including npm](https://nodejs.org/en/download),
   and [`uv`](https://docs.astral.sh/uv/getting-started/installation/) for the
   server's Python environment. Install **tmux** for persistent terminals and
   in-app Server updates; basic chats can run without it. On macOS with
   Homebrew, `brew install node uv tmux` installs these prerequisites.
   Windows can run the desktop app and connect to a supported server;
   the npm Server installer does not run natively on Windows.
2. **Install the server.** Run these commands in a terminal **on the server
   machine**, as your normal user, without `sudo`:

   ```sh
   npm install -g agentsdock
   agentsdock list
   agentsdock token default
   ```

   On a fresh machine, the global install creates and starts the stable
   **default** server, normally on port **7850**. No repo clone, npm account,
   or separate setup/start command is needed. Wait for installation to finish;
   it downloads Python dependencies too. Confirm `default` is `running` in
   `agentsdock list`, then keep its URL and token for the next step. The token
   grants access to your server; keep it private.
3. **Install and connect the app.** Download the
   [latest stable desktop app](https://github.com/ZhengyiLuo/AgentsDock/releases/latest)
   or [mobile app](https://agentsdock.net/#downloads). Add a server using the
   URL from `agentsdock list` and the token from `agentsdock token default`.
   On the same computer, use its **This machine only** URL. From a phone or
   another computer, use the listed **LAN** URL on the same network, or the
   **Tailscale** URL with both devices connected to your private tailnet.
   `127.0.0.1` always means the device you are using; it will not reach a
   different computer. Test the connection and save it.
4. **Start your first chat.** Install and sign in to at least one supported
   agent CLI **on the server machine**: Claude Code, Codex, Cursor or OpenCode.
   In the desktop app, check **Settings → My Agents**, then create a chat,
   choose the agent and a working directory on the server, and send a message.
   Installing AgentsDock does not install or sign in to these providers for you.

**Already have a server?** The npm install leaves existing installations and
history unchanged; it does not update or restart them. Use **Settings → Updates**
in the desktop app for supported managed updates. To add another independent
server, use `agentsdock new`, not another default setup. See
[multiple servers](server/README.md#multiple-servers-on-one-machine).

If installation fails, or you need a custom port, see
[server setup and troubleshooting](server/README.md#get-started).
Keep remote access on your LAN or a private network such as Tailscale; do not
forward the server port to the public internet.

## Develop from source

Use Git, **Node.js 24**, and **pnpm 11.9.0** (the version pinned by the project).
Desktop and mobile are separate packages; install dependencies in the package
you are working on. You also need a running AgentsServer to use the app.

```bash
git clone https://github.com/ZhengyiLuo/AgentsDock.git
cd AgentsDock
```

### Desktop

The current desktop app is built with Electron, React, and TypeScript. From
the repository root:

```bash
cd electron
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm dev
```

`pnpm build` compiles the app without packaging or publishing it. For desktop
architecture and platform-specific packaging, see
[electron/README.md](electron/README.md).

### Mobile: iPhone, iPad, and Android source

The current iPhone/iPad app lives in **`mobile-react/`**, using React Native
and Expo. Android source and native modules live in that same package. From
the repository root:

```bash
cd mobile-react
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:history
pnpm test:server-setup
```

For local iOS development on macOS with Xcode, continue in `mobile-react/`:

```bash
pnpm exec expo prebuild --platform ios
pnpm exec expo run:ios
```

Use a simulator or your own signing configuration. Read the
[mobile development guide](mobile-react/README.md) before installing on a
device: using the existing bundle identifier can replace your installed app.
Android development requires the Android toolchain.

## Where things live

| Directory | Purpose |
| --- | --- |
| [`electron/`](electron/) | Current desktop client for macOS, Linux, and Windows |
| [`mobile-react/`](mobile-react/) | Current React Native mobile client, including native modules in `modules/` |
| [`website/`](website/) | Product website and user guides |
| [`team-hub/`](team-hub/) | Team Hub service code and tests |
| [`docs/`](docs/) | Architecture, development notes, and release-channel documentation |
| [`server/`](server/) | Maintained AgentsServer runtime, installer, and server-only tests |
| `Sources/`, `Apps/`, `ZenithDock.xcodeproj` | Legacy Swift clients, not the current Electron or React Native apps |

The maintained backend lives in `server/`. Its Python dependencies and installer
are self-contained; server users do not need to build either client. See
[the source migration notes](docs/SERVER_SOURCE_MIGRATION.md) before exporting
changes or preparing a coordinated release.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for checks and contribution guidelines.
Keep changes scoped and add regression tests where appropriate. Use synthetic
test data; do not commit credentials, private infrastructure details, chat
transcripts, or screenshots containing user data.

The repository's CI verifies source. It does not publish desktop releases,
upload mobile builds, or deploy servers. Official binaries and update feeds
are managed separately; see [release channels](docs/DIRECT_RELEASES.md).

## License

AgentsDock's original code is licensed under the [Apache License 2.0](LICENSE),
except where a component explicitly states another license. See [NOTICE](NOTICE)
for attribution and separately licensed components. Existing third-party
copyrights, licenses, and notices remain in effect.
