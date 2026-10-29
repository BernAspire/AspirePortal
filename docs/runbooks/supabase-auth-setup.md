# Supabase sign-in setup (one time, owner)

The portal signs people in with a one-time code sent by email. All steps are in the Supabase dashboard for the project.

**Do step 4 (your own email sender) first.** Supabase only lets you edit email templates once a custom SMTP sender is set up, and step 1 needs that.

## 1. Send a code, not a link

**Authentication → Emails → Templates → Magic Link** (direct link: `https://supabase.com/dashboard/project/_/auth/templates/magic-link-or-otp`). Replace the body so it shows the code:

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

## 3. Leave code expiry at the default

**Authentication → Sign In / Providers → Email → Email OTP Expiration:** leave it at `3600` seconds (1 hour). This one setting also controls confirmation and invitation links, so a short value would break invitations later. Supabase lets an address request a new code only once every 60 seconds.

## 4. Use your own email sender

Supabase's built-in email service sends very few emails per hour, only to addresses on the Supabase team, and does not allow template changes. Set up a sender under **Project Settings → Authentication → SMTP Settings** (for example Resend, Postmark or Amazon SES, with a sending domain you own). For a quick private test only, a Gmail account with an app password also works (`smtp.gmail.com`, port 465); switch to a domain sender before real users. Then raise **Authentication → Rate Limits → emails sent per hour** to suit the centre.

## Checking it works

Follow `pilot-test-student.md` to create a test student, then sign in at `/sign-in` with that email.
