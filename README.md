# APILinter

The Spectral VS Code Extension brings the power of [Spectral](https://stoplight.io/open-source/spectral?utm_source=github.com&utm_medium=referral&utm_campaign=github_repo_vs_code_spectral) to your favorite editor.

Spectral is a flexible object linter with out of the box support for [OpenAPI](https://openapis.org/) v2 and v3, [Arazzo](https://www.openapis.org/arazzo), [JSON Schema](https://json-schema.org/), and [AsyncAPI](https://www.asyncapi.com/) v2 and v3.

## Features

- Lint-on-save
- Lint-on-type
- Custom ruleset support (`.spectral.yaml`)
- Support for JSON and YAML input



## Requirements

- Node.js ^12.21 or >=14.13
- Visual Studio Code version 1.48 or higher.

## Installation

- Install from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=stoplight.spectral)
- Install via the CLI: `code --install-extension AlexMancilla.apilinter`

## Extension Settings

This extension contributes the following settings:


- `apilinter.spectralRulesetsFile`: Location of the ruleset file to use when validating. If omitted, the default is a `.spectral.(yaml)` in the same folder as the document being validated. Paths are relative to the workspace.
- `apilinter.validateFiles`: An array of file globs (e.g., `**/*.yaml`) which should be validated by Spectral. If language identifiers are also specified, the file must match both in order to be validated. You can also use negative file globs (e.g., `!**/package.json`) here to exclude files.
- `apilinter.trace.server`: Specify trace level.
				"off",
				"verbose"

## Structure

```
.
├── client // Language Client
│   ├── src
│   │   ├── test // End to End tests for Language Client / Server
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── server // Language Server
    └── src
        └── server.ts // Language Server entry point
```

## Running the Sample

- Run `npm install` in this folder. This installs all necessary npm modules in both the client and server folder
- Open VS Code on this folder.
- Press Ctrl+Shift+B to start compiling the client and server in [watch mode](https://code.visualstudio.com/docs/editor/tasks#:~:text=The%20first%20entry%20executes,the%20HelloWorld.js%20file.).
- Switch to the Run and Debug View in the Sidebar (Ctrl+Shift+D).
- Select `Launch Client` from the drop down (if it is not already).
- Press ▷ to run the launch config (F5).
- In the [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.) instance of VSCode, open a document in 'plain text' language mode.

