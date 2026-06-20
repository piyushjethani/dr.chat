import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Bot,
  CalendarDays,
  Clock3,
  FileText,
  HeartPulse,
  Loader2,
  MessageCircle,
  Mic,
  Paperclip,
  Pill,
  Send,
  ShieldAlert,
  Stethoscope,
  UserRound,
  UsersRound,
} from "lucide-react";

const quickPrompts = [
  "I have had a headache for three days.",
  "I have fever and a sore throat.",
  "My blood pressure is high today.",
  "I feel dizzy and tired.",
];

const emergencySymptoms = [
  "Chest pain",
  "Trouble breathing",
  "Stroke signs",
  "Severe bleeding",
];

const fallbackDashboard = {
  user: "Guest User",
  stats: {
    consultations: 3,
    appointments: 0,
    reports: 2,
    prescriptions: 1,
  },
  vitals: [
    { label: "Blood Pressure", value: "120/80 mmHg" },
    { label: "Heart Rate", value: "72 bpm" },
  ],
  recommendations: [
    "Drink more water and stay hydrated based on your last chat symptom.",
    "Schedule a follow-up with Dr. Smith next week.",
  ],
};

function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [dashboard, setDashboard] = useState(fallbackDashboard);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hello, I am Dr. MedAI. Describe your symptoms or ask a health question, and I will guide you with general medical information.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(localStorage.getItem("medai-session-id") || "");
  const [isSending, setIsSending] = useState(false);
  const [apiStatus, setApiStatus] = useState("checking");
  const chatEndRef = useRef(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? setApiStatus("online") : setApiStatus("offline")))
      .catch(() => setApiStatus("offline"));

    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((data) => setDashboard(data))
      .catch(() => setDashboard(fallbackDashboard));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const stats = useMemo(
    () => [
      {
        label: "AI Consultations",
        value: `${dashboard.stats.consultations} Recent`,
        action: "Start New Chat",
        icon: Activity,
        view: "chat",
      },
      {
        label: "Upcoming Appointments",
        value: `${dashboard.stats.appointments} Scheduled`,
        action: "Book Appointment",
        icon: CalendarDays,
        view: "patient",
      },
      {
        label: "Medical Reports",
        value: `${dashboard.stats.reports} Uploaded`,
        action: "View Reports",
        icon: FileText,
        view: "patient",
      },
      {
        label: "Prescriptions",
        value: `${dashboard.stats.prescriptions} Active`,
        action: "View Medicines",
        icon: Clock3,
        view: "patient",
      },
    ],
    [dashboard],
  );

  async function sendMessage(messageText = input) {
    const cleanMessage = messageText.trim();
    if (!cleanMessage || isSending) return;

    setActiveView("chat");
    setInput("");
    setMessages((current) => [...current, { role: "user", text: cleanMessage }]);
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: cleanMessage, sessionId }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to contact MedAI.");
      }

      if (data.sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem("medai-session-id", data.sessionId);
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", text: data.reply, disclaimer: data.disclaimer },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text:
            error.message ||
            "I could not connect to the medical AI right now. Please try again.",
          isError: true,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function resetChat() {
    const nextSession = crypto.randomUUID();
    localStorage.setItem("medai-session-id", nextSession);
    setSessionId(nextSession);
    setMessages([
      {
        role: "assistant",
        text: "New consultation started. What symptoms or question would you like to discuss?",
      },
    ]);
    setActiveView("chat");
  }

  return (
    <main className="app-shell">
      <Navbar activeView={activeView} setActiveView={setActiveView} apiStatus={apiStatus} />

      {activeView === "dashboard" && (
        <Dashboard
          dashboard={dashboard}
          stats={stats}
          setActiveView={setActiveView}
          sendMessage={sendMessage}
        />
      )}

      {activeView === "chat" && (
        <Chat
          messages={messages}
          input={input}
          setInput={setInput}
          sendMessage={sendMessage}
          isSending={isSending}
          resetChat={resetChat}
          chatEndRef={chatEndRef}
        />
      )}

      {activeView === "emergency" && <Emergency sendMessage={sendMessage} />}
      {activeView === "patient" && <PatientPanel dashboard={dashboard} />}
      {activeView === "doctor" && <DoctorPanel />}
    </main>
  );
}

