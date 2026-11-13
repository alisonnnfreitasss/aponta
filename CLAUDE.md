# Aponta: instructions for Claude

This folder is the Aponta kit. People open it in Claude Code and ask, in any words and any language, to install it ("instala o Aponta pra mim", "install this"). Most of them are not technical: run every command yourself, never ask them to type one, and explain each step in a short plain sentence in their language.

## When the user only gave you the link (the usual case)

They paste the ready prompt ("Instala o Aponta pra mim: https://github.com/alisonnnfreitasss/aponta ...") into Claude Code, often in some other folder.

1. Put the kit in their Documents folder unless they name another one: `~/Documents/Aponta` on macOS and Linux, `%USERPROFILE%\Documents\Aponta` on Windows (in Claude Code's Git Bash: `"$USERPROFILE/Documents/Aponta"`). If that folder already holds Aponta, update it instead (`git pull`).
2. `git clone https://github.com/alisonnnfreitasss/aponta.git <that folder>`. If git is missing or fails, download https://github.com/alisonnnfreitasss/aponta/archive/refs/heads/main.zip and extract it there (Windows: PowerShell `Expand-Archive`; macOS and Linux: `unzip`), so the folder holds `package.json` directly.
3. Work from that folder and follow "Installing" below. Use forward slashes in paths on every system (`C:/Users/...` works for Node and for Git Bash).

## Installing

1. `node src/doctor.mjs` and read the result.
2. If something required is missing, say what and why, and offer to install it for them; ask before running an installer:
   - ffmpeg (optional, only for notes on rendered .mp4 files): Windows `winget install --id Gyan.FFmpeg -e`, macOS `brew install ffmpeg` (only if Homebrew is there), Linux `sudo apt install ffmpeg`. After a winget install the terminal may need restarting before ffmpeg is found: say so.
   - Chrome or Edge: Windows ships with Edge; on macOS, Google Chrome from google.com/chrome.
   - Node.js older than 18: the LTS from nodejs.org.
3. `node scripts/install.mjs`. It runs `npm install` when needed and installs the Aponta skill in `~/.claude/skills/aponta/` with this folder's path in it. Do not move this folder afterwards; if it is moved, run the install again.
   If something fails on their machine (a path, a browser that will not start, a port), read the error, fix it in this folder's code if that is where the cause is, and carry on: they cannot fix it themselves. `node src/doctor.mjs` shows what the machine has.
4. Offer to try it on the example film: `node src/server.mjs exemplo --open` in the background. The example has a typo on purpose ("Apnota"): they can circle it, write a note, click "Mandar para o Claude", paste it here, and watch you fix it.
5. Tell them how to use it from now on, in two sentences: in Claude Code, inside the folder of a video made with HyperFrames, say "abre o Aponta nesse vídeo"; after marking what is wrong, click "Mandar para o Claude" and paste the message (or say "lê minhas notas do Aponta e corrige"). A new Claude Code session picks up the skill.

## Fixing the example's notes

Follow `skill/SKILL.md` ("When the user asks to read and fix the notes"), with `exemplo` as the video folder: `node src/notes.mjs list exemplo`, read each image, fix `exemplo/index.html`, `node src/notes.mjs done exemplo <id> "<what changed>"`.

## Files

- `src/server.mjs`: the page's server (127.0.0.1 only). Reads the video folder, writes only `<folder>/.aponta/`.
- `src/page.html`: the page. `src/capture.mjs`: frame pictures with a headless Chrome or Edge. `src/notes.mjs`: the notes and their command. `src/doctor.mjs`: the checks.
- `skill/SKILL.md`: the skill template (`{{APONTA_DIR}}` is replaced on install).
- `exemplo/`: a 6-second HyperFrames film to try it on.
