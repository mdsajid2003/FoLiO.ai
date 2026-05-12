# Privacy Policy

**Effective Date:** [INSERT EFFECTIVE DATE]
**Last Updated:** [INSERT DATE]

---

## Important Notice

This Privacy Policy is a **standalone document** published in accordance with **Section 5 of the Digital Personal Data Protection Act, 2023** (DPDP Act) and **Rule 4 of the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011** (SPDI Rules). It is separate from and supplements our [Terms and Conditions](TERMS.md).

---

## 1. Introduction

**[INSERT LEGAL ENTITY NAME]** ("FoLiOAI", "Company", "we", "us", "our") operates the FoLiOAI platform — a web-based financial reconciliation and diagnostic tool for Indian e-commerce sellers.

We are committed to protecting your personal data and sensitive personal data or information in accordance with the applicable data protection laws of India. This Privacy Policy explains how we collect, use, store, share, and protect your data when you use our Service.

This Privacy Policy is published under:
- **Digital Personal Data Protection Act, 2023** (DPDP Act) and the Digital Personal Data Protection Rules, 2025;
- **Information Technology Act, 2000** (Section 43A) and the IT (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011;
- **Consumer Protection Act, 2019** and the Consumer Protection (E-Commerce) Rules, 2020.

By using the Service, you consent to the collection and processing of your data as described in this Privacy Policy. If you do not agree with this Policy, please do not use the Service.

---

## 2. Definitions

For the purposes of this Privacy Policy:

- **"Data Fiduciary"** means any person who alone or in conjunction with other persons determines the purpose and means of processing of personal data. Under this Policy, the Company acts as the Data Fiduciary (DPDP Act, Section 2(i)).
- **"Data Principal"** means the individual to whom the personal data relates. If you use our Service, you are a Data Principal (DPDP Act, Section 2(j)).
- **"Data Processor"** means any person who processes personal data on behalf of a Data Fiduciary (DPDP Act, Section 2(k)).
- **"Personal Data"** means any data about an individual who is identifiable by or in relation to such data (DPDP Act, Section 2(t)).
- **"Sensitive Personal Data or Information (SPDI)"** includes financial information such as bank account details, credit/debit card details, and payment instrument details, as defined under Rule 3 of the IT (SPDI) Rules, 2011.
- **"Processing"** in relation to personal data means any wholly or partly automated operation performed on digital personal data, including collection, recording, organization, structuring, storage, adaptation, retrieval, use, alignment, combination, indexing, sharing, disclosure, restriction, erasure, or destruction (DPDP Act, Section 2(x)).
- **"Service"** means the FoLiOAI web platform and all its features, as described in our [Terms and Conditions](TERMS.md).

---

## 3. Data Fiduciary Identity and Contact

The Data Fiduciary responsible for your personal data is:

| Detail | Information |
|--------|-------------|
| Legal Name | **[INSERT LEGAL ENTITY NAME]** |
| Type of Entity | **[INSERT: Sole Proprietorship / LLP / Pvt. Ltd.]** |
| Registered Address | **[INSERT FULL ADDRESS WITH PIN CODE]** |
| Data Protection Contact | **[INSERT EMAIL]** |
| Grievance Officer | **[INSERT NAME]** |
| Grievance Officer Email | **[INSERT GRIEVANCE EMAIL]** |
| Grievance Officer Phone | **[INSERT PHONE NUMBER]** |
| CIN / LLPIN / PAN | **[INSERT AS APPLICABLE]** |

---

## 4. Categories of Data Collected

We collect and process the following categories of data:

### 4.1. Settlement Data (Uploaded by You)

| Data Type | Examples | Classification |
|-----------|----------|----------------|
| Order details | Order ID, item ID, SKU, product name | Personal Data |
| Financial transactions | Selling price, settlement amount, referral fees, fulfillment fees, storage fees | SPDI (financial information) |
| Tax information | GST collected, GST rate, TCS deducted, TDS deducted | SPDI (financial information) |
| Business identifiers | Seller state, place of supply, weight, quantity | Personal Data |
| Date information | Order dates, settlement dates | Personal Data |

### 4.2. Session Data (Automatically Generated)

| Data Type | Details | Storage Location |
|-----------|---------|------------------|
| Guest session identifier | Randomly generated ID (e.g., `guest_1712345678`) | Browser localStorage (`guardian_user`) |
| Consent flag | Whether you accepted the data processing consent | Browser localStorage (`guardianai_consent_v1`) |
| Report history | Up to 10 most recent processed reports | Browser localStorage (`guardianai_reports`) |

### 4.3. Technical Data (Automatically Collected)

| Data Type | Details | Purpose |
|-----------|---------|---------|
| IP address | Your device's IP address | Rate limiting, abuse prevention |
| HTTP request metadata | Request method, URL path, timestamps | Structured logging, debugging |
| File metadata | Filename, file size, delimiter type | Processing and debugging |

### 4.4. Chat Data (When Using AI Features)

| Data Type | Details | Shared With |
|-----------|---------|-------------|
| Chat messages | Your questions to the AI assistant | Anthropic (AI provider) |
| Report context | Aggregate financial figures from your report (total revenue, expenses, profit, leakage, tax summaries) | Anthropic (AI provider) |
| Chat history | Last 5 messages in the conversation | Anthropic (AI provider) |

### 4.5. Data We Do NOT Collect

- We do **not** collect or store passwords (there is no password-based login in the current version).
- We do **not** collect biometric data.
- We do **not** collect health or medical records.
- We do **not** use cookies or third-party tracking pixels.
- We do **not** collect Aadhaar numbers, PAN numbers, or government-issued identifiers directly (though your uploaded settlement files may contain business identifiers).

---

## 5. Purpose of Collection and Processing

We process your data strictly for the following purposes (DPDP Act, Section 4):

| Purpose | Data Used | Legal Basis |
|---------|-----------|-------------|
| Settlement reconciliation | Settlement Data | Consent (DPDP Act, Section 6) |
| Revenue leakage detection | Settlement Data | Consent |
| GST, TCS, TDS, and income tax analysis | Settlement Data, financial figures | Consent |
| Recovery action generation | Settlement Data, leakage analysis | Consent |
| AI-assisted narrative and chat | Aggregate report data, chat messages | Consent |
| Data quality assessment | Settlement Data parsing metadata | Consent |
| Service improvement and debugging | Technical Data, structured logs | Legitimate use (DPDP Act, Section 7) |
| Rate limiting and abuse prevention | IP address | Legitimate use |
| Local report storage for your convenience | Processed reports | Consent |

We do **not** process your data for advertising, profiling, sale to third parties, or any purpose not disclosed above.

---

## 6. Legal Basis for Processing

### 6.1. Under the Digital Personal Data Protection Act, 2023

Our primary legal basis for processing your personal data is **explicit consent** under **Section 6 of the DPDP Act**. We obtain this consent through a click-wrap consent mechanism (the "Data Processing Consent" modal) before you upload any Settlement Data. The consent notice:
- (a) Is presented in clear, plain English;
- (b) Specifies the data being collected and the purposes of processing;
- (c) Informs you of your right to withdraw consent;
- (d) References the DPDP Act, 2023.

For Technical Data used for rate limiting and abuse prevention, we rely on **Section 7 of the DPDP Act** (certain legitimate uses).

### 6.2. Under the IT Act SPDI Rules, 2011

For Sensitive Personal Data or Information (financial data in your settlement files), we obtain your **prior consent** before collection in accordance with **Rule 5 of the SPDI Rules**. The consent mechanism satisfies the requirement of consent via electronic means under the SPDI Rules.

---

## 7. Consent Mechanism and Withdrawal

### 7.1. How We Obtain Consent

Before you upload any Settlement Data, the Service presents a **Data Processing Consent** modal that clearly describes:
- What data will be processed;
- How the data will be stored (browser local storage in the MVP);
- That we do not share financial data with third parties (except as disclosed for AI features);
- That results are deterministic from your CSV but some tax outputs are assumption-based;
- Your right to clear saved data.

You must affirmatively click "Accept & Continue" to provide consent. This click-wrap mechanism satisfies the requirements of:
- **DPDP Act, Section 6** (free, specific, informed, unconditional, unambiguous consent through clear affirmative action);
- **SPDI Rules, Rule 5** (consent via electronic means);
- **Indian Contract Act, 1872** (valid acceptance);
- **IT Act, Section 10A** (valid electronic contract formation).

### 7.2. Withdrawal of Consent

In accordance with **Section 6(4) of the DPDP Act**, you have the right to withdraw your consent at any time. Withdrawal of consent is as easy as giving consent:

**How to withdraw consent:**
- (a) **Clear browser storage:** Clear your browser's local storage for the FoLiOAI domain to remove all locally stored session data, consent flags, and report history;
- (b) **Contact us:** Email our Grievance Officer at **[INSERT GRIEVANCE EMAIL]** to request deletion of any server-side data associated with your session;
- (c) **Stop using the Service:** Simply discontinue use of the Service.

**Consequences of withdrawal:**
- Processing of your data will cease;
- Locally stored reports and session data will be removed (upon clearing browser storage);
- Server-side job data will be deleted upon request;
- Withdrawal does not affect the lawfulness of processing carried out before withdrawal.

---

## 8. Local Storage and Device-Side Data

### 8.1. Browser Local Storage

The Service uses your browser's **localStorage** API (not cookies) to store the following data **on your device only**:

| Storage Key | Data Stored | Purpose | Retention |
|-------------|-------------|---------|-----------|
| `guardian_user` | Guest session identifier (JSON object with uid and email) | Session management | Until you sign out or clear storage |
| `guardianai_consent_v1` | Consent flag ("1" for accepted, "0" for declined) | Record your consent decision | Until you clear storage |
| `guardianai_reports` | Up to 10 most recent processed reconciliation reports (JSON) | Allow you to access past reports without re-uploading | Until you clear storage or new reports push old ones out |

### 8.2. Key Facts About Local Storage

- (a) This data is stored **entirely on your device** and is not transmitted to our servers unless you initiate a new upload or chat request;
- (b) We **cannot access, modify, or delete** your local storage remotely;
- (c) The data is accessible only to the FoLiOAI domain in your browser;
- (d) Local storage has no expiry — data persists until you manually clear it;
- (e) Report data stored locally may contain sensitive financial information; **you are responsible for securing your device**;
- (f) To clear all locally stored data: open your browser's Developer Tools, navigate to Application > Local Storage > [FoLiOAI domain], and clear all entries.

### 8.3. No Cookies

The Service does **not** use HTTP cookies, third-party cookies, tracking cookies, or any cookie-based tracking mechanism.

---

## 9. Server-Side Processing and Data Flow

### 9.1. Data Flow

When you upload a Settlement Data file, the following processing occurs:

1. **Upload:** Your browser sends the file contents (as a text string, up to 50 MB) to our server via the `/api/reconcile` endpoint;
2. **Queuing:** The file is placed in a server-side processing queue (stored in `.guardianai/jobs.json` on the server filesystem);
3. **Processing:** The file is parsed, validated, and analyzed. This includes CSV parsing, leakage detection, GST/TCS/TDS/income tax computation, recovery action generation, and data quality assessment;
4. **AI Narrative (if configured):** Aggregate report figures are sent to Anthropic's API for narrative generation;
5. **Result Delivery:** The completed report is returned to your browser via the `/api/reconcile/status/:jobId` polling endpoint;
6. **Local Storage:** Your browser stores the report in localStorage for future access.

### 9.2. Server-Side Storage

| Data | Storage Location | Retention |
|------|------------------|-----------|
| Processing jobs and results | `.guardianai/jobs.json` on server filesystem | Duration of server runtime; cleared on server restart unless persisted |
| Structured logs (HTTP requests, processing events) | Server console output / log files | Minimum **one (1) year** as required by the Digital Personal Data Protection Rules, 2025 |

### 9.3. No Database

In the current MVP version, the Service does **not** use a traditional database (SQL or NoSQL). All server-side job data is stored in a file-based queue. This means:
- (a) Data is retained only while the server is operational;
- (b) Server restarts may clear in-memory processing state (though the file-based queue provides persistence across restarts);
- (c) We do not maintain long-term historical records of your reports on the server.

---

## 10. AI Processing Disclosures

### 10.1. Third-Party AI Provider

The Service integrates with **Anthropic** (Anthropic PBC, a United States-based company) for AI-powered features. When you use AI Features:

| What is Sent | What is NOT Sent |
|-------------|-----------------|
| Aggregate report figures (total revenue, expenses, profit, leakage, tax summaries) | Raw CSV file contents |
| Your chat messages | Your session identifier or any personal identifiers |
| Last 5 chat messages for context | Your IP address or device information |
| Platform identifier (Amazon/Flipkart) | Your full report data or row-level details |

### 10.2. Anthropic's Data Handling

As per our understanding of Anthropic's data policies:
- Anthropic processes the data to generate a response and does not use API inputs to train their models;
- Data sent to Anthropic may be temporarily retained by Anthropic for abuse monitoring and safety purposes, subject to Anthropic's own privacy policy;
- Anthropic operates as a **Data Processor** on our behalf within the meaning of the DPDP Act, 2023.

### 10.3. Contractual Safeguards

We maintain contractual arrangements with our AI provider to ensure:
- (a) Data is processed only for the purpose of providing the Service;
- (b) Appropriate security measures are in place;
- (c) Data is not sold, shared with, or used to train third-party models;
- (d) Compliance with breach notification obligations under the DPDP Act.

### 10.4. Fallback Without AI

When the AI provider is unavailable or not configured, the Service uses locally generated template responses. In this mode, **no data is sent to any third party**.

---

## 11. Data Sharing and Third-Party Disclosure

### 11.1. We Do NOT Sell Your Data

We do **not** sell, rent, trade, or commercially share your personal data or Settlement Data with any third party.

### 11.2. Limited Sharing

We may share your data only in the following circumstances:

| Recipient | Data Shared | Purpose | Legal Basis |
|-----------|-------------|---------|-------------|
| Anthropic (AI provider) | Aggregate report figures, chat messages | AI narrative and chat functionality | Consent; Data Processor contract |
| Law enforcement / regulatory authorities | As required by law | Compliance with legal obligations, court orders, or lawful requests | DPDP Act, Section 8(8); IT Act, Section 69 |
| Professional advisors | Aggregated, anonymized data | Legal, accounting, or audit purposes | Legitimate interest |

### 11.3. No Other Third-Party Sharing

Beyond the disclosures above, we do **not** share your personal data or Settlement Data with advertisers, data brokers, analytics companies, social media platforms, or any other third party.

---

## 12. Cross-Border Data Transfer

### 12.1. Current Transfers

When you use the AI Features, aggregate report data and chat messages are transmitted to Anthropic's servers, which are located in the **United States**. This constitutes a cross-border transfer of data.

### 12.2. Legal Basis for Transfer

- Under **Rule 7 of the IT (SPDI) Rules, 2011:** Cross-border transfer is permitted where the recipient ensures the same level of data protection as required under the SPDI Rules, and the transfer is necessary for the performance of a lawful contract.
- Under **Section 16 of the DPDP Act, 2023:** Transfer of personal data outside India is permitted except to countries specifically restricted by the Central Government. As of the effective date of this Policy, the United States has not been restricted.

### 12.3. Safeguards

We ensure that all cross-border transfers are subject to appropriate contractual safeguards, including confidentiality obligations, security requirements, and purpose limitations.

### 12.4. Avoiding Cross-Border Transfer

If you do not wish for your data to be transferred outside India, **do not use the AI chat features**. All other Service features (reconciliation, tax analysis, leakage detection) are processed entirely on our India-based servers.

---

## 13. Data Retention and Deletion

### 13.1. Retention Periods

| Data Category | Retention Period | Basis |
|---------------|-----------------|-------|
| Browser localStorage data | Until you clear it or sign out | User-controlled |
| Server-side job queue data | Duration of server runtime; may persist across restarts | Operational necessity |
| Structured server logs | Minimum **one (1) year** | DPDP Rules, 2025 (log retention requirement) |
| AI provider processing logs | Subject to Anthropic's retention policy | Anthropic's data processing agreement |

### 13.2. Deletion Upon Purpose Fulfillment

In accordance with **Section 8(7) of the DPDP Act, 2023**, we will erase your personal data once:
- (a) The purpose for which it was collected has been fulfilled; and
- (b) Retention is no longer necessary for the stated purpose; and
- (c) No other Indian law requires continued retention.

### 13.3. How to Request Deletion

You can request deletion of your data by:
- (a) **Clearing local storage:** Clear your browser's local storage for the FoLiOAI domain;
- (b) **Emailing us:** Send a deletion request to **[INSERT GRIEVANCE EMAIL]** with your session identifier (if known). We will process the request within **thirty (30) days**;
- (c) **Server-side data:** Upon receiving your request, we will delete or anonymize any server-side data associated with your session.

---

## 14. Data Minimization

In accordance with the DPDP Act, 2023, we follow the principle of **data minimization**:

- (a) We process only the data columns in your settlement file that are necessary for reconciliation and tax analysis;
- (b) We do not request or require you to provide personal identifiers (Aadhaar, PAN, bank account numbers) through the Service;
- (c) Data sent to the AI provider is limited to aggregate figures — we do not send raw CSV data or row-level details;
- (d) Chat history sent to the AI provider is limited to the last 5 messages;
- (e) Rate limiting uses only IP addresses, which are not stored beyond the current server session.

---

## 15. Security Measures

### 15.1. Technical Safeguards

We implement the following reasonable security practices in accordance with **Section 43A of the IT Act, 2000** and **Rule 8 of the SPDI Rules, 2011**:

| Measure | Description |
|---------|-------------|
| HTTPS/TLS | All data in transit between your browser and our servers is encrypted |
| Rate limiting | IP-based rate limiting prevents abuse (15 uploads/min, 40 chats/min) |
| No-cache headers | All API responses include `Cache-Control: no-store` to prevent caching of financial data |
| Input validation | Uploaded files are validated for format, size (50 MB limit), and content before processing |
| Structured logging | Security-relevant events are logged with timestamps for audit purposes |
| Minimal data exposure | AI features receive only aggregate data, not raw settlement files |
| No permanent server storage | MVP does not use a persistent database; job data is file-based and transient |

### 15.2. Organizational Safeguards

- (a) Access to server infrastructure is restricted to authorized personnel;
- (b) We follow the principle of least privilege in system access;
- (c) We conduct periodic reviews of security practices.

### 15.3. Security Standard Reference

Rule 8 of the SPDI Rules recognizes **IS/ISO/IEC 27001** as an appropriate security standard. While we aspire to align with this standard, we have not yet obtained formal IS/ISO/IEC 27001 certification. We will update this Policy when and if such certification is obtained.

### 15.4. Limitations

No system is perfectly secure. We cannot guarantee absolute security of your data. In the event of a security incident, we will comply with our breach notification obligations (see Section 16 below).

---

## 16. Data Breach Notification

### 16.1. Notification to the Data Protection Board

In the event of a personal data breach, we will notify the **Data Protection Board of India** within **seventy-two (72) hours** of becoming aware of the breach, in accordance with **Section 8(6) of the DPDP Act, 2023** and the procedures prescribed under the **DPDP Rules, 2025**.

### 16.2. Notification to Affected Users

We will notify affected Data Principals (users) **without unreasonable delay** after becoming aware of a breach. The notification will include:
- (a) A description of the nature of the breach;
- (b) The categories and approximate number of data records affected;
- (c) Likely consequences of the breach;
- (d) Measures taken or proposed to address the breach;
- (e) Recommendations for affected individuals to mitigate potential harm.

### 16.3. Breach Response

Our breach response plan includes:
- (a) Immediate containment and investigation;
- (b) Assessment of risk to affected individuals;
- (c) Notification to DPB and affected users as required by law;
- (d) Remediation of the root cause;
- (e) Documentation of the breach and response for audit purposes.

---

## 17. Data Principal Rights

Under the **Digital Personal Data Protection Act, 2023** (Sections 11-14), you have the following rights as a Data Principal:

### 17.1. Right to Access (Section 11)

You have the right to:
- (a) Obtain confirmation as to whether your personal data is being processed;
- (b) Access a summary of the personal data being processed and the processing activities.

**How to exercise:** Email **[INSERT GRIEVANCE EMAIL]** with the subject line "Data Access Request."

### 17.2. Right to Correction (Section 11)

You have the right to:
- (a) Request correction of inaccurate or misleading personal data;
- (b) Request completion of incomplete personal data;
- (c) Request that we update your personal data.

**How to exercise:** Email **[INSERT GRIEVANCE EMAIL]** with the subject line "Data Correction Request" and specify the data requiring correction.

### 17.3. Right to Erasure (Section 12)

You have the right to request erasure of your personal data when:
- (a) The data is no longer necessary for the purpose for which it was collected;
- (b) You withdraw your consent;
- (c) The data has been processed in violation of the DPDP Act.

**How to exercise:** Email **[INSERT GRIEVANCE EMAIL]** with the subject line "Data Erasure Request." Locally stored data can be erased by clearing your browser's local storage. See Section 13.3 for detailed instructions.

### 17.4. Right to Nomination (Section 14)

You have the right to nominate another individual who, in the event of your death or incapacity, may exercise your rights under the DPDP Act on your behalf.

**How to exercise:** Email **[INSERT GRIEVANCE EMAIL]** with the subject line "Nomination Request" and provide the nominee's details.

### 17.5. Right to Grievance Redressal (Section 13)

You have the right to register a grievance with our Grievance Officer regarding any act or omission relating to the processing of your personal data. See Section 18 for Grievance Officer details and timelines.

### 17.6. Right to Approach the Data Protection Board

If your grievance is not resolved to your satisfaction, you have the right to file a complaint with the **Data Protection Board of India** under the DPDP Act, 2023.

### 17.7. Response Timeline

We will respond to all Data Principal rights requests within **thirty (30) days** of receipt. If we require additional time, we will inform you of the reasons for the delay.

---

## 18. Grievance Officer

In compliance with the **DPDP Act, 2023**, the **IT (SPDI) Rules, 2011 (Rule 5(9))**, and the **Consumer Protection (E-Commerce) Rules, 2020**, we have appointed the following Grievance Officer:

| Detail | Information |
|--------|-------------|
| Name | **[INSERT NAME]** |
| Designation | Grievance Officer / Data Protection Officer |
| Email | **[INSERT GRIEVANCE EMAIL]** |
| Phone | **[INSERT PHONE]** |
| Address | **[INSERT ADDRESS WITH PIN CODE]** |

### Redressal Timelines

| Regulation | Acknowledgment | Resolution |
|------------|---------------|------------|
| Consumer Protection Act, 2019 / E-Commerce Rules, 2020 | Within 48 hours | Within 30 days |
| IT (SPDI) Rules, 2011 (Rule 5(9)) | Prompt | Within 1 month |
| DPDP Act, 2023 | Prompt | Within 90 days |

If your grievance is not resolved within the prescribed timelines, you may approach:
- (a) The **Consumer Disputes Redressal Commission** under the Consumer Protection Act, 2019;
- (b) The **Data Protection Board of India** under the DPDP Act, 2023;
- (c) The appropriate **civil court** of competent jurisdiction.

---

## 19. Children's Data

### 19.1. Age Restriction

The Service is intended for users who are **eighteen (18) years of age or older**. In accordance with **Section 9 of the DPDP Act, 2023**, we do not knowingly collect or process personal data of children (individuals below 18 years of age) without verifiable parental or guardian consent.

### 19.2. Parental Consent

If we become aware that a user is below 18 years of age, we will:
- (a) Immediately cease processing their data;
- (b) Delete any personal data collected from the minor;
- (c) Require verifiable parental or guardian consent before allowing continued use.

### 19.3. Reporting

If you believe we have inadvertently collected personal data from a child under 18, please contact our Grievance Officer immediately at **[INSERT GRIEVANCE EMAIL]**.

---

## 20. Cookies, Local Storage, and Tracking Technologies

### 20.1. No Cookies

The Service does **not** use HTTP cookies of any kind — no session cookies, no persistent cookies, no third-party cookies, and no tracking cookies.

### 20.2. Local Storage Only

The Service uses the browser's **localStorage API** exclusively for client-side data persistence. Unlike cookies:
- localStorage data is **not** automatically sent with HTTP requests;
- localStorage data is **not** accessible by third-party domains;
- localStorage data has **no expiry** — it persists until manually cleared;
- localStorage data is **not** transmitted to any analytics or advertising platform.

See Section 8 for a complete listing of localStorage keys and their contents.

### 20.3. No Third-Party Tracking

We do **not** use:
- Google Analytics or any similar analytics service;
- Facebook Pixel, Google Ads tags, or any advertising tracker;
- Fingerprinting scripts or device identification technologies;
- Session replay tools (e.g., Hotjar, FullStory).

---

## 21. Log Retention

### 21.1. Structured Server Logs

The Service maintains structured server-side logs that record:
- HTTP request method and path (not request body);
- Processing events (job start, completion, failure);
- Errors and warnings;
- Timestamps.

### 21.2. Retention Period

In accordance with the **Digital Personal Data Protection Rules, 2025**, we retain server logs for a minimum period of **one (1) year**. Logs are stored in a structured JSON format and are used for:
- (a) Debugging and service improvement;
- (b) Security incident investigation;
- (c) Compliance with legal obligations;
- (d) Audit purposes.

### 21.3. Log Security

Logs are stored on secured server infrastructure with access restricted to authorized personnel. Logs do not contain the contents of your uploaded settlement files or the full text of your chat messages.

---

## 22. Changes to This Policy

### 22.1. Right to Update

We reserve the right to update this Privacy Policy at any time to reflect changes in our practices, applicable laws, or features of the Service.

### 22.2. Notification of Changes

- (a) Material changes will be communicated through a prominent notice on the Service;
- (b) The "Last Updated" date at the top of this Policy will be revised;
- (c) If email addresses are collected in future versions, notifications will also be sent via email.

### 22.3. Re-Consent for Material Changes

If we make material changes that alter the purposes of data processing or the categories of data collected, we will obtain your **fresh consent** before processing your data under the new terms. This is in accordance with the DPDP Act's requirement that consent be purpose-specific.

### 22.4. Advance Notice

We will provide at least **fifteen (15) days** advance notice before material changes take effect. Your continued use of the Service after the effective date constitutes acceptance of the updated Policy.

---

## 23. Cross-Reference to Terms and Conditions

This Privacy Policy should be read together with our [Terms and Conditions](TERMS.md). In particular:
- (a) **Section 7 of the Terms** contains critical disclaimers about the nature of financial outputs;
- (b) **Section 8 of the Terms** addresses your data ownership and authorization responsibilities;
- (c) **Section 9 of the Terms** defines acceptable use and prohibited conduct;
- (d) **Section 10 of the Terms** explains AI feature limitations and reliability tiers;
- (e) **Section 16 of the Terms** addresses limitation of liability.

In the event of any conflict between this Privacy Policy and the Terms and Conditions regarding data protection matters, this Privacy Policy shall prevail.

---

## 24. Contact

For any questions, concerns, or requests regarding this Privacy Policy or your personal data, please contact us:

| Channel | Details |
|---------|---------|
| General Inquiries | **[INSERT SUPPORT EMAIL]** |
| Data Protection / Grievance Officer | **[INSERT GRIEVANCE EMAIL]** |
| Postal Address | **[INSERT FULL ADDRESS WITH PIN CODE]** |

For filing complaints with the regulatory authority:
- **Data Protection Board of India** — [https://www.meity.gov.in](https://www.meity.gov.in)
- **Consumer Helpline** — 1915 or [https://consumerhelpline.gov.in](https://consumerhelpline.gov.in)

---

## Indian Law Statutory References

This Privacy Policy has been drafted with reference to the following Indian laws and regulations:

| Law / Regulation | Relevant Provisions |
|-----------------|---------------------|
| Digital Personal Data Protection Act, 2023 | Sections 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 16 |
| Digital Personal Data Protection Rules, 2025 | Rules on consent management, log retention, breach notification |
| Information Technology Act, 2000 | Sections 10A, 43A, 69, 72A |
| IT (Reasonable Security Practices and Procedures and SPDI) Rules, 2011 | Rules 3, 4, 5, 6, 7, 8 |
| Indian Contract Act, 1872 | Sections 10, 11, 13, 14 |
| Consumer Protection Act, 2019 | Sections 2(47), 18, 89 |
| Consumer Protection (E-Commerce) Rules, 2020 | Grievance officer, disclosure requirements |
| Guidelines for Prevention and Regulation of Dark Patterns, 2023 | Prohibition of manipulative design practices |

---

**ACKNOWLEDGMENT**

BY CLICKING "ACCEPT & CONTINUE" OR BY USING THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ AND UNDERSTOOD THIS PRIVACY POLICY AND CONSENT TO THE COLLECTION, PROCESSING, AND STORAGE OF YOUR DATA AS DESCRIBED HEREIN, IN ACCORDANCE WITH THE DIGITAL PERSONAL DATA PROTECTION ACT, 2023 AND THE INFORMATION TECHNOLOGY ACT, 2000.

---

*This document is a first draft prepared for review by qualified legal counsel. It is recommended that a practicing advocate specializing in data protection and technology law review and finalize this document before publication. The placeholders marked with [INSERT ...] must be filled in with actual details before this document is made effective.*
