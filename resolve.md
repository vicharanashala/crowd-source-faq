# Resolution Summary

This document details the issues identified and resolved during this pairing session.

---

## 1. TypeScript Error: Union Type Too Complex (TS2590)

### Problem Description
When typechecking the backend and utility scripts, TypeScript threw the following error:
```
backend/utils/ai/embeddings.ts(160,28): error TS2590: Expression produces a union type that is too complex to represent.
```
This occurred because the `pipeline` utility in `@huggingface/transformers` uses an intensive conditional mapping type (`AllTasks[T]`) to resolve task strings to their corresponding pipeline class definitions. When the code used `as any` on the task parameter, or when type resolution hit the deep type union limit of the library, TypeScript exceeded its internal complexity thresholds.

### Fix
We bypassed the complex compile-time overload resolution of the `pipeline` function by casting the function itself as `any` (i.e. `(pipeline as any)(...)`). Since the returned promise is already safely typecasted to `FeatureExtractionPipeline`, type safety is preserved at the call site and the compilation succeeds.

### Files Modified:
* **[test-q8.ts](file:///c:/CSFAQ/crowd-source-faq/scripts/test-q8.ts)**
  ```diff
  -    const embedder = await pipeline(
  -      'feature-extraction' as any,
  +    const embedder = await (pipeline as any)(
  +      'feature-extraction',
         'mixedbread-ai/mxbai-embed-large-v1',
         { dtype: 'q8' }
       ) as FeatureExtractionPipeline;
  ```
* **[embeddings.ts](file:///c:/CSFAQ/crowd-source-faq/backend/utils/ai/embeddings.ts)**
  ```diff
  -    cachedEmbedder = await pipeline(
  -      'feature-extraction' as any,
  +    cachedEmbedder = await (pipeline as any)(
  +      'feature-extraction',
         MODEL_SLUG,
         { dtype: 'fp32' },
       ) as FeatureExtractionPipeline;
  ```

---

## 2. Port Conflict: `EADDRINUSE: address already in use :::6767`

### Problem Description
Starting the backend developer server threw a port collision error because a stale Node.js process from a previous execution was silently holding onto port `6767` and `5173`.

### Fix
We located and stopped the active processes using PowerShell:
* Process `node.exe` (PID `22764`) listening on port `6767` was forcefully terminated.
* Process `node.exe` (PID `32304`) listening on port `5173` was forcefully terminated.
* Development server ports are now clean and ready to launch via the zero-config runner (`npm run dev:local` in the root).

---

## 3. Security Vulnerability: 2FA Bypass Loophole

### Problem Description
The newly implemented 2FA flow generated a temporary `preAuthToken` containing the user payload `{ id: userId, isPreAuth: true }` valid for 5 minutes during login. However, because the main auth middleware (`verifyAndLoadUser`) only verified the signature of incoming JWT tokens without inspecting the `isPreAuth` claim, an attacker could copy the `preAuthToken` and pass it as a `Bearer` token to access normal protected API endpoints directly—effectively bypassing the 2FA constraint.

### Fix
1. Modified the auth middleware [authShared.ts](file:///c:/CSFAQ/crowd-source-faq/backend/middleware/authShared.ts) to verify the token payload and reject any token containing `isPreAuth: true` on standard authenticated routes:
   ```typescript
   // Reject pre-auth tokens on normal routes (prevents 2FA bypass)
   if ((decoded as any).isPreAuth) {
     res.status(401).json({ message: 'Not authorized. Complete 2FA verification first.' });
     return null;
   }
   ```
2. Added a robust integration test case to [auth2fa.test.ts](file:///c:/CSFAQ/crowd-source-faq/backend/__tests__/auth2fa.test.ts) to assert that any attempt to use a `preAuthToken` on protected routes is correctly blocked.

### Files Modified:
* **[authShared.ts](file:///c:/CSFAQ/crowd-source-faq/backend/middleware/authShared.ts)** (Added verification checks)
* **[auth2fa.test.ts](file:///c:/CSFAQ/crowd-source-faq/backend/__tests__/auth2fa.test.ts)** (Added unit tests verifying the 2FA bypass blocker)

---

## Verification Results
* Running typescript typechecks returns no errors:
  ```bash
  npx tsc --noEmit
  # Completed successfully
  ```
* All 49 unit and integration tests are passing clean:
  ```bash
  Test Files  8 passed (8)
  Tests       49 passed (49)
  ```
