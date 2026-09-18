# Snapshot Frame Descriptions

**Question asked:**

Compare each description against your storyboard spec. A "black frame" or "loading screen" for a content beat is a bug.

## frame-00-at-18s.png

Based on the screenshot provided, here is a summary of the **GridWise live benchmark**:

### **Overview**

The benchmark tests the performance of a production worker handling 20 sequential requests to the `/optimize-energy` endpoint. It highlights the difference in response times between cached requests and "cold" (unique) requests.

### **Performance Data**

- **10x Cached (Identical body, cache hits):**
  - The first request took 2106 ms, but subsequent requests were significantly faster.
  - **Results:** Min 158 ms, P50 (median) 172 ms, Mean 365 ms.
- **10x Cold (Unique note per request, full LLM path):**
  - These requests represent brand-new data processed by the LLM.
  - Response times are consistently higher, ranging from approximately 1423 ms to 1714 ms.
  - **Summary:** The text below the charts notes a median of **1.7 seconds** for these cold requests.

### **Key Takeaways**

-

## frame-01-at-92s.png

This image outlines a clever architectural strategy for building AI applications with a budget of zero by maximizing free-tier usage across multiple services.

Here is a breakdown of the workflow described:

### 1. The Core Strategy: "Racing" and "Hedging"

The goal is to get a fast, valid response without hitting paid rate limits or incurring costs.

- **The Race (t=0 ms):** The system initiates requests simultaneously to two different providers.
- **The Hedge (t=+2.5 s):** If the initial "race" models fail or don't return a result quickly, a secondary set of requests is triggered through different providers (like OpenRouter). This acts as a fallback or "hedge" to ensure a result is eventually produced.
- **Winner Takes All:** The system accepts the "first valid answer" that arrives, discarding the others.

### 2. The Components

- **AI Gateway:** Used to manage and route these requests efficiently.
- **Gemini 3.8:** Specifically mentioned as being used with "thinking disabled" to keep it fast and low-resource.
- **Vercel AI SDK

## frame-02-at-110s.png

Based on the image provided, here is a breakdown of the API endpoint details:

### Endpoint Overview

- **Path:** `/optimize-energy`
- **Method:** `POST`
- **Purpose:** To interpret operator notes and optimize a 24-hour energy schedule.

### Request Body Requirements

The request body expects a JSON object containing three main fields:

1.  **`battery`**: An object containing specifications such as `capacity_kwh`, `initial_energy_kwh`, `max_charge_kwh_per_hour`, and `max_discharge_kwh_per_hour`.
2.  **`hours`**: An array of 24 objects, each containing `demand_kwh`, `hour`, `solar_kwh`, and `tariff_kst_per_kwh`.
3.  **`operator_notes`**: An array of strings (minimum length of 1) to provide context (e.g., "Solar output will drop to about 20% from 1 PM to 3 PM").
4.  **`scenario_id`**: A string identifier for the scenario

## frame-03-at-160.05s.png

The provided image is a presentation or title slide for a project called **"GridWise LLM"** by "Team Huntrix."

Key details from the image:

- **Project Name:** GridWise LLM
- **Associated Links/Resources:**
  - `gridwise-llm.seyamalam41.workers.dev` (likely the live Cloudflare Workers deployment)
  - `docker.io/touhidulalam41/gridwise-llm` (the Docker Hub repository)
- **Technology Stack:** The bottom text mentions it uses **Cloudflare Workers** and **Docker**.
- **Status:** It is presented as an open-source/reproducible project, noting that "everything [is] reproducible from the README."
