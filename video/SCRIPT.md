# GridWise LLM — demo video script

Total runtime: 170 seconds (2:50). The video shows each line as a subtitle while
its scene plays. Read the subtitle text aloud at a calm pace; the scene window
gives you the time budget. Record one take per scene if that is easier — the
audio can be stitched per scene.

| Scene | Window | Lines (read these) |
|---|---|---|
| 1 | 0:00-0:08 | GridWise LLM. One API that turns plain operator notes into a valid, low cost, 24 hour energy schedule. |
| 2 | 0:08-0:23 | A smart campus runs on grid power, rooftop solar, and a battery. Demand, sunlight, and price change hourly. Operators send short notes. Our job: understand the notes, respect the physics, minimize the cost. |
| 3 | 0:23-0:36 | The contract is two endpoints. Health returns status ok. Optimize-energy takes the scenario and notes, and returns the interpretation plus a full 24 hour plan. |
| 4 | 0:36-0:54 | The pipeline has six stages. Validate the request. Interpret the notes with a language model. Check the output with deterministic guardrails. Fold the directives into constraints. Solve a linear program. Then verify the plan before responding. |
| 5 | 0:54-1:16 | The model only handles language. A note like "solar drops to 20 percent between 1 and 3 PM" becomes a structured directive with hours and a factor. Every output passes guardrails: known types, sorted hours, valid numbers. Fail, and the model is re-prompted with the exact error. |
| 6 | 1:16-1:32 | Three Gemini models answer in parallel. OpenRouter follows two and a half seconds later as a hedge. The first valid response wins. Repeat scenarios skip the model entirely through a per-isolate cache. |
| 7 | 1:32-1:50 | The optimizer is exact. A 120-variable linear program minimizes grid cost under every rule: balance, battery dynamics, rate limits, solar caps, directive windows, and end of day neutrality. It solves in 2 milliseconds and matches the reference optimum on all ten public cases. |
| 8 | 1:50-2:06 | Nothing leaves unchecked. A replay verifier mirrors the judge. It replays the plan hour by hour against every directive and every rule. The totals in the response are recomputed from the plan itself. |
| 9 | 2:06-2:24 | Here is a live call against the deployed worker. The notes describe panel washing and a reserve. Both are interpreted correctly, and the plan comes back at the exact optimal cost in about one and a half seconds. |
| 10 | 2:24-2:38 | The harness runs all ten public cases against the live API. Ten passed, zero failed, with a cost ratio of exactly one on every case. |
| 11 | 2:38-2:50 | Deployed on Cloudflare Workers. Docker fallback on Docker Hub. Everything reproducible from the README. Thank you for watching. |

## Recording notes

- Total: 170 seconds of video. Leave a half second of silence at the very start
  if you can; it makes alignment easier.
- Any common format works for the recording (m4a, mp3, wav). Phone or laptop mic
  is fine.
- If a line runs long, read a touch faster rather than skipping words; the
  subtitle stays up for the whole scene window.
- After recording, hand over the audio file. It gets muxed with the rendered
  video using ffmpeg: `ffmpeg -i video.mp4 -i audio.m4a -c:v copy -c:a aac -shortest final.mp4`.
