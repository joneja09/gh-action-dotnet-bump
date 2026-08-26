const core = require('@actions/core');
const bumpVersion = require('./bumper');
const { exitSuccess, logError, exitFailure } = require('./utils');

function readBooleanInput(name, fallback) {
  const raw = core.getInput(name);
  if (raw === '') {
    return fallback;
  }
  return core.getBooleanInput(name);
}

(async () => {
  try {
    const githubToken = core.getInput('github-token');
    if (githubToken && !process.env.GITHUB_TOKEN) {
      process.env.GITHUB_TOKEN = githubToken;
    }

    const result = await bumpVersion({
      tagPrefix: core.getInput('tag-prefix'),
      minorWording: core.getInput('minor-wording'),
      majorWording: core.getInput('major-wording'),
      patchWording: core.getInput('patch-wording'),
      versionPart: core.getInput('version-part'),
      rcWording: core.getInput('release-candidate-wording'),
      skipTag: readBooleanInput('skip-tag', true),
      skipCommit: readBooleanInput('skip-commit', false),
      skipPush: readBooleanInput('skip-push', false),
      pathToDocument: core.getInput('path-to-file'),
      targetBranch: core.getInput('target-branch'),
      preReleaseId: core.getInput('pre-release-id'),
      commitMessageToUse: core.getInput('commit-message'),
      releaseCommitMessageRegex: core.getInput('release-commit-message-regex') || core.getInput('commit-message'),
      type: core.getInput('type') || 'csproj',
      dryRun: readBooleanInput('dry-run', false),
      versionOverride: core.getInput('version-override'),
      defaultBump: core.getInput('default')
    });

    core.setOutput('wasBumped', result.wasBumped);
    if (result.oldVersion) {
      core.setOutput('oldVersion', result.oldVersion);
    }
    if (result.newVersion) {
      core.setOutput('newVersion', result.newVersion);
    }

    if (result.wasBumped) {
      exitSuccess('Version bumped!');
      return;
    }
    exitSuccess('No version bump was necessary.');
  } catch (err) {
    logError(err);
    core.setFailed(err.message || 'Failed to bump version');
    exitFailure('Failed to bump version');
  }
})();
