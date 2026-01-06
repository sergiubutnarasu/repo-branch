#!/usr/bin/env node

import { Command } from "commander";
import { Octokit } from "@octokit/rest";
import chalk from "chalk";
import inquirer from "inquirer";
import Listr from "listr";
import dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load environment variables from .env file
dotenv.config({ quiet: true });

const program = new Command();

// Configuration - load from environment variables
const GITHUB_ORG = process.env.BRANCH_SYNC_GITHUB_ORG || "";
const GITHUB_OWNER = process.env.BRANCH_SYNC_GITHUB_OWNER || "";
const GITHUB_TOKEN = process.env.BRANCH_SYNC_GITHUB_TOKEN || "";
const OWNER = GITHUB_ORG || GITHUB_OWNER;

// Function to check if .env file exists
function checkEnvFile(): boolean {
  const envPath = path.resolve(process.cwd(), ".env");
  return fs.existsSync(envPath);
}

// Function to validate environment variables
function validateEnv(): boolean {
  if (!OWNER) {
    console.error(
      chalk.red(
        "❌ Neither BRANCH_SYNC_GITHUB_ORG nor BRANCH_SYNC_GITHUB_OWNER found in environment variables"
      )
    );
    console.error(
      chalk.yellow(
        "Please set either BRANCH_SYNC_GITHUB_ORG or BRANCH_SYNC_GITHUB_OWNER in your .env file or as environment variable"
      )
    );
    return false;
  }

  if (!GITHUB_TOKEN) {
    console.error(
      chalk.red(
        "❌ BRANCH_SYNC_GITHUB_TOKEN not found in environment variables"
      )
    );
    console.error(
      chalk.yellow(
        "Please set BRANCH_SYNC_GITHUB_TOKEN in your .env file or as environment variable"
      )
    );
    return false;
  }

  return true;
}

if (!validateEnv()) {
  if (!checkEnvFile()) {
    console.error(chalk.red("\nNo .env file found!"));
    console.error(chalk.yellow("Create a .env file with:"));
    console.error(chalk.yellow("BRANCH_SYNC_GITHUB_TOKEN=your_token_here"));
    console.error(chalk.yellow("BRANCH_SYNC_GITHUB_OWNER=your_username"));
  }
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

interface Repository {
  name: string;
  defaultBranch: string;
  full_name: string;
}

async function getRepositories(): Promise<Repository[]> {
  try {
    const repos = !!GITHUB_ORG
      ? await octokit.paginate(octokit.rest.repos.listForOrg, {
          org: OWNER,
          username: OWNER,
          per_page: 100,
          sort: "full_name",
        })
      : await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
          username: OWNER,
          per_page: 100,
          sort: "full_name",
        });

    return repos.map((repo) => ({
      name: repo.name,
      defaultBranch: repo.default_branch ?? "main",
      full_name: repo.full_name,
    }));
  } catch (error) {
    console.error(chalk.red("Failed to fetch repositories:"), error);
    throw error;
  }
}

async function createBranch(
  repoName: string,
  branchName: string
): Promise<void> {
  try {
    const { data: refData } = await octokit.rest.git.getRef({
      owner: OWNER,
      repo: repoName,
      ref: `heads/${
        (
          await octokit.rest.repos.get({ owner: OWNER, repo: repoName })
        ).data.default_branch
      }`,
    });

    await octokit.rest.git.createRef({
      owner: OWNER,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    });
  } catch (error: any) {
    if (error.status === 422) {
      throw new Error(`Branch already exists`);
    }
    throw error;
  }
}

async function selectRepositories(repos: Repository[]): Promise<Repository[]> {
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
}

async function run(branchName: string, repoNames?: string[]) {
  try {
    console.log(chalk.blue("🔍 Fetching repositories..."));

    const allRepos = await getRepositories();

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
            await createBranch(repo.name, branchName);
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
}

program
  .name("repo-branch")
  .description("Create a branch across multiple GitHub repositories")
  .argument("<branch-name>", "name of the branch to create")
  .argument("[repositories...]", "repositories to create branch in")
  .action((branchName, repositories) => {
    run(branchName, repositories);
  });

program.parse();
