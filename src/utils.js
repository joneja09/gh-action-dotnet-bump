// eslint-disable-next-line security/detect-child-process
const { spawn } = require('child_process');
const { readFileSync } = require('fs');
const { EOL } = require('os');
const semver = require('semver');
const semverInc = require('semver/functions/inc');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const github = require('@actions/github');

function logInfo(message) {
  console.info(message);
}

function exitSuccess(message) {
  logInfo(`✔  success   ${message}`);
  process.exit(0);
}

function exitFailure(message) {
  logError(message);
  process.exit(1);
}

function logError(error) {
  console.error(`✖  fatal     ${error.stack || error}`);
}

function getProjectContent(pathToDocument) {
  return readFileSync(pathToDocument);
}

function childElements(parent, nodeName) {
  return Object.values(parent.childNodes || {}).filter((node) => node.nodeName === nodeName);
}

function getNodeText(node) {
  if (!node || !node.childNodes || node.childNodes.length === 0) {
    return undefined;
  }
  const text = node.childNodes.item(0);
  return text && text.nodeValue ? text.nodeValue.trim() : undefined;
}

function setNodeText(node, value) {
  if (!node) {
    return;
  }
  if (node.childNodes && node.childNodes.length > 0) {
    node.childNodes.item(0).data = value;
    return;
  }
  const doc = node.ownerDocument || new DOMParser().parseFromString('<root/>', 'text/xml');
  node.appendChild(doc.createTextNode(value));
}

function toFourPartVersion(version) {
  const parsed = semver.parse(version);
  if (parsed) {
    return `${parsed.major}.${parsed.minor}.${parsed.patch}.0`;
  }
  const core = String(version).split('-')[0];
  const parts = core.split('.');
  return `${parts[0] || 0}.${parts[1] || 0}.${parts[2] || 0}.0`;
}

function normalizeCurrentVersion(version) {
  if (semver.valid(version)) {
    return version;
  }
  const coerced = semver.coerce(version);
  if (coerced) {
    logInfo(`Normalized current version "${version}" to "${coerced.version}"`);
    return coerced.version;
  }
  throw new Error(`Current version "${version}" is not a valid semantic version.`);
}

function toCoreVersion(version) {
  const parsed = semver.parse(version);
  if (parsed) {
    return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  }
  return String(version).split('-')[0];
}

function getPrereleaseSuffix(version) {
  const parsed = semver.parse(version);
  if (parsed && parsed.prerelease.length > 0) {
    return parsed.prerelease.join('.');
  }
  return '';
}

function findFirstPropertyValue(propertyGroupNodes, elementName) {
  for (const propertyGroupNode of propertyGroupNodes) {
    const nodes = childElements(propertyGroupNode, elementName);
    if (nodes.length === 1) {
      const value = getNodeText(nodes[0]);
      if (value) {
        return value;
      }
    }
  }
  return undefined;
}

function getCurrentVersionCsproj(csprojDocument) {
  const doc = new DOMParser().parseFromString(csprojDocument, 'text/xml');
  const rootNode = doc.documentElement;
  if (!rootNode || !rootNode.hasChildNodes()) {
    return undefined;
  }

  const propertyGroupNodes = childElements(rootNode, 'PropertyGroup');
  const version = findFirstPropertyValue(propertyGroupNodes, 'Version');
  if (version) {
    return version;
  }

  const versionPrefix = findFirstPropertyValue(propertyGroupNodes, 'VersionPrefix');
  if (!versionPrefix) {
    return undefined;
  }
  const versionSuffix = findFirstPropertyValue(propertyGroupNodes, 'VersionSuffix');
  return versionSuffix ? `${versionPrefix}-${versionSuffix}` : versionPrefix;
}

function updateNamedVersionNodes(propertyGroupNode, elementName, value) {
  const nodes = childElements(propertyGroupNode, elementName);
  let updated = false;
  for (const node of nodes) {
    setNodeText(node, value);
    updated = true;
  }
  return updated;
}

