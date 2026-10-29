# Supabase sign-in setup (one time, owner)

The portal signs people in with a one-time code sent by email. Supabase needs four settings changed before this works. All are in the Supabase dashboard for the project.

## 1. Send a code, not a link

**Authentication → Emails → Templates → Magic Link.** Replace the body so it shows the code:

- Subject: `Your Aspire Portal sign-in code`
- Body (HTML):

```html
<h2>Your sign-in code</h2>
<p>Enter this code to sign in to Aspire Portal:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>The code expires soon. If you didn't ask for it, you can ignore this email.</p>
```

The template must contain `{{ .Token }}`. Without it, Supabase sends a link, which the portal does not use.

## 2. Turn off self sign-up

**Authentication → Sign In / Providers → User Signups:** turn off **Allow new users to sign up**. Centres create accounts; nobody can create their own. The app also asks Supabase not to create users, so this is a second lock.

## 3. Set how long codes last

**Authentication → Sign In / Providers → Email:** set **Email OTP Expiration** to `600` seconds (10 minutes) and leave **Email OTP Length** at `6`. The app accepts 6–10 digits, so a later change won't break it.

## 4. Use your own email sender before real users

Supabase's built-in email service is for testing only: it sends very few emails per hour and only to addresses on the Supabase team. Before the pilot, set up a sender under **Project Settings → Authentication → SMTP Settings** (for example Resend, Postmark or Amazon SES, with a sending domain you own). Then raise **Authentication → Rate Limits → emails sent per hour** to suit the centre.

## Checking it works

Follow `pilot-test-student.md` to create a test student, then sign in at `/sign-in` with that email.
