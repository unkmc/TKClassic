# TK Classic
At some point, Baram released some kind of "Classic" mode. They remastered some of the old graphics from pre-5.0.

This project attempts to extract that remastered frame data from Baram, overwrite the corresponding frames in NTK data files, then pack those files back up so the NTK client can display them. 

![west-gate](https://github.com/unkmc/TKClassic/blob/main/2022-04-27.png)

## Prerequisites
  * The Baram client. This one might be tough, but I know it's out there.
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
  * Clone this repository into a folder somewhere
    * `git clone https://github.com/unkmc/TKClassic.git`
    * `cd TKClassic`
  * Install its dependencies:
    * `npm install`
  * Edit [Configuration.ts](./Configuration.ts)
    * You may need to change `Configuration.baram.dataDirectory` if you don't have a default installation
    * You will probably want to change `Configuration.ntk.datDumpDirectory`. That's where the modified `dat` files will show up.
  * Execute the `classic.ts` script
  * In your `Configuration.ntk.datDumpDirectory` you should see a `custom` folder with a bunch of `dat` files. 
  * In your NTK installation's data directory (default is `C:\Program Files (x86)\KRU\NexusTK\Data`) back up the original `dat` files. I just copied the whole folder into `C:\Program Files (x86)\KRU\NexusTK\Data - Copy`.
  * Copy all of the `dat` files from that `custom` folder into `C:\Program Files (x86)\KRU\NexusTK\Data`
  * 🤞 and start the client.

### Credits
 * Credit for 95% of file file processing logic goes to TKViewer, thanks guys.
 * The rest goes to Erik Rogers. Thanks for leaving your stuff up.
 * J & T

I had to follow these instructions to get fs-ext installed:
https://github.com/nodejs/node-gyp/blob/master/docs/Updating-npm-bundled-node-gyp.md
