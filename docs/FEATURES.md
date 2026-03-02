# Application Features

## 🔐 Authentication & Security

- **Google OAuth**: Secure login via Auth.js, restricted strictly to `@snu.ac.kr` domains.
- **Role-Based Access**: Automatic distinction between regular Members and Admins.
- **Obfuscated Attendance Links**: Generates unique, randomized URLs (e.g., `/events/[id]/[random_code]`) for simplified and secure check-in.
- **Input Validation**: Robust server-side checks prevent IDOR attacks and unauthorized data manipulation.

## 👥 Membership System

- **Signup Flow**: New users must apply for membership. Applications are processed through Notion for Admin approval.
- **Robust Approval Workflow**: Admin actions (Accept/Reject) include instant button disabling and state verification to prevent duplicate entries and ensure data integrity.
- **User Profile**: Members can view their full participation history with standardized semester filtering and manage personal details (Phone, Bio, Background).
- **Seminar Application**: Members can propose and organize their own seminars directly through the web interface.
- **Automated Alerts**: Admins receive instant email notifications for new signups and completed attendance requests via the Gmail API.

## 📅 Event & Attendance System

- **Event Lifecycle**: Admins can Create (Draft), Activate (Publish), Expire, and Delete events. Expired events can be reactivated.
- **Existing Event Connection**: Ability to link new attendance sessions to already existing Notion activity records.
- **Seminar Approval**: Admins review member-submitted seminar proposals. Approved seminars are automatically converted into official Activities in Notion.
- **Attendance Tracking**: Users check in via obfuscated links. One-click completion records both start and end times for admin review.

## 🎨 UI & UX

- **Dynamic Theme Selection**: Easily switch between **Light, Dark, and System** themes via text-based controls in the universal footer.
- **Form Integrity**: Textareas like the "Background" info are fixed-size to maintain dashboard layout.
- **Standardized Error Feedback**: Detailed error messages and standard HTTP status codes provide clear feedback during form submissions.
- **Smart Phone Normalization**: Automatically converts various input styles (e.g., `01012345678`, `010 1234 5678`) into the standardized `010-XXXX-XXXX` format.
- **Smart Paging**: Handles large databases via automatic pagination helpers.
- **Skeleton Loaders**: Shimmering placeholders ensure a smooth perceived performance during data loading.
- **Robust Admin Feedback**: Instant button throttling combined with background state verification and automated refresh for critical operations like membership and seminar approvals.
