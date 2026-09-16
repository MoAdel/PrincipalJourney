# Serverless Compute: Azure Functions v4 Isolated Worker Model (.NET 9)

> "In .NET 6/7, Azure Functions ran inside the host process, creating dependency conflicts and runtime lock-in. In .NET 9, Functions execute in an independent out-of-process Isolated Worker, giving you complete control over the application pipeline."

---

## 1. In-Process vs. Isolated Worker Model

```text
┌───────────────────────────────────────┬───────────────────────────────────────┐
│ Legacy In-Process Model (Deprecated)  │ Modern Isolated Worker Model (.NET 9) │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ Runs inside the Azure Functions Host  │ Runs in an independent .NET 9 process │
│ process (w3wp.exe / dotnet.exe).      │ (`Program.cs` with `HostBuilder`).    │
│ Tightly coupled to host runtime.      │ Zero dependency conflicts (Choose your│
│ Version conflicts with packages.      │ own Newtonsoft/System.Text.Json).     │
│ Limited middleware support.           │ Full ASP.NET Core-style Middleware    │
│                                       │ pipeline (`IFunctionsWorkerMiddleware`)│
└───────────────────────────────────────┴───────────────────────────────────────┘
```

---

## 2. Production C# 13 / .NET 9 Isolated Function Implementation

```csharp
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using System.Net;

public sealed class OrderIngestionFunction
{
    private readonly IOrderProcessingService _orderService;
    private readonly ILogger<OrderIngestionFunction> _logger;

    public OrderIngestionFunction(IOrderProcessingService orderService, ILogger<OrderIngestionFunction> logger)
    {
        _orderService = orderService;
        _logger = logger;
    }

    [Function("IngestOrder")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1/orders")] HttpRequestData req,
        FunctionContext executionContext)
    {
        _logger.LogInformation("Processing order ingestion via Isolated Worker.");

        var orderRequest = await req.ReadFromJsonAsync<CreateOrderDto>();
        if (orderRequest is null)
        {
            var badResponse = req.CreateResponse(HttpStatusCode.BadRequest);
            await badResponse.WriteStringAsync("Invalid payload schema.");
            return badResponse;
        }

        var orderId = await _orderService.CreateOrderAsync(orderRequest);

        var response = req.CreateResponse(HttpStatusCode.Created);
        await response.WriteAsJsonAsync(new { OrderId = orderId, Status = "Accepted" });
        return response;
    }
}
```

---

## 3. Hosting Plan Selection Matrix

```text
┌───────────────────────────┬─────────────────────┬──────────────────────┬──────────────────────┐
│ Plan Tier                 │ Consumption Plan    │ Flex Consumption Plan│ Premium Plan (EP)    │
├───────────────────────────┼─────────────────────┼──────────────────────┼──────────────────────┤
│ Scaling Model             │ Pure event-driven   │ Next-Gen Fast-Scale  │ Pre-warmed instances │
│ Scale to Zero             │ YES                 │ YES                  │ NO (Min 1 instance)  │
│ Cold Start Penalty        │ 2s - 8s             │ 200ms - 800ms        │ ZERO (Pre-warmed)    │
│ VNet Integration          │ NO (Public only)    │ YES (Subnet joined!) │ YES                  │
│ Max Execution Duration    │ 10 minutes (Default)│ Configurable (Custom)│ Unlimited / 60 mins  │
│ Cost Model                │ Pay per execution & │ Pay per execution &  │ Fixed monthly VM cost│
│                           │ memory-second       │ memory-second        │ + burst usage        │
│ Best For                  │ Low-frequency batch │ Production serverless│ Enterprise banking   │
│                           │ jobs, ad-hoc tasks  │ microservices with   │ requiring zero cold  │
│                           │                     │ private VNet access  │ starts and VNet      │
└───────────────────────────┴─────────────────────┴──────────────────────┴──────────────────────┘
```

---

## 4. Formal & Verified References

* [Microsoft Learn: Guide for Running C# Azure Functions in an Isolated Worker Process](https://learn.microsoft.com/en-us/azure/azure-functions/dotnet-isolated-process-guide)
* [Microsoft Learn: Azure Functions Flex Consumption Plan Hosting](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan)
* [David Fowler & Azure Team: Azure Functions Worker Middleware Samples](https://github.com/Azure/azure-functions-dotnet-worker)
