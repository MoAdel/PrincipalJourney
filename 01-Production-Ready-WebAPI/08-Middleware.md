# 08 - Middleware Pipeline

> "Middleware is not a feature.
>
> It is the execution model of ASP.NET Core."

---

# Why Should a Principal Engineer Care?

Every HTTP request entering your application will pass through the Middleware Pipeline.

Authentication.

Authorization.

Logging.

Exception Handling.

Compression.

Routing.

CORS.

Rate Limiting.

Response Caching.

Everything happens here.

If you misunderstand the pipeline,

you misunderstand ASP.NET Core itself.

---

# Production Story

Friday.

5:40 PM.

A deployment reaches production.

Everything looks healthy.

Health Checks return 200.

Swagger works.

But every secured endpoint returns

401 Unauthorized.

Nothing changed in authentication.

Nothing changed in JWT validation.

The root cause?

One line.

```
app.UseAuthorization();

app.UseAuthentication();
```

Authentication executed after Authorization.

The application behaved exactly as instructed.

Not as intended.

One misplaced middleware caused an outage.

---

# The Journey Begins

Imagine a browser sends

```
GET /api/orders/15
```

Where does this request go?

Not to your Controller.

Not immediately.

First...

It reaches the operating system.

---

# Step 1 — Kestrel

```
Internet

↓

Operating System

↓

TCP Socket

↓

Kestrel
```

Kestrel is the ASP.NET Core web server.

Its responsibilities include:

- Accept TCP connections
- Parse HTTP
- Manage connection lifetimes
- Support HTTP/1.1, HTTP/2, HTTP/3
- Handle Keep-Alive
- Request buffering
- TLS termination (sometimes behind a reverse proxy)

Kestrel does **not** know what a Controller is.

It only understands HTTP.

---

# Step 2 — HttpContext Creation

Kestrel converts the raw HTTP request into an object graph.

```
HttpContext

├── Request

├── Response

├── User

├── Features

├── Connection

└── Items
```

This object becomes the "universe" for the lifetime of the request.

Every middleware receives the same HttpContext.

---

# Step 3 — Create Request Scope

Before the pipeline starts,

ASP.NET Core creates a new Dependency Injection Scope.

```
HTTP Request

↓

Create Scope

↓

Resolve Scoped Services
```

Every Scoped service now belongs exclusively to this request.

Examples:

- DbContext
- Unit of Work
- Business Services

When the request ends,

the entire scope is disposed.

---

# Step 4 — Enter Middleware Pipeline

The request now enters the middleware chain.

Imagine the pipeline as a series of gates.

```
Request

↓

Exception Middleware

↓

HTTPS Redirection

↓

Static Files

↓

Routing

↓

Authentication

↓

Authorization

↓

Rate Limiting

↓

Endpoints

↓

Controller

↓

Response
```

Every middleware decides one thing:

Should I continue?

Or should I stop the pipeline?

---

# The Middleware Contract

Every middleware has the same fundamental shape.

```csharp
public async Task InvokeAsync(
    HttpContext context,
    RequestDelegate next)
{
    // Before

    await next(context);

    // After
}
```

Notice something important.

The middleware executes twice.

Once before.

Once after.

This creates a natural request/response flow.

---

# Visualizing the Pipeline

```
Request
   │
   ▼
┌──────────────────────┐
│ Logging              │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Exception Handler    │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Authentication       │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Authorization        │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Controller           │
└──────────┬───────────┘
           ▲
           │
Response ◄─┘
```

Notice how the response travels back through the same pipeline.

This is why logging middleware can measure execution time.

---

# Short-Circuiting

Not every request reaches the controller.

Example:

Static File Middleware.

```
Request

↓

Static File Middleware

↓

File Found

↓

Return File

↓

END
```

No Routing.

No Controller.

No DbContext.

No Dependency Injection.

The pipeline ends early.

This is called **Short-Circuiting**.

It improves performance by avoiding unnecessary work.

---

# Why Ordering Matters

Middleware order is not cosmetic.

It defines application behavior.

Correct:

```
UseRouting()

↓

UseAuthentication()

↓

UseAuthorization()

↓

MapControllers()
```

Incorrect:

```
UseAuthorization()

↓

UseAuthentication()
```

Authorization requires an authenticated user.

If authentication hasn't run yet,

authorization has nothing to evaluate.

---

# Exception Middleware

Global Exception Middleware should appear near the beginning.

```
Request

↓

Exception Middleware

↓

Everything Else
```

Why?

Because it can catch exceptions from all downstream middleware.

If placed at the end,

exceptions thrown earlier bypass it completely.

---

# RequestDelegate

Internally,

each middleware wraps the next middleware.

Think of it as nested functions.

```
Logging(

    Exception(

        Authentication(

            Authorization(

                Controller
            )
        )
    )
)
```

The final delegate is built once at startup.

Each request simply executes the already-constructed pipeline.

This is one reason the ASP.NET Core pipeline is so fast.

---

# Middleware vs Filters

A common interview question.

Middleware

- Works for every request
- Runs before MVC
- Has access to the entire HttpContext
- Framework-wide

Filters

- MVC only
- Controller-specific
- Action-specific
- Know about ActionContext

Rule of thumb:

If the concern belongs to the application,

use Middleware.

If it belongs to MVC,

consider Filters.

---

# Middleware and DI

Middleware itself is typically Singleton.

Do not inject Scoped services into its constructor.

Wrong:

```csharp
public LoggingMiddleware(
    ApplicationDbContext db)
```

Correct:

```csharp
public async Task InvokeAsync(
    HttpContext context,
    ApplicationDbContext db)
```

ASP.NET Core resolves scoped services per request when InvokeAsync executes.

This subtle distinction prevents lifetime bugs.

---

# Performance Considerations

Middleware runs for **every request**.

A small inefficiency becomes expensive under load.

Guidelines:

- Keep middleware lightweight.
- Avoid blocking I/O.
- Avoid unnecessary allocations.
- Avoid expensive reflection.
- Exit early whenever possible.
- Do not perform business logic.

Middleware should orchestrate,

not implement domain behavior.

---

# Production Incident

A custom logging middleware reads the request body.

It forgets to enable buffering.

Downstream MVC receives an already-consumed stream.

Controllers start receiving empty request bodies.

The bug appears only for POST requests.

The middleware worked.

The application didn't.

Understanding the request pipeline would have prevented the incident.

---

# Principal Thinking

Junior Engineer:

"Where should I put this code?"

Senior Engineer:

"Should this be Middleware or a Filter?"

Principal Engineer:

"Does this concern belong to the transport layer at all?"

Many problems disappear when responsibilities are placed at the correct architectural boundary.

---

# Middleware Design Checklist

Before creating custom middleware, ask:

- Does it apply to every request?
- Is it transport-related?
- Does it need the full HttpContext?
- Can it short-circuit safely?
- Is ordering important?
- Will it execute efficiently under heavy load?
- Does it belong outside the business layer?

If the answer to most questions is "No",

middleware may not be the right abstraction.

---

# Self Assessment

You have mastered this chapter if you can confidently explain:

- How a request travels from Kestrel to a Controller.
- Why each request creates a new DI scope.
- How RequestDelegate chains are built.
- Why middleware order changes application behavior.
- When a middleware should short-circuit.
- The difference between Middleware and MVC Filters.
- Why scoped services should not be injected into middleware constructors.

If you can mentally trace a request through the entire pipeline and predict what happens at each stage, you've moved beyond using ASP.NET Core—you understand how it executes.