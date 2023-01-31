# gh-action-dotnet-bump
GitHub action which bumps the library version that follows Semantic Versioning.

**Attention**

Make sure you use the `actions/checkout@v2` action!

### Workflow

* Based on the commit messages, increment the version from the latest release.
  * If the string "BREAKING CHANGE", "major" or the Attention pattern `refactor!: drop support for Node 6` is found anywhere in any of the commit messages or descriptions the major
    version will be incremented.
  * If a commit message begins with the string "feat" or includes "minor" then the minor version will be increased. This works
    for most common commit metadata for feature additions: `"feat: new API"` and `"feature: new API"`.
  * If a commit message contains the word "pre-alpha" or "pre-beta" or "pre-rc" then the pre-release version will be increased (for example specifying pre-alpha: 1.6.0-alpha.1 -> 1.6.0-alpha.2 or, specifying pre-beta: 1.6.0-alpha.1 -> 1.6.0-beta.0)
  * All other changes will increment the patch version.
* Push the bumped version back into the repo.
* Push a tag for the new version back into the repo.

### Usage:


#### **wording:** 
Customize the messages that trigger the version bump. It must be a string, case sensitive, coma separated  (optional). Example:
```yaml
- name:  'Automated Version Bump'
  uses:  '@joneja09/gh-action-dotnet-bump@main'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    minor-wording:  'add,Adds,new'
    major-wording:  'MAJOR,cut-major'
    patch-wording:  'patch,fixes'     # Providing patch-wording will override commits
                                      # defaulting to a patch bump.
    rc-wording:     'RELEASE,alpha'
```
#### **default:**
Set a default version bump to use  (optional - defaults to patch). Example:
```yaml
- name:  'Automated Version Bump'
  uses:  '@joneja09/gh-action-dotnet-bump@main'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    default: prerelease
```

#### **version-part:**
Override to choose the specific version segment to bump.  Example:
```yaml
- name:  'Automated Version Bump'
  uses:  '@joneja09/gh-action-dotnet-bump@main'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    version-part: 'Patch'
```

#### **pre-id:**
Set a pre-id value will building prerelease version  (optional - defaults to 'rc'). Example:
```yaml
- name:  'Automated Version Bump'
  uses:  '@joneja09/gh-action-dotnet-bump@main'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    default: prerelease
    pre-id: 'prc'
```

#### **tag-prefix:**
Prefix that is used for the git tag  (optional). Example:
```yaml
- name:  'Automated Version Bump'
  uses:  '@joneja09/gh-action-dotnet-bump@main'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    tag-prefix:  'v'
```

#### **skip-tag:**
The tag is not added to the git repository  (optional). Example:
```yaml
- name:  'Automated Version Bump'
  uses:  '@joneja09/gh-action-dotnet-bump@main'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    skip-tag:  'true'
```

#### **skip-commit:**
No commit is made after the version is bumped (optional). Must be used in combination with `skip-tag`, since if there's no commit, there's nothing to tag. Example:
```yaml
- name:  'Automated Version Bump'
  uses:  '@joneja09/gh-action-dotnet-bump@main'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    skip-commit:  'true'
    skip-tag: 'true'
```

#### **skip-push:**
If true, skip pushing any commits or tags created after the version bump (optional). Example:
```yaml
- name:  'Automated Version Bump'
  uses:  '@joneja09/gh-action-dotnet-bump@main'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    skip-push:  'true'
```

#### **TARGET-BRANCH:**
Set a custom target branch to use when bumping the version. Useful in cases such as updating the version on main after a tag has been set (optional). Example:
```yaml
- name:  'Automated Version Bump'
  uses:  '@joneja09/gh-action-dotnet-bump@main'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    target-branch: 'main'
```

#### **commit-message:**
Set a custom commit message for version bump commit. Useful for skipping additional workflows run on push. Example:
```yaml
- name:  'Automated Version Bump'
  uses:  '@joneja09/gh-action-dotnet-bump@main'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    commit-message: 'CI: bumps version to {{version}} [skip ci]'
```

### **Parameter Options**
#### type 
> Which type of project are you bumping version for? This is important as .NET Core projects store versions in .csproj files, and .NET framework use AssemblyInfo.cs. Options [csproj, assembly], Default: csproj

#### tag-prefix
> Prefix that is used for the git tag. Default: ''

#### patch-wording
> Words list that trigger a patch version bump.  Use "," to separate multiple words.  Default: 'fix'

#### minor-wording
> Words list that trigger a minor version bump.  Use "," to separate multiple words.  Default: 'feat'

#### major-wording
> Words list that trigger a major version bump.  Use "," to separate multiple words.  Default: 'feat!,fix!,refactor!'

#### version-part
> This indicates which version part to bump.  If specified, it will force bump on that segment. Options [Major | Minor | Patch], Default: ''

#### version-override
> The version to change the project version to.  If specified, it will force setting the project to the supplied version.

#### release-candidate-wording
> Words list that trigger a release candidate version bump. Use "," to separate multiple words. Default: 'next'

#### skip-tag
> Avoid to add a TAG to the version update commit. Options [true, false], Default: true

#### skip-commit
> Avoid to add a commit after the version is bumped. Options [true, false], Default: false

#### skip-push
> If true, skip pushing any commits or tags created after the version bump. Options [true, false], Default: false

#### path-to-file
> (Required) Path to the csproj file where the version is located.

#### target-branch
> A separate branch to perform the version bump on.  Default: ''

#### pre-release-id
> Set a custom id for prerelease build.  Default: 'next'

#### commit-message
> Set a custom commit message for version bump commit. Use {{version}} as a placeholder for the new version.  Default: 'ci: version bump to {{version}}'

#### dry-run
> Allows running the action without modifying the file and committing changes.

#### release-commit-message-regex
> Set a custom commit message regex for release commits. Use {{version}} as a placeholder for the new version.  Default: 'ci: version bump to {{version}}'
