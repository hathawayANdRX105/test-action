<div align="center">
**🌎 **[Universe Federation](https://dc.hhhl.cc/)** is an open source, decentralized social media platform that's free forever! 🚀**

---

<a href="https://dc.hhhl.cc/">
		<img src="https://custom-icon-badges.herokuapp.com/badge/create_an-instance-FBD53C?logoColor=FBD53C&style=for-the-badge&logo=server&labelColor=363B40" alt="create an instance"/></a>

<a href="./CONTRIBUTING.md">
		<img src="https://custom-icon-badges.herokuapp.com/badge/become_a-contributor-A371F7?logoColor=A371F7&style=for-the-badge&logo=git-merge&labelColor=363B40" alt="become a contributor"/></a>

<a href="https://discord.gg/6VgKmEqHNk">
		<img src="https://custom-icon-badges.herokuapp.com/badge/join_the-community-5865F2?logoColor=5865F2&style=for-the-badge&logo=discord&labelColor=363B40" alt="join the community"/></a>

---

</div>

<div>

## ✨ Features
- **ActivityPub support**\
Not on Universe Federation? No problem! Not only can Universe Federation instances talk to each other, but you can make friends with people on other networks like Mastodon and Pixelfed!
- **Federated Backgrounds and Music status**\
You can add a background to your profile as well as a music status via ListenBrainz, show everyone what music you are currently listening to
- **Mastodon API**\
Universe Federation implements the Mastodon API.
- **UI/UX Improvements**\
Universe Federation makes some UI/UX improvements to make it easier to navigate
- **Sign-Up Approval**\
With Universe Federation, you can enable sign-ups, subject to manual moderator approval and mandatory user-provided reasons for joining.
- **Rich Web UI**\
       Universe Federation has a rich and easy to use Web UI!
       It is highly customizable, from changing the layout and adding widgets to making custom themes.
       Furthermore, plugins can be created using AiScript, an original programming language.
- And much more...

</div>

<div style="clear: both;"></div>

## Documentation

Universe Federation Documentation can be found at [Universe Federation Documentation](https://dc.hhhl.cc/)

## Repository documentation

- [Contributing](CONTRIBUTING.md)
- [Agent / contributor handbook](AGENTS.md)
- [Important user notes](docs/user/important-notes.md)
- [Upgrade notes](docs/ops/upgrade-notes.md)
- [Security notes](SECURITY.md)
- [Compose files](deploy/compose/) — run from repo root, e.g. `docker compose -f deploy/compose/local-db.yml up -d`

## Repository layout

| Path | Purpose |
|------|---------|
| `packages/` | Application packages (backend, frontend, …) |
| `locales/` | i18n (`upstream/` + `fork/`, merged at build) |
| `assets/` | Brand assets and runtime emoji submodules under `assets/emojis/` |
| `deploy/compose/` | Docker Compose examples and local middleware stacks |
| `docs/` | Human docs (user notes, upgrade notes, …) |
| `agent/` | Issue/PR workflow handbook for humans and agents |
| `scripts/` | Build/dev/ops scripts (includes `healthcheck.sh`) |
| `tests/e2e/` | Cypress end-to-end tests |
| `config/` | **Runtime** instance config templates (not general project config) |
| `.github/` | GitHub Actions, issue/PR templates, Renovate config |

Root `package.json` / `pnpm-*` / `Dockerfile` stay at the monorepo root on purpose.
