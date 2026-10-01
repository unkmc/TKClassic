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
  * Run `npm run classic`. Each run clears and recreates the root `Release/` folder with the modified DAT files.
  * Back up the original DAT files in the NexusTK client's `Data` folder before replacing them with the files from `Release/`.
  * 🤞 and start the client.

To unpack Baram DAT files for inspection, run `npm run extract-baram-dats`. Output defaults to `Dump/baram/`; pass a directory after `--` to use another location. Other inspection scripts use `Dump/baram/` and `Dump/nexus/`. These generated folders and `Release/` are ignored by Git.

Run `npm run documentation` after `npm run classic` to generate the [sprite replacement catalog](./documentation/README.md), with separate pages for body, fan, shield, spear, and sword. Each page compares frame index 6 of affected Nexus sprites with their released replacements and identifies the Baram source frames. Both previews use the Nexus palette. The command reads the existing `Release/` files and stops if a sampled replacement no longer matches the current Baram data.

### Credits
 * Credit for 95% of file file processing logic goes to TKViewer, thanks guys.
 * The rest goes to Erik Rogers. Thanks for leaving your stuff up.
 * J & T

I had to follow these instructions to get fs-ext installed:
https://github.com/nodejs/node-gyp/blob/master/docs/Updating-npm-bundled-node-gyp.md
