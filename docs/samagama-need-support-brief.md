# Brief: "Need support?" button on the Samagama dashboard

**For:** whoever implements this on samagama.in
**Companion doc:** `docs/samagama-sso-integration.md` in `vicharanashala/crowd-source-faq` — full protocol reference
**csfaq side:** already implemented and merged-pending in PR #235. Nothing to build there.

---

## What you are building

Add a **"Need support?"** button to the Samagama dashboard.

When a signed-in user clicks it, they arrive at the csfaq support portal already logged in and already inside their own programme's cohort. No second login. No manual enrolment.

That is the entire feature. It is **one backend route plus one button**.

---

## Why it is small

csfaq already exposes a bridge endpoint that does the hard part: it verifies the request came from Samagama, finds or creates the user, enrols them in the right cohort, and returns both a session token and the URL to send them to.

Your side only has to: identify the user, decide their cohort, call the endpoint, set a cookie, redirect.

Both apps are already served from `samagama.in` (csfaq is mounted at `/csfaq`), so the session cookie is shared without any cross-domain work.

---

## The route

```js
// GET /need-support
// MUST require a signed-in samagama.in session — see "Security" below.
app.get('/need-support', requireSamagamaLogin, async (req, res) => {
  const user = req.user;

  // 1. Which cohort is this person in?
  const { programSlug, programRole } = resolveProgramTag(user);

  // 2. No cohort? Decide deliberately — see "Users with no tag".
  if (!programSlug) return res.redirect('/support/general');

  // 3. Exchange for a csfaq session.
  const bridged = await bridgeToCsfaq({
    email: user.email,
    displayName: user.name,
    programSlug,
    programRole,
  });

  // 4. Hand the session over.
  res.cookie('yaksha_session', bridged.token, {
    domain: '.samagama.in',
    path: '/',
    secure: true,
    sameSite: 'lax',
    httpOnly: false,              // required — see "The cookie" below
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // 5. Straight into their cohort.
  return res.redirect(bridged.redirectUrl);
});
```

The button is then just a link to `/need-support`.

## The exchange helper

```js
const crypto = require('node:crypto');

async function bridgeToCsfaq({ email, displayName, programSlug, programRole }) {
  const ts = Math.floor(Date.now() / 1000);        // SECONDS, not milliseconds

  const canonical =
    `${ts}.${email.toLowerCase().trim()}.${displayName.trim()}` +
    (programSlug ? `.${programSlug.toLowerCase().trim()}.${programRole.trim()}` : '');

  const sig = crypto
    .createHmac('sha256', process.env.CSFAQ_BRIDGE_SECRET)
    .update(canonical)
    .digest('hex');

  const res = await fetch('https://samagama.in/csfaq/api/auth/bridge/exchange', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bridge-Secret-Index': '0',
    },
    body: JSON.stringify({ email, displayName, programSlug, programRole, ts, sig }),
  });

  if (!res.ok) {
    throw new Error(`csfaq bridge ${res.status}: ${await res.text()}`);
  }
  return res.json();
  // { token, refreshToken, user, program: { batchId, slug, name, programRole }, redirectUrl }
}
```

The canonical string must match **byte for byte**, including the lowercasing and trimming. Any difference produces a 401.

---

## Cohort mapping

These are the live values, read from production on 2026-09-03:

| Who they are | `programSlug` | `programRole` |
|---|---|---|
| Internship participant, summer batch | `summership` | `student` |
| Internship participant, monsoon batch | `monsoonship` | `student` |
| Faculty on the FDP | `guruvaani` | `student` |
| Someone teaching on a programme | that programme's slug | `mentor` |

**The Guru Vaani slug is `guruvaani`, one word, no dash.** The cohort is stored as `GuruVaani` and the slug derives from that. `guru-vaani` returns 404. This is easy to get wrong.

**A faculty member on Guru Vaani is a `student` of that programme.** `programRole` describes what they do *inside the cohort*, not their job title. `mentor` is reserved for people who are there to teach. Only `student`, `ta` and `mentor` can be set through the bridge; `moderator` and `program_admin` are granted inside csfaq by an admin and a login will never confer them.

