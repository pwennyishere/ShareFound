# ShareHood 🏡

**Connect, Lend & Volunteer in Your Neighborhood**

ShareHood is a community-driven web application that connects nearby people and neighborhoods through voluntary lending, borrowing, and task exchanges — secured by a **Trust Escrow Wallet** system.

![ShareHood Logo](public/logo.jpg)

---

## Features

- 📋 **Neighborhood Board** – Browse offers to lend items/services or requests to borrow/get help
- 🤝 **Trust Fund Escrow** – Virtual tokens locked in escrow during transactions, rewarding lenders on completion
- 💬 **Live Public Chats** – Ask questions publicly on any listing before accepting
- 🔒 **Private Chats** – Auto-opens a private room once a listing is taken/accepted
- 🔔 **Real-time Notifications** – Toast alerts and badge counts for new messages & transactions
- 📁 **My Workspace** – Separated dashboard for your own requests, offers, and active agreements
- 🌙 **Dark / Light Mode** – Beautiful theme toggle with woodland-inspired color palette
- 🐻 **Polar Bear Mascot** – Friendly guide appearing in different poses across all pages
- 📸 **Image Uploads** – Attach photos to your listings

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Real-time | Socket.io |
| File Uploads | Multer |
| Database | Local JSON file (`data/db.json`) |
| Frontend | Vanilla HTML + CSS + JavaScript |
| Fonts | Google Fonts (Inter) |

---

## Getting Started

### Prerequisites
- Node.js v18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/pwennyishere/ShareFound.git
cd ShareFound

# Install dependencies
npm install

# Start the server
npm start
```

Open your browser and navigate to **http://localhost:3000**

---

## Testing Multi-User Live Chat

1. Open `http://localhost:3000` in a **normal** browser window — act as **Sarah Chen** (Greenwood)
2. Open `http://localhost:3000` in an **Incognito** window — switch to **Mark Miller** (Maplewood)
3. On Mark's window, click **Discussion Board** on a listing and type a message — it appears instantly for Sarah!
4. Click **Take Offer** — both users get toast notifications, 20 Trust Tokens are locked in escrow, and a private chat opens
5. Send messages in private chat and see the **"... is typing"** live indicator
6. Click **Mark Completed** — escrow is released and the lender earns **+5 Trust Tokens**!

---

## Project Structure

```
ShareHood/
├── server.js              # Express + Socket.io backend
├── package.json
├── public/
│   ├── index.html         # Single Page Application
│   ├── css/
│   │   └── style.css      # Dark/light theme + glassmorphic styles
│   ├── js/
│   │   ├── app.js         # Frontend logic & state management
│   │   └── socket.js      # Real-time socket client
│   ├── uploads/           # User-uploaded listing images
│   ├── logo.jpg           # ShareHood brand logo
│   ├── mascot_waving.jpg  # Bear mascot – waving pose
│   ├── mascot_helpful.jpg # Bear mascot – helpful pose
│   ├── mascot_success.jpg # Bear mascot – thumbs-up pose
│   └── illustration.jpg   # Hero banner background
└── data/
    └── db.json            # Auto-generated local database
```

---

## Trust Fund Mechanics

| Event | Effect |
|-------|--------|
| User posts a listing | Specifies required deposit (e.g. 20 TF) |
| Taker accepts an Offer | 20 TF locked from Taker's wallet into escrow |
| Author accepts a Request fulfillment | 20 TF locked from Author's wallet into escrow |
| Transaction marked Complete | Deposit returned + **+5 TF reward** to the lender/volunteer |
| Transaction Cancelled | Full deposit refunded to whoever locked it |

Each user starts with **100 Trust Tokens** (TF).

---

## Deployment Note

> ⚠️ **Socket.io & Vercel**: Vercel is a serverless platform and has limited support for persistent WebSocket connections. For full Socket.io functionality (live chat, typing indicators, real-time updates), consider deploying to a platform that supports long-running Node.js processes, such as:
> - [Railway](https://railway.app) *(recommended, free tier)*
> - [Render](https://render.com)
> - [Fly.io](https://fly.io)
> - [Heroku](https://heroku.com)

---

## License

MIT
