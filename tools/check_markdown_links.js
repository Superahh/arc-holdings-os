"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SKIP_DIRS = new Set([".git", "node_modules"]);
const LOCAL_LINK_PATTERN = /\[[^\]]+\]\(([^)]+)\)/g;

function walkMarkdownFiles(rootDir, currentDir = rootDir, out = []) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      walkMarkdownFiles(rootDir, absolutePath, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(absolutePath);
    }
  }
  return out;
}

function normalizeLinkTarget(rawLink) {
  let link = rawLink.trim();
  if (link.startsWith("<") && link.endsWith(">")) {
    link = link.slice(1, -1);
  }
  const noFragment = link.split("#")[0];
  const noQuery = noFragment.split("?")[0];
  return decodeURI(noQuery.trim());
}

function isExternalLink(linkTarget) {
  return /^(https?:|mailto:|tel:|data:|#)/i.test(linkTarget);
}

function isWindowsAbsolute(linkTarget) {
  return /^[A-Za-z]:[\\/]/.test(linkTarget);
}

function resolveLinkPath(markdownFilePath, linkTarget) {
  if (isWindowsAbsolute(linkTarget)) {
    return path.normalize(linkTarget);
  }
  if (path.isAbsolute(linkTarget)) {
    return path.normalize(linkTarget);
  }
  return path.normalize(path.resolve(path.dirname(markdownFilePath), linkTarget));
}

function findBrokenLocalLinks(rootDir) {
  const markdownFiles = walkMarkdownFiles(rootDir);
  const broken = [];

  for (const filePath of markdownFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    const matches = content.matchAll(LOCAL_LINK_PATTERN);
    for (const match of matches) {
      const rawLink = match[1];
      if (isExternalLink(rawLink)) {
        continue;
      }
      const linkTarget = normalizeLinkTarget(rawLink);
      if (!linkTarget) {
        continue;
      }
      if (isExternalLink(linkTarget)) {
        continue;
      }

      const resolvedTarget = resolveLinkPath(filePath, linkTarget);
      if (!fs.existsSync(resolvedTarget)) {
        broken.push({
          file: path.relative(rootDir, filePath),
          link: rawLink,
        });
      }
    }
  }

  return broken;
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--root") {
      args.root = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(args.root);
  const broken = findBrokenLocalLinks(rootDir);
  if (broken.length > 0) {
    process.stdout.write("Broken local markdown links:\n");
    for (const item of broken) {
      process.stdout.write(`${item.file} -> ${item.link}\n`);
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write("OK: no broken local markdown links detected.\n");
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  findBrokenLocalLinks,
  normalizeLinkTarget,
  resolveLinkPath,
  main,
};
