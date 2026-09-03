# Offline Mode Testing Guide

This guide explains how to manually verify the Offline Mode feature of the Yaksha FAQ Portal.

## Purpose

Offline Mode allows users to access FAQ pages they have previously visited when their internet connection becomes unavailable. It uses a service worker and browser cache to store supported content.

## Prerequisites

Before testing, ensure that:

- The application is running using a production build.
- You are using a modern browser such as Google Chrome or Microsoft Edge.
- The `offlineMode` feature flag is enabled.
- You are signed in to the application.
- The browser supports service workers and Cache Storage.

## Test 1: Verify service-worker registration

1. Open the application while connected to the internet.
2. Sign in using a valid account.
3. Navigate to the Offline Mode page.
4. Open the browser Developer Tools.
5. Select **Application > Service Workers**.
6. Confirm that the service worker is registered and running.
7. Confirm that the Offline Mode page displays `Offline caching: Active`.

### Expected result

The service worker should be active without producing registration errors in the browser console.

## Test 2: Cache an FAQ page

1. Keep the internet connection enabled.
2. Open the FAQ list.
3. Select and view an FAQ.
4. Return to the Offline Mode page.
5. Check the number shown under `FAQ pages cached`.

### Expected result

The FAQ request should appear in Cache Storage and the cached-page count should increase.

## Test 3: Access cached content offline

1. Open Developer Tools.
2. Select the **Network** panel.
3. Change the network setting from **Online** to **Offline**.
4. Reload an FAQ page that was previously visited.

### Expected result

The previously visited FAQ should remain available while the browser is offline.

## Test 4: Check uncached content

1. Keep the browser in offline mode.
2. Attempt to open an FAQ that was not previously visited.

### Expected result

The application should not display outdated or unrelated content. Uncached content may require an internet connection.

## Test 5: Disable Offline Mode

1. Restore the browser network setting to **Online**.
2. Disable the `offlineMode` feature flag.
3. Refresh the application.
4. Inspect **Application > Service Workers** and **Cache Storage**.

### Expected result

The service worker should be unregistered and Offline Mode caches should be cleared.

## Troubleshooting

| Problem | Possible cause | Recommended check |
|---|---|---|
| Service worker is not visible | Offline Mode is disabled | Confirm that the `offlineMode` feature flag is enabled |
| Cached-page count remains zero | No FAQ request has been cached | Visit an FAQ while online and check Cache Storage again |
| Offline page does not load | The page was not previously visited | Load the page once while connected to the internet |
| Install button is disabled | The browser has not provided an install prompt | Test using a supported browser and a secure connection |
| Old content remains after disabling the feature | Cache cleanup has not completed | Refresh the application and inspect Cache Storage |
| Offline testing works differently during development | Development service workers may behave differently | Test using a production build |

## Test Record

| Test | Result | Notes |
|---|---|---|
| Service-worker registration | Pass / Fail | |
| FAQ caching | Pass / Fail | |
| Previously visited FAQ offline | Pass / Fail | |
| Uncached FAQ handling | Pass / Fail | |
| Feature disabled cleanup | Pass / Fail | |
