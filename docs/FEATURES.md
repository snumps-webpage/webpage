# Application Features

## 🔐 Authentication & Security
- **Google OAuth**: Secure login via Auth.js, restricted strictly to `@snu.ac.kr` domains.
- **Role-Based Access**: Automatic distinction between regular Members and Admins.
- **Obfuscated Attendance Links**: Generates unique, randomized URLs (e.g., `/events/[id]/[random_code]`) for simplified and secure check-in.
- **Input Validation**: Robust server-side checks prevent IDOR attacks and unauthorized data manipulation.

## 👥 Membership System
- **Signup Flow**: New users must apply for membership. Applications are processed through a hybrid system (Notion primary, Local JSON cache) for Admin approval.
- **User Profile**: Members can view their full participation history with standardized semester filtering and manage personal details (Phone, Bio, Background).
- **Seminar Application**: Members can propose and organize their own seminars directly through the web interface.
- **Automated Alerts**: Admins receive instant email notifications for new signups and completed attendance requests via the Gmail API.

## 📅 Event & Attendance System
- **Event Lifecycle**: Admins can Create (Draft), Activate (Publish), Expire, and Delete events. Expired events can be reactivated.
- **Existing Event Connection**: Ability to link new attendance sessions to already existing Notion activity records.
- **Seminar Approval**: Admins review member-submitted seminar proposals. Approved seminars are automatically converted into official Activities in Notion.
- **Global Timezone Support**: Full IANA timezone database integration (e.g., `Asia/Seoul`, `America/New_York`) for accurate global scheduling.
- **Attendance Tracking**: Users check in via time-sensitive, obfuscated links. One-click completion records both start and end times for admin review.

## 🎨 UI & UX
- **Light/Dark Mode**: Native support for Light, Dark, and System themes with persistence and a dedicated toggle button.
- **Smart Paging**: Handles large member lists via recursive fetching (bypassing the 100-record limit).
- **Dynamic Context**: Automatically calculates the current semester and fetches the current Club President's name for the universal footer.
- **Search & Filtering**: Real-time search by Name or Department in both Admin and Notion Database views.
- **Native UI Feel**: Interactive elements use `user-select: none` to prevent accidental text highlighting.
- **Fluid Transitions**: Utilizes the native View Transitions API for smooth, app-like page navigation.
- **Skeleton Loaders**: Implements shimmering placeholder UI during asynchronous data streaming for immediate visual feedback.
- **Automatic Linking**: Activity titles in the user dashboard link directly to their published Notion pages.
