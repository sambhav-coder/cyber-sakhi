# Cyber Sakhi — Unified AI Platform for Digital & Real-World Safety
> **Presented By Team NullPointers** (Prashant Kumar, Dhairya Sharma, Manav Gupta, Sambhav Yadav)

Cyber Sakhi is an AI-powered safety companion designed to provide holistic, proactive protection against both online harassment/extortion and real-world physical threats.

---

## 🌟 Key Features & User Flows

1. **Homepage & Emergency Quick-Bar**
   - Clean, professional interface with *"Cyber Sakhi"* brand and *"Your safety. Your privacy. Your Sakhi."*
   - Primary action tiles: 🚨 Emergency SOS, 🧠 Check a Message, 🔒 Evidence Locker, 💬 Talk to Sakhi.
   - Real-time protection status telemetry and 1-click test scanner.

2. **Harassment & Digital Threat Detector (`/detector`)**
   - Multi-vector threat analysis for text messages, screenshot OCR, and voice stress.
   - Heuristic & NLP categorization: Extortion & Blackmail, Cyberstalking, Sexual Harassment, Financial Scams, Hate Speech.
   - Severity rating (SAFE / LOW / MEDIUM / HIGH / CRITICAL) and 0–100 score.
   - Legal section analysis mapped to Indian Law (IT Act 2000 Section 66E, 67, 66D; BNS / IPC 354D, 354A, 351, 506).
   - 1-Click "Save to Evidence Locker" and "Consult Sakhi Companion".

3. **VoiceShield & Emergency SOS (`/sos`)**
   - Simulated offline wake-word activation (*"Hey Sakhi Help"* / *"Sakhi Bachao"*).
   - Instant 1-tap SOS trigger with countdown safeguard and cancel drill option.
   - Live location capture (via browser Geolocation API with realistic fallback coordinates).
   - Multi-channel silent dispatch simulation (SMS & WhatsApp payloads to verified contacts).
   - Direct emergency helpline dials: **112** (National SOS), **1091** (Women Helpline), **1930** (Cyber Fraud), **181** (Women in Distress).

4. **Tamper-Proof Evidence Locker (`/locker`)**
   - Secure evidence vault for screenshots, audio recordings, and chat exports.
   - Client-side **SHA-256 cryptographic checksum calculation** (Web Crypto API) ensuring strict chain-of-custody for Section 65B Indian Evidence Act compliance.
   - Simulated IPFS CID and Blockchain transaction anchoring.
   - **Export Case Dossier**: 1-click generation of formatted, complaint-ready incident reports.

5. **Sakhi AI Companion / HerGuardian (`/companion`)**
   - 24/7 empathetic conversational AI guide with safety, emotional, and legal support.
   - Bilingual support: **English** and **Hindi/Hinglish**.
   - Pre-configured quick response chips for common crisis situations.
   - Embedded emergency action buttons and prominent medical/legal disclaimer.

6. **Trusted Contacts & Escalation Network (`/contacts`)**
   - Manage emergency circles (Mother, Sister, Friend, Guardian).
   - Multi-channel notification preferences (WhatsApp, SMS).
   - Primary recipient toggling and simulated test safety ping.

7. **Personal Safety Dashboard (`/dashboard`)**
   - Safety health posture score (96/100 Optimal).
   - Real-time threat activity timeline and risk factor distribution.
   - Automated safety hygiene checklist.

8. **Institutional Admin Portal (`/admin`)**
   - Anonymized threat analytics for university safety teams, NGOs, and cyber cell officers.
   - Case management ledger with interactive status progression (*Investigating*, *Escalated to Cyber Cell*, *Resolved*).

9. **Platform REST API & SheShield SDK (`/developer`)**
   - Interactive endpoint tester for `POST /api/analyze-threat`.
   - Copy-paste code snippets in cURL, TypeScript, and Node.js.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with Glassmorphism & Dark Mode
- **Icons**: Lucide React
- **Cryptography**: Web Cryptography API (`crypto.subtle.digest` for SHA-256)
- **State & Storage**: LocalStorage with automatic seed data & Supabase-ready data models

---

## 🚀 How to Run Locally

```bash
# Navigate to the project directory
cd C:\Users\ry526\.gemini\antigravity\scratch\cyber-sakhi

# Start development server
npm run dev

# Or run production build
npm run build
npm start
```
The application will be accessible at `http://localhost:3000`.

---

## 👥 Hackathon Team Credits

**Team NullPointers**:
- **Prashant Kumar** — Team Leader | Research & Content
- **Dhairya Sharma** — Presentation Lead
- **Manav Gupta** — Frontend Developer
- **Sambhav Yadav** — Backend Developer