function Navbar({ activeView, setActiveView, apiStatus }) {
  const items = [
    { id: "emergency", label: "Emergency", icon: HeartPulse },
    { id: "chat", label: "AI Chat", icon: MessageCircle },
    { id: "dashboard", label: "Patient Dashboard", icon: UserRound },
    { id: "doctor", label: "Doctor Panel", icon: Stethoscope },
  ];

  return (
    <header className="topbar">
      <button className="brand" onClick={() => setActiveView("dashboard")} aria-label="MedAI home">
        <span className="brand-icon">
          <Stethoscope size={31} />
        </span>
        <span>
          Med<span>AI</span>
        </span>
      </button>

      <nav className="nav-links" aria-label="Primary">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-link ${activeView === item.id ? "active" : ""} ${
                item.id === "emergency" ? "danger" : ""
              }`}
              onClick={() => setActiveView(item.id)}
            >
              <Icon size={20} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className={`status-pill ${apiStatus}`}>
        <span />
        {apiStatus === "online" ? "Online" : apiStatus === "offline" ? "Offline" : "Checking"}
      </div>
    </header>
  );
}

function Dashboard({ dashboard, stats, setActiveView, sendMessage }) {
  return (
    <section className="page dashboard-page">
      <div className="welcome-row">
        <div>
          <p className="eyebrow">Care workspace</p>
          <h1>
            Welcome, <span>{dashboard.user}</span>
          </h1>
        </div>
        <button className="primary-action" onClick={() => setActiveView("chat")}>
          <MessageCircle size={20} />
          Start Consultation
        </button>
      </div>

      <div className="stats-grid">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button key={stat.label} className="stat-card" onClick={() => setActiveView(stat.view)}>
              <span className="stat-icon">
                <Icon size={38} />
              </span>
              <span className="stat-label">{stat.label}</span>
              <strong>{stat.value}</strong>
              <span className="link-text">{stat.action} {'->'}</span>
            </button>
          );
        })}
      </div>

      <div className="content-grid">
        <section className="panel vitals-panel">
          <h2>Recent Health Vitals</h2>
          <div className="vital-list">
            {dashboard.vitals.map((vital) => (
              <div className="vital-row" key={vital.label}>
                <span>{vital.label}</span>
                <strong>{vital.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>AI Recommended Actions</h2>
          <ul className="recommendation-list">
            {dashboard.recommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="quick-panel">
        <h2>Quick Symptom Check</h2>
        <div className="prompt-grid">
          {quickPrompts.map((prompt) => (
            <button key={prompt} onClick={() => sendMessage(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function Chat({
  messages,
  input,
  setInput,
  sendMessage,
  isSending,
  resetChat,
  chatEndRef,
}) {
  return (
    <section className="page chat-page">
      <div className="chat-shell">
        <div className="chat-header">
          <div className="doctor-avatar">
            <Stethoscope size={28} />
          </div>
          <div>
            <h1>Dr. MedAI</h1>
            <p>
              <span /> Online
            </p>
          </div>
          <button className="ghost-button" onClick={resetChat}>
            <Bot size={18} />
            New Chat
          </button>
        </div>

        <div className="chat-body" aria-live="polite">
          {messages.length === 1 && (
            <div className="empty-state">
              <Stethoscope size={92} />
              <h2>How can I help you today?</h2>
              <p>Describe your symptoms, ask a medical question, or mention a report.</p>
              <small>
                Disclaimer: This AI is not a real doctor. Consult a professional for serious
                conditions.
              </small>
            </div>
          )}

          <div className="message-list">
            {messages.map((message, index) => (
              <article
                className={`message ${message.role} ${message.isError ? "error" : ""}`}
                key={`${message.role}-${index}`}
              >
                <div className="message-avatar">
                  {message.role === "assistant" ? <Stethoscope size={18} /> : <UserRound size={18} />}
                </div>
                <div className="message-bubble">
                  {message.text}
                  {message.disclaimer && <small>{message.disclaimer}</small>}
                </div>
              </article>
            ))}
            {isSending && (
              <article className="message assistant">
                <div className="message-avatar">
                  <Stethoscope size={18} />
                </div>
                <div className="message-bubble typing">
                  <Loader2 size={18} />
                  Dr. MedAI is reviewing your symptoms...
                </div>
              </article>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        <form
          className="chat-input"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <button type="button" className="icon-button" aria-label="Attach report">
            <Paperclip size={23} />
          </button>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Describe your symptoms..."
          />
          <button type="button" className="icon-button" aria-label="Voice input">
            <Mic size={22} />
          </button>
          <button className="send-button" type="submit" disabled={isSending || !input.trim()}>
            {isSending ? <Loader2 size={22} className="spin" /> : <Send size={23} />}
          </button>
        </form>
      </div>
    </section>
  );
}

function Emergency({ sendMessage }) {
  return (
    <section className="page narrow-page">
      <div className="emergency-hero">
        <ShieldAlert size={62} />
        <h1>Emergency Guidance</h1>
        <p>
          For chest pain, severe breathing trouble, stroke symptoms, heavy bleeding, or suicidal
          thoughts, contact emergency services immediately.
        </p>
        <a className="emergency-call" href="tel:112">
          Call Emergency
        </a>
      </div>

      <div className="emergency-grid">
        {emergencySymptoms.map((symptom) => (
          <button key={symptom} onClick={() => sendMessage(`Emergency symptom: ${symptom}`)}>
            <HeartPulse size={22} />
            {symptom}
          </button>
        ))}
      </div>
    </section>
  );
}

function PatientPanel({ dashboard }) {
  return (
    <section className="page dashboard-page">
      <div className="welcome-row">
        <div>
          <p className="eyebrow">Patient dashboard</p>
          <h1>Health Records</h1>
        </div>
      </div>

      <div className="content-grid">
        <section className="panel">
          <h2>Reports</h2>
          <div className="record-list">
            <Record icon={FileText} title="Blood Test Report" meta="Uploaded 2 days ago" />
            <Record icon={FileText} title="Chest X-ray" meta="Uploaded last month" />
          </div>
        </section>
        <section className="panel">
          <h2>Medicines</h2>
          <div className="record-list">
            <Record icon={Pill} title="Vitamin D" meta="1 active prescription" />
            <Record icon={CalendarDays} title="Next Visit" meta="No appointment scheduled" />
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>Vitals Summary</h2>
        <div className="vital-list">
          {dashboard.vitals.map((vital) => (
            <div className="vital-row" key={vital.label}>
              <span>{vital.label}</span>
              <strong>{vital.value}</strong>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function DoctorPanel() {
  return (
    <section className="page dashboard-page">
      <div className="welcome-row">
        <div>
          <p className="eyebrow">Doctor panel</p>
          <h1>Clinical Overview</h1>
        </div>
      </div>

      <div className="content-grid">
        <section className="panel">
          <h2>Patient Queue</h2>
          <div className="record-list">
            <Record icon={UsersRound} title="Guest User" meta="AI consultation in progress" />
            <Record icon={Activity} title="Triage Review" meta="No urgent flags detected" />
          </div>
        </section>
        <section className="panel">
          <h2>AI Notes</h2>
          <ul className="recommendation-list">
            <li>Review recurring headache messages for duration and severity.</li>
            <li>Ask for fever temperature and current medication history.</li>
          </ul>
        </section>
      </div>
    </section>
  );
}

function Record({ icon: Icon, title, meta }) {
  return (
    <div className="record-row">
      <span>
        <Icon size={22} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{meta}</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
