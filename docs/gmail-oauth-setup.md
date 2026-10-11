# Gmail OAuth deployment setup

The Email Forensics Gmail connector uses the server-only variables
`GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`, and
`GMAIL_OAUTH_REDIRECT_URI`. It requests only
`https://www.googleapis.com/auth/gmail.readonly`.

Register the value of `GMAIL_OAUTH_REDIRECT_URI` exactly in the Google Cloud
OAuth 2.0 **Web application** client. The callback must be:

`https://<canonical-production-host>/api/gmail/callback`

For local development, the matching callback is:

`http://localhost:3000/api/gmail/callback`

Use the same Google Cloud project for the client credentials and Gmail API.
Enable the Gmail API in that project. If the OAuth consent screen is in
Testing, add each account that will connect a mailbox as a test user. Public
production use of the sensitive `gmail.readonly` scope requires the applicable
Google verification/security assessment; deploying or changing code does not
bypass that requirement.

Set the three variables separately in each Vercel environment. A local
`.env.local` file is not deployed automatically. Do not use `NEXT_PUBLIC_`
prefixes for these values and do not expose this callback through preview
deployments unless each preview hostname is explicitly authorized in Google
Cloud.
