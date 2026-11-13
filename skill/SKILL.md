---
name: aponta
description: "Aponta: the user watches a HyperFrames video live from its code (no render), circles what is wrong on a frame and writes one line; Claude reads those notes with their pictures and fixes the code. Use when the user says \"abre o Aponta\", \"abre o Aponta nesse vídeo\", \"abrir o Aponta\", \"lê minhas notas\", \"lê minhas notas do Aponta e corrige\", \"corrige as notas\", \"open Aponta\", \"read my Aponta notes\", or pastes a message that starts with \"Lê minhas notas do Aponta\"."
---

# Aponta

The Aponta kit is installed at `{{APONTA_DIR}}`. Answer the user in the language they write in.

## When the user asks to open Aponta

1. The video folder is the folder the user names; otherwise the current working directory. It should hold HyperFrames compositions (`.html` files with `data-composition-id`) or rendered videos. If it holds neither, say so and ask which folder.
2. Start the page with the Bash tool in the background (`run_in_background: true`):
   `node "{{APONTA_DIR}}/src/server.mjs" "<video folder>" --open`
   It prints the address (http://127.0.0.1:8840, or the next free port) and opens the browser. If it says Aponta is already open for that folder, it reopens the browser tab.
3. Tell the user, briefly: play or step frame by frame with the arrow keys, draw on the frame (the video pauses), write one line, press Enter; when done, click "Mandar para o Claude" and paste the message here.

## When the user asks to read and fix the notes

1. List the open notes (the folder is in the pasted message):
   `node "{{APONTA_DIR}}/src/notes.mjs" list "<video folder>"`
2. Open every `imagem` (the whole frame with the user's red drawing) and `recorte` (the drawn area, clean) with the Read tool before changing anything. The drawing shows what the note is about.
3. Fix the composition named in the note at that time. A note that says `dentro de <file> em <time>` is about that sub-composition at that local time: fix that file.
4. After each fix, close the note with one line, in the user's language, on what changed:
   `node "{{APONTA_DIR}}/src/notes.mjs" done "<video folder>" <id> "<what changed>"`
5. Do not render. The page reloads by itself on the same frame when the files change, and closed notes move to the "Conferir" tab, where the user approves or reopens them. Render only when the user asks, with their usual HyperFrames command.

## Good to know

- If the user says a fix did not land, first check the file on disk: the HyperFrames Studio's Undo, if it is open, reverts changes made outside it.
- A note with `imagem: failed: ...` has no picture: rely on the time, the frame number and the text.
- `node "{{APONTA_DIR}}/src/doctor.mjs"` says what the computer is missing.
