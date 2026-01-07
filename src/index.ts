#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import Listr from "listr";
import dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { promisify } from "util";

const exec = promisify(require("child_process").exec);

// Load environment variables from .env file
dotenv.config({ quiet: true });
const program = new Command();

// Configuration - load from environment variables
const GITHUB_ORG = process.env.BRANCH_SYNC_GITHUB_ORG || "";

interface Repository {
  name: string;
  defaultBranch: string;
  full_name: string;
}

// Get current GitHub user (from gh auth status)
const getCurrentUser = async (): Promise<string> => {
  try {
    const { stdout } = await exec("gh api user --jq .login");
    return stdout.trim();
  } catch (error) {
    throw new Error("Failed to get GitHub user. Please run 'gh auth login'");
  }
};

// Function to validate environment and get owner
const validateAndGetOwner = async (): Promise<string> => {
  if (GITHUB_ORG) {
    return GITHUB_ORG;
  }

  try {
    const currentUser = await getCurrentUser();
    return currentUser;
  } catch (error) {
    console.error(chalk.red("❌ Unable to determine GitHub owner"));
    console.error(chalk.yellow("Please either:"));
    console.error(
      chalk.yellow("1. Set BRANCH_SYNC_GITHUB_ORG in your .env file")
    );
    console.error(
      chalk.yellow("2. Run 'gh auth login' to authenticate with GitHub CLI")
    );
    throw error;
  }
};

// Check if GitHub CLI is installed
const checkGitHubCLI = async (): Promise<boolean> => {
  try {
    await exec("gh --version");
    return true;
  } catch (error) {
    return false;
  }
};

const getRepositories = async (owner: string): Promise<Repository[]> => {
  try {
    const command = `gh repo list ${owner} --limit 1000 --json name,defaultBranchRef,nameWithOwner`;

    const { stdout } = await exec(command);
    const repos = JSON.parse(stdout);

    return repos
      .map((repo: any) => ({
        name: repo.name,
        defaultBranch: repo.defaultBranchRef?.name || "main",
        full_name: repo.nameWithOwner,
      }))
      .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));
  } catch (error) {
    console.error(chalk.red("Failed to fetch repositories:"), error);
    throw error;
  }
};

const createBranch = async (
  owner: string,
  repoName: string,
  branchName: string
): Promise<void> => {
  try {
    // Get default branch
    const { stdout: defaultBranchStdout } = await exec(
      `gh repo view ${owner}/${repoName} --json defaultBranchRef --jq .defaultBranchRef.name`
    );
    const defaultBranch = defaultBranchStdout.trim() || "main";

    // Get SHA of default branch
    const { stdout: shaStdout } = await exec(
      `gh api repos/${owner}/${repoName}/git/refs/heads/${defaultBranch} --jq .object.sha`
    );
    const sha = shaStdout.trim();

    // Create new branch
    await exec(
      `gh api repos/${owner}/${repoName}/git/refs -f ref=refs/heads/${branchName} -f sha=${sha}`
    );
  } catch (error: any) {
    if (error.stderr && error.stderr.includes("Reference already exists")) {
      throw new Error(`Branch already exists`);
    }
    throw error;
  }
};

const selectRepositories = async (
  repos: Repository[]
): Promise<Repository[]> => {
  const answers = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedRepos",
      message: "Select repositories:",
      choices: repos.map((repo) => ({
        name: `${repo.full_name} (${repo.defaultBranch})`,
        value: repo,
      })),
      pageSize: 15,
    },
  ]);
  return answers.selectedRepos;
};

const run = async (branchName: string, repoNames?: string[]) => {
  try {
    // Get owner (org or current user)
    const owner = await validateAndGetOwner();

    console.log(chalk.blue(`🔍 Fetching repositories for ${owner}...`));
    const allRepos = await getRepositories(owner);

    let selectedRepos: Repository[];

    if (repoNames && repoNames.length > 0) {
      selectedRepos = allRepos.filter((repo) => repoNames.includes(repo.name));
      const notFound = repoNames.filter(
        (name) => !allRepos.some((repo) => repo.name === name)
      );

      if (notFound.length > 0) {
        console.warn(
          chalk.yellow(`⚠️  Repositories not found: ${notFound.join(", ")}`)
        );
      }
    } else {
      selectedRepos = await selectRepositories(allRepos);
    }

    if (selectedRepos.length === 0) {
      console.log(chalk.yellow("No repositories selected"));
      return;
    }

    console.log(
      chalk.blue(
        `\n🚀 Creating branch '${branchName}' in ${selectedRepos.length} repositories...\n`
      )
    );

    // Create tasks for Listr
    const tasks = new Listr(
      selectedRepos.map((repo) => ({
        title: `Creating branch in ${chalk.cyan(repo.name)}`,
        task: async () => {
          try {
            await createBranch(owner, repo.name, branchName);
          } catch (error: any) {
            if (error.message.includes("already exists")) {
              throw new Error(chalk.yellow("Branch already exists"));
            }
            throw error;
          }
        },
      }))
    );

    await tasks.run();
    console.log(chalk.green("\n✨ All done!"));
  } catch (error: any) {
    if (error.message === "Prompt was cancelled") {
      console.log(chalk.yellow("\nOperation cancelled"));
      process.exit(0);
    }
    console.error(chalk.red("Error:"), error);
    process.exit(1);
  }
};

// Main execution wrapper to avoid top-level await
(async () => {
  // Check if GitHub CLI is available
  if (!(await checkGitHubCLI())) {
    console.error(chalk.red("❌ GitHub CLI not found"));
    console.error(
      chalk.yellow("Please install GitHub CLI: https://cli.github.com/")
    );
    process.exit(1);
  }

  program
  .name("repo-branch")
  .description("Create a branch across multiple GitHub repositories")
  .argument("<branch-name>", "name of the branch to create")
  .argument("[repositories...]", "repositories to create branch in")
  .helpOption("-h, --help", "Display help for command")
  .addHelpText("after", `
Examples:
  $ repo-branch feature/new-ui
  $ repo-branch feature/new-ui repo1 repo2
  `)
    .action((branchName, repositories) => {
      run(branchName, repositories);
    });

  program.parse();
})();
