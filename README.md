# n8n AI Agent — Tool Calling Issues & Solutions

> **Project**: NS4L AI Customer Service Chatbot  
> **Workflow**: Nodewave.json  
> **Date Fixed**: May 8, 2026  
> **Reference for**: Future n8n workflow builds with AI Agents + Code Tools

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Issue #1 — Tool Code Crashes Silently (TDZ Error)](#issue-1--tool-code-crashes-silently-tdz-error)
3. [Issue #2 — Tool Loaded With Wrong Dataset](#issue-2--tool-loaded-with-wrong-dataset)
4. [Issue #3 — n8n Passes Tool Inputs as Objects, Not Strings](#issue-3--n8n-passes-tool-inputs-as-objects-not-strings)
5. [Issue #4 — Multi-Parameter Tools: Only `query` Variable Exists](#issue-4--multi-parameter-tools-only-query-variable-exists)
6. [Issue #5 — Weak System Prompt = Agent Ignores Tools](#issue-5--weak-system-prompt--agent-ignores-tools)
7. [Issue #6 — Image Analysis Lost in Pipeline](#issue-6--image-analysis-lost-in-pipeline)
8. [Golden Rules for n8n AI Agent + Code Tools](#golden-rules-for-n8n-ai-agent--code-tools)

---

## Architecture Overview

```
User Message
    │
    ▼
┌──────────┐     ┌──────────────────┐     ┌────────┐
│ Webhook  │────▶│ Parse & Normalize│────▶│ Switch │
└──────────┘     └──────────────────┘     └────┬───┘
                                               │
                    ┌──────────────────────────┬┴──────────────┐
                    │                          │               │
              ┌─────▼─────┐            ┌──────▼──────┐  ┌─────▼──────┐
              │  Skip /    │            │  Respond    │  │  Gemini    │
              │  Duplicate │            │  Success1   │  │  Vision    │
              └────────────┘            └──────┬──────┘  └─────┬──────┘
                                               │               │
                                         ┌─────▼─────┐         │
                                         │Edit Fields│◀────────┘
                                         └─────┬─────┘
                                               │
                                        ┌──────▼───────┐
                                        │   Prepare    │
                                        │   Metadata   │
                                        └──────┬───────┘
                                               │
                                        ┌──────▼───────┐
                                        │  AI Agent2   │
                                        │  (gpt-4o-mini)│
                                        └──┬───┬───┬───┘
                                           │   │   │
                                    ┌──────┘   │   └──────┐
                                    │          │          │
                              ┌─────▼──┐  ┌───▼────┐  ┌──▼──────┐
                              │Orders1 │  │Inv'tory│  │ Memory  │
                              │(Tool)  │  │(Tool)  │  │(Buffer) │
                              └────────┘  └────────┘  └─────────┘
```

The AI Agent receives user queries and is supposed to call the attached **Code Tools** (Orders1 for tracking, Inventoryy for product search) to retrieve real data. Instead, it was returning vague error messages like *"There was an error retrieving information"* or *"I couldn't find any matching shoes"*.

---

## Issue #1 — Tool Code Crashes Silently (TDZ Error)

### What Happened

The `Orders1` tool had this code:

```javascript
const query = (query || "").toLowerCase().trim();
```

This is a **JavaScript Temporal Dead Zone (TDZ)** error. When you write `const query = ...`, the variable `query` is declared in the current scope. JavaScript hoists the declaration but NOT the initialization. So when the right side tries to read `query`, it's in the TDZ — it exists but hasn't been assigned yet.

### What The Agent Saw

The tool crashed with a `ReferenceError` before any logic ran. The AI Agent received an error response from the tool and, following its training, told the user *"There was an error retrieving information. Please try again later."*

### The Fix

Rename the local variable to avoid shadowing:

```javascript
// ❌ BEFORE — TDZ crash
const query = (query || "").toLowerCase().trim();

// ✅ AFTER — different name, no conflict
const userQuery = (query || "").toLowerCase().trim();
```

### Rule To Remember

> **Never name a local variable the same as an n8n-injected parameter.** If your tool schema defines `query`, don't create `const query = ...` in your code. Use `userQuery`, `searchQuery`, etc.

---

## Issue #2 — Tool Loaded With Wrong Dataset

### What Happened

The `Inventoryy` tool (product recommendations) was supposed to search a **product catalog** with fields like `name`, `brand`, `category`, `price_inr`, `stock`, `rating`, `sizes`.

Instead, someone had pasted **order data** into it — with fields like `email`, `customer_name`, `order_id`, `shipping_address`, `carrier`. The tool was searching through order records when the user asked for "best Nike shoes."

### What The Agent Saw

The search logic ran against wrong fields. No product matched because there was no `brand`, `category`, or `price_inr` field to search against. The tool returned "No matching products found" every time.

### The Fix

Replaced the entire dataset with the correct 30-product shoe catalog from the standalone `Inventory` node.

### Rule To Remember

> **Always verify your tool's embedded data matches what it claims to search.** When copy-pasting between nodes, double-check you pasted the right dataset. A recommendation tool needs product data, not order data.

---

## Issue #3 — n8n Passes Tool Inputs as Objects, Not Strings

### What Happened

After fixing Issues #1 and #2, the tool still returned "No matching products found." The n8n execution panel showed the tool receiving `query: "best Nike shoes"` correctly, but the search found nothing.

The error was:

```
"(query || "").toLowerCase is not a function"
```

This means `query` existed but **wasn't a string**. n8n's Code Tool node (v1.3) passes tool parameters as a special internal type, not plain JavaScript strings. Calling `.toLowerCase()` directly on it fails.

Even after wrapping with `String(query)`, the search returned empty — because `String()` on an n8n proxy object returns `"[object Object]"` instead of the actual query text.

### What The Agent Saw

The tool executed without errors but searched for `"[object object]"` in the product catalog. No product name contains "object", so zero results every time.

### The Fix

Robust type-checking extraction:

```javascript
let rawQuery = '';
try {
  if (typeof query === 'string') {
    rawQuery = query;
  } else if (query && typeof query === 'object') {
    // n8n wraps all params in an object
    rawQuery = query.query || query.text || query.input || '';
  } else {
    rawQuery = String(query || '');
  }
} catch(e) { rawQuery = ''; }
const userQuery = rawQuery.toLowerCase().trim();
```

### Rule To Remember

> **In n8n Code Tool v1.3, tool parameters arrive as an OBJECT, not individual strings.** If your schema defines `{ query: "string" }`, the variable `query` in your code is an object like `{ query: "actual text" }`. Always extract: `query.query` for the actual value.

---

## Issue #4 — Multi-Parameter Tools: Only `query` Variable Exists

### What Happened

The `Orders1` tool schema defined three parameters: `query`, `email`, and `order_id`. The code tried to access all three as separate variables:

```javascript
const userQuery = safeStr(query);          // ✅ Works
const providedEmail = safeStr(email);       // ❌ ReferenceError: email is not defined
const providedOrderId = safeStr(order_id);  // ❌ ReferenceError: order_id is not defined
```

n8n only injects **one variable** into the Code Tool sandbox: `query` (the first/primary parameter). The other parameters (`email`, `order_id`) are NOT available as separate variables — they're **properties inside the `query` object**.

### What The Agent Saw

The tool crashed at `email is not defined`. The AI Agent told the user *"Please provide your email"* even though the email was clearly provided.

### The Fix

Extract ALL parameters from the single `query` object:

```javascript
let rawQuery = '', rawEmail = '', rawOrderId = '';
try {
  if (typeof query !== 'undefined') {
    if (typeof query === 'string') {
      rawQuery = query;
    } else if (query && typeof query === 'object') {
      rawQuery = String(query.query || '');
      rawEmail = String(query.email || '');
      rawOrderId = String(query.order_id || '');
    }
  }
} catch(e) {}
```

### Rule To Remember

> **ALL tool schema parameters arrive bundled in ONE object.** When the AI Agent calls `Orders1({ query: "Track order", email: "user@gmail.com" })`, your code receives a single variable where `query = { query: "Track order", email: "user@gmail.com" }`. Access them as `query.query`, `query.email`, etc.

---

## Issue #5 — Weak System Prompt = Agent Ignores Tools

### What Happened

The original system prompt said things like "use tools when appropriate" and "if a tool returns no data, politely say the information could not be retrieved." This gave the LLM too much freedom to:

1. **Skip tool calls entirely** and answer from its own knowledge (making up shoe names and prices)
2. **Apologize preemptively** without even trying the tool ("I'm sorry, I couldn't retrieve that information")

The prompt also included a confusing `{{ ai_output }}` reference that was always empty for non-image queries, adding noise to the context.

### The Fix

Replaced with explicit, forceful instructions:

```
CRITICAL RULES:

1. You MUST use the available tools for ANY product or order related question.
   NEVER answer product or order questions from your own knowledge.

2. For product recommendations → MUST call the Inventoryy tool
3. For order tracking → MUST call the Orders1 tool
4. NEVER make up product names, prices, or order details
5. If a tool returns no results, say "no matching products found" — do NOT make up data
```

### Rule To Remember

> **Be forceful in your system prompt.** Use "MUST", "NEVER", "ALWAYS" — not "when appropriate" or "if possible." LLMs follow strong instructions more reliably than suggestions. Explicitly name which tool to use for which query type.

---

## Issue #6 — Image Analysis Lost in Pipeline

### What Happened

The workflow's image route works like this:

1. User sends photo + text → Switch Output 4 → **Gemini Vision** analyzes the image
2. Gemini response flows through `Edit Fields` → stored as `ai_output`
3. `Prepare Metadata` wraps everything → `AI Agent2` processes it

But the AI Agent's prompt template didn't include the `ai_output` field (it was removed during prompt cleanup). So the agent never saw the Gemini analysis. Combined with conversation memory containing old order-tracking context, the agent responded about orders instead of the image.

### The Fix

Added `ai_output` back to the prompt with conditional display:

```
{{ $json.debug_input_first.ai_output ? 'Image Analysis Result: ' + $json.debug_input_first.ai_output : '' }}
```

And added system prompt rule:
```
If the prompt includes an "Image Analysis Result", base your response on that analysis.
Do NOT call product or order tools for image complaints.
```

### Rule To Remember

> **When chaining multiple AI models (Vision → Agent), make sure the first model's output is explicitly passed to the second model's prompt.** Don't rely on implicit data flow — the Agent node only sees what's in its prompt template.

---

## Golden Rules for n8n AI Agent + Code Tools

These apply to **any** n8n workflow with AI Agents and Code Tool nodes:

### 1. Tool Input Access Pattern

```javascript
// In n8n Code Tool v1.3, ALL parameters arrive as ONE object via `query`
// Schema: { query: string, email: string, order_id: string }
// Actual variable: query = { query: "...", email: "...", order_id: "..." }

let rawQuery = '', rawEmail = '';
if (typeof query === 'string') {
  rawQuery = query;
} else if (query && typeof query === 'object') {
  rawQuery = String(query.query || '');
  rawEmail = String(query.email || '');
}
```

### 2. Never Shadow Injected Variables

```javascript
// ❌ BAD — TDZ crash
const query = (query || '').toLowerCase();

// ✅ GOOD — unique name
const userQuery = (query?.query || '').toLowerCase();
```

### 3. Always Return Strings from Tools

```javascript
// ❌ BAD — Agent can't interpret JSON objects well
return [{ json: { products: [...] } }];

// ✅ GOOD — Formatted string the Agent can directly use
return "Found 3 shoes:\n1. Nike Pro - ₹5000\n2. Adidas Run - ₹4500";
```

### 4. System Prompt Must Be Forceful

```
// ❌ BAD
"Use tools when the user asks about products"

// ✅ GOOD
"You MUST call the Inventoryy tool for ANY product question. NEVER answer from your own knowledge."
```

### 5. Test With These Patterns

| Test | What It Validates |
|------|-------------------|
| `"best nike shoes"` | Tool calling + keyword search |
| `"shoes under 3000"` | Price filter in tool |
| `"track my order"` → `"email@test.com"` | Multi-turn + email extraction |
| `"hello"` | Agent responds WITHOUT calling tools |
| Send image + text | Vision pipeline → Agent handoff |

### 6. Debug Checklist When Tools Fail

1. **Check n8n execution** → Does the tool node show in the execution trace?
   - No → Agent isn't calling the tool → Fix the system prompt
   - Yes → Continue to step 2

2. **Check tool OUTPUT** → Is there an error message?
   - `"X is not defined"` → Variable access issue (see Issues #1, #4)
   - `".toLowerCase is not a function"` → Type issue (see Issue #3)
   - Empty/wrong results → Data or logic issue (see Issue #2)

3. **Check tool INPUT** → Are the parameters what you expect?
   - If `query` shows the right value but the code doesn't find it → The object wrapping issue (Issue #3)

---

## Files Modified

| File | Changes |
|------|---------|
| `Nodewave.json` | Fixed Orders1 tool, Inventoryy tool, AI Agent2 prompts |
| `chatbot-frontend/public/app.js` | Fresh session on every open, enhanced quick replies |
| `chatbot-frontend/public/styles.css` | Quick reply chip styles, message animations |

## No Changes Made To

- `server.js` (backend untouched)
- Switch node logic
- Parse & Normalize node
- Webhook configuration
- Any routing/connection logic
