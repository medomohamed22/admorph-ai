# Reproduce the local demo

The delivered MP4 is actual isolated-browser footage of the running application, not generated scenes or a simulated provider response. English annotations and the accompanying SRT describe each stage. It is silent. Original browser recordings stay in ignored `releases/demo-recording-work`; only the encoded MP4 and verified screenshots are packaged.

1. Create a local Brand Kit with the bundled Sora sample.
2. Create three local Arabic concepts, review and approve them.
3. Build three editable layouts and show the real gallery.
4. Open the first editor and deliberately clip a long Arabic headline with low contrast.
5. Run measured checks, preview full-resolution before/after images and approve the local repair.
6. Undo/redo and export a real 1080 × 1350 PNG.
7. Show empty-key Settings, lock the session and switch the interface to Arabic.

The demo does not enter real keys, make paid requests, prove live Meta access or claim remote publication. The annotated facts are checked by browser assertions, while `recording.json` records actual chapters, time and output dimensions.

To record again, run the production build locally, install Chrome plus Playwright's FFmpeg (`npx playwright install ffmpeg`) and make system `ffmpeg`/`ffprobe` available. Then run `node scripts/record-demo.mjs`. This overwrites the current demo output; prepare a separate folder if retaining an older recording matters. Recording output is always isolated from browser regression artifacts.
