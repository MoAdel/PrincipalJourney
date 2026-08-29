# 08A - Inside the ASP.NET Core Pipeline

> "Frameworks are not magic.
>
> They are simply code written by engineers who deeply understand trade-offs."

---

# Why This Chapter Exists

Most developers know how to write:

```csharp
app.UseAuthentication();

app.UseAuthorization();

app.MapControllers();
```

Very few know what these methods actually do.

Even fewer know why the ASP.NET Core pipeline is one of the fastest HTTP pipelines available.

As a Principal Engineer,

you should understand not only **how to use the pipeline**,

but **how the pipeline itself is built**.

---

# The Biggest Misconception

Many developers imagine this:

```
Request

↓

Middleware 1

↓

Middleware 2

↓

Middleware 3

↓

Controller
```

This is **execution order**.

It is **NOT**

how ASP.NET Core stores the pipeline internally.

---

# Startup vs Runtime

One of the most important concepts.

Everything below happens exactly once.

```
Application Starts

↓

Program.cs executes

↓

Register Services

↓

Configure Middleware

↓

Build Request Pipeline

↓

Application Starts Listening
```

After Startup finishes,

Program.cs never executes again.

Never.

Every request simply executes what Startup already built.

---

# Phase 1 — Building the Pipeline

Imagine this code.

```csharp
app.UseMiddleware<A>();

app.UseMiddleware<B>();

app.UseMiddleware<C>();
```

Looks simple.

But internally,

ASP.NET Core stores something closer to

```
List<Func<RequestDelegate, RequestDelegate>>
```

Not middleware instances.

Not requests.

Only pipeline builders.

Think of them as recipes.

---

# IApplicationBuilder

One of the central interfaces.

Simplified:

```csharp
public interface IApplicationBuilder
{
    IApplicationBuilder Use(
        Func<RequestDelegate,
        RequestDelegate> middleware);
}
```

Notice something surprising.

Each middleware receives

```
RequestDelegate
```

and returns

```
RequestDelegate
```

It doesn't execute anything.

It simply wraps the next delegate.

---

# Visualizing Use()

Suppose we register

```
A

↓

B

↓

C
```

Internally

the builder stores

```
MiddlewareA Factory

MiddlewareB Factory

MiddlewareC Factory
```

Nothing has been linked yet.

Think of it as stacking Lego pieces on a table.

---

# Build()

When Startup finishes,

ASP.NET Core calls

```
Build()
```

This is where the magic happens.

Pseudo-code:

```csharp
RequestDelegate app = context =>
{
    return Task.CompletedTask;
};

foreach(var component in components.Reverse())
{
    app = component(app);
}
```

That loop constructs

one

single

delegate.

Everything else disappears.

---

# Why Reverse?

Imagine

```
A

↓

B

↓

C
```

To produce

```
A(B(C()))
```

the runtime must start with C.

Working backwards.

Exactly like recursive function composition.

---

# Building the Delegate Chain

Initial Delegate

```
TerminalDelegate
```

After adding C

```
C(Terminal)
```

After adding B

```
B(C(Terminal))
```

After adding A

```
A(B(C(Terminal)))
```

Done.

One delegate.

---

# Runtime

Now imagine

100,000 requests arrive.

Does ASP.NET Core rebuild the chain?

No.

It simply executes

```
FinalRequestDelegate(context);
```

One function call.

Everything has already been composed.

That is why Startup exists.

---

# Understanding RequestDelegate

Simplified

```csharp
public delegate Task RequestDelegate(
    HttpContext context);
```

Nothing more.

Every request eventually becomes

```
RequestDelegate(HttpContext)
```

The entire framework revolves around this delegate.

---

# Closures

Consider

```csharp
app.Use(async (context, next) =>
{
    Console.WriteLine("Before");

    await next();

    Console.WriteLine("After");
});
```

Internally,

the lambda captures

```
next
```

using a Closure.

The resulting delegate remembers

who should execute next.

Each middleware therefore becomes

