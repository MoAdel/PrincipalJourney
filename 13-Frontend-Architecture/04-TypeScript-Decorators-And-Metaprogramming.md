# TypeScript Decorators & Meta-Programming

> "Decorators provide declarative aspect-oriented programming (AOP) for TypeScript.
>
> They allow you to attach cross-cutting concerns—such as execution timing, caching, and role authorization—directly to classes and methods without polluting domain logic."

---

## 1. TC39 Stage 3 Standard Decorators vs Experimental Decorators

TypeScript 5.0+ natively implements the official **TC39 Stage 3 Decorators** standard, eliminating the legacy `experimentalDecorators` flag:

```text
┌─────────────────────────────────┬──────────────────────────────────┬─────────────────────────────────┐
│ Feature                         │ Legacy (experimentalDecorators)  │ Modern (TC39 Stage 3 / TS 5+)   │
├─────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────┤
│ tsconfig Flag                   │ "experimentalDecorators": true   │ Native (Standard TypeScript 5+) │
│ Context Parameter               │ Method descriptor and target any │ Strongly typed ClassMethodDecoratorContext│
│ Function Return                 │ Replaces property descriptor     │ Returns wrapped function directly│
│ Metadata Reflection             │ Requires reflect-metadata polyfill│ Native context.metadata object  │
└─────────────────────────────────┴──────────────────────────────────┴─────────────────────────────────┘
```

---

## 2. Authoring Enterprise Method Decorators

### 1. The `@LogExecutionTime` Performance Decorator
Measures exact method execution time and logs warnings if execution exceeds 50ms:

```typescript
export function LogExecutionTime(thresholdMs: number = 50) {
  return function (target: Function, context: ClassMethodDecoratorContext) {
    const methodName = String(context.name);

    return function (this: any, ...args: any[]) {
      const start = performance.now();
      const result = target.apply(this, args);

      // Handle both synchronous and asynchronous methods
      if (result instanceof Promise) {
        return result.then((res) => {
          const elapsed = performance.now() - start;
          if (elapsed > thresholdMs) {
            console.warn(`[SLOW METHOD] ${methodName} took ${elapsed.toFixed(2)}ms (threshold: ${thresholdMs}ms)`);
          }
          return res;
        });
      }

      const elapsed = performance.now() - start;
      if (elapsed > thresholdMs) {
        console.warn(`[SLOW METHOD] ${methodName} took ${elapsed.toFixed(2)}ms`);
      }
      return result;
    };
  };
}
```

### Usage in Enterprise Service:
```typescript
export class InventoryCalculationService {
  @LogExecutionTime(30)
  public async calculateWarehouseMetrics(warehouseId: string): Promise<Metrics> {
    // Heavy domain computation...
    return metrics;
  }
}
```
