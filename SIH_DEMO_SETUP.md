# SIH Demo Setup Instructions

## Environment Variables

Add the following environment variables to your `.env.local` file:

```bash
# SIH Demo Configuration (Normal User)
SIH_DEMO_ENABLED=true
SIH_DEMO_SAKHI_NUMBER=SAKHI-2026-DSAX
SIH_DEMO_PASSWORD=<your_secure_password>
SIH_DEMO_JUDGE_EMAIL=dhairya.sharma.01315616124@adgips.ac.in
```

## Demo Account Setup

The demo account has been created with:
- Sakhi Number: `SAKHI-2026-DSAX`
- Email: `dhairya.sharma.01315616124@adgips.ac.in`
- Name: `SIH Demo User`
- Role: `USER` (Normal user, not admin or government)

## Setup Steps

1. **Set the demo password** in `.env.local`:
   ```bash
   SIH_DEMO_PASSWORD=<your_secure_password>
   ```

2. **Update the demo account password** if needed:
   ```bash
   node scripts/create-sih-demo-user.cjs
   ```

3. **Restart the development server** after updating environment variables.

## Security Notes

- The demo password is stored in `.env.local` which is in `.gitignore`
- Never commit the actual password to version control
- The demo account has normal USER permissions only
- No government or admin access is granted
- The demo login flow uses the existing NextAuth authentication system

## Demo Login Flow

1. User clicks "Try SIH Demo" button on the login page
2. Client calls NextAuth with the demo Sakhi number and a special token
3. Server validates the demo credentials from environment variables
4. Normal user session is created through NextAuth
5. User is redirected to the normal user dashboard
