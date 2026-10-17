# Incident 02: The Autonomous ReAct Agent Infinite Tool-Error Loop (`$48,000` Token Burn)

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Autonomous Customer Support ReAct Agent (.NET 9 Semantic Kernel / OpenAI `gpt-4o`)  
> **Business Impact**: 120 stuck agent loops burned `$48,200` in LLM API tokens in 42 minutes and exhausted the enterprise TPM (Tokens Per Minute) quota, taking down all AI features company-wide  
> **Competencies Mastered**: ReAct Loop Termination Guards (`MaxIterations`), Quadratic Context Window Cost ($\sum_{i=1}^N i$), Identical Tool-Call Cycle Detection, Token Budget Circuit Breakers

---

## 🚨 1. The 04:10 AM Crisis Briefing

At `03:30 AM`, a downstream CRM API began returning `HTTP 500 Internal Server Error` when queried by the Autonomous Customer Support Agent (`LookupCustomerOrderTool`). Instead of failing gracefully, the LLM agent decided to retry the tool with slightly rephrased parameters in an unbounded `while (!isComplete)` loop:

```text
[03:45:00] OpenAI Quota Alert: Enterprise 10,000,000 TPM (Tokens Per Minute) quota 100% exhausted (HTTP 429)!
[03:50:12] RED HERRING: FinOps Analyst pages "Someone leaked our OpenAI API Key on GitHub — attackers are mining crypto with our LLM!"
[04:10:05] Billing Alert: $48,200 consumed in 42 minutes across 120 active background agent sessions!
```

> 📐 **Derive It (Fermi Mode): Quadratic Token Burn in Unbounded Multi-Turn Agent Loops**
> - **Inputs**: `StuckSessions = 120`, `IterationsPerSession = 250`, `TokensAddedPerTurn = 1200`, `InputCostPerMillionUSD = 2.50`
> - **Formula**: `TotalInputTokensPerSession = TokensAddedPerTurn * (IterationsPerSession * (IterationsPerSession + 1) / 2)`
> - **Step-by-Step**:
>   1. In a stateful LLM chat/agent loop, **every turn resends the entire accumulated history of all previous turns**!
>   2. Therefore, token consumption across $N$ turns is **quadratic** ($\sum_{i=1}^{N} i = rac{N(N+1)}{2}$), NOT linear!
>   3. For `1` stuck session running $N = 250$ iterations adding `1,200` tokens of stack-trace error JSON per turn:
>      $$	ext{Input Tokens per Session} = 1,200 	imes rac{250 	imes 251}{2} = 37,650,000	ext{ tokens!}$$
>   4. Across `120` concurrent stuck sessions: $120 	imes 37.65	ext{M} = 4,518,000,000	ext{ tokens}$ (`4.5 Billion tokens`)! At blended input/output rates, 120 stuck loops burn **`$48,000+` in under an hour**!
> - **What-If Sensitivity**: Enforcing a hard **`MaxIterations = 6` ceiling** + **Duplicate Tool-Call Hash Cycle Detection** caps worst-case tokens per session at $1,200 	imes rac{6 	imes 7}{2} = 25,200	ext{ tokens}$ (`$0.06` max blast radius — a **$1,490	imes$ cost reduction**)!

