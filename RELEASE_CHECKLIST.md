# Release Checklist — nano-recommender

This checklist outlines the steps to verify, build, package, and publish **nano-recommender** to npm and GitHub.

---

## 1. Pre-Release Verification

Before tagging or publishing, verify the integrity of the codebase:

- [ ] **Clean Workspace**: Ensure there are no uncommitted changes in the git repository:
  ```bash
  git status
  ```
- [ ] **Dependencies Status**: Ensure all dependencies are installed and up-to-date:
  ```bash
  npm install
  ```
- [ ] **Type & Compile Checks**: Compile the project using `tsup` to make sure there are no TypeScript errors:
  ```bash
  npm run build
  ```
- [ ] **Tests Verification**: Run the unit and integration test suite to ensure all tests pass:
  ```bash
  npm test
  ```
- [ ] **Benchmark Execution**: Run the benchmarks to verify that performance remains optimal:
  ```bash
  npm run benchmark
  ```

---

## 2. Versioning & Metadata Check

Confirm that the release package metadata is accurate:

- [ ] **Verify Version**: Check `package.json` version matches the intended release (e.g., `"version": "1.0.0"`).
- [ ] **Verify Package Exports**: Ensure that `package.json` contains valid ESM/CJS exports pointing to `dist/index.js` and `dist/index.cjs`.
- [ ] **Verify CHANGELOG**: Ensure `CHANGELOG.md` is updated with the version release notes under a release date section.
- [ ] **Verify LICENSE**: Check that the `LICENSE` file contains the correct year and copyright holders.

---

## 3. Local Packaging Dry-Run

Verify the packaged bundle content to ensure only correct files are published:

- [ ] **Dry-Run Package**: Run the dry-run packaging command:
  ```bash
  npm pack --dry-run
  ```
- [ ] **Inspect Packaged Files**: Confirm that the list of included files only contains the compiled files and essential documentation:
  - `dist/index.js` (ESM Entry)
  - `dist/index.cjs` (CJS Entry)
  - `dist/index.d.ts` (Types)
  - `dist/index.d.cts` (CJS Types)
  - `dist/index.js.map` (Source maps)
  - `dist/index.cjs.map` (Source maps)
  - `package.json`
  - `README.md`
  - `LICENSE`
  - `CHANGELOG.md`
- [ ] **Verify Excluded Files**: Ensure internal directories like `src/`, `benchmarks/`, `node_modules/`, and configuration files (like `tsup.config.ts`, `tsconfig.json`) are excluded from the distribution package.

---

## 4. Publish to npm Registry

Follow these steps to publish the package:

- [ ] **npm Registry Authentication**: Ensure you are authenticated to publish on npm:
  ```bash
  npm whoami
  ```
  If not logged in, run:
  ```bash
  npm login
  ```
- [ ] **Publish Package**: Publish the library to the npm registry:
  - For standard public package:
    ```bash
    npm publish --access public
    ```
  - For scoped/private package (if applicable):
    ```bash
    npm publish
    ```

---

## 5. Post-Release & Git Tagging

Lock the release version in Git and synchronize with the remote repository:

- [ ] **Commit Version Changes**: Commit any final version bumps:
  ```bash
  git add package.json CHANGELOG.md
  git commit -m "chore(release): v1.0.0"
  ```
- [ ] **Tag the Version**: Create a Git tag corresponding to the release version:
  ```bash
  git tag -a v1.0.0 -m "Release v1.0.0"
  ```
- [ ] **Push to GitHub**: Push the commits and tags to the remote repository:
  ```bash
  git push origin main --tags
  ```
- [ ] **Post-Release Verify**: Verify that the package has been published and can be viewed at:
  `https://www.npmjs.com/package/nano-recommender`
