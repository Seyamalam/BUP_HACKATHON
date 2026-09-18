# GridWise LLM — demo video script (v3)

Total runtime: 163 seconds (2:43). Team: **Huntrix**.
Each subtitle stays up for its whole scene window, which is your time budget.
Read at a calm pace; trim pauses, not words.

| Scene | Window | Lines (read these) |
|---|---|---|
| 1 | 0:00-0:06 | GridWise LLM, by Team Huntrix. Operator notes in, optimal energy schedules out. |
| 2 | 0:06-0:34 | Demo first. This is a live benchmark against the production API. Ten repeat requests: the interpretation cache answers all ten, median 172 milliseconds. Ten brand new notes: each one runs the full language model path, median 1.7 seconds. Twenty requests, twenty 200s. The judge allows thirty seconds per call. |
| 3 | 0:34-0:46 | The problem: a campus on grid power, rooftop solar, and a battery. Operators send notes in plain English. The service must understand the note, respect every energy rule, and minimize grid cost. |
| 4 | 0:46-1:04 | The interpretation path, in the real code. Every request races the first model of two providers; the rest hedge behind. And before anything is trusted, guardrails check the output: known types, sorted hours, valid numbers. |
| 5 | 1:04-1:22 | Then the math. The optimizer builds a linear program: balance, dynamics, caps, and day-end neutrality. And the verifier replays the finished plan against every rule the judge runs, before anything leaves. |
| 6 | 1:22-1:44 | Now the fun part. We are students. Free tiers are the budget. So every request races the first free model of two providers at once; the next in each chain hedges two and a half seconds behind. First valid answer wins. And a repeat scenario skips every model through the cache. |
| 7 | 1:44-2:02 | The API documents itself. The OpenAPI spec lives at /openapi.json, rendered by Scalar at /docs: every endpoint, every field, every enum, served by the same worker the judge calls. |
| 8 | 2:02-2:18 | The optimizer is exact math, not a heuristic. Charge and discharge are netted into one clean battery action per hour. Solve time is about two milliseconds. It matches the reference optimum on all ten public cases, ratio one point zero. |
| 9 | 2:18-2:34 | And the proof, unedited: all ten public cases against the live worker. Interpretation matches ground truth, plans replay clean, cost ratio one point zero on every case. |
| 10 | 2:34-2:43 | GridWise LLM. Cloudflare Workers, Docker on Docker Hub, everything reproducible from the README. Team Huntrix, thanks for watching. |

## Recording notes

- Total: 163 seconds of video. Leave a half second of silence at the start.
- Any common audio format works (m4a, mp3, wav). Phone or laptop mic is fine.
- Scenes 4 and 5 are the code cards: slow down a touch there, they carry the
  technical weight of the video.
- After recording, hand over the file. It gets muxed with ffmpeg:
  `ffmpeg -i video.mp4 -i audio.m4a -c:v copy -c:a aac -shortest gridwise-final.mp4`.