```
Current Delegate

+

Reference To Next Delegate
```

No lookup.

No searching.

Just direct execution.

---

# Why This Is Fast

Notice what does NOT happen.

For every request

ASP.NET Core does NOT

❌ Build middleware

❌ Search middleware

❌ Reflect over assemblies

❌ Recalculate execution order

❌ Rebuild delegates

Everything already exists.

The runtime simply walks a delegate chain.

---

# Where DI Fits

When a request reaches a middleware,

constructor dependencies already exist.

Scoped services,

however,

are resolved

only

when InvokeAsync executes.

This distinction avoids unnecessary object creation.

---

# Endpoint Routing

Eventually,

Routing Middleware executes.

Its job is not

to execute Controllers.

Its job is to identify

which endpoint matches.

Think of it as

```
URL

↓

Endpoint

↓

Metadata

↓

Delegate
```

Later,

EndpointMiddleware invokes that delegate.

Controllers are simply one type of endpoint.

Minimal APIs are another.

SignalR hubs are another.

Everything becomes

```
Endpoint Delegate
```

---

# The Complete Picture

```
Application Startup

↓

Register Services

↓

Register Middleware

↓

Compose Delegates

↓

Build Final RequestDelegate

────────────────────────────

Runtime

↓

HTTP Request

↓

Kestrel

↓

HttpContext

↓

Create Scope

↓

Execute Final Delegate

↓

Middleware A

↓

Middleware B

↓

Routing

↓

Endpoint

↓

Controller

↓

Response

↓

Dispose Scope

↓

Connection Reused
```

This mental model is far more valuable than memorizing middleware order.

---

# Why RequestDelegate Instead of Reflection?

Reflection would allow ASP.NET Core to discover middleware dynamically.

Why not?

Performance.

Reflection is relatively expensive.

Delegates are compiled function pointers.

Once composed,

invoking delegates is extremely efficient.

ASP.NET Core optimizes for the hot path:

request execution.

Not startup convenience.

---

# Why Doesn't ASP.NET Core Use a Linked List?

At first glance,

middleware resembles a linked list.

But the runtime prefers delegate composition because:

- Simpler execution
- Better JIT optimization
- Fewer indirections
- Lower allocation cost
- Better inlining opportunities

Sometimes the simplest abstraction is also the fastest.

---

# Reading the Source

If you browse the ASP.NET Core repository,

look for:

```
ApplicationBuilder.cs
```

Pay particular attention to the `Build()` method.

You'll notice it is surprisingly small.

That is a hallmark of good framework design.

The complexity lies not in the method itself,

but in the abstractions surrounding it.

---

# Principal Thinking

A Junior Engineer asks:

> "Which middleware runs first?"

A Senior Engineer asks:

> "Why does middleware order matter?"

A Principal Engineer asks:

> "How can the runtime execute millions of requests without rebuilding the pipeline?"

The third question reveals an understanding of the framework's execution model.

---

# Performance Takeaways

The ASP.NET Core pipeline is fast because it:

- Builds once.
- Executes many times.
- Avoids reflection in the hot path.
- Uses delegate composition.
- Creates one DI scope per request.
- Reuses the composed execution chain.
- Keeps middleware stateless whenever possible.

The framework spends extra work during Startup to minimize work during Runtime.

That is a deliberate engineering trade-off.

---

# Self Assessment

You have mastered this chapter if you can explain:

- Why `Program.cs` executes only once.
- What `IApplicationBuilder.Use()` really stores.
- Why `Build()` iterates in reverse order.
- How multiple middleware become a single `RequestDelegate`.
- Why delegate composition is faster than rebuilding the pipeline.
- Where DI scopes are created.
- When scoped services are actually resolved.
- Why middleware execution is considered one of the hottest paths in ASP.NET Core.

If you can sketch the delegate composition process on a whiteboard from memory and explain its performance characteristics, you've crossed an important boundary—from being a user of ASP.NET Core to understanding one of its core runtime mechanisms.