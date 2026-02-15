# Authentication & Authorization Variables

This document describes the purpose and usage of key environment variables used for managing access and notifications within the SNUMPS Automation system.

## 1. ADMINS_EMAILS

**Description**: A comma-separated list of email addresses that have full administrative access to the application.

### Key Uses:
- **Route Authorization**: Restricts access to all `/admin/*` routes. Any user not in this list attempting to access admin pages will receive a `404 Not Found` (by design for security through obscurity).
- **Action Protection**: Server-side actions (like approving members, creating events, or managing seminars) verify the user's email against this list before execution.
- **Admin Notifications**: Used by the mailing service (`src/lib/server/mail.ts`) to determine which accounts should receive automated alerts for:
    - New membership applications.
    - New seminar proposals.
    - Pending attendance approval requests.

---

## 2. AUTHORIZED_USERS

**Description**: A variable found in the environment configuration (`.env`), typically containing a list of specific user emails.

### Current Status:
- **Not Currently Active**: As of the current version, this variable is present in the environment but is **not referenced** in the source code.

### Intended / Potential Uses:
While not currently implemented, this variable is reserved for the following potential features:
- **Whitelist Access**: Restricting the entire application to a specific list of individuals, even if they possess a valid `@snu.ac.kr` email.
- **Beta / Early Access**: Granting specific members access to new features or pages before a full rollout.
- **Secondary Privilege Level**: Defining a set of "Staff" or "Moderator" users who have more permissions than standard members but fewer than full Admins.

---

## Configuration Example

In your `.env` file:

```env
ADMINS_EMAILS="admin1@snu.ac.kr,admin2@snu.ac.kr"
AUTHORIZED_USERS="user1@snu.ac.kr,user2@snu.ac.kr"
```
