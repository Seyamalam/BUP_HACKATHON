# Snapshot Frame Descriptions

**Question asked:** 

Compare each description against your storyboard spec. A "black frame" or "loading screen" for a content beat is a bug.

## frame-00-at-3s.png
Based on the image provided, here is a summary of the project:

*   **Project Name:** GridWise LLM
*   **Purpose:** Smart Campus Energy Optimization
*   **Team:** Team Huntrix
*   **Context:** BUP CSE Fest 2026
*   **Core Functionality:** The system is designed to take operator notes as input and output optimal energy schedules, likely using a Large Language Model (LLM) to process operational constraints or requirements and convert them into efficient energy usage plans.

## frame-01-at-18s.png
Based on the benchmark results provided in the image, here is an analysis of the "GridWise" system's performance:

### Performance Summary
The benchmark compares two scenarios, both returning a "200 OK" status for every request:

**1. Cached Performance ("10x cached")**
*   **Context:** These requests use identical bodies, triggering interpretation cache hits.
*   **Latency:** After an initial cold-start latency of 2106 ms, subsequent requests are extremely fast, ranging between **158 ms and 184 ms**.
*   **Median/Mean:** The median latency is **172 ms**, demonstrating high efficiency when the cache is utilized.

**2. Cold Performance ("10x cold")**
*   **Context:** These requests use unique notes, forcing the system to execute the full Large Language Model (LLM) processing path.
*   **Latency:** Latencies consistently fall in the **1.4s to 1.7s range** (1423 ms – 1714 ms).
*   **Median:** The median latency is approximately **1.7s**,

## frame-02-at-60s.png
This image outlines the architecture of a system designed to process energy-related requests through a multi-stage pipeline, likely for optimizing battery or grid management.

### The Six Stages
The workflow is structured into a linear sequence of six steps:

1.  **Validate request:** Ensures the initial request is properly formatted and legitimate.
2.  **LLM interprets notes:** Uses a Large Language Model to translate natural language notes or instructions into a structured format.
3.  **Guardrails check:** Applies strict logical filters to ensure the interpreted data is safe and feasible.
4.  **Fold constraints:** Aggregates the various constraints into a format suitable for mathematical optimization.
5.  **Solve LP:** Executes a Linear Programming (LP) solver to find the optimal energy schedule.
6.  **Verify plan:** Confirms that the resulting schedule adheres to all operational rules.

### Detailed Operational Logic
The image provides specific insights into the two most critical stages:

*   **Guardrails Reject (Stage 03):** This acts as a quality control filter. It blocks requests that contain:
    *   Unknown directive types.
    *   Unsorted or out-of-

## frame-03-at-92s.png
This image describes an engineering strategy for building AI applications with zero costs by leveraging free tiers of various AI services.

Here is a breakdown of the "Squeezing every free tier" approach:

### The Architecture: A Multi-Stage Race
The core concept is to trigger a "race" between multiple AI models and providers to get the fastest or most reliable response without paying.

1.  **Stage 1: Immediate Start ($t=0$ ms)**
    *   **AI Gateway:** Sends the request to seven different free AI models simultaneously via the Vercel AI SDK.
    *   **Gemini:** Simultaneously queries three Gemini variants (3.8, 3.7, and 3.5-lite) with specific instructions to prioritize data extraction over long-form writing.
2.  **Stage 2: The Backup ($t=+2.5$ s)**
    *   **OpenRouter:** A "hedged fallback" request is sent after a 2.5-second delay. If the initial fast models haven't provided a valid answer, OpenRouter serves as a secondary source.
3.  **The "Winner" Logic:**

## frame-04-at-110s.png
Based on the image provided, here is a breakdown of the API endpoint details:

### **Endpoint: `/optimize-energy`**
*   **Method:** POST
*   **Description:** "Interpret operator notes and optimize the 24-hour schedule."

### **Request Body Structure**
The request expects a JSON object containing the following parameters:

1.  **`battery` (Object):** Required. Contains energy storage constraints:
    *   `capacity_kwh`
    *   `initial_energy_kwh`
    *   `min_energy_kwh`
    *   `max_charge_kwh_per_hour`
    *   `max_discharge_kwh_per_hour`
2.  **`hours` (Array of Objects):** Required. An array of 24 objects (one for each hour), each containing:
    *   `hour`
    *   `demand_kwh`
    *   `solar_kwh`
    *   `tariff_bdt_per_kwh`
3.  **`operator_notes` (Array of Strings

## frame-05-at-150s.png
The image displays a status report or system output summary, likely from a software evaluation or performance benchmarking tool. Here is a breakdown of the information presented:

### **Top Section (Evaluation Metrics)**
*   **Public Cases:** 10 out of 10 passed, with a "cost ratio" of 1.0000 per case.
*   **Interpretation:** Successfully matched the "ground truth" on every note.
*   **Plan Validation:** The generated plan was confirmed to be valid under both "our" (the system's) and the "judge's" directives.
*   **Live Requests:** 20 out of 20 passed.
*   **Latency Performance:**
    *   **Cold:** ~2 seconds (the time taken for a request when the system is not primed/cached).
    *   **Cached:** ~172 milliseconds (the speed once the system has stored results).
*   **Final Summary:** "10 passed, 0 failed."

### **Bottom Section (Narrative Summary)**
The text below reiterates the findings in a sentence format: 
"Results. Ten public cases, ten

## frame-06-at-160.05s.png
Based on the image provided, here are the details about the project:

*   **Project Name:** GridWise LLM
*   **Team Name:** Team Huntrix
*   **Deployment/Code Links:**
    *   **Cloudflare Workers:** [gridwise-llm.seyamalam41.workers.dev](https://gridwise-llm.seyamalam41.workers.dev)
    *   **Docker Hub:** [docker.io/touhidulalam41/gridwise-llm](https://hub.docker.com/r/touhidulalam41/gridwise-llm)
*   **Technologies Used:** Cloudflare Workers, Docker.
*   **Accessibility:** The project is noted as being "everything reproducible from the README."
