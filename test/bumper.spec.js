const fs = require('fs');
const bumper = require('../src/bumper');
const utils = require('../src/utils');

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      writeFile: jest.fn().mockResolvedValue()
    }
  };
});

jest.mock('../src/utils', () => {
  const actual = jest.requireActual('../src/utils');
  return {
    ...actual,
    getCommitMessages: jest.fn(),
    setGitConfigs: jest.fn().mockResolvedValue(),
    checkoutBranch: jest.fn().mockResolvedValue(),
    commitChanges: jest.fn().mockResolvedValue(),
    getProjectContent: jest.fn()
  };
});

const sampleCsproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Version>1.2.3</Version>
  </PropertyGroup>
</Project>
`;

function baseOptions(overrides = {}) {
  return {
    tagPrefix: '',
    minorWording: 'feat,feature',
    majorWording: 'feat!,fix!,refactor!',
    patchWording: 'fix',
    versionPart: '',
    rcWording: 'next',
    skipTag: true,
    skipCommit: false,
    skipPush: false,
    pathToDocument: 'src/Lib/Lib.csproj',
    targetBranch: '',
    preReleaseId: 'next',
    commitMessageToUse: 'ci: version bump to {{version}}',
    type: 'csproj',
    dryRun: false,
    versionOverride: '',
    releaseCommitMessageRegex: 'ci: version bump to {{version}}',
    defaultBump: 'patch',
    ...overrides
  };
}

describe('bumper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, GITHUB_WORKSPACE: '', GITHUB_TOKEN: 'token' };
    utils.getProjectContent.mockReturnValue(sampleCsproj);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('sets an explicit version override', async () => {
    const result = await bumper(baseOptions({ versionOverride: '4.0.0' }));

    expect(result).toEqual({wasBumped: true, oldVersion: '1.2.3', newVersion: '4.0.0'});
    expect(fs.promises.writeFile).toHaveBeenCalled();
    expect(utils.commitChanges).toHaveBeenCalledWith(expect.objectContaining({
      newVersion: '4.0.0',
      pathToDocument: 'src/Lib/Lib.csproj'
    }));
    expect(utils.getCommitMessages).not.toHaveBeenCalled();
  });

  test('rejects an invalid version override', async () => {
    await expect(bumper(baseOptions({ versionOverride: 'not-a-version' }))).rejects.toThrow('not a valid semantic version');
  });

  test('rejects an unsupported project type', async () => {
    await expect(bumper(baseOptions({ type: 'json' }))).rejects.toThrow('Unsupported type');
  });

  test('throws when the project file has no version', async () => {
    utils.getProjectContent.mockReturnValue('<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup /></Project>');
    await expect(bumper(baseOptions({ versionOverride: '1.0.0' }))).rejects.toThrow('Could not find a current version');
  });

  test('forces a version-part bump without reading commits', async () => {
    const result = await bumper(baseOptions({ versionPart: 'minor' }));

    expect(result).toEqual({wasBumped: true, oldVersion: '1.2.3', newVersion: '1.3.0'});
    expect(utils.getCommitMessages).not.toHaveBeenCalled();
  });

  test('bumps from conventional commit messages', async () => {
    utils.getCommitMessages.mockResolvedValue(['feat: add widgets\n']);

    const result = await bumper(baseOptions());

    expect(result).toEqual({wasBumped: true, oldVersion: '1.2.3', newVersion: '1.3.0'});
  });

  test('skips when the latest commit is already a bump', async () => {
    utils.getCommitMessages.mockResolvedValue(['ci: version bump to 1.2.3\n', 'feat: add widgets\n']);

    const result = await bumper(baseOptions());

    expect(result).toEqual({wasBumped: false, oldVersion: '1.2.3', newVersion: null});
    expect(fs.promises.writeFile).not.toHaveBeenCalled();
    expect(utils.commitChanges).not.toHaveBeenCalled();
  });

  test('does not write or commit during a dry run', async () => {
    const result = await bumper(baseOptions({ versionOverride: '2.0.0', dryRun: true }));

    expect(result).toEqual({wasBumped: true, oldVersion: '1.2.3', newVersion: '2.0.0'});
    expect(fs.promises.writeFile).not.toHaveBeenCalled();
    expect(utils.setGitConfigs).not.toHaveBeenCalled();
    expect(utils.commitChanges).not.toHaveBeenCalled();
  });

  test('checks out a target branch before reading the project file', async () => {
    const callOrder = [];
    utils.checkoutBranch.mockImplementation(async () => {
      callOrder.push('checkout');
    });
    utils.getProjectContent.mockImplementation(() => {
      callOrder.push('read');
      return sampleCsproj;
    });

    await bumper(baseOptions({ versionOverride: '2.0.0', targetBranch: 'release' }));

    expect(utils.checkoutBranch).toHaveBeenCalledWith('release');
    expect(callOrder).toEqual(['checkout', 'read']);
    expect(utils.commitChanges).toHaveBeenCalledWith(expect.objectContaining({
      branch: 'release',
      tagPrefix: ''
    }));
  });

  test('uses the default bump when no wording matches', async () => {
    utils.getCommitMessages.mockResolvedValue(['chore: housekeeping\n']);

    const result = await bumper(baseOptions({ defaultBump: 'patch' }));

    expect(result).toEqual({wasBumped: true, oldVersion: '1.2.3', newVersion: '1.2.4'});
  });

  test('normalizes four-part versions before bumping', async () => {
    utils.getProjectContent.mockReturnValue(`<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <Version>1.2.3.0</Version>
  </PropertyGroup>
</Project>`);

    const result = await bumper(baseOptions({ versionPart: 'patch' }));

    expect(result).toEqual({wasBumped: true, oldVersion: '1.2.3', newVersion: '1.2.4'});
  });

  test('can disable the default bump', async () => {
    utils.getCommitMessages.mockResolvedValue(['chore: housekeeping\n']);

    const result = await bumper(baseOptions({ defaultBump: 'none' }));

    expect(result).toEqual({wasBumped: false, oldVersion: '1.2.3', newVersion: null});
  });
});