<!-- TELEMETRY_WIDGET: title="Quadratic ReAct Agent Token Burn Explosion" metric1="Tokens / Minute (Millions)" metric2="Cumulative Spend ($ USD)" threshold="6 Max Agent Tool Iterations" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Rule out the "Leaked API Key" Red Herring — group OpenAI outbound calls by SessionId / Pod!
kubectl logs -n prod -l app=support-agent-worker --since=30m | jq -r '.sessionId' | sort | uniq -c | sort -nr | head -n 5
# Output: Session 'sess-8841a' has executed 264 sequential LLM tool-call turns in 20 minutes!
```

### Observed Culprit Agent Loop
```csharp
// ❌ UNBOUNDED WHILE LOOP + PASSING RAW 50KB STACK TRACES BACK INTO LLM CONTEXT:
while (true)
{
    var response = await _chatClient.CompleteAsync(chatHistory, options, ct);
    if (response.FinishReason != ChatFinishReason.ToolCalls) break;

    foreach (var toolCall in response.ToolCalls)
    {
        try {
            var result = await ExecuteToolAsync(toolCall, ct);
            chatHistory.Add(new ChatMessage(ChatRole.Tool, result));
        }
        catch (Exception ex) {
            // ❌ Feeding full ex.ToString() back to LLM causes LLM to apologize and call the tool AGAIN forever!
            chatHistory.Add(new ChatMessage(ChatRole.Tool, ex.ToString()));
        }
    }
}
```

<!-- PREDICT_GATE: Commit your hypothesis: Why does agent token cost scale quadratically ($O(N^2)$) with turn count, why did feeding `ex.ToString()` cause the LLM to retry endlessly, and what 3 hard guards must wrap every agent loop? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Why LLMs Enter "Polite Retry Hallucination Loops" on Tool Errors
* When a tool throws an `HttpRequestException (500)` and you return the exception text to the LLM as a `Tool` message, the LLM's RLHF training tries to be "helpful": it guesses that changing `"orderId": "1042"` to `"orderId": "001042"` might work, and calls the broken tool again and again.

### 2. The 4 Mandatory Agent Loop Guardrails
1. **Hard Step Ceiling (`MaxIterations = 6`)**: Never write `while (true)` around an LLM call.
2. **Per-Session Token & Dollar Budget (`MaxSessionTokens = 32_000`)**: Inspect `response.Usage.TotalTokenCount` after every turn and abort if the session budget is exceeded.
3. **Deterministic Tool-Call Cycle Detection**: Hash `(ToolName, NormalizedArgumentsJson)`. If the agent attempts the exact same tool call twice (or fails the same tool twice consecutively), short-circuit the loop in C# without calling the LLM!
4. **Concise Structured Tool Error Envelopes**: Never dump a 4KB C# stack trace into the prompt context; return `{"error": "CRM_UNAVAILABLE", "retryable": false, "instruction": "Do not call this tool again; inform user human support will follow up."}`.

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace PrincipalJourney.AI.WarRoom;

public sealed class BoundedReActAgentExecutor
{
    private const int MaxToolIterations = 6;
    private const int MaxCumulativeSessionTokens = 32_000;

    public async Task<string> ExecuteSafeAgentLoopAsync(
        IList<AgentMessage> history,
        ILlmClient llmClient,
        IToolDispatcher toolDispatcher,
        CancellationToken ct)
    {
        var seenToolCallHashes = new HashSet<string>(StringComparer.Ordinal);
        var consecutiveToolFailures = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        long cumulativeTokens = 0;

        for (int step = 1; step <= MaxToolIterations; step++)
        {
            var response = await llmClient.CompleteAsync(history, ct);
            cumulativeTokens += response.TotalTokensUsed;

            // Guard 1: Hard Per-Session Token Budget Circuit Breaker
            if (cumulativeTokens > MaxCumulativeSessionTokens)
            {
                throw new InvalidOperationException(
                    $"Agent session aborted: exceeded token budget ({cumulativeTokens} > {MaxCumulativeSessionTokens}).");
            }

            if (response.ToolCalls.Count == 0)
            {
                return response.AssistantText;
            }

            foreach (var call in response.ToolCalls)
            {
                // Guard 2: Cycle Detection (Prevent calling identical tool + args twice!)
                string callSignature = ComputeHash($"{call.ToolName}:{call.CanonicalArgumentsJson}");
                if (!seenToolCallHashes.Add(callSignature))
                {
                    return "I encountered a repeated step while processing your request and have escalated this to a specialist.";
                }

                try
                {
                    string toolOutput = await toolDispatcher.InvokeAsync(call, ct);
                    consecutiveToolFailures[call.ToolName] = 0;
                    history.Add(new AgentMessage("tool", toolOutput));
                }
                catch (Exception)
                {
                    int fails = consecutiveToolFailures.GetValueOrDefault(call.ToolName) + 1;
                    consecutiveToolFailures[call.ToolName] = fails;

                    // Guard 3: Abort loop if downstream tool infrastructure fails twice
                    if (fails >= 2)
                    {
                        return "Our order lookup system is temporarily unavailable. Please try again in a few minutes.";
                    }

                    history.Add(new AgentMessage("tool",
                        "{"status":"ERROR","retryable":false,"directive":"Tool is offline. Do NOT call this tool again."}"));
                }
            }
        }

        return "Request exceeded maximum automated reasoning steps and has been queued for review.";
    }

    private static string ComputeHash(string input) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input)));
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Unbounded `while(true)`) | After (`MaxIterations=6` + Cycle Hash + Token Budget) | Validation & Rollback Procedure |
|---|---|---|---|
| **Worst-Case Session Token Burn** | `37,650,000 tokens` (`$400/session`) | **`<= 32,000 tokens`** (`$0.08/session` hard cap) | Chaos test forces tool to throw `500`; assert agent terminates in `<= 2` tool turns. |
| **Enterprise TPM Quota Protection** | `100%` Exhausted | **`< 4%` Utilization** (Per-tenant token rate limiter) | Alert if any single session exceeds `4` tool iterations. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why don't we just add a system prompt instruction saying `'Never call a failing tool more than twice'` instead of writing C# cycle-detection code?"*

**The Principal Defense**:
> *"A system prompt is a **probabilistic suggestion**, not a deterministic engineering boundary! Under long context windows or adversarial prompt injection, LLMs regularly ignore negative prompt constraints. Financial and infrastructure guardrails (`MaxIterations`, `MaxCumulativeSessionTokens`, SHA-256 cycle detection, and tool circuit breakers) MUST be enforced deterministically in C# host code outside the LLM."*

### Question 2 (The Second-Order Failure Mode):
> *"Why did a background batch customer-support agent share the exact same OpenAI Deployment / API Quota as our real-time interactive user copilot?"*

**The Principal Defense**:
> *"Sharing a single TPM quota pool across asynchronous background agents and synchronous interactive users violates **Bulkhead Isolation**! We provision separate Azure OpenAI deployments (or enforce an APIM AI Gateway Token-Bucket Rate Limiter per workload tier) so a background batch spike gets throttled at `20%` of capacity and can **never** starve interactive users."*

### Question 3 (The FinOps / Cost Axis):
> *"Every turn of our ReAct router uses `gpt-4o` ($2.50/1M input, $10.00/1M output) just to classify which of 5 tools to call, costing $28,000/month. Defend the 80%-good alternative at 8% of the cost."*

**The Principal Defense**:
> *"Using a frontier reasoning model (`gpt-4o`) for simple intent routing and JSON parameter extraction is 12x overpriced and 3x slower. We route **Intent Classification & Tool Parameter Extraction** to **`gpt-4o-mini` / `gemini-2.5-flash` ($0.15/1M input — 94% cheaper and 2.5x lower latency)**, and invoke the frontier model **only on the final synthesis step** when complex multi-document reasoning is actually required!"*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-1202 — ReAct Agent Infinite Tool-Error Loop ($48k Burn)

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 15 minutes | **Mitigation Latency (TTM)**: 42 minutes

## Five Whys Root Cause Chain
1. **Why did we burn $48,200 and exhaust TPM quota?** -> 120 agent sessions executed 250+ turns each, consuming 4.5B tokens.
2. **Why did 250 turns consume 37.6M tokens per session?** -> Chat history grows quadratically ($\sum i$) as history is resent every turn.
3. **Why did the agent run 250 turns?** -> The C# host loop used `while (true)` without `MaxIterations` or cycle detection.
4. **Why did the LLM keep calling a broken CRM tool?** -> Raw C# stack traces were returned to the model without a terminal circuit breaker.
5. **Why did FinOps think our API key was leaked?** -> Dashboards lacked per-session and per-feature token attribution metrics.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Enforce `MaxToolIterations = 6`, `MaxSessionTokens = 32k`, and SHA-256 Tool Cycle Detection | AI Team | Unit test verifies agent halts after 2 consecutive tool failures |
| P1 | Isolate background agent TPM quota from interactive user TPM quota in AI Gateway | Platform | APIM token-rate-limit policy deployed |
```
