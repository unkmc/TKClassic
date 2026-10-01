# TK Classic
At some point, Baram released some kind of "Classic" mode. They remastered some of the old graphics from pre-5.0.

This project attempts to extract that remastered frame data from Baram, overwrite the corresponding frames in NTK data files, then pack those files back up so the NTK client can display them.

![west-gate](https://github.com/unkmc/TKClassic/blob/main/2022-04-27.png)

## Prerequisites
  * The Baram and NexusTK clients, with their `Data` folders available locally.
  * Not required, but a package manager like Chocolatey will make life easier: https://chocolatey.org/
  * Git
    * `choco install git` or
    * https://git-scm.com/download/win
  * Node.js, but I'd recommend using NVM to get it.
    * `choco install nvm` or
    * https://github.com/coreybutler/nvm-windows
  * With NVM installed:
    * `nvm install 16`
  * With npm installed:
    * `npm install -g typescript ts-node`

## Instructions
  * Clone this repository and install its dependencies with `npm install`.
  * Place the Baram client files under `baram/` and the NexusTK client files under `nexus/`, so their data files are in `baram/Data/` and `nexus/Data/`.
  * Run `npm run classic`. Each run clears and recreates the root `Release/` folder with modified body, weapon, monster, riding, and tile DAT files.
  * Back up the original DAT files in the NexusTK client's `Data` folder before replacing them with the files from `Release/`.
  * 🤞 and start the client.

To unpack Baram DAT files for inspection, run `npm run extract-baram-dats`. Output defaults to `Dump/baram/`; pass a directory after `--` to use another location. Other inspection scripts use `Dump/baram/` and `Dump/nexus/`. These generated folders and `Release/` are ignored by Git.

Run `npm run documentation` after `npm run classic` to generate the [sprite replacement catalog](./documentation/README.md), with separate pages for body, fan, shield, spear, and sword. Each page compares frame index 6 of affected Nexus sprites with their released replacements and identifies the Baram source frames. Both previews use the Nexus palette. The command reads the existing `Release/` files and stops if a sampled replacement no longer matches the current Baram data.

Run `npm run export-candidates` to regenerate temporary previews of the remaining classic graphic candidates in `documentation/tmp/`. The index includes unused body and weapon sprites, classic riding and monsters, and samples from each classic tile archive. This output is ignored by Git.

Run `npm run mappings` to regenerate the [classic asset mapping report](./documentation/mappings/README.md). It compares Baram and Nexus monster IDs, animation metadata, tile IDs, object definitions, and palettes without changing `Release/`.

Run `npm run verify-release` after `npm run classic` to check every swapped monster and tile frame, monster DNA, palette assignments, object tile lists, and riding frames against their sources. Monster and tile splices use the same ID on both sides, including the tile IDs listed as pixel-match exceptions in the mapping report.

Run `npm run mob-validation` after `npm run classic` to regenerate the [mob check guide](./documentation/mob-validation.md), which shows released frame 06 images for representative mobs to inspect in the client.

After generating the mapping report and candidate previews, run `npm run validate-mappings` to build temporary [side-by-side visual comparisons](./documentation/tmp/mapping-validation/README.md) for monster IDs, sampled tiles, tile ID exceptions, and riding.

## Packaging v0.1.0

The release scripts require Bash, `unzip`, `sha256sum`, and either `7z` or `zip`; drafting also requires the GitHub CLI (`gh`) with write access to this repository. Packaging uses multithreaded 7-Zip when available. On Windows, run the scripts in an environment that provides those commands, such as WSL.

1. Run `npm run classic` to regenerate `Release/` from the local game data.
2. Run `npm run package-release`. This creates and checks `dist/TKClassic-v0.1.0.zip` and `dist/TKClassic-v0.1.0-original-nexus.zip`, each with a SHA-256 checksum file. The first ZIP contains the replacement DAT files under `Release/`; the second contains the corresponding original files under `nexus/Data/`. Run `npm run package-release:verified` when you also want the full sprite and metadata verification before packaging.
3. Commit the code and documentation, then tag that commit `v0.1.0` and push the commit and tag to GitHub.
4. Run `npm run draft-release`. It runs the full verification, rebuilds both ZIPs, checks the tag and checksums, then uploads both ZIPs and both checksum files to a **draft** GitHub Release with the prepared notes. Review the draft on GitHub before publishing it.

To restore the original graphics from the backup ZIP, copy its `nexus/Data/*.dat` files into the NexusTK client's `Data` folder, replacing the matching files.

GitHub currently limits each Release asset to [under 2 GiB](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). The packaging script checks this limit. The generated ZIP and checksum stay in the ignored `dist/` folder.

### Credits
 * Credit for 95% of file file processing logic goes to TKViewer, thanks guys.
 * The rest goes to Erik Rogers. Thanks for leaving your stuff up.
 * J & T

I had to follow these instructions to get fs-ext installed:
https://github.com/nodejs/node-gyp/blob/master/docs/Updating-npm-bundled-node-gyp.md
