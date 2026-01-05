# Setup & Installation

## 🛠️ Prerequisites
- **Node.js**: Version 18 or higher (Tested on v25).
- **Notion Integration**: Create an internal integration at [developers.notion.com](https://developers.notion.com/) and share your databases with it.
- **Google Cloud Credentials**: Create an OAuth 2.0 Client ID at [console.cloud.google.com](https://console.cloud.google.com/).

## 📥 Installation
```bash
git clone <repository-url>
cd snumps-automation-fork
npm install
```

## ✉️ Automated Email Setup
To enable the system to send automated alerts from a preset Gmail account:

1.  **Enable Gmail API**: In your Google Cloud Project, enable the "Gmail API".
2.  **Set to Production**: On the "OAuth consent screen" page, change the Publishing Status to **In Production**.
3.  **Generate Refresh Token**:
    *   Open the [Google OAuth2 Playground](https://developers.google.com/oauthplayground/).
    *   Click the **Settings cog** (top right) and check **"Use your own OAuth credentials"**.
    *   Enter your `Client ID` and `Client Secret`.
    *   In **Step 1**, enter `https://www.googleapis.com/auth/gmail.send` and click **Authorize APIs**.
    *   Sign in with the Admin Gmail account.
    *   In **Step 2**, click **Exchange authorization code for tokens**.
    *   Copy the **Refresh Token** provided.

## ⚙️ Environment Configuration (.env)
```env
# Auth
AUTH_SECRET=your_secret
GOOGLE_CLIENT_ID=your_id
GOOGLE_CLIENT_SECRET=your_secret
ADMIN_REFRESH_TOKEN=your_token

# Access Control
ADMINS_EMAILS=admin@snu.ac.kr,president@snu.ac.kr

# Notion
NOTION_API_KEY=your_integration_token
NOTION_DB_MEMBERS=id_of_members_db
NOTION_DB_ACTIVITIES=id_of_activities_db
NOTION_DB_PRIVATE_INFO=id_of_private_info_db
NOTION_DB_APPLICATIONS=id_of_applications_mirror_db
NOTION_DB_ATTENDANCE_QUEUE=id_of_attendance_mirror_db
NOTION_DB_SEMINAR_REQUESTS=id_of_seminar_requests_db
```

## 🔍 Utilities
**Schema Inspector**: Check any Notion database structure:
```bash
node --env-file=.env.safe inspect-db.js <database_id>
```

**Data Querier**: Retrieve all records from any Notion database:
```bash
node --env-file=.env.safe query-db.js <database_id>
```


## 🚀 Running & Building
```bash
npm run dev    # Development server
npm run build  # Production build
```
