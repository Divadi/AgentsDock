# AgentsServer

![AgentsDock in action](assets/agentsdock-preview.png)

**AgentsServer is the self-hosted execution backend for
[AgentsDock](https://agentsdock.net).** AgentsDock provides
the polished desktop and mobile chat experience; AgentsServer runs on the
machine that owns your workspaces and agent CLI installations.
Together they provide persistent agent chats without routing private project
files through a third-party chat service.

The desktop and mobile client is also open source:
[ZhengyiLuo/AgentsDock](https://github.com/ZhengyiLuo/AgentsDock).

## Features

- Run agent chats from desktop and mobile, with persistent history.
- Work with files, images, videos, scheduled jobs, and persistent terminals.
- Use Claude Code, Codex, Cursor, or OpenCode where supported by your server
  release, client, and installed CLI.
- Run independent servers on the same machine.

## Get started

Use a Linux or Apple silicon macOS host with **Node.js 22.14 or later**, npm and
[`uv`](https://docs.astral.sh/uv/getting-started/installation/) installed.
macOS requires a desktop login; Linux requires a working user systemd session.
Install and authenticate the agent CLI you want to use on that host.
`tmux` is optional for terminal access and managed updates.

AgentsDock desktop can guide you through **Set up AgentsServer**. For the
recommended manual installation, run as the server owner without `sudo`:

```sh
npm install -g agentsdock
agentsdock list
```

On a fresh machine, the global install automatically creates and starts the
default server, normally on port **7850**. No separate setup/start command is
required. Existing default or named installations and history are left unchanged;
installing the npm CLI again does not update or restart a running server.

Use the installer output or `agentsdock list` to find the server URL. To retrieve
the default server's access token without reinstalling or restarting:

```sh
agentsdock token default
```

Add the URL and token in AgentsDock. For beta installation, use
`npm install -g agentsdock@beta`; existing servers still use managed updates.
Local npm installs, CI installs and installs with scripts disabled do not
automatically create a service. For explicit setup/retry or a custom port, see
the [CLI setup instructions](npm/agentsdock/README.md#install-the-command).

For access from another network, connect the server and your device through
Tailscale. Keep access tokens private and do not expose the agent port directly
to the public internet. See the [setup guide](https://agentsdock.net/setup.html)
for detailed instructions.

### Install from source (advanced)

The source installer remains available for development and checkout-based
installations:

```bash
git clone https://github.com/ZhengyiLuo/AgentsDock.git
cd AgentsDock/server
./install.sh
```

In that checkout, `./install.sh --show-token` reads an existing default token.

### Memory at launch

New agent turns require **2 GiB (2048 MiB) of available server RAM** by default;
scheduled jobs require **4 GiB (4096 MiB)**. This is a launch check, not total RAM or a
guarantee that every workload will fit. Low-memory errors show the available
amount, required minimum, and recovery advice. See [memory settings](docs/MEMORY_ADMISSION.md)
for operator overrides.

## Multiple servers on one machine

Add a separate server without replacing your original/default server:

```sh
# Create a server with an automatic name and free port
agentsdock new

# Or choose its name and port
agentsdock new work --port 7851

# List all servers and their connection URLs
agentsdock list

# Uninstall one server (replace work with its name)
agentsdock remove work
```

Removal asks for confirmation and preserves history by default. Select the
instance explicitly; bare `agentsdock remove` never selects all servers.

Named instances retain separate legacy service units. The default server keeps
the current split service lifecycle; `--execution-mode split` is rejected for
named instances to avoid taking over the default gateway.

## Updating

Use the app's managed update controls for an installed server. Updating the npm
CLI alone leaves its running server unchanged. Signed updates preserve the
server's token and chat history. See the
[update guide](https://agentsdock.net/update.html).

For the default server installed from a checkout:

```bash
git pull --ff-only
./install.sh
```

## Documentation and support

- [Detailed API, configuration, and lifecycle reference](docs/SERVER_REFERENCE.md)

- [Setup and connection help](https://agentsdock.net/setup.html)
- [AgentsDock features](https://agentsdock.net/features.html)
- [Server releases](https://github.com/ZhengyiLuo/AgentsServer/releases)
- [Report a server issue](https://github.com/ZhengyiLuo/AgentsServer/issues)
- [Contributing and tests](CONTRIBUTING.md)

Features in this checkout may not yet be in a published release. The maintained server source is this repository's `server/` directory. The
standalone AgentsServer repository remains a compatibility distribution during
the update migration.

### CLI reference

The published [`agentsdock` CLI](npm/agentsdock/README.md) is the short entry
point. It pins the same-version `@agentsdock/server` runtime and preserves the
signed update protocol. Existing scoped-package installations remain supported.
See the CLI reference for command options, source-only features and native
instance-management acceptance limits.

## License

AgentsServer's original code and documentation are licensed under the
[Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution.
Third-party components retain their respective copyrights and licenses.