function getNewProjectContentCsproj(newVersion, csprojDocument) {
  const doc = new DOMParser().parseFromString(csprojDocument, 'text/xml');
  const rootNode = doc.documentElement;
  if (!rootNode || !rootNode.hasChildNodes()) {
    return new XMLSerializer().serializeToString(rootNode);
  }

  const propertyGroupNodes = childElements(rootNode, 'PropertyGroup');
  const fourPartVersion = toFourPartVersion(newVersion);
  const coreVersion = toCoreVersion(newVersion);
  const prereleaseSuffix = getPrereleaseSuffix(newVersion);
  let versionSet = false;

  for (const propertyGroupNode of propertyGroupNodes) {
    if (updateNamedVersionNodes(propertyGroupNode, 'Version', newVersion)) {
      versionSet = true;
    }
    updateNamedVersionNodes(propertyGroupNode, 'PackageVersion', newVersion);
    updateNamedVersionNodes(propertyGroupNode, 'VersionPrefix', coreVersion);
    if (childElements(propertyGroupNode, 'VersionSuffix').length > 0) {
      updateNamedVersionNodes(propertyGroupNode, 'VersionSuffix', prereleaseSuffix);
    }
    updateNamedVersionNodes(propertyGroupNode, 'AssemblyVersion', fourPartVersion);
    updateNamedVersionNodes(propertyGroupNode, 'FileVersion', fourPartVersion);
    updateNamedVersionNodes(propertyGroupNode, 'InformationalVersion', newVersion);
  }

  if (!versionSet && propertyGroupNodes.length > 0) {
    const propertyGroupNode = propertyGroupNodes[0];
    const versionNode = new DOMParser().parseFromString(
      `<Version>${newVersion}</Version>`,
      'text/xml'
    );
    propertyGroupNode.appendChild(versionNode);
  }

  return new XMLSerializer().serializeToString(rootNode);
}

function execAll(regex, input) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  // eslint-disable-next-line security/detect-non-literal-regexp
  const matcher = new RegExp(regex.source, flags);
  const matches = [];
  let match = matcher.exec(input);
  while (match !== null) {
    matches.push(match);
    if (match[0] === '') {
      matcher.lastIndex += 1;
    }
    match = matcher.exec(input);
  }
  return matches;
}

// eslint-disable-next-line security/detect-unsafe-regex
const assemblyVersionRegex = /^[ \t]*\[assembly:\s*AssemblyVersion\("(?<version>[^"]+)"\)\]/gm;
// eslint-disable-next-line security/detect-unsafe-regex
const assemblyFileVersionRegex = /^[ \t]*\[assembly:\s*AssemblyFileVersion\("(?<version>[^"]+)"\)\]/gm;

function getCurrentVersionAssembly(assemblyDocument) {
  const matches = execAll(assemblyVersionRegex, assemblyDocument);
  if (matches.length === 0) {
    return undefined;
  }
  const assemblyVersion = matches[matches.length - 1].groups.version;
  const versionSplit = assemblyVersion.split('.');
  return `${versionSplit[0]}.${versionSplit[1]}.${versionSplit[2]}`;
}

function replaceLastMatch(documentText, regex, replacement) {
  const matches = execAll(regex, documentText);
  if (matches.length === 0) {
    return { text: documentText, replaced: false };
  }
  const currentMatch = matches[matches.length - 1];
  return {
    text: `${documentText.slice(0, currentMatch.index)}${replacement}${documentText.slice(currentMatch.index + currentMatch[0].length)}`,
    replaced: true
  };
}

function getNewProjectContentAssembly(newSemverVersion, assemblyDocument) {
  const newAssemblyVersion = toFourPartVersion(newSemverVersion);
  const versionLine = `[assembly: AssemblyVersion("${newAssemblyVersion}")]`;
  const fileVersionLine = `[assembly: AssemblyFileVersion("${newAssemblyVersion}")]`;

  let nextDocument = assemblyDocument;
  const versionReplace = replaceLastMatch(nextDocument, assemblyVersionRegex, versionLine);
  nextDocument = versionReplace.text;

  const fileVersionReplace = replaceLastMatch(nextDocument, assemblyFileVersionRegex, fileVersionLine);
  nextDocument = fileVersionReplace.text;

  if (!versionReplace.replaced) {
    const suffix = nextDocument.endsWith('\n') ? '' : '\n';
    nextDocument = `${nextDocument}${suffix}${versionLine}\n`;
  }

  return nextDocument;
}

