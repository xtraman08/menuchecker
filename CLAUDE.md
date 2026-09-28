# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

`menuchecker` is a greenfield repository for a mobile app product. As of this writing, the repository contains no application source code — only this guidance file, a placeholder `README.md`, and the `.github/workflows/` automation that runs Claude Code on issues and pull requests. There is no build system, package manifest, or test suite to run yet.

**When the initial app scaffold is added, update this file** with:
- The chosen framework/toolchain (e.g. React Native/Expo, Flutter, native Android/iOS) and why
- Exact commands to install dependencies, run the app on a simulator/device, lint, type-check, and run tests (including how to run a single test)
- The high-level architecture: how screens/features are organized, where navigation, state management, and API/data layers live, and any conventions that span multiple files

## Working in this repo before the scaffold exists

- Do not invent build, lint, or test commands — none exist yet. Verify commands actually work (e.g. by running them) before documenting them here.
- When proposing the initial project structure, prefer a single, modern, well-supported toolchain over a mix of technologies, and confirm the choice with the repository owner before scaffolding a large amount of code.
- Keep this file's structure (the `# CLAUDE.md` header, a "Commands" section, and an "Architecture" section) once real code lands, replacing the placeholder guidance above.
