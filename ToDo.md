# vclip ToDo

## Context

This app has two distinct modes:

- **Hosted mode** — operates on files that already exist on the host/server filesystem. Improve the path-based workflow; do not add a browser file picker.
- **Local mode** — operates on files selected from the user's machine in the browser via ffmpeg.wasm.

---

## Tasks

Each task has a unique ID, a section tag, and a priority (P1 = highest).

### Hosted Mode

| ID | Priority | Task |
|----|----------|------|
| H3 | P2 | Add saved recent paths so repeat jobs are easy to rerun |
| H4 | P3 | Add drag/drop or paste support only if it maps to a known server-side path source |
| H5 | P2 | Improve ffmpeg job feedback: progress percentage, ETA, and a more readable log view |
| H7 | P2 | Add output presets for common export profiles (high quality, small file, web share) |
| H8 | P3 | Add ffmpeg option controls: output container, video codec, audio codec, scale/crop, copy vs transcode audio |
| H9 | P3 | Add batch clipping — one input produces multiple clips in one session |
| H10 | P3 | Add server-side thumbnail generation and a timeline preview for easier trimming |
| H11 | P3 | Add clip history with rerun, download, and delete actions |
| H12 | P4 | Add authentication and per-user storage for multi-user deployments |

### Local Mode

| ID | Priority | Task |
|----|----------|------|
| L1 | P1 | Add actual clip export in the browser (ffmpeg.wasm), not just ffprobe inspection |
| L3 | P1 | Add a local preview player with scrub, pause, and in/out point controls |
| L4 | P2 | Add frame-step trimming controls and keyboard shortcuts for precise edits |
| L5 | P2 | Add the same export presets as hosted mode where ffmpeg.wasm supports them |
| L6 | P3 | Add local project persistence so file selection and trim settings survive page refreshes |
| L7 | P3 | Add direct file save support where the browser File System Access API allows it |
| L8 | P3 | Add batch clipping for multiple segments from one local file |
| L9 | P3 | Add richer metadata parsing: duration, resolution, fps, and track languages |

### Shared Improvements

| ID | Priority | Task |
|----|----------|------|
| S1 | P1 | Make trim selection a first-class UI flow (timeline/scrubber) instead of manual timestamp entry only |
| S3 | P2 | Show consistent status states across both modes: idle → analyzing → running → done / error |
| S4 | P2 | Add a clearer mode switch explanation so users understand hosted vs local at a glance |
| S5 | P3 | Make logs searchable and copyable |
| S6 | P3 | Add clipboard-friendly output/save path summaries |
| S7 | P2 | Add tests for ffmpeg argument generation and timestamp parsing |
| S8 | P2 | Add tests for subtitle track selection and audio track selection |

### Nice To Have

| ID | Priority | Task |
|----|----------|------|
| N1 | P4 | Persist dark/light theme preference |
| N2 | P4 | Add a compact "advanced options" drawer for power users |
| N3 | P4 | Add an empty state that teaches users how each mode works |
| N4 | P4 | Show file size estimates before export |
| N5 | P4 | Add a shareable job summary for completed clips |

---

## Suggested Implementation Order

1. **L1, L3** — Make local mode capable of exporting clips with a preview player
2. **H5, H7** — Improve hosted path workflow, job feedback, and export controls
3. **S1, S3, H10, L4** — Add timeline preview, trimming UI, and consistent status across both modes
4. **S7, S8, L6, H11** — Add persistence, clip history, and test coverage
5. **N1–N5** — Nice-to-haves last