You can read the current list at any time, no authentication needed:

```bash
curl https://samagama.in/csfaq/api/batches
```

Prefer looking the slug up from that endpoint over hardcoding it. Renaming a cohort in the csfaq admin changes its derived slug, and a hardcoded value would break silently.

---

## Users with no tag

Not everyone signed in to Samagama belongs to a cohort. Decide what the button does for them rather than letting it fail. **Do not invent a slug** — csfaq answers 404 by design rather than guessing.

Three reasonable options:

1. Hide the button for those users.
2. Send them to a general support page.
3. Call the bridge **without** `programSlug` (a v1 call). They still get signed in, and `redirectUrl` points at the portal root instead of a cohort.

---

## Security

**The route must require a signed-in Samagama session.** It creates a csfaq account from whatever email it is handed. An unauthenticated route here would let anyone create an account for any address.

**The token is deliberately absent from `redirectUrl`.** Do not add it. Query strings end up in access logs, browser history and `Referer` headers. The session travels in the cookie.

**Use `bridged.redirectUrl` rather than building the URL yourself.** It is returned precisely so you do not need to know that the portal sits at `/csfaq` or that cohort selection is expressed as `?batch=`. If either changes, your button keeps working.

**The shared secret** must come from your secrets store as `CSFAQ_BRIDGE_SECRET`. Never in a commit, a chat message, or a ticket.

---

## The cookie, and a decision you should make consciously

`httpOnly` must be `false`, because the csfaq frontend reads the cookie from `document.cookie` on boot.

This means **any XSS anywhere under `samagama.in` can steal a 7-day session token.** It is a real trade-off, not an oversight. If you would rather not accept it, say so and we will look at either shortening the token lifetime substantially or adding server-side cookie handling on the csfaq side.

At minimum, consider reducing `maxAge` to the shortest span the user experience tolerates.

---

## Before it can work: csfaq-side configuration

Ask the csfaq admin to set these and restart:

| Variable | Value |
|---|---|
| `BRIDGE_ENABLED` | `true` |
| `BRIDGE_SHARED_SECRET` | 32+ random bytes (`openssl rand -hex 32`) |
| `PUBLIC_URL` | `https://samagama.in` |

The same secret becomes your `CSFAQ_BRIDGE_SECRET`. Exchange it through a password manager.

Confirm the bridge is live:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://samagama.in/csfaq/api/auth/bridge/exchange \
  -H 'Content-Type: application/json' -d '{}'
```

- **`401`** — enabled and configured correctly. The empty body fails signature verification, which is the expected response.
- **`503`** — not yet enabled, or the secret is unset.

---

## Testing checklist

1. `curl` the health check above and confirm `401`, not `503`.
2. Call the exchange with a real email and `programSlug: "guruvaani"`. Expect `200` with a `redirectUrl` containing `batch=6a8d0f6468e06917a2efe1b9`.
3. Click the button as a Guru Vaani user. You should land in the portal signed in, with the cohort already selected.
4. Click it again. Nothing should duplicate — the exchange is idempotent.
5. Send a deliberately wrong slug. Expect `404`, and confirm no user was created.
6. Check a user with no tag takes whichever path you chose.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `401` on every call | **Check clock sync first.** More than 60s of NTP drift between the hosts fails every request. Otherwise the canonical string does not match byte for byte. |
| `404` | Wrong slug. Almost always `guru-vaani` instead of `guruvaani`. |
| `503` | csfaq-side config not applied, or the service was not restarted. |
| User lands but is not signed in | The cookie is not reaching `/csfaq`. Check `Domain=.samagama.in`, `Path=/`, and that `httpOnly` is `false`. |
| User signed in but in the wrong cohort | You redirected somewhere other than `bridged.redirectUrl`. |

---

## One thing to expect afterwards

A Guru Vaani user arriving through this flow currently hits a full-screen csfaq onboarding gate titled **"Welcome to Summership"**, asking them to confirm when their *Internship* ends.

That is a pre-existing csfaq issue, not caused by this integration, but it will be the first thing your users see. It is being raised separately. Worth knowing before you demo this.
