# Snapshot Frame Descriptions

**Question asked:** 

Compare each description against your storyboard spec. A "black frame" or "loading screen" for a content beat is a bug.

## frame-00-at-4s.png
Based on the image provided, here is a summary of the project:

*   **Project Name:** GridWise LLM
*   **Purpose:** Smart Campus Energy Optimization
*   **Core Function:** It is an API designed to convert plain-language operator notes into a valid, cost-optimized, 24-hour energy schedule.
*   **Context:** This project is for the "BUP CSE Fest 2026 – Preliminary Round."

## frame-01-at-16s.png
This is a classic **energy management optimization problem**. To solve this effectively for your "smart campus," you need to build a model that balances three variables (Grid, Solar, Battery) across a 24-hour cycle while adhering to specific constraints.

Here is a breakdown of how you should approach this:

### 1. The Core Constraints (The "Rules")
*   **Solar:** This is your "free" generation. Because you have a note that output drops to 20% between 1 PM and 3 PM, you must adjust your solar generation curve accordingly. Any solar generated beyond your campus demand is "lost" unless it is stored in the battery.
*   **Battery:** This is your buffer.
    *   **Physics constraint:** You cannot create energy, only shift it. 
    *   **Boundary constraint:** The state-of-charge (SoC) at the end of hour 24 must equal the SoC at the beginning of hour 1 (the prompt says, "Must end the day where it started").
*   **Grid:** This is your variable cost. Since the price changes hourly, you want to shift your battery usage to

## frame-02-at-45s.png
This architecture diagram outlines a six-stage pipeline designed to combine Large Language Models (LLMs) with deterministic optimization (specifically Linear Programming) while minimizing the risks of LLM hallucinations.

### The Six Stages Explained:

1.  **Validate request:** Ensures the incoming query is structured correctly and is appropriate for the system to handle before processing begins.
2.  **LLM interprets notes:** A language model parses unstructured user input or notes to extract intent and parameters.
3.  **Guardrails check:** Before the information is used in calculation, it passes through "deterministic guardrails"—a programmatic filter that checks the LLM's output against predefined rules to ensure it is safe, logical, and within expected boundaries.
4.  **Fold constraints:** The interpreted data and checked guardrails are converted into mathematical constraints (the rules the system must follow).
5.  **Solve LP:** The system uses a solver to perform **Linear Programming (LP)**. This is the core "math" engine, which finds the mathematically optimal solution based on the constraints provided in the previous step.
6.  **Verify plan:** Before the result is sent back to the user, the proposed plan is audited to

## frame-03-at-65s.png
This image illustrates a **system architecture for converting natural language inputs into structured data** (often referred to as "Language in, Structure out"). It describes a reliable pipeline for parsing human-written operator notes into machine-readable directives.

Here is a breakdown of the key components shown:

### 1. The Core Process
*   **Input:** An unstructured "Operator note," such as: *"Solar output will drop to about 20% from 1 PM to 3 PM."*
*   **Transformation:** An AI model parses this text and converts it into a structured JSON-like format:
    `{"directive_type": "solar_reduction", "hours": [13, 14], "factor": 0.2}`
    *   This shows the model correctly maps "1 PM to 3 PM" to the 24-hour clock `[13, 14]` and translates "20%" into the numerical factor `0.2`.

### 2. The Guardrails (Validation)
The system ensures reliability by running the model's output through a strict validation layer (guardrails). These rules ensure:
*   **

## frame-04-at-135s.png
This image displays a "LIVE DEMO" of an API call to an energy optimization service.

Here is a breakdown of the information shown:

*   **The Technical Execution:** The terminal snippet shows a `curl` command sending a JSON payload (`sample-01.json`) to an API endpoint hosted on Cloudflare Workers (`gridwise-llm.seyamalam41.workers.dev/optimize-energy`).
*   **The Response:** The server returned an `HTTP 200` success code in `1.5s`. The response JSON provides an array under `directive_interpretation` containing:
    *   `"solar_reduction"` at hours 12 and 13 with a factor of `0.25`.
    *   A `"no_op"` (no operation) directive.
    *   A calculated `"total_cost_bdt"` of `38365.00`, identified as the "exact optimal cost."
*   **The Context:** The text below the code block explains the real-world application: the system successfully interpreted notes regarding "panel washing" and a "reserve," generated an optimization plan

## frame-05-at-164.9s.png
This image is a concluding screen from a software project presentation or documentation page for a project called **"GridWise LLM."**

Key takeaways from the text:

*   **Project Name:** GridWise LLM.
*   **Availability/Deployment:** 
    *   The project is live on **Cloudflare Workers** (accessible at `gridwise-llm.seyamalam41.workers.dev`).
    *   There is a containerized version available on **Docker Hub** (`docker.io/touhidulalam41/gridwise-llm:1.0.0`) as a fallback or alternative deployment method.
*   **Documentation/Reproducibility:** The message emphasizes that the project is "reproducible" and that all necessary instructions can be found in the project's **README** file.

If you are looking for more information, you would likely need to visit the project's GitHub repository (implied by the mention of a README), where the developer ("seyamalam41" or "touhidulalam41") maintains the source code and installation instructions.