function runInWorkspace(command, args) {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: workspace });
    let isDone = false;
    const errorMessages = [];
    child.on('error', (error) => {
      if (!isDone) {
        isDone = true;
        reject(error);
      }
    });
    if (child.stderr) {
      child.stderr.on('data', (chunk) => errorMessages.push(chunk));
    }
    child.on('exit', (code) => {
      if (!isDone) {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${errorMessages.join('')}${EOL}${command} exited with code ${code}`));
        }
      }
    });
  });
}

function runAndCapture(command, args) {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: workspace });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      const output = Buffer.concat(stdout).toString();
      const errorOutput = Buffer.concat(stderr).toString();
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`${errorOutput}${EOL}${command} exited with code ${code}`));
      }
    });
  });
}

/**
 * Bump the version and return the new version to use.
 * @param {*} currentVersion raw version number 'x.x.x'
 * @param {*} bumpMajorVersion
 * @param {*} bumpMinorVersion
 * @param {*} bumpPatchVersion
 * @param {*} bumpPreReleaseVersion
 * @param {*} preReleaseId
 * @returns new version
 */
function bumpVersion(currentVersion, bumpMajorVersion, bumpMinorVersion, bumpPatchVersion, bumpPreReleaseVersion, preReleaseId) {
  let release;
  if (bumpPreReleaseVersion) {
    release = 'prerelease';
  } else if (bumpMajorVersion) {
    release = 'major';
  } else if (bumpMinorVersion) {
    release = 'minor';
  } else if (bumpPatchVersion) {
    release = 'patch';
  }
  return semverInc(currentVersion, release, {}, preReleaseId);
}

function getRepoFromEvent(gitEvents) {
  const repository = gitEvents.repository || {};
  const ownerValue = repository.owner;
  const owner = ownerValue && (ownerValue.login || ownerValue);
  return { owner, repo: repository.name };
}

async function getCommitMessagesFromGit() {
  const output = await runAndCapture('git', ['log', '-n', '100', '--pretty=format:%s%n%b---END---']);
  return output
    .split('---END---')
    .map((message) => message.trim())
    .filter(Boolean);
}

/**
 * Get commits for the current push, checkout, or repository.
 *
 * @param {*} gitEvents
 * @param {*} githubToken
 * @returns {Promise<string[]>}
 */
async function getCommitMessages(gitEvents, githubToken) {
  if (Array.isArray(gitEvents.commits) && gitEvents.commits.length > 0) {
    logInfo(`Using ${gitEvents.commits.length} commit(s) from the GitHub event payload`);
    return gitEvents.commits.map((commitEvent) => `${commitEvent.message || ''}\n`);
  }

  try {
    const gitLogMessages = await getCommitMessagesFromGit();
    if (gitLogMessages.length > 0) {
      logInfo(`Using ${gitLogMessages.length} commit(s) from git log`);
      return gitLogMessages;
    }
  } catch (error) {
    logInfo(`git log was unavailable (${error.message || error}); falling back to the GitHub API`);
  }

  if (!githubToken) {
    throw new Error('A GitHub token is required to read commits when git history is unavailable. Pass github-token or set GITHUB_TOKEN.');
  }

  const { owner, repo } = getRepoFromEvent(gitEvents);
  if (!owner || !repo) {
    throw new Error('Unable to determine the GitHub repository owner/name from the event payload.');
  }

  const client = github.getOctokit(githubToken);
  const response = await client.rest.repos.listCommits({
    owner,
    repo,
    sha: process.env.GITHUB_SHA,
    per_page: 100
  });

  if (response.status !== 200) {
    throw new Error(
      `The GitHub API for getting commits returned ${response.status}, expected 200. ` +
        'Please submit an issue on this action\'s GitHub repo.'
    );
  }

  const commits = response.data;
  if (commits.length === 0) {
    throw new Error('No commits were found for this repository and SHA.');
  }
  return commits.map((commitEvent) => `${commitEvent.commit.message}\n${commitEvent.commit.body || ''}`);
}

/**
 * Get all the commits up until the release commit
 *
 * @param {*} commitMessages
 * @param {*} commitMessageToUse
 * @param {*} tagPrefix
 * @returns
 */
function getRelevantCommitMessages(commitMessages, commitMessageToUse, tagPrefix) {
  const escapedPrefix = String(tagPrefix || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Use 'i' only. A global flag makes RegExp.test() stateful and can skip matches.
  // eslint-disable-next-line security/detect-non-literal-regexp
  const commitMessageRegex = new RegExp(commitMessageToUse.replace(/{{version}}/g, `${escapedPrefix}\\d+\\.\\d+\\.\\d+`), 'i');
  let commitIndexOfBump = undefined;
  for (const [index, commitMessage] of commitMessages.entries()) {
    if (commitMessageRegex.test(commitMessage)) {
      commitIndexOfBump = index;
      break;
    }
  }

  if (commitIndexOfBump !== undefined) {
    return commitMessages.slice(0, commitIndexOfBump);
  }
  return commitMessages;
}

function applyDefaultBump(defaultBump) {
  const normalized = String(defaultBump || '').trim().toLowerCase();
  switch (normalized) {
  case 'major':
    return {doMajorVersion: true, doMinorVersion: false, doPatchVersion: false, doPreReleaseVersion: false};
  case 'minor':
    return {doMajorVersion: false, doMinorVersion: true, doPatchVersion: false, doPreReleaseVersion: false};
  case 'patch':
    return {doMajorVersion: false, doMinorVersion: false, doPatchVersion: true, doPreReleaseVersion: false};
  case 'prerelease':
  case 'pre-release':
  case 'pre':
    return {doMajorVersion: false, doMinorVersion: false, doPatchVersion: false, doPreReleaseVersion: true};
  default:
    return {doMajorVersion: false, doMinorVersion: false, doPatchVersion: false, doPreReleaseVersion: false};
  }
}

function analyseVersionPartChange(versionPart) {
  logInfo(`Version Part set to ${versionPart}`);
  const result = applyDefaultBump(versionPart);
  if (!result.doMajorVersion && !result.doMinorVersion && !result.doPatchVersion && !result.doPreReleaseVersion) {
    throw new Error('version-part must be one of: Major, Minor, Patch, Prerelease');
  }
  return result;
}

function splitWords(wording) {
  if (!wording) {
    return [];
  }
  return wording
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);
}

function getCommitTypePrefix(commitMessage) {
  const firstLine = String(commitMessage).split('\n')[0];
  const idx = firstLine.indexOf(':');
  if (idx === -1) {
    return firstLine.trim();
  }
  return firstLine.slice(0, idx).trim();
}

function typePrefixMatchesWord(typePrefix, word) {
  const normalizedWord = word.trim();
  if (!normalizedWord) {
    return false;
  }
  if (typePrefix === normalizedWord) {
    return true;
  }
  if (typePrefix.startsWith(normalizedWord)) {
    const next = typePrefix.charAt(normalizedWord.length);
    return next === '!' || next === '(' || next === ' ';
  }
  return false;
}

function hasBreakingChange(commitMessage) {
  if ((/BREAKING[ -]CHANGE/i).test(commitMessage)) {
    return true;
  }
  const typePrefix = getCommitTypePrefix(commitMessage);
  return (/!$/).test(typePrefix);
}

function someCommitMatches(commitMessages, words) {
  return commitMessages.some((commitMessage) => {
    const typePrefix = getCommitTypePrefix(commitMessage);
    return words.some((word) => typePrefixMatchesWord(typePrefix, word));
  });
}

/**
 * Figure out which version change to do.
 */
function analyseVersionChange(majorWording, minorWording, patchWording, rcWording, commitMessages, defaultBump = '') {
  const majorWords = splitWords(majorWording);
  const minorWords = splitWords(minorWording);
  const patchWords = splitWords(patchWording);
  const preReleaseWords = splitWords(rcWording);
  logInfo(`Config words: ${JSON.stringify({ majorWords, minorWords, patchWords, preReleaseWords, defaultBump })}`);

  const mappedCommitMessages = commitMessages.map(getCommitTypePrefix);
  logInfo(`Mapped commit messages: ${JSON.stringify(mappedCommitMessages)}`);

  if (commitMessages.some(hasBreakingChange) || someCommitMatches(commitMessages, majorWords)) {
    return {doMajorVersion: true, doMinorVersion: false, doPatchVersion: false, doPreReleaseVersion: false};
  }
  if (someCommitMatches(commitMessages, minorWords)) {
    return {doMajorVersion: false, doMinorVersion: true, doPatchVersion: false, doPreReleaseVersion: false};
  }
  if (someCommitMatches(commitMessages, patchWords)) {
    return {doMajorVersion: false, doMinorVersion: false, doPatchVersion: true, doPreReleaseVersion: false};
  }
  if (someCommitMatches(commitMessages, preReleaseWords)) {
    return {doMajorVersion: false, doMinorVersion: false, doPatchVersion: false, doPreReleaseVersion: true};
  }

  return applyDefaultBump(defaultBump);
}

function findPreReleaseId(preReleaseWords, commitMessages) {
  const words = Array.isArray(preReleaseWords) ? preReleaseWords : splitWords(preReleaseWords);
  let foundWord = undefined;
  for (const commitMessage of commitMessages) {
    for (const preReleaseWord of words) {
      if (commitMessage.includes(preReleaseWord)) {
        const parts = preReleaseWord.split('-');
        foundWord = parts.length > 1 ? parts[1] : preReleaseWord;
      }
    }
  }
  return foundWord;
}

async function setGitConfigs() {
  await runInWorkspace('git', ['config', 'user.name', process.env.GITHUB_USER || 'Automated Version Bump']);
  await runInWorkspace('git', [
    'config',
    'user.email',
    process.env.GITHUB_EMAIL || 'gh-action-dotnet-bump@users.noreply.github.com',
  ]);
  await runInWorkspace('git', ['fetch']);
}

async function checkoutBranch(branch) {
  try {
    await runInWorkspace('git', ['checkout', branch]);
    return;
  } catch (checkoutError) {
    logInfo(`Local checkout of ${branch} failed (${checkoutError.message || checkoutError}), fetching from origin`);
  }
  await runInWorkspace('git', ['fetch', 'origin', `${branch}:${branch}`]);
  await runInWorkspace('git', ['checkout', branch]);
}

async function configureGithubTokenAuth() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return false;
  }
  const encoded = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
  await runInWorkspace('git', [
    'config',
    '--local',
    'http.https://github.com/.extraheader',
    `AUTHORIZATION: basic ${encoded}`
  ]);
  return true;
}

async function pushChanges(branch, includeTags) {
  const args = ['push', 'origin'];
  if (branch) {
    args.push(`HEAD:${branch}`);
  }
  if (includeTags) {
    args.push('--follow-tags');
  }

  try {
    await runInWorkspace('git', args);
    return;
  } catch (error) {
    logInfo('Push with origin credentials failed; retrying with github-token extraheader');
    const configured = await configureGithubTokenAuth();
    if (!configured) {
      throw error;
    }
  }
  await runInWorkspace('git', args);
}

function resolveCurrentBranch(targetBranch) {
  if (targetBranch) {
    return targetBranch;
  }
  if (process.env.GITHUB_HEAD_REF) {
    return process.env.GITHUB_HEAD_REF;
  }
  if (process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME;
  }
  const ref = process.env.GITHUB_REF || '';
  const match = ref.match(/^refs\/[a-zA-Z]+\/(.*)/);
  return match ? match[1] : '';
}

async function commitChanges({
  newVersion,
  skipCommit,
  skipTag,
  skipPush,
  commitMessageToUse,
  pathToDocument,
  branch,
  tagPrefix = ''
}) {
  if (!skipCommit) {
    if (pathToDocument) {
      await runInWorkspace('git', ['add', '--', pathToDocument]);
    }
    const message = commitMessageToUse.replace(/{{version}}/g, newVersion);
    try {
      await runInWorkspace('git', ['commit', '-m', message]);
    } catch (error) {
      if (!String(error).includes('nothing to commit')) {
        throw error;
      }
      logInfo('Nothing to commit');
    }
  } else {
    logInfo('Skipping commit');
    if (!skipTag) {
      logInfo('Warning: tagging without committing. The tag will point at HEAD, which may not include the version bump.');
    }
  }

  const tagName = `${tagPrefix}${newVersion}`;
  if (!skipTag) {
    await runInWorkspace('git', ['tag', tagName]);
  }

  if (skipPush) {
    return;
  }

  await pushChanges(branch, !skipTag);
}

module.exports = {
  getProjectContent,
  logInfo,
  exitSuccess,
  exitFailure,
  logError,
  runInWorkspace,
  bumpVersion,
  getCommitMessages,
  getRelevantCommitMessages,
  analyseVersionChange,
  analyseVersionPartChange,
  findPreReleaseId,
  setGitConfigs,
  checkoutBranch,
  resolveCurrentBranch,
  commitChanges,
  getCurrentVersionCsproj,
  getNewProjectContentCsproj,
  getCurrentVersionAssembly,
  getNewProjectContentAssembly,
  toFourPartVersion,
  normalizeCurrentVersion,
  applyDefaultBump,
  getCommitTypePrefix,
  hasBreakingChange
};
