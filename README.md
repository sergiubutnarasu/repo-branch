# 🌿 repo-branch

A command-line tool to create a new branch in multiple GitHub repositories at once. Built with [Commander.js](https://github.com/tj/commander.js), [Inquirer](https://github.com/SBoudrias/Inquirer.js), and the [GitHub CLI](https://cli.github.com/).

## ✨ Features

- Create a branch in one or more of your GitHub repositories.
- Works with personal repos or organization-owned repos.
- Interactive repository selection via checkbox prompt.
- Non-interactive mode by specifying repositories directly.
- Prevents duplicate branch creation.

## 📦 Prerequisites

Before using `repo-branch`, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v22 or higher)
- [GitHub CLI](https://cli.github.com/) (`gh`)
- Authenticated with GitHub CLI:

  ```bash
  gh auth login
  ```

## 🔧 Installation

You can run this tool directly using `npx` without installing it globally:

```bash
npx repo-branch <branch-name> [repositories...]
```

## ⚙️ Configuration

To target an organization instead of your personal account, set the environment variable:

```bash
BRANCH_SYNC_GITHUB_ORG=your-org-name
```

You can place this in a `.env` file in the project root.

## 🚀 Usage

### Interactive Mode

Select which repositories to create the branch in interactively:

```bash
npx repo-branch feature/new-ui
```

### Non-Interactive Mode

Specify repositories directly:

```bash
npx repo-branch feature/new-ui repo1 repo2 repo3
```

### Examples

```
# Create 'feature/new-ui' in selected repos
npx repo-branch feature/new-ui

# Create 'fix/readme-typo' in specific repos
npx repo-branch fix/readme-typo docs main-repo
```

## 🛠 Commands

| Command                                | Description                             |
| -------------------------------------- | --------------------------------------- |
| `repo-branch <branch-name>`            | Starts interactive mode to choose repos |
| `repo-branch <branch-name> [repos...]` | Creates branch in specified repos       |
| `-h, --help`                           | Display help information                |

## 📜 License

MIT
